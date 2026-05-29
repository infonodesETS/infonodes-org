/* ===== MARLA — chatbot di info.nodes ===== */
/* Chiama l'API serverless /api/chat e mostra le risposte */

const WELCOME_MSG = `Ciao, sono MARLA. Cosa stai cercando? Vuoi parlare di qualcosa in particolare?`;

class InfonodesChat {
  constructor() {
    this.messages = [];
    this.isTyping = false;
    this.init();
  }

  init() {
    this.messagesEl = document.getElementById('chat-messages');
    this.form = document.getElementById('chat-form');
    this.input = document.getElementById('chat-input');

    if (!this.messagesEl || !this.form) return;

    this.addMessage('bot', WELCOME_MSG);

    this.form.addEventListener('submit', (e) => {
      e.preventDefault();
      const text = this.input.value.trim();
      if (!text || this.isTyping) return;
      this.input.value = '';
      this.send(text);
    });
  }

  addMessage(role, text) {
    const msg = document.createElement('div');
    msg.className = `msg ${role}`;
    const label = role === 'bot' ? '[ MARLA ]' : '[ TU ]';
    msg.innerHTML = `<div class="msg-label">${label}</div>${this.escapeHtml(text).replace(/\n/g, '<br>')}`;
    this.messagesEl.appendChild(msg);
    this.scrollBottom();
    return msg;
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
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  async send(userText) {
    this.addMessage('user', userText);
    this.messages.push({ role: 'user', content: userText });
    this.isTyping = true;
    this.showTyping();

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: this.messages })
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const reply = data.reply || '(nessuna risposta)';

      this.messages.push({ role: 'assistant', content: reply });
      this.hideTyping();
      this.addMessage('bot', reply);
    } catch (err) {
      this.hideTyping();
      this.addMessage('bot',
        'Errore di connessione.\nIl servizio chatbot non è ancora configurato.\nControlla /api/chat.');
      console.error('Chat error:', err);
    } finally {
      this.isTyping = false;
    }
  }
}

document.addEventListener('DOMContentLoaded', () => {
  new InfonodesChat();
});
