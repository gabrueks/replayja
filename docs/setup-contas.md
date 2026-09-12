# Contas e provisionamento — o que já existe e o que falta

> Escrito na task **B1** (scaffold do app web), em 2026-09-12.
> Complementa `adr/0001-stack-e-arquitetura.md` §4 e `decisoes.md` §3.

Este documento tem dois públicos: quem precisa **rodar o projeto agora** e o
Gabriel, que precisa **fechar o que só ele pode fechar**. Os comandos são exatos
e foram escritos para copiar e colar.

---

## 1. Estado atual, sem rodeios

| Conta | Situação | O que falta |
|---|---|---|
| **Vercel** | ✅ **Projeto `replayja` criado** no time `gabriel-bolzis-projects` (o mesmo do Sentinela), pasta `web/` linkada, 18 variáveis configuradas em Preview e Production | Root Directory = `web` no dashboard; conectar o repositório Git |
| **Neon** | ❌ **Não criado.** A CLI do Neon não está instalada nesta máquina e não há `NEON_API_KEY` no ambiente — e a instrução foi não tentar autenticar | Criar o projeto `replayja` na região `aws-sa-east-1` (§3) |
| **Resend** | ⏸ Conta existe (é a do Sentinela); o domínio `replayja.com.br` ainda não foi verificado | Depende do domínio (G-07) |
| **Google OIDC** | ⏸ Não configurado | Criar as credenciais (§5) |
| **AWS (S3 + CloudFront)** | ⏸ Não criado — de propósito: bucket e distribuição **geram custo** e o Gabriel aprova junto com a infra do relay | §6 |
| **Domínio `replayja.com.br`** | ⏸ Pendência G-07 | Bloqueia OTP, OG, CDN e TLS do relay |

**Nenhum deploy de produção foi feito.** O projeto na Vercel existe e está
configurado, mas está vazio.

---

## 2. Vercel — o que já foi feito, e o que sobra

O que já está pronto:

```bash
vercel project add replayja --scope gabriel-bolzis-projects
cd web && vercel link --yes --project replayja --scope gabriel-bolzis-projects
```

- `projectId`: `prj_0x3SmFd3FyEnYTJITRskRQJuQ7TE`
- `orgId`: `team_w0VgnDBrape3dGzXcJjGuJMi` (o mesmo time do `condocam`/Sentinela)
- `web/vercel.json` fixa a região em **`gru1`** (ADR §4.1: os handlers que falam
  com o banco precisam estar perto dele).

### 2.1 Falta: Root Directory

O repositório tem `web/` e `relay/` lado a lado. O deploy por Git precisa saber
que o app é `web/` — e **isso não tem comando de CLI**:

> Vercel → Projeto `replayja` → Settings → General → **Root Directory** = `web`

Sem isso, o build por Git falha com "no Next.js version detected".

### 2.2 Falta: conectar o Git

> Settings → Git → Connect Git Repository

Depois disso, todo push de branch vira preview. O `scripts/migrate.ts` **só
escreve esquema quando `VERCEL_ENV=production`** — uma branch pela metade não
aplica migração em produção.

### 2.3 Recomendado: Spend Management

O uso do Replay já passa a contar **na fatura do Sentinela** (mesmo time). Um
alerta de gasto evita que um bug de cache no produto novo apareça como surpresa
na conta do produto antigo (ADR §4.1).

> Time → Settings → Billing → **Spend Management** → limite + alerta por e-mail

### 2.4 Variáveis já configuradas (Preview + Production)

Geradas aleatoriamente nesta task, **já no ar**:

| Variável | O que é |
|---|---|
| `SESSION_SECRET` | 48 bytes. Assina o cookie de sessão, o desafio do OTP e o do Google. **Trocar desloga todo mundo** |
| `RELAY_KEY` / `RELAY_KEY_HASH` | A chave que o relay apresenta em `x-relay-key`, e o SHA-256 dela |
| `RELAY_TOKEN` | O token que NÓS usamos ao chamar `POST /jobs` no relay |
| `RELAY_TOKEN_SECRET` | ⚠️ **Tem de ser idêntico ao do `rec.env` na máquina do relay** — é com ele que o `auth-sidecar` assina as URLs de `/t/<token>/clip`. Divergência = "o vídeo não toca", sem erro nenhum no nosso log |

