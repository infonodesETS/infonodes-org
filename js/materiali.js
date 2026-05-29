/* ===== INFONODES — VISUALIZZATORE MATERIALI ===== */

const TIPO_CONFIG = {
  inchiesta:  { icon: '📄', badge: 'inchiesta',  label: 'INCHIESTA' },
  ricerca:    { icon: '🔬', badge: 'ricerca',    label: 'RICERCA' },
  reportage:  { icon: '📷', badge: 'reportage',  label: 'REPORTAGE' },
  video:      { icon: '🎬', badge: 'video',      label: 'VIDEO' },
  podcast:    { icon: '🎙️', badge: 'podcast',    label: 'PODCAST' },
  formazione: { icon: '📚', badge: 'formazione', label: 'FORMAZIONE' },
  documento:  { icon: '📎', badge: 'documento',  label: 'DOCUMENTO' },
  campagna:   { icon: '📢', badge: 'campagna',   label: 'CAMPAGNA' },
  altro:      { icon: '📎', badge: 'altro',      label: 'ALTRO' },
};

const PIATTAFORMA_ICON = {
  'Spotify':             '🎵',
  'YouTube':             '▶️',
  'Internazionale':      '🎬',
  'info.nodes':          '🔷',
  'IrpiMedia':           '🔍',
  'OCCRP':               '🌐',
  "L'Espresso":          '📰',
  'Domani Editoriale':   '📰',
  'Scomodo':             '📰',
  'Bike Italia':         '🚲',
  'Voice Over':          '🎤',
  'infoLibre':           '🌐',
};

// ----- BADGE -----

function buildBadges(tipi) {
  if (!tipi || tipi.length === 0) tipi = ['altro'];
  return tipi.map(t => {
    const cfg = TIPO_CONFIG[t] || TIPO_CONFIG.altro;
    return `<span class="mat-badge ${cfg.badge}">${cfg.label}</span>`;
  }).join(' ');
}

// Icona: usa quella del primo tipo
function getIcon(tipi) {
  if (!tipi || tipi.length === 0) return TIPO_CONFIG.altro.icon;
  return (TIPO_CONFIG[tipi[0]] || TIPO_CONFIG.altro).icon;
}

// ----- CARD -----

function truncate(str, n) {
  if (!str || str.length <= n) return str || '';
  return str.slice(0, n).trim() + '…';
}

function buildCard(m, basePath) {
  const tipi   = m.tipi || (m.tipo ? [m.tipo] : ['altro']);
  const icon   = getIcon(tipi);
  const pIcon  = PIATTAFORMA_ICON[m.piattaforma] || '🔗';
  const link   = m.pdf
    ? `${basePath}/${encodeURIComponent(m.pdf)}`
    : m.url;
  const autori = m.autori
    ? m.autori.slice(0, 3).join(', ') + (m.autori.length > 3 ? ' +altri' : '')
    : '';

  return `
    <a href="${link}" target="_blank" rel="noopener"
       class="material-card"
       data-tipi="${tipi.join(',')}">
      <div class="mat-icon">${icon}</div>
      <div class="mat-body">
        <span class="mat-title">${m.titolo}</span>
        <div class="mat-desc">
          ${autori ? `<span class="mat-autori">${autori}</span><br>` : ''}
          ${truncate(m.descrizione, 160)}
        </div>
        <div class="mat-meta">
          ${pIcon} ${m.piattaforma} &nbsp;·&nbsp; ${m.anno}
          ${m.pdf ? ' &nbsp;·&nbsp; <span class="mat-pdf">↓ PDF</span>' : ''}
        </div>
      </div>
      <div class="mat-badges">${buildBadges(tipi)}</div>
    </a>`;
}

// ----- FILTRI -----

function buildFiltri(materiali, containerId) {
  // Raccoglie tutti i tipi presenti
  const tuttiTipi = new Set();
  materiali.forEach(m => {
    const tipi = m.tipi || (m.tipo ? [m.tipo] : []);
    tipi.forEach(t => tuttiTipi.add(t));
  });

  const filtriEl = document.getElementById('filtri-tipo');
  if (!filtriEl || tuttiTipi.size === 0) return;

  const ordine = ['inchiesta','ricerca','reportage','video','podcast','formazione','documento','campagna','altro'];
  const presenti = ordine.filter(t => tuttiTipi.has(t));

  const bottoni = presenti.map(t => {
    const cfg = TIPO_CONFIG[t] || TIPO_CONFIG.altro;
    return `<button class="filtro-btn" data-tipo="${t}">${cfg.label}</button>`;
  }).join('');

  filtriEl.innerHTML = `
    <span class="filtro-label">FILTRA:</span>
    <button class="filtro-btn active" data-tipo="tutti">TUTTI</button>
    ${bottoni}
  `;

  // Evento click
  filtriEl.addEventListener('click', e => {
    const btn = e.target.closest('.filtro-btn');
    if (!btn) return;

    // Aggiorna bottone attivo
    filtriEl.querySelectorAll('.filtro-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');

    const tipo = btn.dataset.tipo;
    const cards = document.querySelectorAll(`#${containerId} .material-card`);

    cards.forEach(card => {
      if (tipo === 'tutti') {
        card.style.display = '';
      } else {
        const tipiCard = card.dataset.tipi ? card.dataset.tipi.split(',') : [];
        card.style.display = tipiCard.includes(tipo) ? '' : 'none';
      }
    });
  });
}

// ----- CARICAMENTO -----

async function caricaMateriali(sezione, containerId, basePath) {
  const container = document.getElementById(containerId);
  if (!container) return;

  container.innerHTML = '<div class="mat-loading">[ caricamento... ]</div>';

  try {
    const rootPath = basePath.replace(/\/[^/]+$/, '');
    const res = await fetch(`${rootPath}/search-index.json`);
    if (!res.ok) throw new Error('search-index.json non trovato');
    const data = await res.json();

    const lista = data.materiali.filter(m => m.sezione === sezione);
    lista.sort((a, b) => b.anno - a.anno);

    if (lista.length === 0) {
      container.innerHTML = '<div class="mat-loading">[ Nessun materiale ancora caricato ]</div>';
      return;
    }

    // Prima costruisci i filtri (servono i dati), poi le card
    buildFiltri(lista, containerId);
    container.innerHTML = lista.map(m => buildCard(m, basePath)).join('');

  } catch (e) {
    container.innerHTML = `<div class="mat-loading mat-error">[ Errore nel caricamento ]<br><small>${e.message}</small></div>`;
    console.error(e);
  }
}
