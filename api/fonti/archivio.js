/**
 * api/fonti/archivio.js — fonte "Archivio info.nodes"
 *
 * Espone i materiali dell'archivio (newsletter MARLA, pubblicazioni, inchieste,
 * letture di altre organizzazioni) come strumenti interrogabili, secondo
 * docs/CONTRATTO-FONTI.md.
 *
 * Legge la stessa kb.json che usa api/chat.js, ma la interroga in modo diverso.
 * chat.js assegna un punteggio per sovrapposizione di parole e passa al modello
 * i sei frammenti migliori: funziona per la divulgazione, non per la ricerca.
 * La domanda "cosa dice il nostro archivio sul controllo delle frontiere" non è
 * una domanda su quali documenti contengono quella parola.
 *
 * Qui l'archivio è invece presentato come un CATALOGO: sono 90 documenti, e i
 * loro titoli stanno tutti in poche migliaia di token. Il modello li legge e
 * sceglie con giudizio cosa aprire, invece di affidarsi al punteggio. La
 * ricerca testuale resta disponibile come secondo canale, con i suoi limiti
 * dichiarati.
 */

const ID_FONTE   = 'archivio';
const NOME_FONTE = 'Archivio info.nodes';
const KB_URL     = process.env.ARCHIVIO_KB_URL || 'https://infonodesets.github.io/MARLA/kb.json';

const TTL_MS = 10 * 60 * 1000;
let cache = null;
let cacheTime = 0;
let catalogo = null;