Valores de configuração (não são segredo): `NEXT_PUBLIC_SITE_URL`, `EMAIL_FROM`,
`EMAIL_REPLY_TO`, `RELAY_NODE_ID`, `STORAGE_REGION`, `STORAGE_BUCKET`,
`STORAGE_PUBLIC_BUCKET`, `CLOUDFRONT_DOMAIN`, `CDN_PUBLIC_BASE_URL`.

**Para ler os segredos gerados** (eles não estão em lugar nenhum do repositório):

```bash
cd web && vercel env pull .env.local --environment=production
```

### 2.5 Falta: as variáveis que ainda não têm valor

A Vercel **recusa variável com valor vazio**, então elas não foram criadas. Cada
uma bloqueia uma coisa específica:

| Variável | Bloqueia | Onde nasce |
|---|---|---|
| `DATABASE_URL` | tudo | §3 |
| `RESEND_API_KEY` | o e-mail do código de login | §4 |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | o botão "Continuar com o Google" (o login por e-mail funciona sem) | §5 |
| `STORAGE_ACCESS_KEY_ID` / `STORAGE_SECRET_ACCESS_KEY` | o upload do clipe | §6 |
| `CLOUDFRONT_KEY_PAIR_ID` / `CLOUDFRONT_PRIVATE_KEY` | a reprodução do clipe | §6 |
| `CLOUDFRONT_DISTRIBUTION_ID` | o takedown da LGPD (apagar no S3 **não** tira do cache das bordas) | §6 |

```bash
# o padrão, para cada uma:
printf '%s' "VALOR" | vercel env add NOME production --scope gabriel-bolzis-projects
printf '%s' "VALOR" | vercel env add NOME preview    --scope gabriel-bolzis-projects
```

---

## 3. Neon — criar o projeto `replayja`

**Região: `aws-sa-east-1` (São Paulo).** É decisão do fundador ("só Brasil") e
**não deve ser herdada por inércia** da conta do Sentinela — é o G-04 de
`decisoes.md`.

**Projeto novo, não branch** do banco do Sentinela: branch compartilha histórico e
regras de um banco que é de outro produto, e a separação por projeto dá isolamento
de conexão, de backup e de restauração (ADR §4.2).

```bash
# 1. instalar e autenticar (abre o navegador)
npm i -g neonctl
neonctl auth

# 2. criar o projeto na região certa
neonctl projects create --name replayja --region-id aws-sa-east-1

# 3. pegar a connection string
neonctl connection-string --project-id <ID_QUE_SAIU_ACIMA>

# 4. mandar para a Vercel (os dois ambientes)
printf '%s' "postgres://...?sslmode=require" | vercel env add DATABASE_URL production --scope gabriel-bolzis-projects
printf '%s' "postgres://...?sslmode=require" | vercel env add DATABASE_URL preview    --scope gabriel-bolzis-projects

# 5. aplicar as migrações
cd web && vercel env pull .env.local && pnpm migrate
```

Pelo painel, se preferir: <https://console.neon.tech> → New Project → Region
**AWS South America (São Paulo)** → nome `replayja`.

> **O que mantém o Neon acordado é o nosso próprio polling.** O relay consulta a
> fila de jobs, e se ele perguntar a cada 2 s o dia inteiro o banco nunca dorme —
> 730 CU-horas/mês, ~US$ 19 mesmo com o produto parado de madrugada. A decisão da
> ADR §4.2 é polling **adaptativo**: 2 s dentro do horário de operação da quadra,
> 60 s fora dele. Isso já está no modelo de dados (`court.opens_time` /
> `closes_time`) e é configuração do relay, não código novo.

---

## 4. Resend — verificar o domínio

Mesma conta do Sentinela, **domínio novo**. Um OTP do "Replay já" chegando de
`@sentinelacam.com` parece phishing, e o atleta que não reconhece o remetente não
confirma o código — o que mata exatamente a métrica que o produto precisa
proteger (ADR §4.4).

