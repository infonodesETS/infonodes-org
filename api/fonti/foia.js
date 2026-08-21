/**
 * api/fonti/foia.js — fonte "FOIA Tracker" (INTERNA)
 *
 * Il registro delle richieste di accesso agli atti inviate dal team: a quale
 * ente, con quale esito, con quali scadenze. Vedi docs/CONTRATTO-FONTI.md.
 *
 * QUESTA FONTE È `interno`. A differenza delle altre contiene dati non
 * pubblicati — richieste in corso, chi le ha inviate — e per questo:
 *
 *   - non esiste un file indice come per Man in the Loop. Questo repository è
 *     PUBBLICO: un indice committato sarebbe leggibile da chiunque. I dati si
 *     leggono dal vivo dal Google Sheet a ogni richiesta;
 *   - la colonna EMAIL non viene MAI restituita, nemmeno all'interno. Serve
 *     solo ai promemoria dell'app foia.nodes;
 *   - la porta pubblica non deve caricare questa fonte (vedi
 *     strumentiDisponibili in api/mitl.js).
 *
 * Autenticazione: service account Google, lo stesso di foia.nodes. Firmiamo un
 * JWT a mano con `crypto` invece di usare googleapis, che pesa decine di MB e
 * peggiorerebbe ogni avvio a freddo della funzione.
 *
 * Variabili d'ambiente (stessi nomi di foia.nodes):
 *   GOOGLE_SPREADSHEET_ID, GOOGLE_SHEET_NAME, GOOGLE_CLIENT_EMAIL, GOOGLE_PRIVATE_KEY
 */

const crypto = require('crypto');

const ID_FONTE   = 'foia';
const NOME_FONTE = 'FOIA Tracker';
const APP_URL    = 'https://foia-nodes.vercel.app';

const TTL_MS = 5 * 60 * 1000;   // il foglio cambia spesso: cache breve
let cache = null;
let cacheTime = 0;

// ── Accesso al foglio ─────────────────────────────────────────────────────────

function base64url(buf) {
  return Buffer.from(buf).toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function tokenAccesso() {
  const email = process.env.GOOGLE_CLIENT_EMAIL;
  const chiave = (process.env.GOOGLE_PRIVATE_KEY || '').replace(/\\n/g, '\n');
  if (!email || !chiave) throw new Error('credenziali Google non configurate');

  const ora = Math.floor(Date.now() / 1000);
  const intestazione = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const corpo = base64url(JSON.stringify({
    iss: email,
    scope: 'https://www.googleapis.com/auth/spreadsheets.readonly',
    aud: 'https://oauth2.googleapis.com/token',
    iat: ora,
    exp: ora + 3600,
  }));
  const firma = base64url(
    crypto.createSign('RSA-SHA256').update(`${intestazione}.${corpo}`).sign(chiave)
  );

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: `${intestazione}.${corpo}.${firma}`,
    }),
  });
  if (!res.ok) throw new Error(`autenticazione Google fallita: ${res.status}`);
  return (await res.json()).access_token;
}

// Colonne del foglio, A..V. L'ordine è quello di foia.nodes/types/index.ts:
// se cambia lì, va cambiato anche qui.
const COLONNE = [
  'numero', 'inviatoDa', 'ente', 'oggetto', 'stato', 'dataInvio',
  'deadlineRisposta', 'giorni', 'esitoRisposta', 'note', 'dataRisposta',
  'riesameRpct', 'invioRiesame', 'deadlineRiesame', 'risultato', 'ricorsoTar',
  'email',            // <- mai restituita: vedi rimuoviEmail()
  'allegatoRichiesta', 'allegatoRisposta', 'ultimaModifica', 'tagProgetto', 'notifiche',
];

// GOOGLE_SHEET_NAME è di norma vuota, anche su foia.nodes: in quel caso il nome
// del foglio (la scheda) va chiesto all'API, come fa resolveSheetName() là.
// Indovinarlo — "Foglio1" — funziona solo se la scheda si chiama davvero così.
let nomeFoglio = null;

