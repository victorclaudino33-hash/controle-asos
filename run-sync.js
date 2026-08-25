import { fetchNewPdfAttachments } from './imap.js';
import { extractExamData } from './parse-pdf.js';
import { matchEmployee } from './match-employee.js';
import { uploadEncryptedAso } from './aso-storage.js';
import { FieldValue } from 'firebase-admin/firestore';
import getDb, { EMPLOYEES_COL, META_COL, SYNC_DOC } from './firestore.js';

export async function runSync() {
  const db = getDb();
  const attachments = await fetchNewPdfAttachments();

  const resultado = { processados: 0, atualizados: 0, revisao: 0, erros: [] };

  for (const anexo of attachments) {
    resultado.processados++;
    try {
      const dados = await extractExamData(anexo.buffer);

      if (dados.confidence === 'baixa' || !dados.dataExame) {
        await registrarPendenteRevisao(db, anexo, dados, 'extração de baixa confiança');
        resultado.revisao++;
        continue;
      }

      const { employee, matchedBy, motivo } = await matchEmployee(db, dados);
      if (!employee) {
        await registrarPendenteRevisao(db, anexo, dados, motivo || 'colaborador não identificado');
        resultado.revisao++;
        continue;
      }

      // só avança a data se o exame do PDF for mais recente que o que já está gravado
      // (evita e-mail atrasado/reenviado sobrescrever um exame mais novo já lançado)
      if (employee.ultimaData && dados.dataExame <= employee.ultimaData) {
        resultado.processados--; // não conta como novo processamento útil
        continue;
      }

      // PDF sobe criptografado (AES-256-GCM) pro Storage — o arquivo original nunca
      // fica salvo em texto puro em lugar nenhum, só passa pela memória da função.
      const asoPath = await uploadEncryptedAso(dados.matricula, dados.dataExame, anexo.buffer);

      await db.collection(EMPLOYEES_COL).doc(employee.id).set({
        ultimaData: dados.dataExame,
        dataAgendada: '', // exame realizado limpa um eventual agendamento pendente
        revisaoPendente: false,
        ultimoAsoPath: asoPath,
        historico: FieldValue.arrayUnion({
          data: dados.dataExame,
          registradoEm: new Date().toISOString(),
          origem: 'robô',
        }),
      }, { merge: true });
      resultado.atualizados++;
    } catch (e) {
      resultado.erros.push({ arquivo: anexo.filename, erro: e.message });
      await registrarPendenteRevisao(db, anexo, {}, 'erro ao processar: ' + e.message);
      resultado.revisao++;
    }
  }

  await db.collection(META_COL).doc(SYNC_DOC).set({
    lastRun: new Date(),
    processadosUltimaRodada: resultado.processados,
    atualizadosUltimaRodada: resultado.atualizados,
    pendentes: resultado.revisao,
  }, { merge: true });

  return resultado;
}

// Grava o caso em uma coleção separada pra você revisar manualmente no painel
// (a aba "Pendentes de revisão" ainda precisa ser construída no app.js do painel).
async function registrarPendenteRevisao(db, anexo, dados, motivo) {
  await db.collection('_revisao_pendente').add({
    arquivo: anexo.filename,
    assunto: anexo.subject,
    remetente: anexo.from,
    recebidoEm: anexo.receivedAt,
    dadosExtraidos: dados,
    motivo,
    criadoEm: new Date(),
    resolvido: false,
  });
}