1. <https://resend.com/domains> → Add Domain → `replayja.com.br`
2. Envio por `mail.replayja.com.br`; publicar SPF, DKIM e DMARC próprios
3. Criar API key → `RESEND_API_KEY` na Vercel

> **O teto do plano gratuito é COMPARTILHADO e é POR DIA**: 3.000/mês **e
> 100/dia**, somando os dois produtos. O piloto sozinho deve usar 60–80/dia, então
> **o limite diário é o que vai estourar primeiro**. No primeiro estouro, Resend
> Pro (US$ 20/mês, 50 mil) cobre os dois com uma assinatura só.

---

## 5. Google — credenciais OIDC

O login por e-mail funciona sem isto; o botão do Google some sozinho quando as
variáveis não existem (`googleConfigurado()`).

1. <https://console.cloud.google.com/apis/credentials> → Create Credentials →
   OAuth client ID → **Web application**
2. **Authorized JavaScript origins**: `https://replayja.com.br`,
   `http://localhost:3000`
3. **Authorized redirect URIs**:
   - `https://replayja.com.br/api/auth/google/callback`
   - `http://localhost:3000/api/auth/google/callback`
   - (cada domínio de preview que for usar, ou configurar `GOOGLE_REDIRECT_URI`)
4. `GOOGLE_CLIENT_ID` e `GOOGLE_CLIENT_SECRET` na Vercel

O fluxo é OIDC manual com `jose`, sem Auth.js — a justificativa é **posse da
sessão** (ADR §4.4): um dono de sessão só no app.

---

## 6. AWS — S3 em `sa-east-1` + CloudFront

**Não criado de propósito**: bucket e distribuição geram custo, e a aprovação vem
junto com a infra do relay (`relay/README.md`, pendências P1–P4).

Decidido em 2026-09-12, substituindo o R2 da ADR §5: **S3 em `sa-east-1` (São
Paulo) + CloudFront, Price Class All**. A imagem de pessoa não sai do país, o que
tira a jurisdição do bucket da lista de bloqueantes da LGPD. O custo que isso troca
é o **egress**, que no R2 era zero — é o parafuso a acompanhar quando o piloto
virar tráfego real.

```bash
REGIAO=sa-east-1

# Bucket privado dos clipes (bloqueio total de acesso público; quem entrega é o
# CloudFront, com URL assinada)
aws s3api create-bucket --bucket replayja-clips --region $REGIAO \
  --create-bucket-configuration LocationConstraint=$REGIAO
aws s3api put-public-access-block --bucket replayja-clips \
  --public-access-block-configuration "BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true"

# Bucket dos thumbnails e do Open Graph. Público é EXCEÇÃO CONSCIENTE: o crawler
# do WhatsApp não tem sessão, e sem imagem pública o link compartilhado não tem
# preview tocável — que é o que faz a arena aparecer (api/README.md §3).
aws s3api create-bucket --bucket replayja-thumbs --region $REGIAO \
  --create-bucket-configuration LocationConstraint=$REGIAO

# Rede de segurança independente dos jobs (modelo-de-dados.md §5):
aws s3api put-bucket-lifecycle-configuration --bucket replayja-clips \
  --lifecycle-configuration '{"Rules":[{"ID":"expira-400d","Status":"Enabled","Filter":{"Prefix":"clips/"},"Expiration":{"Days":400}}]}'
```

Depois: distribuição CloudFront com os dois buckets como origem, OAC para o
privado, **key group** para as URLs assinadas (`CLOUDFRONT_KEY_PAIR_ID` +
`CLOUDFRONT_PRIVATE_KEY`) e o CNAME `cdn.replayja.com.br`.

O IAM do app precisa de: `s3:PutObject`, `s3:GetObject`, `s3:HeadObject`,
`s3:DeleteObject` nos dois buckets, e `cloudfront:CreateInvalidation` na
distribuição.

---

## 7. Rodar na sua máquina

```bash
cd web
pnpm install
cp .env.example .env.local     # e preencha ao menos SESSION_SECRET
pnpm dev
```

