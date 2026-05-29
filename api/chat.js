/**
 * api/chat.js — funzione serverless Vercel
 * Riceve la domanda, cerca nel kb.json, chiama Claude API, risponde come MARLA.
 */

const Anthropic = require('@anthropic-ai/sdk');

const KB_URL = 'https://infonodesets.github.io/infonodes-org/kb.json';
const MODELLO = 'claude-haiku-4-5';
const MAX_CHUNK_CONTESTO = 6;   // quanti chunk passare a Claude
const MAX_TOKENS_RISPOSTA = 600;

// Cache in memoria del kb (dura quanto l'istanza Vercel è viva)
let kbCache = null;
let kbCacheTime = 0;
const KB_TTL_MS = 10 * 60 * 1000; // 10 minuti

// ── SYSTEM PROMPT ────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `Sei MARLA, il chatbot di info.nodes.

info.nodes è un'organizzazione no-profit italiana fondata nel 2019 da giornalisti e attivisti. Si occupa di giustizia sociale e climatica, impatto delle nuove tecnologie sui diritti umani, libertà di espressione.

Il tuo carattere: sei diretta, non banale, un po' cinica ma appassionata. Non dai risposte rassicuranti o politically correct. Fumi troppo, parli male, ma sai esattamente di cosa parli. Non hai pretese di salvare il mondo, ma ti interessa chi tenta di ribaltare il tavolo delle ingiustizie.

Quando rispondi:
- Rispondi SEMPRE in italiano
- Sii concisa ma sostanziale (massimo 3-4 paragrafi)
- Se hai materiale pertinente nel contesto, citalo con il titolo e indica che è disponibile nell'archivio
- Se non sai qualcosa, dillo senza inventare
- Non elencare roboticamente i documenti: integra le informazioni in modo naturale
- Se la domanda è vaga, puoi chiedere un chiarimento

Hai accesso all'archivio di info.nodes: newsletter MARLA, inchieste, ricerche, reportage, podcast e video.`;

// ── RICERCA NEL KB ────────────────────────────────────────────────────────────

const STOPWORDS_IT = new Set([
  'il','lo','la','i','gli','le','un','uno','una','di','del','della','dei','delle',
  'degli','in','nel','nella','nei','nelle','negli','a','al','alla','ai','alle',
  'agli','da','dal','dalla','dai','dalle','dagli','su','sul','sulla','sui','sulle',
  'sugli','con','per','tra','fra','e','ed','o','ma','se','che','chi','cui','non',
  'è','sono','ha','hanno','ho','siamo','mi','ti','si','ci','vi','lo','la','li',
  'le','ne','questo','questa','questi','queste','quello','quella','quelli','quelle',
  'come','quando','dove','cosa','perché','anche','già','più','molto','tutto',
  'tutti','tutte','sempre','mai','essere','avere','fare','dire','vedere','sapere',
]);

function tokenizza(testo) {
  return testo.toLowerCase()
    .replace(/[^a-zàèéìòù\s]/gi, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2 && !STOPWORDS_IT.has(w));
}

function cercaChunk(kb, query, nRisultati) {
  const queryTokens = new Set(tokenizza(query));
  if (queryTokens.size === 0) return [];

  const scored = kb.chunks.map(chunk => {
    const testoTokens = tokenizza(chunk.testo + ' ' + chunk.titolo);
    let score = 0;
    for (const token of queryTokens) {
      for (const tt of testoTokens) {
        if (tt === token) score += 2;
        else if (tt.includes(token) || token.includes(tt)) score += 1;
      }
    }
    return { chunk, score };
  });

  return scored
    .filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, nRisultati)
    .map(x => x.chunk);
}

function formattaContesto(chunks) {
  if (!chunks.length) return '';
  return chunks.map((c, i) =>
    `[Fonte ${i+1}: "${c.titolo}" — ${c.tipo}]\n${c.testo}`
  ).join('\n\n---\n\n');
}

// ── CARICA KB ─────────────────────────────────────────────────────────────────

async function caricaKb() {
  const ora = Date.now();
  if (kbCache && (ora - kbCacheTime) < KB_TTL_MS) return kbCache;

  const res = await fetch(KB_URL);
  if (!res.ok) throw new Error(`KB non raggiungibile: ${res.status}`);
  kbCache = await res.json();
  kbCacheTime = ora;
  return kbCache;
}

// ── HANDLER VERCEL ────────────────────────────────────────────────────────────

module.exports = async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Metodo non consentito' });

  try {
    const { messages } = req.body;
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'messages mancante o vuoto' });
    }

    // Ultima domanda dell'utente
    const ultimaDomanda = messages.filter(m => m.role === 'user').pop()?.content || '';

    // Carica kb e cerca contesto rilevante
    let contesto = '';
    try {
      const kb = await caricaKb();
      const chunks = cercaChunk(kb, ultimaDomanda, MAX_CHUNK_CONTESTO);
      contesto = formattaContesto(chunks);
    } catch (e) {
      console.warn('KB non disponibile:', e.message);
    }

    // Costruisci system prompt con contesto
    const systemConContesto = contesto
      ? `${SYSTEM_PROMPT}\n\n===ARCHIVIO PERTINENTE===\n${contesto}\n===FINE ARCHIVIO===`
      : SYSTEM_PROMPT;

    // Chiama Claude
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const risposta = await client.messages.create({
      model: MODELLO,
      max_tokens: MAX_TOKENS_RISPOSTA,
      system: systemConContesto,
      messages: messages.map(m => ({
        role: m.role === 'assistant' ? 'assistant' : 'user',
        content: m.content,
      })),
    });

    const testo = risposta.content?.[0]?.text || '(nessuna risposta)';
    return res.status(200).json({ reply: testo });

  } catch (err) {
    console.error('Errore chat:', err);
    return res.status(500).json({ error: 'Errore interno', detail: err.message });
  }
};
