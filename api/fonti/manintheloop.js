/**
 * api/fonti/manintheloop.js — fonte "Man in the Loop"
 *
 * Espone il database dei finanziamenti alle armi autonome come insieme di
 * strumenti interrogabili. Vedi docs/CONTRATTO-FONTI.md per le regole comuni a
 * tutte le fonti: ogni record porta id, url e visibilità, e il modello può
 * citare solo ciò che gli strumenti gli hanno restituito.
 *
 * Legge data/mitl-index.json, la vista compatta generata da
 * scripts/build_chat_index.py nel repo manintheloop (~0,9 MB contro i ~12,7 MB
 * del database completo).
 */

const ID_FONTE   = 'manintheloop';
const NOME_FONTE = 'Man in the Loop';
const SITO       = 'https://infonodesets.github.io/manintheloop';
const INDICE_URL = process.env.MITL_INDEX_URL || `${SITO}/data/mitl-index.json`;

const TTL_MS = 30 * 60 * 1000;   // l'indice cambia di rado: mezz'ora basta
let cache = null;
let cacheTime = 0;

// In sviluppo si può puntare a un file locale invece che alla rete.
async function caricaIndice() {
  const ora = Date.now();
  if (cache && (ora - cacheTime) < TTL_MS) return cache;

  if (INDICE_URL.startsWith('file:') || INDICE_URL.startsWith('/') || /^[A-Za-z]:/.test(INDICE_URL)) {
    const fs = require('fs');
    const percorso = INDICE_URL.replace(/^file:\/\//, '');
    cache = JSON.parse(fs.readFileSync(percorso, 'utf8'));
  } else {
    const res = await fetch(INDICE_URL);
    if (!res.ok) throw new Error(`indice Man in the Loop non raggiungibile: ${res.status}`);
    cache = await res.json();
  }
  cacheTime = ora;
  return cache;
}

// ── Indici derivati, costruiti una volta sola per istanza ─────────────────────

let derivati = null;

function indici(idx) {
  if (derivati && derivati.per === idx) return derivati;

  const perId = new Map();
  idx.soggetti.forEach(s => perId.set(s.id, s));
  idx.progetti.forEach(p => perId.set(p.id, p));

  const investimentiIn = new Map();   // azienda  → relazioni ricevute
  const investimentiDa = new Map();   // investitore → relazioni fatte
  const edfPerSoggetto = new Map();   // soggetto → progetti EDF
  const edfPerProgetto = new Map();   // progetto → soggetti partecipanti

  for (const r of idx.relazioni) {
    if (r.tipo === 'investment') {
      if (!investimentiIn.has(r.a)) investimentiIn.set(r.a, []);
      investimentiIn.get(r.a).push(r);
      if (!investimentiDa.has(r.da)) investimentiDa.set(r.da, []);
      investimentiDa.get(r.da).push(r);
    } else if (r.tipo === 'edf_participation') {
      if (!edfPerSoggetto.has(r.da)) edfPerSoggetto.set(r.da, []);
      edfPerSoggetto.get(r.da).push(r);
      if (!edfPerProgetto.has(r.a)) edfPerProgetto.set(r.a, []);
      edfPerProgetto.get(r.a).push(r);
    }
  }

  derivati = { per: idx, perId, investimentiIn, investimentiDa, edfPerSoggetto, edfPerProgetto };
  return derivati;
}

// ── Helper ────────────────────────────────────────────────────────────────────

function senzaAccenti(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

function recordSoggetto(s, dati) {
  return {
    id: s.id,
    fonte: ID_FONTE,
    titolo: s.nome,
    url: s.url,
    visibilita: 'pubblico',
    dati: dati || {
      tipo: s.tipo,
      paese: s.paese,
      settori: s.settori,
      contributo_edf_eur: Number(s.edf_contributo) || 0,
      progetti_edf: s.edf_progetti || 0,
    },
  };
}

function recordProgetto(p, conObiettivo) {
  const dati = {
    acronimo: p.acronimo,
    bando: p.bando,
    stato: p.stato,
    periodo: [p.inizio, p.fine].filter(Boolean).join(' → ') || null,
    budget_totale_eur: Number(p.budget_totale) || null,
    contributo_ue_eur: Number(p.contributo_ue) || null,
    tipo_azione: p.tipo_azione,
    url_commissione: p.url_commissione || null,
  };
  if (conObiettivo) dati.obiettivo = p.obiettivo || null;
  return {
    id: p.id,
    fonte: ID_FONTE,
    titolo: p.titolo,
    url: p.url,
    visibilita: 'pubblico',
    dati,
  };
}

function confrontaPaese(a, b) {
  return senzaAccenti(a) === senzaAccenti(b);
}

// ── Strumenti ─────────────────────────────────────────────────────────────────

const strumenti = [
  {
    name: 'mitl_trova_soggetto',
    description:
      'Cerca un soggetto (azienda, università, istituzione, investitore, fondo) nel database ' +
      'Man in the Loop a partire dal nome, anche parziale. Usalo SEMPRE come primo passo quando ' +
      'la domanda nomina un soggetto: restituisce l\'identificativo che serve agli altri strumenti. ' +
      'Se restituisce più risultati, scegli in base a Paese e tipo, oppure chiedi conferma all\'utente.',
    input_schema: {
      type: 'object',
      properties: {
        nome: { type: 'string', description: 'Nome o parte del nome del soggetto.' },
        paese: { type: 'string', description: 'Facoltativo: restringe a un Paese (in inglese, es. "Italy").' },
      },
      required: ['nome'],
    },
  },
  {
    name: 'mitl_scheda_soggetto',
    description:
      'Scheda completa di un soggetto dato il suo identificativo: Paese, tipo, settori, ' +
      'fondi EDF ricevuti, progetti EDF a cui partecipa, quanti investitori ha e in quante ' +
      'aziende ha investito.',
    input_schema: {
      type: 'object',
      properties: { id: { type: 'string', description: 'Identificativo, es. IN-0723.' } },
      required: ['id'],
    },
  },
  {
    name: 'mitl_investitori_di',
    description:
      'Elenca i soggetti che hanno investito in una data azienda. Con il parametro "paese" ' +
      'risponde a domande del tipo "questa società ha investitori con sede in Cile?". ' +
      'ATTENZIONE: il database registra il legame investitore-azienda, NON la cifra investita.',
    input_schema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Identificativo dell\'azienda partecipata.' },
        paese: { type: 'string', description: 'Facoltativo: filtra gli investitori per Paese di sede.' },
      },
      required: ['id'],
    },
  },
  {
    name: 'mitl_partecipazioni_di',
    description:
      'Elenca le aziende in cui un investitore o fondo ha investito. È il verso opposto di ' +
      'mitl_investitori_di.',
    input_schema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Identificativo dell\'investitore.' },
        paese: { type: 'string', description: 'Facoltativo: filtra le partecipate per Paese.' },
      },
      required: ['id'],
    },
  },
  {
    name: 'mitl_indice_progetti',
    description:
      'Elenco compatto di TUTTI i progetti EDF nel database: identificativo, acronimo, titolo, ' +
      'bando e contributo UE, senza il testo degli obiettivi. Utile per farsi un quadro o per ' +
      'contare. Per capire di cosa tratta un progetto serve mitl_dettaglio_progetti.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'mitl_cerca_progetti',
    description:
      'Cerca parole nel testo degli obiettivi dei progetti EDF e restituisce i progetti candidati ' +
      'con le frasi in cui le parole compaiono. È una ricerca LESSICALE, non semantica: produce ' +
      'falsi positivi (cercando "border" trovi anche "cross-border cooperation", che è ' +
      'cooperazione fra Stati e non controllo delle frontiere). Passa più sinonimi in inglese, ' +
      'poi LEGGI le frasi restituite e scarta tu i risultati non pertinenti. Se un progetto ti ' +
      'sembra rilevante, apri il testo completo con mitl_dettaglio_progetti prima di citarlo.',
    input_schema: {
      type: 'object',
      properties: {
        parole: {
          type: 'array',
          items: { type: 'string' },
          description: 'Parole o radici da cercare, in inglese (i testi sono in inglese).',
        },
      },
      required: ['parole'],
    },
  },
  {
    name: 'mitl_dettaglio_progetti',
    description:
      'Testo completo degli obiettivi di uno o più progetti EDF, insieme a budget, date e bando. ' +
      'Usalo per giudicare se un progetto riguarda davvero il tema chiesto, prima di citarlo.',
    input_schema: {
      type: 'object',
      properties: {
        ids: {
          type: 'array',
          items: { type: 'string' },
          description: 'Identificativi dei progetti, es. ["EDF-0012","EDF-0043"]. Massimo 12.',
        },
      },
      required: ['ids'],
    },
  },
  {
    name: 'mitl_partecipanti_progetto',
    description:
      'Elenca i soggetti che partecipano a un progetto EDF, con Paese e tipo. Risponde a ' +
      '"chi c\'è dentro questo progetto" e "quali Paesi sono coinvolti".',
    input_schema: {
      type: 'object',
      properties: { id: { type: 'string', description: 'Identificativo del progetto, es. EDF-0012.' } },
      required: ['id'],
    },
  },
];

