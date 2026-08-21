/**
 * api/mitl.js — MARLA sui dati (porta privata)
 *
 * Endpoint separato da api/chat.js: stessa MARLA, ma interroga i database dei
 * progetti invece dell'archivio, e non è pubblico. Vedi docs/CONTRATTO-FONTI.md.
 *
 * Differenza sostanziale da api/chat.js: lì si cerca nel kb e si passa il
 * risultato al modello una volta sola. Qui il modello ha degli strumenti e
 * decide lui quali chiamare e in che ordine — serve perché "questa società ha
 * investitori cileni?" richiede due passaggi concatenati (trova il soggetto,
 * poi filtra i suoi investitori) che nessuna ricerca testuale può fare.
 *
 * Variabili d'ambiente:
 *   ANTHROPIC_API_KEY   obbligatoria
 *   MITL_CHAT_TOKEN     obbligatoria — codice d'accesso, senza il quale l'endpoint rifiuta
 *   MITL_INDEX_URL      facoltativa — dove leggere l'indice Man in the Loop
 *   MITL_MODELLO        facoltativa — default claude-sonnet-5
 *   UPSTASH_REDIS_REST_URL / _TOKEN   facoltative — se presenti, limita le chiamate
 */

const Anthropic = require('@anthropic-ai/sdk');
const manintheloop = require('./fonti/manintheloop');
const citazioni = require('./lib/citazioni');

const MODELLO      = process.env.MITL_MODELLO || 'claude-sonnet-5';
const MAX_TOKENS   = 1600;
const MAX_GIRI     = 8;      // quante volte il modello può richiamare strumenti
const LIMITE_ORA   = 60;     // chiamate all'ora per token d'accesso

// Registro delle fonti. Aggiungere l'archivio significa aggiungere una riga.
const FONTI = [manintheloop];

// ── Prompt ────────────────────────────────────────────────────────────────────

const PERSONA = `Sei MARLA, il chatbot di info.nodes, organizzazione no-profit italiana fondata nel 2019 da giornalisti e attivisti.

Il tuo carattere è quello di Marla Singer (Fight Club): cinica, diretta, niente giri di parole né risposte rassicuranti. Un po' di Daria Morgendorffer: ironia secca, capacità di smontare le ipocrisie. Non hai pretese di salvare il mondo, ma ti interessa chi prova a ribaltare il tavolo delle ingiustizie.

Qui però stai facendo un lavoro diverso dal solito: non divulghi, fai ricerca su dati. Il carattere resta, ma non decide mai il contenuto.`;

const REGOLE = `===COME LAVORI===

Rispondi consultando i database attraverso gli strumenti. Non rispondi mai a memoria: quello che sai sul mondo serve a formulare buone ricerche, non a riempire i buchi dei dati.

REGOLE NON NEGOZIABILI:

1. CITA SEMPRE. Ogni affermazione che deriva dai dati va accompagnata dalla sua fonte, con nome e link, nel formato: [Nome del soggetto](url). Se hai usato più fonti diverse, dichiara esplicitamente da quale viene cosa — per esempio "dal database Man in the Loop risulta che…, mentre…".

2. CITA SOLO CIÒ CHE HAI RICEVUTO. Puoi nominare esclusivamente identificativi, titoli e URL comparsi nei risultati degli strumenti in questa conversazione. Non costruire URL a mano, non dedurli, non completarli. Se non hai un link per qualcosa, dillo e cita per nome e identificativo.

3. IL CARATTERE NON COPRE UN "NON LO SO". Se i dati non rispondono alla domanda, dillo chiaramente e spiega cosa manca. Una battuta al posto di un dato mancante è l'errore peggiore che puoi fare qui. Meglio una risposta breve e onesta che una brillante e vaga.

4. RIPORTA I LIMITI CHE GLI STRUMENTI TI DICHIARANO. Quando un risultato arriva con una "nota" — per esempio che il Paese di alcuni soggetti non è noto, o che una ricerca è lessicale e produce falsi positivi — quel limite va nella risposta, non lasciato intuire. Se non puoi escludere qualcosa, scrivi che non puoi escluderlo.

5. VERIFICA PRIMA DI CITARE. La ricerca nei testi dei progetti è per parole: restituisce candidati, non risposte. Leggi il testo completo dei progetti promettenti prima di affermare che riguardano un tema. Molti progetti citano "cross-border cooperation" — cooperazione fra Stati membri — che non ha niente a che vedere col controllo delle frontiere.

6. NUMERI ESATTI. Importi, conteggi e date si riportano come li restituiscono gli strumenti, senza arrotondare al rialzo e senza stimare.

Rispondi nella lingua in cui ti scrive l'utente. Sii concisa: i dati parlano, tu li ordini.`;

function systemPrompt() {
  return `${PERSONA}\n\n${REGOLE}\n\n===FONTI DISPONIBILI===\n` +
    FONTI.map(f => `- ${f.nome} (${f.id}): ${f.visibilita}`).join('\n');
}

// ── Limite di chiamate ────────────────────────────────────────────────────────

const memoria = new Map();   // ripiego quando Redis non è configurato

