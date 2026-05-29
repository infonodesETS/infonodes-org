"""
costruisci_kb.py
Estrae il testo da tutti i materiali (PDF, HTML, TXT) nelle cartelle
MARLA/ e pubblicazioni/ e costruisce kb.json — la memoria di MARLA.
"""

import os
import json
import re
from datetime import date

# ── dipendenze opzionali ──────────────────────────────────────────────────────
try:
    from pypdf import PdfReader
    PYPDF_OK = True
except ImportError:
    PYPDF_OK = False
    print("  ⚠ pypdf non trovato: i PDF verranno saltati")

try:
    from bs4 import BeautifulSoup
    BS4_OK = True
except ImportError:
    BS4_OK = False
    print("  ⚠ beautifulsoup4 non trovato: gli HTML verranno saltati")


CARTELLE = {
    'MARLA':        'newsletter',
    'pubblicazioni': 'pubblicazione',
    'archivio':     'archivio',        # materiali interni non pubblicati
}

CHUNK_PAROLE = 400      # lunghezza massima di ogni chunk (in parole)
OVERLAP_PAROLE = 50     # sovrapposizione tra chunk consecutivi


# ── utility ──────────────────────────────────────────────────────────────────

def slugify(testo):
    testo = testo.lower()
    for a, b in [('à','a'),('è','e'),('é','e'),('ì','i'),('ò','o'),('ù','u'),
                 ("'",""),("'",""),("'",'')]:
        testo = testo.replace(a, b)
    testo = re.sub(r'[^a-z0-9\s\-]', '', testo)
    return re.sub(r'[\s\-]+', '-', testo.strip())[:60]


def pulisci(testo):
    """Rimuove spazi multipli e righe vuote eccessive."""
    testo = re.sub(r'\r\n', '\n', testo)
    testo = re.sub(r'[ \t]+', ' ', testo)
    testo = re.sub(r'\n{3,}', '\n\n', testo)
    return testo.strip()


def chunkerizza(testo, nome_base, fonte, tipo):
    """Divide il testo in chunk sovrapposti."""
    parole = testo.split()
    if not parole:
        return []

    chunks = []
    i = 0
    indice = 0
    while i < len(parole):
        fine = min(i + CHUNK_PAROLE, len(parole))
        chunk_testo = ' '.join(parole[i:fine])
        chunks.append({
            'id':     f"{slugify(nome_base)}-{indice}",
            'fonte':  fonte,
            'titolo': nome_base,
            'tipo':   tipo,
            'testo':  chunk_testo,
        })
        indice += 1
        i += CHUNK_PAROLE - OVERLAP_PAROLE
        if fine == len(parole):
            break

    return chunks


# ── estrattori ───────────────────────────────────────────────────────────────

def estrai_pdf_ocr(percorso):
    """Fallback OCR per PDF scansionati (immagini)."""
    try:
        from pdf2image import convert_from_path
        import pytesseract
        print(f"    → OCR in corso (PDF scansionato)...")
        immagini = convert_from_path(percorso, dpi=200)
        pagine = []
        for img in immagini:
            pagine.append(pytesseract.image_to_string(img, lang='ita+eng'))
        return pulisci('\n'.join(pagine))
    except Exception as e:
        print(f"    ⚠ OCR fallito: {e}")
        return ''


def estrai_pdf(percorso):
    if not PYPDF_OK:
        return ''
    try:
        reader = PdfReader(percorso)
        pagine = []
        for pagina in reader.pages:
            try:
                pagine.append(pagina.extract_text() or '')
            except Exception:
                pass
        testo = pulisci('\n'.join(pagine))

        # Se il testo è troppo scarso, è probabile che il PDF sia scansionato:
        # proviamo con OCR
        if len(testo.split()) < 100:
            testo_ocr = estrai_pdf_ocr(percorso)
            if len(testo_ocr.split()) > len(testo.split()):
                return testo_ocr

        return testo
    except Exception as e:
        print(f"    ⚠ Errore PDF {os.path.basename(percorso)}: {e}")
        return ''


