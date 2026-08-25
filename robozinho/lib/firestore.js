import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

// A chave da conta de serviço vem de uma variável de ambiente (JSON em string),
// nunca de um arquivo commitado no repositório. Só usa Firestore + Auth do Firebase
// (plano Spark, gratuito, sem cartão) — o arquivo do ASO em si fica no Cloudflare R2,
// não no Firebase Storage (que passou a exigir cartão vinculado em 2026).
function getDb() {
  if (!getApps().length) {
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
    if (!raw) throw new Error('FIREBASE_SERVICE_ACCOUNT não configurada nas variáveis de ambiente.');
    const serviceAccount = JSON.parse(raw);
    initializeApp({ credential: cert(serviceAccount) });
  }
  return getFirestore();
}

export const EMPLOYEES_COL = 'employees';
export const MANAGERS_COL = 'managers';
export const META_COL = '_meta';
export const SYNC_DOC = 'robozinho';

export default getDb;