async function risolviNomeFoglio(id, token) {
  const configurato = (process.env.GOOGLE_SHEET_NAME || '').trim();
  if (configurato) return configurato;
  if (nomeFoglio) return nomeFoglio;

  const url = `https://sheets.googleapis.com/v4/spreadsheets/${id}` +
              `?fields=sheets.properties.title`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`documento non leggibile: ${res.status}`);
  const primo = ((await res.json()).sheets || [])[0]?.properties?.title;
  if (!primo) throw new Error('nessun foglio trovato nel documento');

  nomeFoglio = primo;
  return primo;
}

async function caricaRichieste() {
  const adesso = Date.now();
  if (cache && (adesso - cacheTime) < TTL_MS) return cache;

  const id = process.env.GOOGLE_SPREADSHEET_ID;
  if (!id) throw new Error('GOOGLE_SPREADSHEET_ID non configurato');

  const token = await tokenAccesso();
  const foglio = await risolviNomeFoglio(id, token);
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${id}/values/` +
              `${encodeURIComponent(foglio + '!A:V')}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`foglio non leggibile: ${res.status}`);

  const righe = (await res.json()).values || [];
  const dati = righe.slice(1)   // la prima riga sono le intestazioni
    .map((riga, i) => {
      const r = { rigaFoglio: i + 2 };
      COLONNE.forEach((nome, c) => { r[nome] = (riga[c] || '').toString().trim(); });
      return r;
    })
    .filter(r => r.ente || r.oggetto);   // scarta righe vuote in coda

  cache = dati;
  cacheTime = adesso;
  return dati;
}

// ── Record ────────────────────────────────────────────────────────────────────

// La email non esce mai da qui, nemmeno verso l'interfaccia interna: serve solo
// ai promemoria di foia.nodes e non aggiunge niente a una ricerca.
function rimuoviEmail(r) {
  const { email, notifiche, rigaFoglio, ...resto } = r;
  return resto;
}

function record(r, dati) {
  const numero = r.numero || String(r.rigaFoglio);
  return {
    id: `FOIA-${numero}`,
    fonte: ID_FONTE,
    titolo: `${r.oggetto || 'richiesta senza oggetto'} — ${r.ente || 'ente non indicato'}`,
    // Lo strumento è ad accesso riservato: il link porta all'elenco, non a una
    // pagina pubblica della singola richiesta.
    url: APP_URL,
    visibilita: 'interno',
    dati: dati || rimuoviEmail(r),
  };
}

