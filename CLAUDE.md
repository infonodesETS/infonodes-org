# Infonodes — Sito Archivio con chatbot MARLA

## Cos'è questo progetto
Sito web di info.nodes ETS. Estetica retro terminale anni '90 (verde su nero, font VT323).
Ospita un archivio di materiali e il chatbot MARLA alimentato da Claude API.

**Repository pubblico:** https://github.com/infonodesETS/infonodes-org
**Sito live:** https://infonodesets.github.io/infonodes-org/
**Dominio attuale:** https://www.infonodes.org/ (su Register.it — ancora attivo, non toccare)
**Chatbot backend:** https://infonodes-org.vercel.app/api/chat

## Utente
- Non programmatore, lavora da Windows 11
- Username GitHub: infonodesETS
- Budget API: ~€1500

## Struttura del progetto
```
infonodes-website/
├── index.html                    # Homepage
├── pubblicazioni/
│   └── index.html                # Pagina sezione pubblicazioni
├── css/style.css                 # CSS tema retro terminale
├── js/
│   ├── chatbot.js                # Frontend chatbot MARLA
│   └── materiali.js              # Rendering dinamico schede materiali
├── api/
│   └── chat.js                   # Funzione serverless Vercel (Claude API)
├── scripts/
│   ├── genera_indice.py          # Genera search-index.json
│   ├── costruisci_kb.py          # Genera kb.json (memoria MARLA)
│   └── requirements.txt          # Dipendenze Python
├── .github/workflows/
│   └── genera-indice.yml         # GitHub Action: rigenera indice e kb
├── MARLA/                        # Newsletter MARLA (HTML Substack + PDF)
├── pubblicazioni/                # Materiali pubblicati (PDF + .txt metadati)
├── archivio/                     # Materiali interni (PDF + .txt metadati)
├── IMG/                          # Immagini del sito
├── search-index.json             # Auto-generato dall'Action
├── kb.json                       # Auto-generato dall'Action (769 KB)
├── package.json                  # @anthropic-ai/sdk
└── vercel.json                   # Configurazione Vercel
```

## Architettura chatbot MARLA

### Knowledge base (kb.json)
- Generata da `scripts/costruisci_kb.py` su ogni push a MARLA/**, pubblicazioni/**, archivio/**, scripts/**
- Tre fonti: newsletter MARLA (HTML Substack + PDF), pubblicazioni, archivio
- Chunk da 400 parole con overlap di 50
- Ogni chunk ha: id, fonte, titolo, tipo, url, fonte_nome, testo
- PDF scansionati: fallback OCR con pytesseract (tesseract-ocr-ita installato nell'Action)
- HTML Substack: titolo estratto da og:title / h1 / title tag
- File .txt compagno: URL e fonte_nome salvati in ogni chunk del documento

### Backend (Vercel serverless)
- Modello: claude-haiku-4-5
- MAX_CHUNK_CONTESTO = 6, MAX_TOKENS_RISPOSTA = 600
- Cache kb.json in memoria: 10 minuti
- Ricerca keyword: tokenizzazione italiana con stopwords, score per match esatto/parziale
- MARLA istruita a citare sempre fonte e URL originale quando disponibile

### Frontend
- chatbot.js: POST a https://infonodes-org.vercel.app/api/chat con { messages: [...] }
- Label: [ MARLA ] per bot, [ TU ] per utente

## Layout homepage
1. Header + ticker + nav
2. Chatbot MARLA — larghezza piena (500px altezza)
3. Due colonne uguali: "Ultime pubblicazioni" | "Chi è MARLA" (bio)
4. "Chi siamo" — larghezza piena
5. Footer

## Convenzione file materiali (.txt)
```
Titolo: ...
Autori: ...
Piattaforma: Nome testata          ← usato come fonte_nome
URL: https://...                   ← citato da MARLA nelle risposte
Anno: ...
Parole chiave: ...
Descrizione: (testo libero, tutto indicizzato)
```
- I .txt con PDF compagno vengono usati solo come metadati (non creano chunk separati)
- I .txt senza PDF compagno vengono indicizzati come chunk propri

## Variabili d'ambiente Vercel
- ANTHROPIC_API_KEY — chiave API Anthropic

## Note importanti
- Branch principale: **master** (non main)
- GitHub Pages richiede repo pubblico → kb.json è pubblico
- Eliminare un file da archivio/ triggera l'Action e MARLA dimentica il contenuto in ~12 min (10 min cache Vercel)
- Il modello claude-3-5-haiku-20241022 è deprecato → usare claude-haiku-4-5
- git pull --rebase prima di ogni push per evitare conflitti con l'Action
