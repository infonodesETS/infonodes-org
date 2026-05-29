"""
genera_indice.py
Legge tutti i file .txt nelle cartelle delle tre sezioni
e genera search-index.json con tutti i materiali indicizzati.
"""

import os
import json
import re
from datetime import date

SEZIONI = [
    'pubblicazioni',
]

# Chiavi riconosciute nel formato .txt
CHIAVI = [
    'titolo', 'autori', 'tipo', 'piattaforma',
    'url', 'pdf', 'anno', 'parole chiave', 'descrizione'
]


def normalizza_tipi(tipo_raw):
    """
    Converte la stringa "Tipo" in una lista di tipi normalizzati.
    Esempi:
      "Inchiesta e Ricerca"         → ["inchiesta", "ricerca"]
      "Reportage, Inchiesta"        → ["reportage", "inchiesta"]
      "Documentario video"          → ["video"]
      "Reportage con fotografie e video" → ["reportage", "video"]
    """
    if not tipo_raw:
        return ["altro"]

    # Separa su virgola, " e ", slash, "con"
    parti = re.split(r',\s*|\s+e\s+|/\s*|\s+con\s+', tipo_raw.lower())

    MAPPA = {
        'inchiesta':   'inchiesta',
        'ricerca':     'ricerca',
        'reportage':   'reportage',
        'video':       'video',
        'documentario':'video',
        'podcast':     'podcast',
        'fotografi':   'reportage',   # "fotografie" → reportage
        'formazione':  'formazione',
        'documento':   'documento',
        'campagna':    'campagna',
    }

    risultato = []
    for parte in parti:
        parte = parte.strip()
        trovato = None
        for chiave, valore in MAPPA.items():
            if chiave in parte:
                trovato = valore
                break
        if trovato and trovato not in risultato:
            risultato.append(trovato)

    return risultato if risultato else ["altro"]


def slugify(testo):
    """Converte un testo in un id URL-safe."""
    testo = testo.lower()
    for a, b in [('à','a'),('á','a'),('â','a'),('ã','a'),('ä','a'),
                 ('è','e'),('é','e'),('ê','e'),('ë','e'),
                 ('ì','i'),('í','i'),('î','i'),('ï','i'),
                 ('ò','o'),('ó','o'),('ô','o'),('õ','o'),('ö','o'),
                 ('ù','u'),('ú','u'),('û','u'),('ü','u'),
                 ("'",""),("'",""),("'","")]:
        testo = testo.replace(a, b)
    testo = re.sub(r'[^a-z0-9\s\-]', '', testo)
    testo = re.sub(r'[\s\-]+', '-', testo.strip())
    return testo[:80].strip('-')


def parse_txt(filepath):
    """
    Legge un file .txt nel formato:
        Chiave: valore
        Descrizione: testo
        che può andare su più righe
    Restituisce un dizionario.
    """
    with open(filepath, 'r', encoding='utf-8') as f:
        contenuto = f.read()

    risultato = {}
    chiave_corrente = None
    righe_valore = []

    for riga in contenuto.split('\n'):
        chiave_trovata = None
        for chiave in CHIAVI:
            pattern = re.compile(
                r'^' + re.escape(chiave) + r'\s*:\s*', re.IGNORECASE
            )
            if pattern.match(riga):
                chiave_trovata = chiave
                break

        if chiave_trovata:
            # Salva la chiave precedente
            if chiave_corrente:
                risultato[chiave_corrente] = '\n'.join(righe_valore).strip()
            chiave_corrente = chiave_trovata
            valore = re.sub(
                r'^' + re.escape(chiave_trovata) + r'\s*:\s*',
                '', riga, flags=re.IGNORECASE
            )
            righe_valore = [valore]
        elif chiave_corrente is not None:
            righe_valore.append(riga)

    # Salva l'ultima chiave
    if chiave_corrente:
        risultato[chiave_corrente] = '\n'.join(righe_valore).strip()

    return risultato


def processa_file(cartella, nome_file, sezione):
    """Converte un file .txt in un oggetto materiale."""
    percorso = os.path.join(cartella, nome_file)
    dati = parse_txt(percorso)

    nome_base = nome_file[:-4]  # rimuove .txt

    # Cerca il PDF nella stessa cartella
    pdf_file = None
    campo_pdf = dati.get('pdf', '').strip()
    if campo_pdf:
        nome_pdf = campo_pdf if campo_pdf.lower().endswith('.pdf') else campo_pdf + '.pdf'
        if os.path.exists(os.path.join(cartella, nome_pdf)):
            pdf_file = nome_pdf

    # Autori
    autori_raw = dati.get('autori', '')
    autori = [a.strip() for a in autori_raw.split(',') if a.strip()]

    # Parole chiave
    kw_raw = dati.get('parole chiave', '')
    keywords = [k.strip() for k in kw_raw.split(',') if k.strip()]

    # Anno
    anno_raw = dati.get('anno', '')
    try:
        anno = int(re.search(r'\d{4}', anno_raw).group())
    except Exception:
        anno = date.today().year

    return {
        'id':          slugify(nome_base),
        'sezione':     sezione,
        'titolo':      dati.get('titolo', nome_base).strip(),
        'autori':      autori,
        'tipi':        normalizza_tipi(dati.get('tipo', '')),
        'piattaforma': dati.get('piattaforma', '').strip(),
        'url':         dati.get('url', '').strip(),
        'pdf':         pdf_file,
        'anno':        anno,
        'keywords':    keywords,
        'descrizione': dati.get('descrizione', '').strip(),
    }


def main():
    print("=== Generazione search-index.json ===\n")
    materiali = []
    errori = 0

    for sezione in SEZIONI:
        if not os.path.isdir(sezione):
            print(f"  Cartella '{sezione}' non trovata, saltata.")
            continue

        file_txt = sorted([
            f for f in os.listdir(sezione)
            if f.endswith('.txt')
        ])

        if not file_txt:
            print(f"  {sezione}: nessun .txt trovato")
            continue

        print(f"  {sezione}: {len(file_txt)} file")
        for nome_file in file_txt:
            try:
                m = processa_file(sezione, nome_file, sezione)
                materiali.append(m)
                pdf_tag = ' [PDF]' if m['pdf'] else ''
                print(f"    ✓ {m['titolo'][:60]}{pdf_tag}")
            except Exception as e:
                print(f"    ✗ ERRORE in '{nome_file}': {e}")
                errori += 1

    # Ordina per anno (decrescente) poi titolo
    materiali.sort(key=lambda x: (-x['anno'], x['titolo'].lower()))

    indice = {
        'lastUpdated': str(date.today()),
        'totale':      len(materiali),
        'materiali':   materiali,
    }

    with open('search-index.json', 'w', encoding='utf-8') as f:
        json.dump(indice, f, ensure_ascii=False, indent=2)

    print(f"\n✓ Indice generato: {len(materiali)} materiali")
    if errori:
        print(f"⚠ {errori} file con errori (vedi sopra)")


if __name__ == '__main__':
    main()
