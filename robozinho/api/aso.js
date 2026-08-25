import { getApps, initializeApp, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import getDb, { EMPLOYEES_COL, MANAGERS_COL } from '../lib/firestore.js';
import { downloadDecryptedAso } from '../lib/aso-storage.js';

function initAdmin() {
  if (!getApps().length) {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    initializeApp({ credential: cert(serviceAccount) });
  }
}

// Entrega o PDF do ASO decriptado — só pra sua conta (a que NÃO está na coleção
// `managers`). Gestores e qualquer outro token são recusados com 403, mesmo que o
// token seja válido, mesmo que o colaborador exista.
export default async function handler(req, res) {
  // CORS: só o domínio do próprio painel pode chamar isso.
  const origin = process.env.PAINEL_ORIGIN || '*';
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Headers', 'Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();

  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'token ausente' });

  try {
    initAdmin();
    const decoded = await getAuth().verifyIdToken(token);
    const db = getDb();

    const managerSnap = await db.collection(MANAGERS_COL).doc(decoded.email).get();
    if (managerSnap.exists) {
      return res.status(403).json({ error: 'este acesso não inclui a visualização de ASOs' });
    }

    const matricula = (req.query.matricula || '').toString().trim().replace(/[^\w-]/g, '');
    if (!matricula) return res.status(400).json({ error: 'matricula é obrigatória' });

    const empSnap = await db.collection(EMPLOYEES_COL).doc(matricula).get();
    if (!empSnap.exists || !empSnap.data().ultimoAsoPath) {
      return res.status(404).json({ error: 'nenhum ASO encontrado pra esse colaborador' });
    }

    const pdfBuffer = await downloadDecryptedAso(empSnap.data().ultimoAsoPath);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'inline; filename="aso.pdf"');
    // nunca cachear — o link some da memória do navegador assim que a aba fecha
    res.setHeader('Cache-Control', 'no-store');
    res.status(200).send(pdfBuffer);
  } catch (e) {
    res.status(401).json({ error: 'token inválido ou expirado' });
  }
}
