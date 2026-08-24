import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { encryptBuffer, decryptBuffer } from './crypto.js';

// Cloudflare R2: 10GB grátis, sem cartão, sem taxa de saída de dados — fala a mesma
// API do S3, então usamos o SDK oficial da AWS só trocando o endpoint.
function getClient() {
  const accountId = process.env.R2_ACCOUNT_ID;
  if (!accountId) throw new Error('R2_ACCOUNT_ID não configurada.');
  return new S3Client({
    region: 'auto',
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    },
  });
}

function getBucketName() {
  const bucket = process.env.R2_BUCKET_NAME;
  if (!bucket) throw new Error('R2_BUCKET_NAME não configurada.');
  return bucket;
}

// Caminho no bucket: um arquivo por exame, criptografado. O nome não usa o nome do
// colaborador (só a matrícula), pra evitar vazar dado pessoal no path do arquivo.
function keyFor(matricula, dataExame) {
  return `asos/${matricula}/${dataExame}.pdf.enc`;
}

export async function uploadEncryptedAso(matricula, dataExame, pdfBuffer) {
  const client = getClient();
  const encrypted = encryptBuffer(pdfBuffer);
  const key = keyFor(matricula, dataExame);
  await client.send(new PutObjectCommand({
    Bucket: getBucketName(),
    Key: key,
    Body: encrypted,
    ContentType: 'application/octet-stream', // nunca application/pdf — não é um PDF válido sem decriptar
  }));
  return key;
}

export async function downloadDecryptedAso(key) {
  const client = getClient();
  const resp = await client.send(new GetObjectCommand({ Bucket: getBucketName(), Key: key }));
  const chunks = [];
  for await (const chunk of resp.Body) chunks.push(chunk);
  const encrypted = Buffer.concat(chunks);
  return decryptBuffer(encrypted);
}