def estrai_titolo_html(soup):
    """Estrae il titolo reale dall'HTML (Substack o generico)."""
    # 1. og:title (Substack lo include sempre)
    og = soup.find('meta', property='og:title')
    if og and og.get('content', '').strip():
        return og['content'].strip()
    # 2. Primo h1
    h1 = soup.find('h1')
    if h1 and h1.get_text().strip():
        t = h1.get_text().strip()
        if len(t) > 3:
            return t
    # 3. Tag <title>, ripulito da suffissi tipo " | Substack" o " — info.nodes"
    title_tag = soup.find('title')
    if title_tag:
        t = title_tag.get_text().strip()
        for sep in [' | ', ' — ', ' - ', ' – ']:
            if sep in t:
                t = t.split(sep)[0].strip()
        if len(t) > 3:
            return t
    return None


def estrai_html(percorso):
    if not BS4_OK:
        return '', None
    try:
        with open(percorso, 'r', encoding='utf-8', errors='replace') as f:
            contenuto = f.read()
        soup = BeautifulSoup(contenuto, 'lxml')

        titolo = estrai_titolo_html(soup)

        # Rimuovi nav, footer, script, style, header
        for tag in soup(['nav', 'footer', 'script', 'style', 'header',
                         'aside', 'form', 'button', 'iframe']):
            tag.decompose()

        # Substack: il corpo principale è in .post-content o article
        corpo = (soup.find(class_='post-content') or
                 soup.find('article') or
                 soup.find('main') or
                 soup.body or soup)

        return pulisci(corpo.get_text(separator='\n')), titolo
    except Exception as e:
        print(f"    ⚠ Errore HTML {os.path.basename(percorso)}: {e}")
        return '', None


def estrai_txt(percorso):
    try:
        with open(percorso, 'r', encoding='utf-8', errors='replace') as f:
            return pulisci(f.read())
    except Exception as e:
        print(f"    ⚠ Errore TXT {os.path.basename(percorso)}: {e}")
        return ''


# ── elaborazione cartella ─────────────────────────────────────────────────────

def processa_cartella(cartella, tipo):
    chunks = []
    file_list = sorted(os.listdir(cartella))

    for nome_file in file_list:
        percorso = os.path.join(cartella, nome_file)
        estensione = os.path.splitext(nome_file)[1].lower()
        nome_base = os.path.splitext(nome_file)[0]

        # Salta file non di testo
        if estensione not in ('.pdf', '.html', '.htm', '.txt', '.md'):
            continue
        # Salta README e index
        if nome_file.lower() in ('readme.md', 'readme.txt', 'index.html', 'index.htm'):
            continue

        titolo_estratto = None

        if estensione == '.pdf':
            testo = estrai_pdf(percorso)
        elif estensione in ('.html', '.htm'):
            testo, titolo_estratto = estrai_html(percorso)
        else:
            testo = estrai_txt(percorso)

        if not testo or len(testo.split()) < 30:
            print(f"    ↷ {nome_file} (testo insufficiente, saltato)")
            continue

        # Usa il titolo estratto dall'HTML se disponibile, altrimenti il nome file
        titolo_finale = titolo_estratto if titolo_estratto else nome_base

        nuovi_chunks = chunkerizza(testo, titolo_finale, cartella, tipo)
        chunks.extend(nuovi_chunks)
        n_parole = len(testo.split())
        label = f" [{titolo_finale}]" if titolo_estratto else ""
        print(f"    ✓ {nome_file}{label} → {len(nuovi_chunks)} chunk ({n_parole} parole)")

    return chunks


# ── main ─────────────────────────────────────────────────────────────────────

def main():
    print("=== Costruzione kb.json ===\n")
    tutti_chunks = []

    for cartella, tipo in CARTELLE.items():
        if not os.path.isdir(cartella):
            print(f"  Cartella '{cartella}' non trovata, saltata.")
            continue

        n_file = len([f for f in os.listdir(cartella)
                      if os.path.isfile(os.path.join(cartella, f))])
        print(f"  {cartella}/ ({n_file} file)")
        chunks = processa_cartella(cartella, tipo)
        tutti_chunks.extend(chunks)
        print(f"  → {len(chunks)} chunk estratti\n")

    kb = {
        'lastUpdated': str(date.today()),
        'totaleChunk': len(tutti_chunks),
        'chunks':      tutti_chunks,
    }

    with open('kb.json', 'w', encoding='utf-8') as f:
        json.dump(kb, f, ensure_ascii=False, indent=2)

    dimensione_kb = os.path.getsize('kb.json') / 1024
    print(f"✓ kb.json generato: {len(tutti_chunks)} chunk "
          f"({dimensione_kb:.0f} KB)")


if __name__ == '__main__':
    main()