function senzaAccenti(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

function contiene(r, termine) {
  const t = senzaAccenti(termine);
  return ['ente', 'oggetto', 'note', 'esitoRisposta', 'risultato', 'tagProgetto', 'inviatoDa']
    .some(c => senzaAccenti(r[c]).includes(t));
}

// ── Strumenti ─────────────────────────────────────────────────────────────────

const strumenti = [
  {
    name: 'foia_elenco',
    description:
      'Elenco delle richieste di accesso agli atti (FOIA) inviate dal team info.nodes: ' +
      'ente destinatario, oggetto, stato, date, esito. Filtri facoltativi per ente, esito, ' +
      'progetto o stato. DATI INTERNI: riguardano anche richieste ancora in corso.',
    input_schema: {
      type: 'object',
      properties: {
        ente: { type: 'string', description: 'Filtra per ente destinatario, anche parziale.' },
        progetto: { type: 'string', description: 'Filtra per tag progetto.' },
        esito: { type: 'string', description: 'Filtra per esito, es. "rifiuto", "accoglimento".' },
        solo_con_risposta: { type: 'boolean', description: 'Se vero, solo le richieste che hanno avuto risposta.' },
      },
    },
  },
  {
    name: 'foia_cerca',
    description:
      'Cerca parole fra le richieste FOIA: oggetto, ente, note, esito, progetto, mittente. ' +
      'Utile per "cosa abbiamo chiesto su X" o "abbiamo mai scritto al ministero Y". ' +
      'Ricerca lessicale: passa più sinonimi.',
    input_schema: {
      type: 'object',
      properties: {
        parole: { type: 'array', items: { type: 'string' }, description: 'Termini da cercare.' },
      },
      required: ['parole'],
    },
  },
  {
    name: 'foia_scheda',
    description:
      'Tutti i dettagli di una singola richiesta FOIA dato il suo identificativo (es. FOIA-12): ' +
      'fasi, date, riesame, ricorso al TAR, note e link ai documenti allegati.',
    input_schema: {
      type: 'object',
      properties: { id: { type: 'string', description: 'Identificativo, es. FOIA-12.' } },
      required: ['id'],
    },
  },
];

// ── Esecuzione ────────────────────────────────────────────────────────────────

async function esegui(nome, args) {
  const richieste = await caricaRichieste();
  args = args || {};

  const avviso = 'Dati interni del team: comprendono richieste ancora aperte. ' +
                 'Il registro contiene i metadati delle richieste e i link ai documenti, ' +
                 'NON il testo delle risposte ricevute.';

  switch (nome) {

    case 'foia_elenco': {
      let esiti = richieste;
      if (args.ente)     esiti = esiti.filter(r => senzaAccenti(r.ente).includes(senzaAccenti(args.ente)));
      if (args.progetto) esiti = esiti.filter(r => senzaAccenti(r.tagProgetto).includes(senzaAccenti(args.progetto)));
      if (args.esito)    esiti = esiti.filter(r =>
        senzaAccenti(r.esitoRisposta).includes(senzaAccenti(args.esito)) ||
        senzaAccenti(r.risultato).includes(senzaAccenti(args.esito)));
      if (args.solo_con_risposta) esiti = esiti.filter(r => r.dataRisposta);

      return {
        record: esiti.slice(0, 60).map(r => record(r, {
          ente: r.ente,
          oggetto: r.oggetto,
          stato: r.stato,
          inviata_il: r.dataInvio,
          scadenza_risposta: r.deadlineRisposta,
          risposta_il: r.dataRisposta || null,
          esito: r.esitoRisposta || null,
          progetto: r.tagProgetto || null,
          ha_documento_risposta: !!r.allegatoRisposta,
        })),
        nota: `${esiti.length} richieste su ${richieste.length}` +
              (esiti.length > 60 ? ', ne mostro 60' : '') + '. ' + avviso,
      };
    }

    case 'foia_cerca': {
      const parole = (args.parole || []).filter(Boolean);
      if (!parole.length) return { record: [], nota: 'Nessuna parola da cercare.' };
      const esiti = richieste
        .map(r => ({ r, trovate: parole.filter(p => contiene(r, p)) }))
        .filter(x => x.trovate.length)
        .sort((a, b) => b.trovate.length - a.trovate.length);

      return {
        record: esiti.slice(0, 40).map(x => record(x.r, {
          ente: x.r.ente,
          oggetto: x.r.oggetto,
          stato: x.r.stato,
          esito: x.r.esitoRisposta || null,
          note: x.r.note || null,
          progetto: x.r.tagProgetto || null,
          parole_trovate: x.trovate,
        })),
        nota: `${esiti.length} richieste contengono almeno uno dei termini. ` +
              'Ricerca lessicale sul registro. ' + avviso,
      };
    }

    case 'foia_scheda': {
      const num = String(args.id || '').replace(/^FOIA-/i, '');
      const r = richieste.find(x => (x.numero || String(x.rigaFoglio)) === num);
      if (!r) return { record: [], nota: `Nessuna richiesta con identificativo ${args.id}.` };
      return {
        record: [record(r)],
        nota: (r.allegatoRisposta
          ? 'Il documento di risposta è su Drive: posso darne il link, non leggerne il contenuto. '
          : 'Nessun documento di risposta allegato. ') + avviso,
      };
    }

    default:
      throw new Error(`Strumento sconosciuto: ${nome}`);
  }
}

module.exports = {
  id: ID_FONTE,
  nome: NOME_FONTE,
  visibilita: 'interno',
  strumenti,
  esegui,
};
