/* ===== MARLA — chatbot di info.nodes ===== */
/* Unica interfaccia: parla con /api/mitl, che vede sia l'archivio sia i
   database dei progetti. Vedi docs/CONTRATTO-FONTI.md.

   Due differenze rispetto alla versione precedente, che chiamava /api/chat:
   - le risposte contengono citazioni in markdown, quindi i link vanno resi
     cliccabili invece che scappati come testo;
   - l'endpoint richiede un codice d'accesso, che arriva dal frammento
     dell'indirizzo (#codice=…) e resta memorizzato su questo browser. */

const ENDPOINT = 'https://marlamag.vercel.app/api/mitl';
const CHIAVE_CODICE = 'marla-codice';

const BENVENUTO = `Ciao, sono MARLA. Ho davanti l'archivio di info.nodes — newsletter, pubblicazioni, inchieste, report di altre organizzazioni — e il database Man in the Loop sui finanziamenti alle armi autonome. Posso incrociarli, e ti dico sempre da dove viene ogni cosa. Se non c'è, te lo dico e basta.`;

const CHIEDI_CODICE = `Prima però serve il codice di accesso. Scrivilo qui sotto.`;

class InfonodesChat {
  constructor() {
    this.messages = [];
    this.isTyping = false;
    this.codice = null;
    this.attendoCodice = false;
    this.init();
  }

  init() {
    this.messagesEl = document.getElementById('chat-messages');
    this.form = document.getElementById('chat-form');
    this.input = document.getElementById('chat-input');
    if (!this.messagesEl || !this.form) return;

    this.codice = this.leggiCodice();

    this.addMessage('bot', BENVENUTO);
    if (!this.codice) {
      this.addMessage('bot', CHIEDI_CODICE);
      this.attendoCodice = true;
      if (this.input) this.input.placeholder = 'codice di accesso…';
    }

    this.form.addEventListener('submit', (e) => {
      e.preventDefault();
      const text = this.input.value.trim();
      if (!text || this.isTyping) return;
      this.input.value = '';
      if (this.attendoCodice) return this.salvaCodice(text);
      if (/^\/config(urazione)?$/i.test(text)) return this.controllaConfigurazione();
      this.send(text);
    });
  }

  /* Il codice può arrivare nel link condiviso (#codice=…) — così chi lo riceve
     entra senza digitare — oppure essere già memorizzato da una visita
     precedente. Nel primo caso lo togliamo subito dalla barra dell'indirizzo. */
  leggiCodice() {
    const m = location.hash.match(/(?:^#|&)codice=([^&]+)/);
    if (m) {
      const c = decodeURIComponent(m[1]);
      try { localStorage.setItem(CHIAVE_CODICE, c); } catch (e) {}
      history.replaceState(null, '', location.pathname + location.search);
      return c;
    }
    try { return localStorage.getItem(CHIAVE_CODICE); } catch (e) { return null; }
  }

  salvaCodice(c) {
    this.codice = c;
    try { localStorage.setItem(CHIAVE_CODICE, c); } catch (e) {}
    this.attendoCodice = false;
    if (this.input) this.input.placeholder = 'scrivi qui…';
    this.addMessage('bot', 'Fatto. Chiedimi pure.');
  }

  dimenticaCodice() {
    try { localStorage.removeItem(CHIAVE_CODICE); } catch (e) {}
    this.codice = null;
    this.attendoCodice = true;
    if (this.input) this.input.placeholder = 'codice di accesso…';
  }

  addMessage(role, text, extra) {
    const msg = document.createElement('div');
    msg.className = `msg ${role}`;
    const label = role === 'bot' ? '[ MARLA ]' : '[ TU ]';
    msg.innerHTML = `<div class="msg-label">${label}</div>${this.rendi(text)}` +
                    (extra ? `<div class="msg-note">${this.escapeHtml(extra)}</div>` : '');
    this.messagesEl.appendChild(msg);
    this.scrollBottom();
    return msg;
  }

  /* Markdown minimo: link e grassetto. Tutto il resto resta scappato — le
     citazioni sono il motivo per cui questi link esistono, e devono essere
     cliccabili. */
  rendi(text) {
    return this.escapeHtml(text)
      .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
               '<a href="$2" target="_blank" rel="noopener">$1</a>')
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/\n/g, '<br>');
  }

