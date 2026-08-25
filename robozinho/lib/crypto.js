import crypto from 'node:crypto';

// AES-256-GCM. A chave vive só na variável de ambiente (nunca no código, nunca no
// navegador) — sem ela, o PDF salvo no Storage é ilegível, mesmo se alguém conseguisse
// acesso direto ao bucket.
function getKey() {
  const raw = process.env.ASO_ENCRYPTION_KEY;
  if (!raw) throw new Error('ASO_ENCRYPTION_KEY não configurada nas variáveis de ambiente.');
  const key = Buffer.from(raw, 'hex');
  if (key.length !== 32) throw new Error('ASO_ENCRYPTION_KEY precisa ter 32 bytes (64 caracteres hex).');
  return key;
}

// Formato do arquivo salvo: [iv (12 bytes)][authTag (16 bytes)][ciphertext]
export function encryptBuffer(plainBuffer) {
  const key = getKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(plainBuffer), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, ciphertext]);
}

export function decryptBuffer(encryptedBuffer) {
  const key = getKey();
  const iv = encryptedBuffer.subarray(0, 12);
  const authTag = encryptedBuffer.subarray(12, 28);
  const ciphertext = encryptedBuffer.subarray(28);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

// Gera uma chave nova (rodar uma vez localmente e colar em ASO_ENCRYPTION_KEY).
export function generateKeyHex() {
  return crypto.randomBytes(32).toString('hex');
}
