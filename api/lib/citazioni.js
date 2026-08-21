/**
 * api/lib/citazioni.js — si cita solo ciò che gli strumenti hanno restituito.
 *
 * È la regola 3 di docs/CONTRATTO-FONTI.md, e vive in un modulo a parte per due
 * ragioni: non dipende da nulla, quindi è testabile senza chiamare l'API; ed è
 * la parte su cui poggia l'affidabilità di tutto il resto, quindi va tenuta
 * piccola e leggibile.
 *
 * Il modo tipico in cui questi sistemi sbagliano non è tacere: è attribuire
 * alla fonte sbagliata un dato letto altrove, o produrre un indirizzo
 * verosimile che non esiste. Chiederlo nel prompt non basta, perché quella
 * richiesta compete con tutte le altre istruzioni.
 */

const RE_URL = /https?:\/\/[^\s)\]<>"']+/g;
// Identificativi citabili, per fonte: IN/IV/EDF vengono da Man in the Loop,
// FOIA dal registro delle richieste di accesso. Una fonte nuova che usa un
// prefisso diverso va aggiunta qui, altrimenti i suoi id inventati passano.
const RE_ID  = /\b(?:IN|IV|EDF)-\d{3,5}\b|\bFOIA-\d{1,5}\b/g;

// Link che non arrivano dagli strumenti ma sono legittimi: il sito
// dell'organizzazione, che MARLA cita per sua natura.
const SEMPRE_AMMESSI = [/^https?:\/\/(www\.)?infonodes\.org(\/|$)/];

function ripulisci(url) {
  return String(url).replace(/[.,;:)\]]+$/, '');
}

function nuoviConsentiti() {
  return { id: new Set(), url: new Set() };
}

/** Registra ciò che uno strumento ha restituito: da qui in poi è citabile. */
function raccogli(record, consentiti) {
  for (const r of record || []) {
    if (r.id)  consentiti.id.add(r.id);
    if (r.url) consentiti.url.add(ripulisci(r.url));
    const primaria = r.dati && r.dati.url_commissione;
    if (primaria) consentiti.url.add(ripulisci(primaria));
  }
  return consentiti;
}

/** Riferimenti presenti nel testo che nessuno strumento ha restituito. */
function nonValide(testo, consentiti) {
  const problemi = [];
  for (const grezzo of String(testo).match(RE_URL) || []) {
    const url = ripulisci(grezzo);
    if (SEMPRE_AMMESSI.some(re => re.test(url))) continue;
    if (!consentiti.url.has(url)) problemi.push(url);
  }
  for (const id of String(testo).match(RE_ID) || []) {
    if (!consentiti.id.has(id)) problemi.push(id);
  }
  return [...new Set(problemi)];
}

/**
 * Ultima risorsa, se il modello sbaglia anche dopo la correzione: i riferimenti
 * inventati restano come testo semplice invece che come link cliccabili. La
 * risposta resta leggibile, ma nessuno finisce su un indirizzo che non esiste.
 */
function neutralizza(testo, problemi) {
  let out = String(testo);
  for (const p of problemi) {
    const esc = p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    out = out.replace(new RegExp(`\\[([^\\]]*)\\]\\(\\s*${esc}\\s*\\)`, 'g'), '$1');
    out = out.replace(new RegExp(`\\(\\s*${esc}\\s*\\)`, 'g'), '');
    out = out.replace(new RegExp(esc, 'g'), '');
  }
  return out.replace(/[ \t]{2,}/g, ' ').replace(/ +([.,;:])/g, '$1').trim();
}

module.exports = { nuoviConsentiti, raccogli, nonValide, neutralizza };