Sem `DATABASE_URL` o app **sobe**: `/api/health` responde `degraded` e as páginas
que dependem do banco tratam a ausência. Sem `RESEND_API_KEY`, o código de login
sai no **log do servidor** (nunca na resposta).

### Testes

```bash
pnpm test          # unitários; o de integração é PULADO sem TEST_DATABASE_URL
pnpm typecheck
pnpm build
```

Para rodar o teste de integração (migrações + consulta central) contra Postgres
de verdade:

```bash
docker run --rm -d -p 5433:5432 -e POSTGRES_PASSWORD=postgres \
  --name replayja-pg postgres:16-alpine
TEST_DATABASE_URL=postgres://postgres:postgres@localhost:5433/postgres pnpm test
```

> **Sem Docker?** Funciona com qualquer Postgres 14+ acessível. O banco precisa
> ser **UTF-8** — num cluster inicializado com locale do Windows (WIN1252) as
> migrações falham, porque os comentários delas têm acento e traço longo. Crie
> assim: `CREATE DATABASE replayja_test ENCODING 'UTF8' LC_COLLATE 'C'
> LC_CTYPE 'C' TEMPLATE template0;`

---

## 8. Ordem sugerida

1. **Domínio `replayja.com.br`** (G-07) — destrava Resend, OG, CDN e o TLS do relay
2. **Neon** (§3) — destrava tudo o que é banco
3. **Root Directory + Git na Vercel** (§2.1, §2.2) — destrava o preview por PR
4. **Resend** (§4) — destrava o login
5. **AWS** (§6) — junto com a infra do relay
6. **Google** (§5) — melhora o login, não bloqueia nada

---

## Estado em 2026-09-12 (feito nesta sessão)

- **Neon criado via integração da Vercel** (a organização Neon é gerenciada pela Vercel; a API do Neon recusa `create_project` direto). Comando usado, em `web/`:

  ```bash
  vercel integration add neon -n replayja -m region=gru1 -e production -e preview --no-env-pull
  ```

- Recurso **`replayja`** → projeto Neon `rough-bread-27863452`, região **`aws-sa-east-1`**, Postgres 18, banco `neondb`, endpoint `ep-winter-pond-acaawqb8`. Variáveis `DATABASE_URL`, `DATABASE_URL_UNPOOLED`, `PG*`, `POSTGRES_*`, `NEON_PROJECT_ID` criadas em Preview + Production do projeto Vercel `replayja`.
- **Compute ajustado para custo mínimo**: autoscaling 0,25–1 CU e suspensão após 5 min de inatividade (o padrão da integração vinha com 1 CU fixo e sem suspensão, que consumiria as horas de compute do plano Launch 24/7).
- **9 migrações aplicadas** no banco de produção (`pnpm migrate` com a URL sem pool); `pnpm migrate:status` = 0 pendentes. O `vercel-build` roda `migrate up --if-configured` a cada deploy.
- **Incidente evitado**: o recurso `neon-red-fountain` (banco de produção do Sentinela, compartilhado com condocam e deconfianca) chegou a ser conectado ao projeto `replayja` com prefixo `DB_`. Foi **desconectado** (`vercel integration resource disconnect neon-red-fountain replayja`, que só remove as variáveis do replayja — não toca no banco nem nos outros projetos). Zero variáveis `DB_*` restantes. Regra: o Replay já **nunca** aponta para o banco do Sentinela.
- Ainda pendente na Vercel (só pela UI): **Root Directory = `web`** e conexão com o Git (o repo ainda não tem commit nem remoto).

## App no ar (2026-09-12)

- **Produção:** https://replayja.vercel.app (aliases `replayja-gabriel-bolzis-projects.vercel.app`). `GET /api/health` → `{"status":"ok","db":"ok"}`.
- **Bug do 1º deploy e correção:** o projeto tinha *Framework Preset = Other* (criado pela CLI sem framework). A Vercel tratou o `middleware.ts` da raiz como *Routing Middleware* Node em vez de middleware do Next → 500 em todas as páginas e 404 na API. Correção: `"framework": "nextjs"` no `web/vercel.json` e redeploy (`vercel deploy --prod`). O Root Directory continua `.` porque o deploy é feito de dentro de `web/` pela CLI; **quando conectar o Git, definir Root Directory = `web`** no painel.
- Deploys pela CLI a partir de `web/`: `vercel deploy` (preview) / `vercel deploy --prod`.

