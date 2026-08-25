import { runSync } from '../lib/run-sync.js';

export default async function handler(req, res) {
  // protege o endpoint: só a própria Vercel (cron) ou alguém com o segredo pode chamar
  const auth = req.headers.authorization || '';
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'não autorizado' });
  }
  try {
    const resultado = await runSync();
    res.status(200).json(resultado);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
