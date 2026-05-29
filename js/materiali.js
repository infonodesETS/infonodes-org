/* ===== INFONODES — VISUALIZZATORE MATERIALI ===== */

const TIPO_CONFIG = {
  inchiesta:  { icon: '📄', badge: 'pdf',   label: 'INCHIESTA' },
  reportage:  { icon: '📷', badge: 'img',   label: 'REPORTAGE' },
  video:      { icon: '🎬', badge: 'video', label: 'VIDEO' },
  podcast:    { icon: '🎙️', badge: 'video', label: 'PODCAST' },
  ricerca:    { icon: '🔬', badge: 'doc',   label: 'RICERCA' },
  formazione: { icon: '📚', badge: 'doc',   label: 'FORMAZIONE' },
  default:    { icon: '📎', badge: 'doc',   label: 'MATERIALE' }
};

const PIATTAFORMA_ICON = {
  'Spotify':      '🎵',
  'YouTube':      '▶️',
  'Internazionale': '🎬',
  'info.nodes':   '🔷',
  'IrpiMedia':    '🔍',
  'OCCRP':        '🌐',
  'L\'Espresso':  '📰',
  'Domani Editoriale': '📰',
  'Scomodo':      '📰',
  'Bike Italia':  '🚲',
  'Voice Over':   '🎤',
  'infoLibre':    '🌐',
};

function getTipoConfig(tipo) {
  if (!tipo) return TIPO_CONFIG.default;
  const t = tipo.toLowerCase();
  if (t.includes('podcast'))   return TIPO_CONFIG.podcast;
  if (t.includes('video') || t.includes('documentario')) return TIPO_CONFIG.video;
  if (t.includes('reportage')) return TIPO_CONFIG.reportage;
  if (t.includes('ricerca'))   return TIPO_CONFIG.ricerca;
  if (t.includes('inchiesta')) return TIPO_CONFIG.inchiesta;
  return TIPO_CONFIG.default;
}

function truncate(str, n) {
  if (!str || str.length <= n) return str || '';
  return str.slice(0, n).trim() + '…';
}

function buildCard(m, basePath) {
  const cfg   = getTipoConfig(m.tipo);
  const pIcon = PIATTAFORMA_ICON[m.piattaforma] || '🔗';
  const link  = m.pdf
    ? `${basePath}/${encodeURIComponent(m.pdf)}`
    : m.url;
  const target = m.pdf ? '_blank' : '_blank';
  const autori = m.autori ? m.autori.slice(0, 3).join(', ') + (m.autori.length > 3 ? ' +altri' : '') : '';

  return `
    <a href="${link}" target="${target}" rel="noopener" class="material-card">
      <div class="mat-icon">${cfg.icon}</div>
      <div>
        <span class="mat-title">${m.titolo}</span>
        <div class="mat-desc">
          ${autori ? `<span style="color:var(--amber);font-size:13px;">${autori}</span><br>` : ''}
          ${truncate(m.descrizione, 160)}
        </div>
        <div style="margin-top:6px;font-size:13px;color:var(--grey);">
          ${pIcon} ${m.piattaforma} &nbsp;·&nbsp; ${m.anno}
          ${m.pdf ? ' &nbsp;·&nbsp; <span style="color:var(--green)">↓ PDF</span>' : ''}
        </div>
      </div>
      <span class="mat-badge ${cfg.badge}">${cfg.label}</span>
    </a>`;
}

async function caricaMateriali(sezione, containerId, basePath) {
  const container = document.getElementById(containerId);
  if (!container) return;

  container.innerHTML = '<div style="color:var(--grey);padding:20px 0;text-align:center;">[ caricamento... ]</div>';

  try {
    const rootPath = basePath.replace(/\/[^/]+$/, '');
    const res  = await fetch(`${rootPath}/search-index.json`);
    if (!res.ok) throw new Error('index non trovato');
    const data = await res.json();

    const lista = data.materiali.filter(m => m.sezione === sezione);
    lista.sort((a, b) => b.anno - a.anno);

    if (lista.length === 0) {
      container.innerHTML = '<div style="color:var(--grey);padding:20px 0;text-align:center;">[ Nessun materiale ancora caricato ]</div>';
      return;
    }

    container.innerHTML = lista.map(m => buildCard(m, basePath)).join('');
  } catch (e) {
    container.innerHTML = `<div style="color:var(--red);padding:20px 0;text-align:center;">[ Errore nel caricamento dei materiali ]<br><span style="font-size:13px;">${e.message}</span></div>`;
    console.error(e);
  }
}
