# Infonodes — Sito Archivio

## Cos'è questo progetto
Sito web di Infonodes ETS che sostituisce (o affianca) l'attuale sito su Register.it.
Estetica anni '90 / terminale retro. Ospita un archivio di materiali divisi in tre sezioni
e un chatbot che aiuta gli utenti a trovare i materiali che cercano.

**Repository:** https://github.com/infonodesETS/infonodes-org  
**Sito live:** https://infonodesets.github.io/infonodes-org/  
**Dominio attuale:** https://www.infonodes.org/ (su Register.it — ancora attivo, non toccare)

## Utente
- Non programmatore, lavora da Windows 11
- Username GitHub: infonodesETS
- Budget disponibile: ~€1500 per infrastruttura e API

## Struttura del progetto
```
infonodes-website/
├── index.html                    # Homepage con chatbot
├── inchieste-ricerche/
│   └── index.html                # Sezione ricerche
├── formazione-incontri/
│   └── index.html                # Sezione formazione
├── campagne-progetti/
│   └── index.html                # Sezione campagne
├── css/
│   └── style.css                 # Tutto il CSS (tema retro terminale verde su nero)
├── js/
│   └── chatbot.js                # Frontend chatbot (chiama /api/chat)
└── materiali/                    # Cartella di appoggio (non usata ancora)
```

## Convenzione materiali
Ogni materiale nella propria sezione segue questa regola:
- File reale (PDF, immagine): caricato direttamente nella cartella della sezione
- File descrizione: `.txt` con lo stesso nome del file, contenente:
  ```
  Titolo: ...
  Anno: ...
  Parole chiave: ...
  Descrizione: ...
  ```
- Materiali esterni (podcast Spotify, video su Internazionale, ecc.): solo `.txt` con campo aggiuntivo:
  ```
  Tipo: podcast | video | articolo
  Piattaforma: Spotify | Internazionale | ...
  URL: https://...
  ```

## Cosa è già fatto
- [x] Sito statico HTML/CSS con tema retro terminale (verde su nero, font VT323)
- [x] Homepage con tre sezioni, ticker animato, chatbot UI
- [x] Pagine per le tre sezioni (inchieste, formazione, campagne)
- [x] Repository GitHub creato e pubblicato
- [x] GitHub Pages attivato

## Cosa manca — da fare in ordine
1. **Indicizzazione materiali**: script Python che legge tutti i `.txt` e i PDF
   dalla cartella del repo e costruisce un file `search-index.json`
2. **Backend chatbot**: funzione serverless su Vercel che riceve la domanda,
   cerca nel search-index, passa i risultati rilevanti a Claude API e restituisce la risposta
3. **Aggiornamento pagine sezione**: le pagine delle sezioni devono leggere
   il search-index e mostrare le schede dei materiali dinamicamente
4. **Dominio personalizzato**: configurare infonodes.org su GitHub Pages
   (DNS su Register.it + CNAME nel repo) — opzionale, solo quando si è pronti

## Decisioni tecniche prese
- Hosting: GitHub Pages (gratuito, statico)
- Backend chatbot: Vercel serverless functions (gratuito per uso leggero)
- LLM: Claude API (Anthropic) — modello da scegliere al momento dell'implementazione
- Ricerca: RAG semplice su JSON index (sufficiente per ~100 documenti)
- No framework JS, no build step: HTML/CSS/JS puri per semplicità

## Design
- Font: VT323 (testo), Press Start 2P (titoli) — Google Fonts
- Colori: sfondo #0a0a1a, testo #00ff41 (verde), accenti #ffb000 (ambra), #00e5ff (cyan)
- Effetto scanline CSS overlay su tutto il sito
- Chatbot sidebar sticky a destra su desktop, sotto su mobile

## Note importanti
- Il branch principale si chiama `master` (non `main`)
- I materiali vengono caricati direttamente su GitHub.com via browser drag-and-drop
- NON modificare il sito su Register.it — rimane invariato fino alla decisione finale
- Il file `search-index.json` andrà rigenerato ogni volta che si aggiungono materiali