## Infra do relay aplicada (2026-09-12, via CloudShell no console AWS)

A CLI da AWS desta máquina é de outra conta; o `terraform apply` foi feito no **CloudShell** (`sa-east-1`) da conta pessoal do Gabriel, com Terraform 1.9.8 em `~/bin` e os arquivos em `~/replayja/infra/`. **O `terraform.tfstate` está lá** (home do CloudShell, persistente por região) — copiar para um bucket/backend antes de qualquer mudança grande.

| Saída | Valor |
|---|---|
| `ip_publico` (EIP) | **15.229.94.105** |
| `instance_id` | `i-04bb3a7f14df569ca` (t4g.medium, Ubuntu 24.04 arm64, crédito `standard`) |
| `volume_midia` | `vol-05f52a143a7915923` (st1 250 GB, `/dev/sdf`, `prevent_destroy`) |
| Acesso | **SSM Session Manager** (agente Online). Sem porta 22, sem key pair: `aws ssm start-session --region sa-east-1 --target i-04bb3a7f14df569ca` |
| DNS a criar | `relay-1.replayja.com.br` e `stream.replayja.com.br` → `15.229.94.105` |

Duas mudanças feitas na infra em relação ao que o agente entregou: (1) perfil IAM com `AmazonSSMManagedInstanceCore` e `cidrs_ssh`/`nome_chave_ssh` opcionais (padrão fechado); (2) a descrição da regra de egress tinha um apóstrofo ("Let's") e a API do EC2 rejeitou — corrigido nos dois lados. Os `.tf` aplicados no CloudShell são uma versão com comentários enxutos dos de `relay/infra/` (mesmos recursos e nomes).

**Próximo passo do relay:** levar o código de `relay/` para a instância. Sem repositório remoto, a via é `git push` para um repo (GitHub) + `git clone` dentro da sessão SSM, ou `aws s3 cp` de um tarball a partir do CloudShell. Depois: `rec.env` com os 4 segredos (o `RELAY_TOKEN_SECRET` igual ao da Vercel) e `sudo sh setup.sh`.

## Armazenamento e entrega aplicados (2026-09-12, CloudShell, `relay/infra/storage.tf`)

| Recurso | Valor |
|---|---|
| Bucket privado dos clipes | `replayja-clips` (sa-east-1, SSE-AES256, sem versionamento, expira em 100 dias) |
| Bucket de thumbs/OG | `replayja-thumbs` (privado no S3; público só via CloudFront em `*.jpg`) |
| CloudFront | `dp5uk8macopb8.cloudfront.net`, distribuição `E2YM01F0V7JZ24`, Price Class All, OAC nos dois buckets; padrão exige URL assinada (key group `replayja-app`, key pair `KKGXO9IIDU78V`) |
| Acesso do app | **Federação OIDC da Vercel** → role `arn:aws:iam::301952060370:role/replayja-vercel-app` (S3 Put/Get/Delete nos dois buckets + invalidação da distribuição). **Nenhuma access key da AWS existe.** Exige o projeto Vercel com "Secure backend access with OIDC federation" ligado |
| Chave de assinatura | Par RSA-2048 gerado localmente; a pública está no CloudFront, a privada só em `CLOUDFRONT_PRIVATE_KEY` na Vercel (Production + Preview) |

Envs setadas na Vercel (Production + Preview): `STORAGE_REGION`, `STORAGE_BUCKET`, `STORAGE_PUBLIC_BUCKET`, `AWS_ROLE_ARN`, `CLOUDFRONT_DOMAIN`, `CLOUDFRONT_KEY_PAIR_ID`, `CLOUDFRONT_DISTRIBUTION_ID`, `CLOUDFRONT_PRIVATE_KEY`, `CDN_PUBLIC_BASE_URL`. O código (`web/lib/storage.ts`) usa `awsCredentialsProvider` de `@vercel/functions/oidc` quando `AWS_ROLE_ARN` existe; chave estática fica só para dev local.

