import { pdf } from 'pdf-to-img';
import { createWorker } from 'tesseract.js';

// Os PDFs da clínica SEG Saúde Ocupacional são só imagem (sem camada de texto) —
// confirmado testando com os PDFs reais. Por isso o pipeline é: rasterizar cada
// página em PNG e rodar OCR em português antes de aplicar os padrões abaixo.
//
// Padrões validados com 3 ASOs reais (nome, código/matrícula e data do exame saíram
// corretos nos 3). Se a Ability trabalhar com mais de uma clínica no futuro, cada
// uma pode formatar o PDF diferente — vale testar de novo antes de confiar no robô.

const NOME_COD_RE = /Nome:\s*([A-ZÀ-Ú][A-ZÀ-Úa-zà-ú\s]+?)\s*\/\s*C[oó]d\.?:?\s*([0-9]{1,20})/i;
const DATA_RE = /\b(\d{2})\/(\d{2})\/(\d{4})\b/g;

function parseDataBR(dd, mm, yyyy) {
  return `${yyyy}-${mm}-${dd}`;
}

async function ocrPdfBuffer(buffer) {
  const worker = await createWorker('por');
  try {
    let textoCompleto = '';
    // scale 3 ≈ 300dpi — resolução que deu bom resultado nos testes; menor que isso
    // prejudica a leitura de números pequenos (matrícula, CPF, datas).
    const documento = await pdf(buffer, { scale: 3 });
    for await (const pagina of documento) {
      const { data } = await worker.recognize(pagina);
      textoCompleto += data.text + '\n';
    }
    return textoCompleto;
  } finally {
    await worker.terminate();
  }
}

/**
 * Extrai nome, matrícula e data do exame a partir do PDF (buffer) do ASO.
 * Retorna confidence baixa quando falta nome+matrícula ou não acha data —
 * esses casos vão pra fila de revisão manual em vez de atualizar a base direto.
 */
export async function extractExamData(buffer) {
  const text = await ocrPdfBuffer(buffer);

  const nomeCodMatch = text.match(NOME_COD_RE);
  const nome = nomeCodMatch ? nomeCodMatch[1].trim().replace(/\s+/g, ' ') : null;
  const matricula = nomeCodMatch ? nomeCodMatch[2].trim() : null;

  // A data do exame fica no bloco "Exames Médicos e Complementares para o PCMSO",
  // isolado do resto do documento pra não pegar "Data de Nasc." ou datas de assinatura.
  // Pode haver mais de um exame (ECG, Glicemia etc.) — todos no mesmo dia — por isso
  // pegamos a data mais frequente do bloco em vez da primeira que aparecer.
  const bloco = (text.split(/Exames?\s*M[eé]dicos?\s*e\s*Complementares/i)[1] || '')
    .split(/Os dados neste documento/i)[0];
  const datas = [...bloco.matchAll(DATA_RE)].map(m => parseDataBR(m[1], m[2], m[3]));
  const freq = {};
  datas.forEach(d => { freq[d] = (freq[d] || 0) + 1; });
  const dataExame = Object.keys(freq).sort((a, b) => freq[b] - freq[a])[0] || null;

  // Confiança: o checkbox de Apto/Inapto não sai confiável no OCR (o "X" vira "bd",
  // "nm" etc. dependendo do arquivo) — por isso não usamos aptidão pra decisão nenhuma,
  // só nome + matrícula + data, que testaram 100% nos 3 PDFs reais.
  const temIdentificacao = Boolean(nome && matricula);
  const confidence = temIdentificacao && dataExame ? 'alta'
    : (nome || matricula) && dataExame ? 'media'
    : 'baixa';

  return { matricula, nome, dataExame, confidence, textoOriginal: text.slice(0, 2000) };
}
