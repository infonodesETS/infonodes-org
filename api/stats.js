/**
 * api/stats.js — statistiche anonime di MARLA
 * Restituisce solo contatori aggregati: conversazioni, messaggi, lingue.
 * Nessun contenuto, nessun dato personale.
 */

const CHIAVI = [
  'stats:conversazioni',
  'stats:messaggi',
  'stats:lingua:it',
  'stats:lingua:en',
  'stats:lingua:fr',
  'stats:lingua:es',
  'stats:lingua:altro',
];

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method !== 'GET') return res.status(405).json({ error: 'Metodo non consentito' });

  const url   = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  if (!url || !token) {
    return res.status(200).json({ nota: 'Statistiche non ancora configurate. MARLA non sta contando.' });
  }

  try {
    const comandi = CHIAVI.map(k => ['GET', k]);
    const r = await fetch(`${url}/pipeline`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(comandi),
    });
    const risultati = await r.json();
    const valore = i => parseInt(risultati[i]?.result, 10) || 0;

    return res.status(200).json({
      conversazioni: valore(0),
      messaggi:      valore(1),
      lingue: {
        italiano: valore(2),
        inglese:  valore(3),
        francese: valore(4),
        spagnolo: valore(5),
        altro:    valore(6),
      },
      nota: 'Contatori aggregati e anonimi. MARLA non registra nessuna conversazione.',
    });
  } catch (e) {
    return res.status(500).json({ error: 'Statistiche non disponibili', detail: e.message });
  }
};