async function superaLimite(chiave) {
  const url   = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  const finestra = `mitl:${chiave}:${Math.floor(Date.now() / 3600000)}`;

  if (!url || !token) {
    const n = (memoria.get(finestra) || 0) + 1;
    memoria.set(finestra, n);
    if (memoria.size > 500) memoria.clear();
    return n > LIMITE_ORA;
  }
  try {
    const res = await fetch(`${url}/pipeline`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify([['INCR', finestra], ['EXPIRE', finestra, 3600]]),
    });
    const dati = await res.json();
    return Number(dati?.[0]?.result || 0) > LIMITE_ORA;
  } catch (e) {
    console.warn('Limite non verificabile:', e.message);
    return false;   // in caso di dubbio si risponde: il tetto è anti-abuso, non una serratura
  }
}

// ── Ciclo degli strumenti ─────────────────────────────────────────────────────

function strumentiDisponibili(visibilita) {
  return FONTI
    .filter(f => visibilita === 'interno' || f.visibilita === 'pubblico')
    .flatMap(f => f.strumenti);
}

function fonteDelloStrumento(nome) {
  return FONTI.find(f => f.strumenti.some(s => s.name === nome));
}

async function conversa(client, messages, consentiti, traccia) {
  const tools = strumentiDisponibili('interno');
  let giro = 0;

  while (giro++ < MAX_GIRI) {
    const risposta = await client.messages.create({
      model: MODELLO,
      max_tokens: MAX_TOKENS,
      system: systemPrompt(),
      tools,
      messages,
    });

    const chiamate = risposta.content.filter(c => c.type === 'tool_use');
    if (!chiamate.length) {
      const testo = risposta.content.filter(c => c.type === 'text').map(c => c.text).join('\n');
      return { testo, messages };
    }

    messages.push({ role: 'assistant', content: risposta.content });

    const esiti = [];
    for (const c of chiamate) {
      traccia.push({ strumento: c.name, argomenti: c.input });
      try {
        const fonte = fonteDelloStrumento(c.name);
        if (!fonte) throw new Error(`strumento non registrato: ${c.name}`);
        const esito = await fonte.esegui(c.name, c.input);
        citazioni.raccogli(esito.record || [], consentiti);
        esiti.push({
          type: 'tool_result',
          tool_use_id: c.id,
          content: JSON.stringify({ record: esito.record, nota: esito.nota }),
        });
      } catch (e) {
        esiti.push({
          type: 'tool_result', tool_use_id: c.id, is_error: true,
          content: `Strumento fallito: ${e.message}`,
        });
      }
    }
    messages.push({ role: 'user', content: esiti });
  }

  return { testo: 'Ho girato in tondo troppo a lungo senza chiudere il cerchio. Riformula la domanda, magari più stretta.', messages };
}

// ── Handler ───────────────────────────────────────────────────────────────────

module.exports = async function handler(req, res) {
  // Nessun CORS aperto: questa porta risponde solo a chi ha il codice.
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'POST') return res.status(405).json({ error: 'Metodo non consentito' });

  const atteso = process.env.MITL_CHAT_TOKEN;
  if (!atteso) return res.status(503).json({ error: 'Accesso non configurato' });

  const { messages, token } = req.body || {};
  if (token !== atteso) return res.status(401).json({ error: 'Codice di accesso non valido' });
  if (!Array.isArray(messages) || !messages.length) {
    return res.status(400).json({ error: 'messages mancante o vuoto' });
  }

  if (await superaLimite(String(token).slice(0, 12))) {
    return res.status(429).json({ error: 'Troppe domande in un\'ora. Riprova più tardi.' });
  }

  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const consentiti = citazioni.nuoviConsentiti();
    const traccia = [];

    const conversazione = messages.map(m => ({
      role: m.role === 'assistant' ? 'assistant' : 'user',
      content: m.content,
    }));

    let { testo, messages: dopo } = await conversa(client, conversazione, consentiti, traccia);

    // Controllo delle citazioni, con una possibilità di correzione.
    let problemi = citazioni.nonValide(testo, consentiti);
    if (problemi.length) {
      console.warn('Citazioni non verificate:', problemi);
      dopo.push({ role: 'assistant', content: testo });
      dopo.push({
        role: 'user',
        content: `CONTROLLO AUTOMATICO: questi riferimenti non compaiono in nessun risultato ` +
                 `degli strumenti in questa conversazione: ${problemi.join(', ')}. ` +
                 `Riscrivi la risposta usando solo identificativi e URL che hai davvero ricevuto. ` +
                 `Se per un'informazione non hai un link, dillo invece di costruirne uno.`,
      });
      const secondo = await conversa(client, dopo, consentiti, traccia);
      testo = secondo.testo;
      problemi = citazioni.nonValide(testo, consentiti);
      if (problemi.length) {
        testo = citazioni.neutralizza(testo, problemi) +
          '\n\n_(Alcuni riferimenti non verificabili sono stati rimossi da un controllo automatico.)_';
      }
    }

    return res.status(200).json({
      reply: testo,
      strumenti: traccia.map(t => t.strumento),
      fonti_citabili: consentiti.url.size,
    });

  } catch (err) {
    console.error('Errore mitl:', err);
    return res.status(500).json({ error: 'Errore interno', detail: err.message });
  }
};