Pendente: `cdn.replayja.com.br` como alias (certificado ACM em us-east-1 validado por DNS) — depende do DNS do domínio (G-07).

## Git (2026-09-12)

- Repositório: https://github.com/gabrueks/replayja (público). `vercel git connect` feito; Root Directory = `web` salvo no painel; OIDC Federation em modo **Team** (issuer `https://oidc.vercel.com/gabriel-bolzis-projects`), que é o que a role `replayja-vercel-app` confia.
- A partir de agora **push em `main` gera deploy de produção**. Preview por branch/PR.

## DNS de `replayja.com.br` (2026-09-12)

Nameservers atuais: `nova.dns-parking.com` / `cosmos.dns-parking.com` (**Hostinger**). O domínio já estava vinculado a **outra conta Vercel** (provavelmente do Replay já 1.0); por isso a Vercel exige um TXT de verificação para liberar o uso neste time. Registros a criar **no painel da Hostinger** (hpanel → Domínios → replayja.com.br → DNS / Zona DNS):

| Tipo | Nome | Valor | Para quê |
|---|---|---|---|
| TXT | `_vercel` | `vc-domain-verify=replayja.com.br,04ea5fd5af55dd352e87` | provar posse do domínio para a Vercel (pode remover depois de verificado) |
| A | `@` | `216.150.1.1` | site em `replayja.com.br` (Vercel) |
| A | `relay-1` | `15.229.94.105` | relay (Caddy/TLS, /clip, /stats) |
| A | `stream` | `15.229.94.105` | endereço RTMP digitado nas câmeras |
| CNAME | `www` | `cname.vercel-dns.com` | opcional; redireciona para o apex |

Depois: em Vercel → replayja → Domains → **Refresh** (ou `vercel domains verify replayja.com.br`). O Resend vai pedir mais 3–4 registros (MX/TXT SPF/DKIM) quando o domínio for adicionado lá — ver abaixo.

**Resend:** a conta atual está no plano Free e **atingiu o limite de domínios** (mail.sentinelacam.com, sentinelacam.com, apruma.app). Para `replayja.com.br` é preciso uma destas: (a) Pro US$ 20/mês; (b) remover um domínio não usado (ex.: `apruma.app`) — decisão do Gabriel; (c) integração Resend do marketplace da Vercel (conta separada, free). A `RESEND_API_KEY` já está na Vercel (Production), mas sem domínio verificado o envio falha.

## Relay instalado na EC2 (2026-09-12, via SSM Run Command a partir do CloudShell)

- Código: `git clone` do repo público em `/tmp/replayja`, copiado para `/tmp/relay` (o `setup.sh` exige esse caminho) → instalado em `/opt/replayja-relay`. Serviços ativos: `caddy`, `replayja-auth`, `replayja-recserver`, `replayja-clip-worker`; timers `replayja-health`, `replayja-sync-cameras`, `replayja-backup`. `/srv/rec` = LVM sobre o st1 (250 GB). `RETAIN_HOURS=72`.
- `rec.env` vem do **SSM Parameter Store** `/replayja/replayja-relay-1/rec.env` (SecureString, versão 2), lido pela role da instância (`relay-params.tf`). Rotacionar = `put-parameter --overwrite` e repetir o passo de escrita abaixo.
- **Caddy sem DNS**: enquanto `relay-1.replayja.com.br` não existe, o `Caddyfile` instalado usa `:443 { tls internal ... }` (certificado interno). Quando o DNS entrar: restaurar a primeira linha do Caddyfile do repo e `systemctl reload caddy`.
- Relay ↔ API: **200** em `/api/relay/cameras` com a `RELAY_KEY` nova (após `vercel redeploy` — env nova só vale em deploy novo; o primeiro contato deu 401 por isso).

