import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';

/**
 * Conecta na caixa dedicada (ex: Gmail criado só pra isso), busca e-mails
 * ainda não processados e retorna os PDFs anexados.
 *
 * Convenção: depois de processar um e-mail, marcamos como \Seen — assim,
 * na próxima rodada, só pegamos o que é novo.
 */
export async function fetchNewPdfAttachments() {
  const client = new ImapFlow({
    host: process.env.IMAP_HOST || 'imap.gmail.com',
    port: Number(process.env.IMAP_PORT || 993),
    secure: true,
    auth: {
      user: process.env.IMAP_USER,
      pass: process.env.IMAP_APP_PASSWORD, // senha de app, não a senha normal da conta
    },
  });

  const results = [];
  await client.connect();
  try {
    const lock = await client.getMailboxLock('INBOX');
    try {
      // \Seen = false -> só e-mails ainda não marcados como lidos por uma rodada anterior
      for await (const msg of client.fetch({ seen: false }, { source: true, uid: true })) {
        const parsed = await simpleParser(msg.source);
        const pdfs = (parsed.attachments || []).filter(a => a.contentType === 'application/pdf');
        if (pdfs.length === 0) {
          // e-mail sem PDF (confirmação de agendamento em texto, por ex.) — marca como visto e segue
          await client.messageFlagsAdd(msg.uid, ['\\Seen'], { uid: true });
          continue;
        }
        for (const pdf of pdfs) {
          results.push({
            uid: msg.uid,
            subject: parsed.subject || '',
            from: parsed.from?.text || '',
            receivedAt: parsed.date || new Date(),
            filename: pdf.filename,
            buffer: pdf.content,
          });
        }
        await client.messageFlagsAdd(msg.uid, ['\\Seen'], { uid: true });
      }
    } finally {
      lock.release();
    }
  } finally {
    await client.logout();
  }
  return results;
}
