"""
costruisci_kb.py
Estrae il testo da tutti i materiali (PDF, HTML, TXT) nelle cartelle
MARLA/, pubblicazioni/ e archivio/ e costruisce kb.json — la memoria di MARLA.
Per ogni documento, se esiste un file .txt compagno con metadati (Titolo, Fonte,
URL, ecc.), questi vengono incorporati in ogni chunk del documento.
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
    'MARLA newsletter': 'newsletter',
    'pubblicazioni':    'pubblicazione',
    'archivio':         'archivio',    # materiali interni non pubblicati
    'letture':          'lettura',     # report di altre organizzazioni
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


def titolo_da_nome_file(nome_base):
    """
    Substack esporta ogni post come '<id numerico>.<slug-del-titolo>.html', e
    il file contiene solo il corpo: niente <title>, niente og:title. Il titolo
    vero sta quindi nel nome del file, ed è più affidabile di qualunque <h1>
    trovato nel testo — vedi la nota in processa_cartella().

    '139099781.sesso-e-potere-2023' -> 'Sesso e potere 2023'
    Restituisce None se il nome non ha quella forma.
    """
    m = re.match(r'^\d{6,}\.(.+)$', nome_base)
    if not m:
        return None
    parole = m.group(1).replace('_', ' ').replace('-', ' ').split()
    if not parole:
        return None
    testo = ' '.join(parole)
    return testo[0].upper() + testo[1:]


def pulisci(testo):
    """Rimuove spazi multipli e righe vuote eccessive."""
    testo = re.sub(r'\r\n', '\n', testo)
    testo = re.sub(r'[ \t]+', ' ', testo)
    testo = re.sub(r'\n{3,}', '\n\n', testo)
    return testo.strip()


def leggi_metadati_txt(percorso_txt):
    """
    Legge i metadati da un file .txt compagno.
    Restituisce un dict con: titolo, url, fonte_nome, autori, anno.
    """
    meta = {}
    try:
        with open(percorso_txt, 'r', encoding='utf-8', errors='replace') as f:
            for riga in f:
                riga = riga.strip()
                if ':' not in riga:
                    continue
                chiave, _, valore = riga.partition(':')
                chiave = chiave.strip().lower()
                valore = valore.strip()
                if not valore:
                    continue
                if chiave == 'titolo':
                    meta['titolo'] = valore
                elif chiave == 'url':
                    # Ricompone URL che poteva essere spezzato dalla partition
                    meta['url'] = riga.partition(':')[2].strip()
                elif chiave in ('piattaforma', 'fonte', 'organizzazione'):
                    meta['fonte_nome'] = valore
                elif chiave == 'autori':
                    meta['autori'] = valore
                elif chiave == 'anno':
                    meta['anno'] = valore
    except Exception:
        pass
    return meta


def chunkerizza(testo, titolo, fonte_cartella, tipo, url='', fonte_nome='',
                base_id=None):
    """
    Divide il testo in chunk sovrapposti.

    `base_id` identifica il DOCUMENTO e deve essere unico: gli id dei chunk sono
    'base_id-N' e chi legge la kb risale al documento togliendo il suffisso.
    Derivarlo dal titolo non basta — due documenti con lo stesso titolo si
    fonderebbero in uno — quindi chi chiama passa un valore reso unico.
    """
    parole = testo.split()
    if not parole:
        return []

    base = base_id or slugify(titolo)
    chunks = []
    i = 0
    indice = 0
    while i < len(parole):
        fine = min(i + CHUNK_PAROLE, len(parole))
        chunk_testo = ' '.join(parole[i:fine])
        chunks.append({
            'id':         f"{base}-{indice}",
            'fonte':      fonte_cartella,
            'titolo':     titolo,
            'tipo':       tipo,
            'url':        url,
            'fonte_nome': fonte_nome,
            'testo':      chunk_testo,
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

        # Se il testo è troppo scarso, è probabile che il PDF sia scansionato
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
    og = soup.find('meta', property='og:title')
    if og and og.get('content', '').strip():
        return og['content'].strip()
    h1 = soup.find('h1')
    if h1 and h1.get_text().strip():
        t = h1.get_text().strip()
        if len(t) > 3:
            return t
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
        for tag in soup(['nav', 'footer', 'script', 'style', 'header',
                         'aside', 'form', 'button', 'iframe']):
            tag.decompose()
        corpo = (soup.find(class_='post-content') or
                 soup.find('article') or
                 soup.find('main') or
                 soup.body or soup)
        return pulisci(corpo.get_text(separator='\n')), titolo
    except Exception as e:
        print(f"    ⚠ Errore HTML {os.path.basename(percorso)}: {e}")
        return '', None


def estrai_docx(percorso):
    try:
        from docx import Document
        doc = Document(percorso)
        paragrafi = [p.text for p in doc.paragraphs if p.text.strip()]
        return pulisci('\n'.join(paragrafi))
    except Exception as e:
        print(f"    ⚠ Errore DOCX {os.path.basename(percorso)}: {e}")
        return ''


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
    id_usati = {}   # base_id -> quante volte, per non fondere documenti omonimi

    for nome_file in file_list:
        percorso = os.path.join(cartella, nome_file)
        estensione = os.path.splitext(nome_file)[1].lower()
        nome_base = os.path.splitext(nome_file)[0]

        # Salta file non di testo
        if estensione not in ('.pdf', '.html', '.htm', '.txt', '.md', '.docx'):
            continue
        # Salta README e index
        if nome_file.lower() in ('readme.md', 'readme.txt', 'index.html', 'index.htm'):
            continue
        # Salta i .txt che hanno un PDF o DOCX compagno (verranno usati come metadati)
        if estensione == '.txt':
            for ext_doc in ('.pdf', '.docx'):
                if os.path.exists(os.path.join(cartella, nome_base + ext_doc)):
                    break
            else:
                ext_doc = None
            if ext_doc:
                continue  # i metadati verranno letti durante il processo del documento

        # ── Leggi metadati dal .txt compagno (se esiste) ──────────────────────
        meta = {}
        txt_compagno = os.path.join(cartella, nome_base + '.txt')
        if estensione not in ('.txt', '.md') and os.path.exists(txt_compagno):
            meta = leggi_metadati_txt(txt_compagno)

        titolo_estratto = meta.get('titolo') or None
        url             = meta.get('url', '')
        fonte_nome      = meta.get('fonte_nome', '')

        # ── Estrai testo ──────────────────────────────────────────────────────
        if estensione == '.pdf':
            testo = estrai_pdf(percorso)
        elif estensione in ('.html', '.htm'):
            testo, titolo_html = estrai_html(percorso)
            # Negli export Substack il nome del file batte l'<h1> del corpo:
            # l'<h1> è la prima rubrica del numero, non il titolo del pezzo.
            # Undici newsletter diverse si chiamavano tutte "FACTS ARE FACTS.
            # FICTION IS FICTION" e finivano fuse in un unico documento, con
            # le citazioni attribuite al pezzo sbagliato.
            if not titolo_estratto:
                titolo_estratto = titolo_da_nome_file(nome_base) or titolo_html
        elif estensione == '.docx':
            testo = estrai_docx(percorso)
        else:
            testo = estrai_txt(percorso)
            # Per i .txt senza PDF compagno, leggi anche URL dal testo stesso
            if not url:
                meta2 = leggi_metadati_txt(percorso)
                url        = meta2.get('url', '')
                fonte_nome = meta2.get('fonte_nome', '')
                if not titolo_estratto:
                    titolo_estratto = meta2.get('titolo')

        if not testo or len(testo.split()) < 30:
            print(f"    ↷ {nome_file} (testo insufficiente, saltato)")
            continue

        titolo_finale = titolo_estratto if titolo_estratto else nome_base

        # Identificativo del documento: dal titolo, ma reso unico. Due file con
        # lo stesso titolo devono restare due documenti distinti, altrimenti si
        # fondono e le citazioni finiscono sul documento sbagliato.
        base_id = slugify(titolo_finale) or slugify(nome_base) or 'documento'
        id_usati[base_id] = id_usati.get(base_id, 0) + 1
        if id_usati[base_id] > 1:
            base_id = f"{base_id}--{slugify(nome_base)[:24]}"
            print(f"    ⚠ titolo ripetuto: \"{titolo_finale}\" → id {base_id}")

        nuovi_chunks = chunkerizza(testo, titolo_finale, cartella, tipo,
                                   url=url, fonte_nome=fonte_nome,
                                   base_id=base_id)
        chunks.extend(nuovi_chunks)
        n_parole = len(testo.split())
        extra = f" [{fonte_nome} — {url}]" if url else ""
        print(f"    ✓ {nome_file}{extra} → {len(nuovi_chunks)} chunk ({n_parole} parole)")

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
