# Robozinho ASO

Lê os e-mails de exames que chegam de uma caixa dedicada, faz OCR no PDF anexado, extrai
matrícula/nome/data do exame e atualiza automaticamente o Painel de ASOs. Casos incertos vão
pra fila de revisão manual (coleção `_revisao_pendente` no Firestore) em vez de serem gravados
errados.

## Descoberta importante: os PDFs são só imagem

Os ASOs da clínica (SEG Saúde Ocupacional) não têm camada de texto — testado com 3 PDFs reais,
`pdf-parse` e `pdfplumber` retornaram 0 caracteres nos dois. Por isso o pipeline precisa de OCR:
PDF → imagem (300dpi) → texto (Tesseract, português) → regex.

Testado com os 3 PDFs reais que você mandou: nome, matrícula e data do exame saíram corretos
nos 3. O checkbox de "Apto/Inapto" **não** saiu confiável (o "X" virou "bd", "nm" etc. dependendo
do arquivo) — por isso o robô não usa isso pra nenhuma decisão automática, só nome + matrícula +
data.

## 100% gratuito, sem cartão em lugar nenhum

Toda a stack roda em planos genuinamente sem cartão vinculado:

| Peça | Serviço | Plano |
|---|---|---|
| Banco de dados (colaboradores, fila de revisão) | Firestore | Spark — grátis, sem cartão |
| Login | Firebase Auth | Spark — grátis, sem cartão |
| PDF do ASO criptografado | Cloudflare R2 | Free tier — 10GB, sem cartão, zero taxa de saída |
| Funções que rodam o robô e o endpoint de visualização | Vercel | Hobby — grátis, sem cartão |

O Firebase Storage ficou de fora de propósito: desde fevereiro de 2026 ele passou a exigir
cartão vinculado (plano Blaze) mesmo dentro da faixa gratuita. O R2 resolve o mesmo problema
sem pedir cartão nenhum.

## Passo a passo pra colocar no ar

1. **Ativar Fluid Compute no projeto da Vercel.** Project Settings → Functions → Fluid Compute.
   Sem isso, o limite de execução no plano Hobby é 10s — insuficiente pra OCR. Com Fluid Compute
   ativado, sobe pra até 300s mesmo no Hobby (sem custo, sem cartão). O `vercel.json` já pede
   120s pra função de sync.

2. **Criar a caixa dedicada.** Uma conta de e-mail nova (Gmail é o mais simples), só pra isso.
   Ative IMAP nas configurações da conta e gere uma **senha de app** (não use a senha normal).

3. **Regra de encaminhamento no Outlook corporativo.** "Regras" → nova regra → de: e-mail(s) da
   clínica → encaminhar para a caixa nova.

4. **Chave de conta de serviço do Firebase.** No Console do Firebase do projeto `controle-aso-48c88`:
   Configurações do projeto → Contas de serviço → Gerar nova chave privada. Guarde o JSON.
   (Isso não pede cartão — é só o Firestore/Auth, que continuam no plano Spark.)

5. **Criar o bucket no Cloudflare R2.**
   - Crie uma conta grátis na Cloudflare (não pede cartão).
   - No painel: R2 → Create bucket → nome `asos-ability` (ou o que preferir, ajustando
     `R2_BUCKET_NAME`).
   - R2 → Manage API Tokens → Create API Token → permissão "Object Read & Write", limitado
     ao bucket criado. Copie o Access Key ID e o Secret Access Key na hora — o secret não
     aparece de novo depois.
   - O Account ID fica na barra lateral direita do painel da Cloudflare.

6. **Variáveis de ambiente.** Copie `.env.example` para `.env` (uso local) e preencha. Na Vercel,
   configure as mesmas variáveis em Project Settings → Environment Variables (o JSON da conta de
   serviço do Firebase vai inteiro, como uma linha só, em `FIREBASE_SERVICE_ACCOUNT`).

7. **Testar localmente antes de publicar:**
   ```
   npm install
   npm run sync
   ```
   Isso roda uma vez só e imprime o resultado no terminal. A primeira execução é mais lenta —
   o Tesseract baixa o pacote de idioma português na primeira vez e depois reaproveita.

8. **Publicar na Vercel.** `vercel deploy` (ou conectar o repositório).

## Ponto de atenção: escala nos planos gratuitos

Com ~450KB por ASO (medido nos seus PDFs reais), os 10GB grátis do R2 cabem uns 20.000+ exames —
bem acima dos ~5.000 colaboradores da Ability, mesmo guardando histórico de vários anos. O
Firestore (só texto/metadados, não o PDF) fica bem abaixo do 1GiB gratuito nesse uso. Se algum
dia isso mudar (ex: adicionar fotos, laudos maiores), vale reconferir os números antes de crescer
o volume.

Confirme também o limite de cron jobs do plano Hobby da Vercel antes de contar com a frequência
de 30 minutos exatamente — se precisar ajustar, o `schedule` fica isolado no `vercel.json`.

## ASOs criptografados (LGPD)

O PDF do exame é dado de saúde — categoria sensível pela LGPD. Por isso:

- O PDF original sobe **criptografado (AES-256-GCM)** pro Cloudflare R2, nunca em texto puro.
- A chave de criptografia (`ASO_ENCRYPTION_KEY`) só existe na variável de ambiente do servidor —
  gerar uma vez com `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
  e guardar em local seguro. **Se essa chave se perder, os ASOs já salvos ficam ilegíveis.**
- O bucket do R2 não é público — só as credenciais de API (guardadas como variável de ambiente
  no servidor) conseguem ler ou escrever nele. O único caminho pra ver um ASO é o endpoint
  `/api/aso.js`, que roda com essas credenciais.
- O endpoint confere o token de login de quem está pedindo e **recusa qualquer conta que esteja
  na coleção `managers`** — só a sua conta (a que não é gestor) consegue abrir o PDF.
- Configure `PAINEL_ORIGIN` com o domínio exato onde o painel está hospedado, senão o CORS fica
  aberto pra qualquer site chamar o endpoint (mesmo que a autenticação continue bloqueando).

No `app.js` do painel, troque a constante `ROBOZINHO_API` pela URL real do projeto depois do
primeiro deploy na Vercel.

## Ajustando a extração do PDF

`lib/parse-pdf.js` tem os padrões validados com a clínica SEG Saúde Ocupacional. Se a Ability
trabalhar com outra clínica no futuro, o formato do PDF provavelmente muda — vale rodar o mesmo
teste (mandar 2-3 PDFs reais) antes de confiar no robô pra ela.

## O que falta pro painel (app.js)

- Uma aba/lista que lê a coleção `_revisao_pendente` e mostra os casos pra você confirmar ou
  corrigir manualmente (hoje só o contador de "Pendente de revisão" existe, olhando o campo
  `revisaoPendente` no colaborador — a leitura da coleção de pendências em si ainda não foi
  construída na interface).
