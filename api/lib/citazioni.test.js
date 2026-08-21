/**
 * Test del controllo citazioni.  Esecuzione:
 *   "C:\Program Files\nodejs\node.exe" api/lib/citazioni.test.js
 *
 * Nessuna dipendenza: gira senza npm install e senza chiamare l'API.
 */

const c = require('./citazioni');

let falliti = 0;
function prova(nome, condizione, dettaglio) {
  if (condizione) { console.log('  ok   ' + nome); }
  else { falliti++; console.log('  FALLITO  ' + nome + (dettaglio ? '\n         ' + dettaglio : '')); }
}

const SITO = 'https://infonodesets.github.io/manintheloop';

// Quello che uno strumento ha davvero restituito
const consentiti = c.raccogli([
  { id: 'IN-1302', fonte: 'manintheloop', titolo: 'KoBold Metals', url: `${SITO}/search.html?organization=IN-1302` },
  { id: 'EDF-0047', fonte: 'manintheloop', titolo: 'EUROGUARD', url: `${SITO}/networks.html?selected=EDF-0047`,
    dati: { url_commissione: 'https://ec.europa.eu/info/funding-tenders/opportunities/portal/x' } },
], c.nuoviConsentiti());

console.log('\n1. Riferimenti legittimi passano');
{
  const t = `Dal database risulta che [KoBold Metals](${SITO}/search.html?organization=IN-1302) ` +
            `non ha investitori cileni. Il progetto [EUROGUARD](${SITO}/networks.html?selected=EDF-0047) ` +
            `(EDF-0047) vale 65 milioni.`;
  prova('nessun problema su citazioni vere', c.nonValide(t, consentiti).length === 0,
        JSON.stringify(c.nonValide(t, consentiti)));
}

console.log('\n2. URL inventato viene intercettato');
{
  const t = `Vedi la scheda su ${SITO}/search.html?organization=IN-9999 per i dettagli.`;
  const p = c.nonValide(t, consentiti);
  prova('URL non restituito segnalato', p.includes(`${SITO}/search.html?organization=IN-9999`));
  prova('identificativo inventato segnalato', p.includes('IN-9999'));
}

console.log('\n3. Identificativo plausibile ma mai restituito');
{
  const t = 'Il progetto EDF-0099 sviluppa sistemi di sorveglianza.';
  prova('EDF-0099 segnalato', c.nonValide(t, consentiti).includes('EDF-0099'));
}

console.log('\n4. Il link della fonte primaria è ammesso se lo strumento l\'ha dato');
{
  const t = 'Scheda ufficiale: https://ec.europa.eu/info/funding-tenders/opportunities/portal/x';
  prova('url_commissione accettato', c.nonValide(t, consentiti).length === 0);
}

console.log('\n5. Il sito di info.nodes è sempre ammesso');
{
  const t = 'Trovi tutto su https://www.infonodes.org e anche su https://infonodes.org/chi-siamo';
  prova('dominio infonodes accettato', c.nonValide(t, consentiti).length === 0);
}

console.log('\n6. La punteggiatura finale non falsa il confronto');
{
  const t = `Vedi [KoBold](${SITO}/search.html?organization=IN-1302).`;
  prova('parentesi di chiusura non conta come URL', c.nonValide(t, consentiti).length === 0,
        JSON.stringify(c.nonValide(t, consentiti)));
}

console.log('\n7. Neutralizzazione: il link sparisce, il testo resta');
{
  const finto = `${SITO}/search.html?organization=IN-9999`;
  const t = `Secondo [Azienda Fantasma](${finto}) i dati sono questi.`;
  const out = c.neutralizza(t, c.nonValide(t, consentiti));
  prova('URL rimosso', !out.includes('IN-9999'), out);
  prova('nome leggibile conservato', out.includes('Azienda Fantasma'), out);
  prova('frase ancora sensata', /Secondo Azienda Fantasma i dati sono questi\./.test(out), out);
}

console.log('\n8. Neutralizzazione parziale: i riferimenti buoni sopravvivono');
{
  const finto = 'https://esempio.invalido/x';
  const t = `Vero: [KoBold Metals](${SITO}/search.html?organization=IN-1302). Falso: [X](${finto}).`;
  const out = c.neutralizza(t, c.nonValide(t, consentiti));
  prova('link valido intatto', out.includes(`${SITO}/search.html?organization=IN-1302`), out);
  prova('link inventato rimosso', !out.includes('esempio.invalido'), out);
}

console.log('\n' + (falliti ? `${falliti} TEST FALLITI` : 'tutti i test passati'));
process.exit(falliti ? 1 : 0);