// ── Esecuzione ────────────────────────────────────────────────────────────────

async function esegui(nome, args) {
  const idx = await caricaIndice();
  const { perId, investimentiIn, investimentiDa, edfPerSoggetto, edfPerProgetto } = indici(idx);
  args = args || {};

  switch (nome) {

    case 'mitl_trova_soggetto': {
      const ago = senzaAccenti(args.nome);
      if (!ago) return { record: [], nota: 'Nome vuoto.' };
      let esiti = idx.soggetti.filter(s => senzaAccenti(s.nome).includes(ago));
      if (args.paese) esiti = esiti.filter(s => confrontaPaese(s.paese, args.paese));
      // Prima le corrispondenze esatte, poi i nomi più corti (meno rumore).
      esiti.sort((a, b) => {
        const ea = senzaAccenti(a.nome) === ago ? 0 : 1;
        const eb = senzaAccenti(b.nome) === ago ? 0 : 1;
        return ea - eb || a.nome.length - b.nome.length;
      });
      const troppi = esiti.length > 15;
      return {
        record: esiti.slice(0, 15).map(s => recordSoggetto(s)),
        nota: troppi
          ? `${esiti.length} corrispondenze, ne mostro 15. Restringi il nome o indica il Paese.`
          : undefined,
      };
    }

    case 'mitl_scheda_soggetto': {
      const s = perId.get(args.id);
      if (!s || args.id.startsWith('EDF-')) {
        return { record: [], nota: `Nessun soggetto con identificativo ${args.id}.` };
      }
      const progetti = (edfPerSoggetto.get(s.id) || [])
        .map(r => perId.get(r.a)).filter(Boolean)
        .map(p => ({ id: p.id, acronimo: p.acronimo, titolo: p.titolo }));
      return {
        record: [recordSoggetto(s, {
          tipo: s.tipo,
          paese: s.paese,
          settori: s.settori,
          contributo_edf_eur: Number(s.edf_contributo) || 0,
          progetti_edf: progetti,
          numero_investitori: (investimentiIn.get(s.id) || []).length,
          numero_partecipazioni: (investimentiDa.get(s.id) || []).length,
        })],
      };
    }

    case 'mitl_investitori_di':
    case 'mitl_partecipazioni_di': {
      const inverso = nome === 'mitl_partecipazioni_di';
      const s = perId.get(args.id);
      if (!s) return { record: [], nota: `Nessun soggetto con identificativo ${args.id}.` };

      const rel = (inverso ? investimentiDa : investimentiIn).get(args.id) || [];
      const tutti = rel.map(r => ({ s: perId.get(inverso ? r.a : r.da), lead: !!r.lead }))
                       .filter(x => x.s);

      // Per una parte dei soggetti il Paese non è noto. Filtrare in silenzio
      // trasformerebbe "non lo sappiamo" in "non c'è": vanno dichiarati.
      const ignoti = tutti.filter(x => !x.s.paese);
      let altri = tutti;
      if (args.paese) altri = tutti.filter(x => confrontaPaese(x.s.paese, args.paese));

      const avviso = 'Il database registra il legame investitore-azienda, non l\'importo investito.';
      let nota;
      if (args.paese) {
        nota = `${altri.length} corrispondenze per "${args.paese}" su ${tutti.length} soggetti collegati.`;
        if (ignoti.length) {
          nota += ` Attenzione: per ${ignoti.length} di essi il Paese non è noto ` +
                  `(${ignoti.map(x => x.s.nome).join(', ')}), quindi non è possibile ` +
                  `né confermarli né escluderli.`;
        }
        nota += ' ' + avviso;
      } else {
        nota = avviso;
        if (ignoti.length) nota += ` Paese non noto per ${ignoti.length} soggetti su ${tutti.length}.`;
      }

      return {
        record: altri.map(x => recordSoggetto(x.s, {
          tipo: x.s.tipo,
          paese: x.s.paese,
          ruolo: x.lead ? 'lead investor' : 'investitore',
          relazione: inverso ? `${s.nome} ha investito in ${x.s.nome}` : `${x.s.nome} ha investito in ${s.nome}`,
        })),
        nota,
      };
    }

    case 'mitl_indice_progetti': {
      return {
        record: idx.progetti.map(p => ({
          id: p.id,
          fonte: ID_FONTE,
          titolo: p.titolo,
          url: p.url,
          visibilita: 'pubblico',
          dati: {
            acronimo: p.acronimo,
            bando: p.bando,
            contributo_ue_eur: Number(p.contributo_ue) || null,
            stato: p.stato,
          },
        })),
        nota: `${idx.progetti.length} progetti EDF. Il testo degli obiettivi è disponibile per ` +
              `${idx.progetti.filter(p => p.obiettivo).length} di essi tramite mitl_dettaglio_progetti.`,
      };
    }

    case 'mitl_cerca_progetti': {
      // Un termine può essere una locuzione ("border control"). Cercarla come
      // stringa intera non funziona: nei testi EDF quelle parole ricorrono
      // vicine ma quasi mai attaccate. Un termine conta come trovato se TUTTE
      // le sue parole compaiono nella STESSA frase — abbastanza vicine da
      // essere probabilmente collegate, senza pretendere l'ordine esatto.
      const termini = (args.parole || [])
        .map(t => ({ testo: String(t), parole: senzaAccenti(t).split(/\s+/).filter(Boolean) }))
        .filter(t => t.parole.length);
      if (!termini.length) return { record: [], nota: 'Nessuna parola da cercare.' };

      const esiti = [];
      for (const p of idx.progetti) {
        if (!p.obiettivo) continue;
        const frasiTesto = p.obiettivo.split(/(?<=[.!?])\s+|\n+/).filter(f => f.trim());
        const trovate = new Set();
        const frasi = [];

        for (const frase of frasiTesto) {
          const f = senzaAccenti(frase);
          const qui = termini.filter(t => t.parole.every(w => f.includes(w)));
          if (!qui.length) continue;
          qui.forEach(t => trovate.add(t.testo));
          if (frasi.length < 3) frasi.push(frase.trim());
        }
        if (!trovate.size) continue;
        esiti.push({ p, trovate: [...trovate], frasi });
      }

      esiti.sort((a, b) => b.trovate.length - a.trovate.length);

      return {
        record: esiti.map(e => ({
          id: e.p.id,
          fonte: ID_FONTE,
          titolo: e.p.titolo,
          url: e.p.url,
          visibilita: 'pubblico',
          dati: {
            acronimo: e.p.acronimo,
            bando: e.p.bando,
            parole_trovate: e.trovate,
            frasi: e.frasi,
          },
        })),
        nota: `${esiti.length} progetti contengono almeno una delle parole. Ricerca lessicale: ` +
              `leggi le frasi e scarta i risultati non pertinenti prima di citarli.`,
      };
    }

    case 'mitl_dettaglio_progetti': {
      const ids = (args.ids || []).slice(0, 12);
      const record = [];
      const mancanti = [];
      for (const id of ids) {
        const p = perId.get(id);
        if (p && id.startsWith('EDF-')) record.push(recordProgetto(p, true));
        else mancanti.push(id);
      }
      return {
        record,
        nota: mancanti.length ? `Identificativi non trovati: ${mancanti.join(', ')}.` : undefined,
      };
    }

    case 'mitl_partecipanti_progetto': {
      const p = perId.get(args.id);
      if (!p || !args.id.startsWith('EDF-')) {
        return { record: [], nota: `Nessun progetto con identificativo ${args.id}.` };
      }
      const parti = (edfPerProgetto.get(args.id) || [])
        .map(r => perId.get(r.da)).filter(Boolean);
      const paesi = [...new Set(parti.map(s => s.paese).filter(Boolean))].sort();
      return {
        record: parti.map(s => recordSoggetto(s, { tipo: s.tipo, paese: s.paese })),
        nota: `${parti.length} partecipanti al progetto ${p.acronimo || p.id}, ` +
              `da ${paesi.length} Paesi: ${paesi.join(', ')}.`,
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