async function caricaKb() {
  const ora = Date.now();
  if (cache && (ora - cacheTime) < TTL_MS) return cache;

  if (KB_URL.startsWith('file:') || /^[A-Za-z]:/.test(KB_URL) || KB_URL.startsWith('/')) {
    const fs = require('fs');
    cache = JSON.parse(fs.readFileSync(KB_URL.replace(/^file:\/\//, ''), 'utf8'));
  } else {
    const res = await fetch(KB_URL);
    if (!res.ok) throw new Error(`archivio non raggiungibile: ${res.status}`);
    cache = await res.json();
  }
  cacheTime = ora;
  catalogo = null;
  return cache;
}

// Gli id dei frammenti sono "<documento>-<n>": il documento è tutto ciò che
// precede l'ultimo trattino seguito da cifre.
function idDocumento(idFrammento) {
  return String(idFrammento).replace(/-\d+$/, '');
}

function costruisciCatalogo(kb) {
  if (catalogo && catalogo.per === kb) return catalogo;

  const docs = new Map();
  for (const c of kb.chunks) {
    const id = idDocumento(c.id);
    if (!docs.has(id)) {
      docs.set(id, {
        id,
        titolo: c.titolo || id,
        tipo: c.tipo || null,
        raccolta: c.fonte || null,          // letture | pubblicazioni | archivio | MARLA newsletter
        editore: c.fonte_nome || null,      // chi l'ha pubblicato, se noto
        url: c.url || null,
        frammenti: [],
      });
    }
    docs.get(id).frammenti.push(c);
  }
  // I frammenti vanno riletti nell'ordine in cui sono stati scritti.
  for (const d of docs.values()) {
    d.frammenti.sort((a, b) => {
      const na = Number(String(a.id).match(/-(\d+)$/)?.[1] ?? 0);
      const nb = Number(String(b.id).match(/-(\d+)$/)?.[1] ?? 0);
      return na - nb;
    });
  }

  catalogo = { per: kb, docs };
  return catalogo;
}

function record(d, dati) {
  return {
    id: d.id,
    fonte: ID_FONTE,
    titolo: d.titolo,
    url: d.url || null,     // 42 documenti su 90 non hanno un link: si citano per titolo
    visibilita: 'pubblico',
    dati,
  };
}

function senzaAccenti(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

function incipit(d, n) {
  const t = (d.frammenti[0]?.testo || '').replace(/\s+/g, ' ').trim();
  return t.length > n ? t.slice(0, n) + '…' : t;
}

// ── Strumenti ─────────────────────────────────────────────────────────────────

const strumenti = [
  {
    name: 'archivio_catalogo',
    description:
      'Elenco COMPLETO dei documenti dell\'archivio info.nodes: newsletter MARLA, pubblicazioni ' +
      'dell\'organizzazione, materiali interni e report di altre organizzazioni. Per ognuno: ' +
      'titolo, tipo, editore edestratto iniziale. Sono circa 90 documenti. ' +
      'USA QUESTO PER PRIMO quando la domanda riguarda cosa dicono i nostri materiali su un tema: ' +
      'leggi i titoli e scegli tu quali documenti valga la pena aprire con archivio_leggi. ' +
      'È più affidabile della ricerca per parole, che trova solo corrispondenze letterali.',
    input_schema: {
      type: 'object',
      properties: {
        tipo: {
          type: 'string',
          description: 'Facoltativo, per restringere: newsletter, pubblicazione, archivio, lettura.',
        },
      },
    },
  },
  {
    name: 'archivio_cerca',
    description:
      'Cerca parole nel testo dei documenti dell\'archivio e restituisce i passaggi in cui ' +
      'compaiono. Ricerca LESSICALE, non semantica: trova solo le parole esatte che passi. ' +
      'I materiali sono in italiano e in inglese, quindi passa i termini in ENTRAMBE le lingue ' +
      'e più sinonimi (es. per le frontiere: "frontiere", "confini", "border", "Frontex", ' +
      '"sorveglianza migranti"). Un documento che usa parole diverse da quelle che hai pensato ' +
      'non verrà trovato: per questo il catalogo resta il canale principale.',
    input_schema: {
      type: 'object',
      properties: {
        parole: {
          type: 'array',
          items: { type: 'string' },
          description: 'Termini da cercare, in italiano e in inglese. Anche locuzioni.',
        },
      },
      required: ['parole'],
    },
  },
  {
    name: 'archivio_leggi',
    description:
      'Legge il testo di un documento dell\'archivio. I documenti lunghi sono divisi in parti: ' +
      'la risposta dice quante ce ne sono, chiedi le successive se serve.',
    input_schema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Identificativo del documento, dal catalogo o dalla ricerca.' },
        parte: { type: 'number', description: 'Numero della parte, da 1. Default 1.' },
      },
      required: ['id'],
    },
  },
];

// ── Esecuzione ────────────────────────────────────────────────────────────────

const FRAMMENTI_PER_PARTE = 6;

async function esegui(nome, args) {
  const kb = await caricaKb();
  const { docs } = costruisciCatalogo(kb);
  args = args || {};

  switch (nome) {

    case 'archivio_catalogo': {
      let elenco = [...docs.values()];
      if (args.tipo) {
        const t = senzaAccenti(args.tipo);
        elenco = elenco.filter(d => senzaAccenti(d.tipo).includes(t) || senzaAccenti(d.raccolta).includes(t));
      }
      const senzaLink = elenco.filter(d => !d.url).length;
      return {
        record: elenco.map(d => record(d, {
          tipo: d.tipo,
          raccolta: d.raccolta,
          editore: d.editore || null,
          parti: Math.ceil(d.frammenti.length / FRAMMENTI_PER_PARTE),
          incipit: incipit(d, 200),
        })),
        nota: `${elenco.length} documenti. ` +
              (senzaLink ? `${senzaLink} non hanno un link pubblico: vanno citati per titolo. ` : '') +
              `Aggiornato al ${kb.lastUpdated || 'n/d'}.`,
      };
    }

    case 'archivio_cerca': {
      // Come per i progetti EDF: una locuzione conta come trovata se tutte le
      // sue parole stanno nella stessa frase, non se compare letteralmente.
      const termini = (args.parole || [])
        .map(t => ({ testo: String(t), parole: senzaAccenti(t).split(/\s+/).filter(Boolean) }))
        .filter(t => t.parole.length);
      if (!termini.length) return { record: [], nota: 'Nessuna parola da cercare.' };

      const esiti = [];
      for (const d of docs.values()) {
        const trovate = new Set();
        const passaggi = [];
        for (const c of d.frammenti) {
          for (const frase of String(c.testo || '').split(/(?<=[.!?])\s+|\n+/)) {
            const f = senzaAccenti(frase);
            const qui = termini.filter(t => t.parole.every(w => f.includes(w)));
            if (!qui.length) continue;
            qui.forEach(t => trovate.add(t.testo));
            if (passaggi.length < 3) passaggi.push(frase.trim().slice(0, 320));
          }
        }
        if (trovate.size) esiti.push({ d, trovate: [...trovate], passaggi });
      }
      esiti.sort((a, b) => b.trovate.length - a.trovate.length);

      return {
        record: esiti.slice(0, 20).map(e => record(e.d, {
          tipo: e.d.tipo,
          editore: e.d.editore || null,
          parole_trovate: e.trovate,
          passaggi: e.passaggi,
        })),
        nota: `${esiti.length} documenti contengono almeno uno dei termini` +
              (esiti.length > 20 ? ', ne mostro 20' : '') + '. ' +
              'Ricerca lessicale: non trova i documenti che usano parole diverse da quelle cercate. ' +
              'Se il tema è importante, controlla anche il catalogo.',
      };
    }

    case 'archivio_leggi': {
      const d = docs.get(args.id);
      if (!d) return { record: [], nota: `Nessun documento con identificativo ${args.id}.` };

      const parti = Math.ceil(d.frammenti.length / FRAMMENTI_PER_PARTE);
      const n = Math.min(Math.max(1, Number(args.parte) || 1), parti);
      const testo = d.frammenti
        .slice((n - 1) * FRAMMENTI_PER_PARTE, n * FRAMMENTI_PER_PARTE)
        .map(c => c.testo).join('\n\n');

      return {
        record: [record(d, {
          tipo: d.tipo,
          editore: d.editore || null,
          parte: n,
          parti_totali: parti,
          testo,
        })],
        nota: parti > n
          ? `Parte ${n} di ${parti}. Chiedi la parte ${n + 1} per continuare.`
          : (parti > 1 ? `Parte ${n} di ${parti}: ultima.` : undefined),
      };
    }

    default:
      throw new Error(`Strumento sconosciuto: ${nome}`);
  }
}

module.exports = {
  id: ID_FONTE,
  nome: NOME_FONTE,
  visibilita: 'pubblico',
  strumenti,
  esegui,
};