  showTyping() {
    const el = document.createElement('div');
    el.className = 'typing-indicator';
    el.id = 'typing';
    el.innerHTML = '<span></span><span></span><span></span>';
    this.messagesEl.appendChild(el);
    this.scrollBottom();
  }

  hideTyping() {
    const el = document.getElementById('typing');
    if (el) el.remove();
  }

  scrollBottom() {
    this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
  }

  escapeHtml(text) {
    return String(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /* Scrivendo "/config" nella chat si vede quali variabili d'ambiente il deploy
     in esecuzione vede davvero. Serve dopo ogni aggiunta su Vercel: le variabili
     nuove valgono solo per i deploy successivi, e senza questo controllo la
     differenza fra "non l'ho messa" e "non ho ridistribuito" non si vede. */
  async controllaConfigurazione() {
    this.addMessage('user', '/config');
    this.isTyping = true;
    this.showTyping();
    try {
      const res = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: this.codice, controlla: 'configurazione' })
      });
      const d = await res.json().catch(() => ({}));
      this.hideTyping();

      if (res.status === 401) { this.dimenticaCodice(); return this.addMessage('bot', 'Il codice non va bene. Riscrivilo.'); }
      if (!res.ok) return this.addMessage('bot', d.error || `Errore ${res.status}.`);

      const righe = Object.entries(d)
        .filter(([k]) => k !== 'nota')
        .map(([k, v]) => `${/MANCANTE/.test(v) ? '✗' : '✓'} ${k}: ${v}`)
        .join('\n');
      this.addMessage('bot', `**Configurazione del deploy in esecuzione**\n\n${righe}`, d.nota);
    } catch (e) {
      this.hideTyping();
      this.addMessage('bot', 'Non riesco a raggiungere il server: ' + e.message);
    } finally {
      this.isTyping = false;
    }
  }

  async send(userText) {
    this.addMessage('user', userText);
    this.messages.push({ role: 'user', content: userText });
    this.isTyping = true;
    this.showTyping();

    try {
      const res = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: this.messages, token: this.codice })
      });
      const data = await res.json().catch(() => ({}));
      this.hideTyping();

      if (res.status === 401) {
        this.dimenticaCodice();
        this.messages.pop();
        this.addMessage('bot', 'Il codice non va bene. Riscrivilo.');
        return;
      }
      if (!res.ok) {
        this.messages.pop();
        this.addMessage('bot', res.status === 429
          ? 'Troppe domande in un\'ora. Riprova più tardi.'
          : (data.error || `Errore ${res.status}.`));
        return;
      }

      const reply = data.reply || '(nessuna risposta)';
      this.messages.push({ role: 'assistant', content: reply });

      // Riga di servizio: quali fonti ha consultato e, se si è fermata per un
      // motivo anomalo, quale. Serve a capire un blocco senza leggere i log.
      const d = data.diagnostica || {};
      const note = [
        (data.strumenti || []).length ? `consultato: ${[...new Set(data.strumenti)].join(', ')}` : null,
        d.stop_reason && d.stop_reason !== 'end_turn' ? `interrotta: ${d.stop_reason}` : null,
        (d.errori || []).length ? `errori — ${[...new Set(d.errori)].join(' | ')}` : null,
      ].filter(Boolean).join(' · ');

      this.addMessage('bot', reply, note || null);
    } catch (err) {
      this.hideTyping();
      this.messages.pop();
      this.addMessage('bot', 'Errore di connessione. Riprova tra qualche secondo.');
      console.error('Chat error:', err);
    } finally {
      this.isTyping = false;
    }
  }
}

document.addEventListener('DOMContentLoaded', () => {
  new InfonodesChat();
});
