# TO DO — verso la pubblicazione (settembre 2026)

Lista delle cose da fare/valutare. Aggiornarla man mano: spuntare ciò che è
fatto, aggiungere ciò che emerge.

## MARLA unica: fondere archivio e database

Obiettivo: **una sola interfaccia e un solo chatbot** che risponde sia con i
materiali dell'archivio sia con i dati di Man in the Loop e dei database futuri,
dichiarando sempre da quale fonte viene ogni affermazione.
Vedi `docs/CONTRATTO-FONTI.md` e la sezione "MARLA sui dati" in `CLAUDE.md`.

Stato: le due fonti esistono e rispettano il contratto, ma **non sono ancora
unite**: `api/mitl.js` ha nel registro solo `manintheloop`.

- [ ] **Sistemare i titoli della kb** — 14 documenti su 83 hanno titoli inutilizzabili
      (`INTRO`, `INDICE`, `152521782.sesso-e-potere-2025`, `marla222`): sono nomi di file
      Substack. Il nuovo approccio fa scegliere al modello **dai titoli del catalogo**,
      quindi un titolo muto rende il documento quasi invisibile. Da correggere in
      `scripts/costruisci_kb.py`, estraendo il titolo dal contenuto invece che dal nome
      del file. **Farlo PRIMA di misurare la qualità delle risposte incrociate**,
      altrimenti non si distingue una risposta debole per il metodo da una debole per
      i titoli. Migliora anche la MARLA attuale.
- [ ] **Aggiungere `archivio` al registro delle fonti** in `api/mitl.js` (una riga).
- [ ] **Spostare la pagina pubblica sul nuovo endpoint** — il widget in `index.html`
      chiama `/api/chat`; va portato su `/api/mitl`, che vede entrambe le fonti.
      Accesso deciso: pagina raggiungibile ma non pubblicizzata, link con codice
      condiviso con 4-5 soci. Un solo livello, tutte le fonti.
- [ ] **Tetti di spesa prima di aprire** — il tool use costa molto più della singola
      chiamata di oggi: più giri, modello più capace. Serve limite per IP, tetto ai
      giri, e misurare il costo reale su qualche decina di domande vere. Valutare
      Haiku per la porta pubblica.
- [ ] **`/api/chat` non ha alcun limite di chiamate** e ha CORS aperto, in un repo
      pubblico che ne documenta l'indirizzo. Esposizione che esiste già oggi,
      indipendente dalla fusione: mettere un tetto a prescindere.

Limiti noti, da tenere presenti e dichiarare nelle risposte:
- 41 documenti su 83 non hanno un link: si citano per titolo (il contratto lo prevede).
- La ricerca nell'archivio è lessicale. Cercando "frontiere/confini/border" il primo
  risultato è un passaggio sul megaprogetto saudita NEOM dove "superare i confini" è
  figurato — stesso tipo di falso positivo del "cross-border cooperation" nei progetti
  EDF. Il catalogo è il canale principale, la ricerca il secondo.
- Gli embedding risolverebbero la copertura, ma con 83 documenti il guadagno è modesto
  e aggiungono un fornitore e una chiave: da riconsiderare verso le centinaia di documenti.

## Da fare
- [ ] **Stile e linguaggio di MARLA** — affinare il system prompt (tono, autrici/autori
      di riferimento, esempi di voce). Sessione dedicata.
- [ ] **Dominio personalizzato** — collegare infonodes.org o un sottodominio
      (es. marla.infonodes.org) a GitHub Pages: DNS su Register.it + file CNAME.

## Da valutare
- [ ] Pagina/nota legale (licenza CC BY-SA citata nel footer, privacy policy minima)
- [ ] Test del sito su mobile prima della pubblicazione
- [ ] Limite di spesa mensile impostato sulla console Anthropic (verificare)

## Fatto
- [x] Statistiche anonime attive: https://marlamag.vercel.app/api/stats (12/06/2026)
- [x] Riga privacy nel footer di tutte le pagine (12/06/2026)
- [x] Sito retro + chatbot MARLA funzionante (giugno 2026)
- [x] Sezioni: pubblicazioni, archivio, letture, MARLA newsletter
- [x] Rename repository in MARLA, pulizia struttura (12/06/2026)