### Pegadinhas que custaram tempo (não repetir)
1. **`aws` do snap na instância**: `aws ssm get-parameter … > arquivo` grava **0 bytes com rc=0**; via **pipe** (`| python3 -c …`) funciona. Sempre ler o parâmetro por pipe.
2. `--value file:///tmp/x` no `put-parameter` do CloudShell gravou o valor errado na v1; usar `--value "$(cat /tmp/x)"`.
3. Repositório do Caddy (cloudsmith) falhou no GPG em arm64; o `caddy` do **repositório do Ubuntu 24.04** resolve — instalar antes do `setup.sh`, que então pula a etapa.
4. Descrição de regra de SG não aceita apóstrofo; `Let's` quebrou o primeiro apply.
5. CloudShell derruba a sessão por inatividade e o Safe Paste pede confirmação em colagem multilinha; comandos longos: escrever script em `/tmp` e mandar por `aws ssm send-command --parameters file://p.json`.

### Comandos úteis (CloudShell)
```bash
# shell na máquina
aws ssm start-session --region sa-east-1 --target i-04bb3a7f14df569ca
# ler rec.env do Parameter Store DENTRO da instância (sempre via pipe)
aws ssm get-parameter --region sa-east-1 --with-decryption --name /replayja/replayja-relay-1/rec.env --output json | python3 -c "import json,sys; open('/etc/replayja/rec.env','w').write(json.load(sys.stdin)['Parameter']['Value'])"
```


---

## Variáveis do E2E em produção (2026-09-12)

Configuradas na Vercel, escopo **Production**, nesta task:

| Variável | Valor | Para quê |
|---|---|---|
| `OTP_BYPASS_EMAILS` | `teste1@replayja.com.br,teste2@replayja.com.br` | os **únicos** e-mails para os quais o código fixo vale em produção |
| `OTP_TEST_CODE` | 6 dígitos, repassado fora do repositório | o código fixo de login enquanto o Resend não entrega |
| `RELAY_NODE_ID` | `relay-1` | reafirmado explicitamente: é o id que o bootstrap de `lib/relay-auth.ts` devolve quando nenhuma linha de `relay_node` bate com a chave, e precisa ser o mesmo id que `pnpm seed:piloto` grava |

**Desligar o bypass é apagar as duas primeiras.** Não há código a mudar, e
`lib/otp.ts` volta sozinho ao comportamento fechado. Faça isso assim que
`replayja.com.br` estiver verificado no Resend.

### ⚠️ `vercel env pull` não devolve variável "Sensitive"

A CLI grava a string literal `[SENSITIVE]` no lugar do valor. Duas consequências
que custaram tempo e que vão custar de novo se não estiverem escritas:

1. **O arquivo puxado não serve para `pnpm build` local.** O Next carrega
   `.env.production.local` sozinho, e `metadataBase: new URL("[SENSITIVE]")`
   derruba o build com `Invalid URL` — um erro que não tem nada a ver com o que
   você estava mexendo. Puxe para um nome que o Next ignore:

   ```bash
   cd web && vercel env pull .env.piloto --environment=production
   pnpm seed:piloto --env=.env.piloto --emails=…
   ```

2. **O seed recusa qualquer valor que comece com `[SENSITIVE`.** Gravar isso
   como `relay_node.key_hash` faria o relay tomar 401 sem ninguém entender por
   quê. Passe o que for crítico por argumento (`--emails=`, `--relay-key-hash=`).

### Estado do `relay_node` depois do seed

A linha `relay-1` foi criada **sem o hash da chave** (a `RELAY_KEY` é Sensitive e
não pôde ser lida). Isso **não** quebra nada: `lib/relay-auth.ts` cai no
bootstrap por env e devolve `RELAY_NODE_ID` — que é `relay-1`, a mesma linha.
Confirmado em produção: o relay está reportando (`/api/health` →
`relay.online: true`).

Para deixar no caminho normal, quando a `RELAY_KEY` estiver em mãos:

```bash
cd web
pnpm seed:piloto --env=.env.piloto --emails=… \
  --relay-key-hash=$(node -e "console.log(require('crypto').createHash('sha256').update('<RELAY_KEY>').digest('hex'))")
```
