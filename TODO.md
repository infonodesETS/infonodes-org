# TO DO — verso la pubblicazione (settembre 2026)

Lista delle cose da fare/valutare. Aggiornarla man mano: spuntare ciò che è
fatto, aggiungere ciò che emerge.

## MARLA unica: fondere archivio e database

Obiettivo: **una sola interfaccia e un solo chatbot** che risponde sia con i
materiali dell'archivio sia con i dati di Man in the Loop e dei database futuri,
dichiarando sempre da quale fonte viene ogni affermazione.
Vedi `docs/CONTRATTO-FONTI.md` e la sezione "MARLA sui dati" in `CLAUDE.md`.

Stato al 21/08/2026: **le due fonti sono unite e funzionanti** su
`marlamag.vercel.app/dati/`. Restano da fare la pagina pubblica e i tetti di spesa.

- [x] **Titoli della kb corretti** (21/08/2026) — non era un problema estetico: gli
      export Substack contengono solo il corpo, quindi lo script ripiegava sul primo
      `<h1>`, che è la rubrica ricorrente del numero. Undici newsletter diverse si
      chiamavano tutte "FACTS ARE FACTS. FICTION IS FICTION" e, siccome l'id era
      ricavato dal titolo, **si fondevano in un unico documento**: tredici newsletter
      irraggiungibili e citazioni attribuite al pezzo sbagliato. Ora il titolo viene dal
      nome del file e gli id sono unici a prescindere. **Da 83 a 99 documenti.**
- [x] **`archivio` aggiunto al registro delle fonti** (21/08/2026).
- [ ] **Spostare la pagina pubblica sul nuovo endpoint** — il widget in `index.html`
      chiama `/api/chat`; va portato su `/api/mitl`, che vede entrambe le fonti.
      Accesso deciso: pagina raggiungibile ma non pubblicizzata, link con codice
      condiviso con 4-5 soci. Un solo livello, tutte le fonti.
- [ ] **Tetti di spesa prima di aprire** — il tool use costa molto più della singola
      chiamata di oggi: più giri, modello più capace, e `MAX_TOKENS` ora è a 8000.
      Serve limite per IP, tetto ai giri, e misurare il costo reale su qualche decina
      di domande vere. Valutare Haiku per la porta pubblica. **Da fare prima di
      spostare la pagina pubblica, non dopo.**
- [ ] **`/api/chat` non ha alcun limite di chiamate** e ha CORS aperto, in un repo
      pubblico che ne documenta l'indirizzo. Esposizione che esiste già oggi,
      indipendente dalla fusione: mettere un tetto a prescindere.

Se il chatbot si blocca: sotto ogni risposta c'è una riga con giri di strumenti e
motivo dell'interruzione. `interrotta: max_tokens` significa che il tetto per
singola chiamata è troppo basso — vale per **ogni** chiamata, non per la risposta
finale, e il modello spesso ragiona a lungo prima di invocare uno strumento: se il
tetto scatta lì, la chiamata resta troncata e il giro si perde in silenzio. È stata
la causa del blocco del 21/08: 3000 non bastavano.

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
