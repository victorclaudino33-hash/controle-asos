import { EMPLOYEES_COL } from './firestore.js';

function semAcento(s) {
  return (s ?? '').toString().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

/**
 * Tenta achar o colaborador correspondente. Prioridade: matrícula exata (mais confiável),
 * depois nome exato (ignorando acento/caixa). Retorna null se não achar ou achar mais de um.
 */
export async function matchEmployee(db, { matricula, nome }) {
  if (matricula) {
    const snap = await db.collection(EMPLOYEES_COL)
      .where('matricula', '==', matricula.toString().trim())
      .where('ativo', '==', true)
      .get();
    if (snap.size === 1) return { employee: snap.docs[0].data(), matchedBy: 'matricula' };
    if (snap.size > 1) return { employee: null, matchedBy: null, motivo: 'matrícula duplicada na base' };
  }
  if (nome) {
    const alvo = semAcento(nome);
    const snap = await db.collection(EMPLOYEES_COL).where('ativo', '==', true).get();
    const candidatos = snap.docs.filter(d => semAcento(d.data().nome) === alvo);
    if (candidatos.length === 1) return { employee: candidatos[0].data(), matchedBy: 'nome' };
    if (candidatos.length > 1) return { employee: null, matchedBy: null, motivo: 'nome ambíguo (mais de um colaborador)' };
  }
  return { employee: null, matchedBy: null, motivo: 'não encontrado na base' };
}
