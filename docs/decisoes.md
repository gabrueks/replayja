# Replay já 2.0 — Registro de decisões (PM)

> Fechamento da Fase 0 em 2026-09-12. Fonte de verdade para o que já está decidido, o que o PM propõe e o que só o Gabriel fecha. Backlog em `PLANO.md`.

## 1. Decididas (não reabrir sem motivo novo)

| # | Decisão | Quem | Onde está detalhado |
|---|---|---|---|
| D-01 | **Sem PC na arena.** Câmera faz push RTMP para relay nosso na AWS (fork enxuto do relay v2 do Sentinela). Botão = webhook HTTPS. PC de borda é plano B **por arena** (uplink ruim / IA local) | Gabriel | `adr/0001` §1, `hardware/spec-captura.md` |
| D-02 | Relay em **máquina separada** da do Sentinela (produção com clientes pagantes) | PM | `adr/0001` §3 |
| D-13 | **Stack reaproveita o Sentinela**: Vercel e Neon já pagos, Resend (mesma conta, domínio `replayja.com.br`), OTP em cookie HMAC sem tabela, Google por OIDC manual (não Auth.js), `pg` puro (não Drizzle), autorização na API (sem RLS), erros em tabela `app_error` (sem Sentry). Piloto enxuto: t4g.medium em modo de crédito `standard`, 3 dias de sessão, ≈ R$ 329/mês | Gabriel + ADR rev. 3 | `adr/0001` §4, §7, §9 |
| D-03 | Marca d'água **na nuvem**, no worker da própria VM do relay; opcional por parceiro; sem logo do parceiro aplica a do Replay já | PM (conflito hardware×ADR resolvido pela D-01) | `adr/0001` §4 |
| D-04 | Login **OTP por e-mail + Google**, sem senha; busca e compartilhamento exigem login; página do parceiro é pública | PRD + design | `design/README.md`, `api/README.md` |
| D-05 | **Visibilidade do clipe**: qualquer usuário logado que informe arena + janela ≤ 6 h vê os clipes. Grupo organiza, não restringe. Sessão completa (12 h) só admin da arena | ADR/API | `api/README.md` §autorização, `legal/analise-lgpd.md` |
| D-06 | Base legal: **legítimo interesse** em **controladoria conjunta** Replay já + arena. Nunca consentimento | Jurídico | `legal/analise-lgpd.md` §4–5 |
| D-07 | Modelo comercial: **SaaS mensal sem entrada e sem fidelidade** (reavaliar comodato na 5ª arena ou CAPEX imobilizado > R$ 60 mil) | GTM | `gtm/proposta-piloto.md` rev. 2 |
| D-08 | **Spike U** (medir uplink da arena por 48 h) acontece **antes** de assinar e tem veto | Plano técnico + GTM | `plano-tecnico.md`, `hardware/spec-captura.md` §8.3 |
| D-09 | Quadra é filtro de busca no piloto; grupo aberto por link (aprovação do dono na Fase 3) | PM | `PLANO.md` decisões 7–8 |
| D-10 | Câmera do kit: **Intelbras VIP 3230 B SL G3** (push RTMP nativo, 1080p30, obturador manual, GOP ajustável, PoE, microSD). Mibo só para prova de conceito | Hardware | `hardware/pesquisa-cameras.md` |
| D-11 | Gatilho principal do piloto: **botão virtual no celular**; físico: Sonoff Zigbee + ZBBridge-Pro (Tasmota, HTTPS) | Hardware | `hardware/pesquisa-botao.md` |
| D-12 | Parâmetros de captura: 1080p30 a 3 Mbps, GOP 1–2 s, IR desligado, corte [ts−24 s, ts+1 s] ajustado a keyframe; "estender lance" ±8 s | ADR + spec | `hardware/spec-captura.md` |

## 2. Propostas do PM — confirmar ou trocar

| # | Proposta | Alternativa | Por quê |
|---|---|---|---|
| P-01 | **Retenção de clipes: 90 dias.** Sessão completa: 7 dias | 30 dias (ADR/API/proposta) | Página do grupo precisa de histórico; política de privacidade já foi escrita com 90. **Conflito aberto entre docs; publicar prazo que o sistema não cumpre viola a LGPD** |
| P-02 | ~~Bucket R2 `eu`~~ **superada por G-04**: S3 São Paulo + CloudFront | — | — |
| P-03 | **Thumbnails borradas antes do login** | thumbnails nítidas públicas | Única superfície com imagem de pessoa sem login; o design já mostra grade borrada com contador |
| P-04 | **Fork enxuto do relay2 dentro do repo `replay/relay/`** (sem Tuya, detector, transcoder) | evoluir o Sentinela para multi-produto | Não arriscar a produção do Sentinela; o código útil (record.sh RTMP, rec-server, auth-sidecar, Caddy) é pequeno |
| P-05 | **Relay em EC2** (t4g.medium no piloto enxuto; c7g.large quando a 6ª câmera entrar ou o crédito de CPU não recuperar à noite), não Lightsail | Lightsail | Lightsail cobra ENTRADA na franquia e SP tem metade dela → ~US$ 370/mês de excedente. Confirmar com o Support da AWS |
| P-06 | **Piloto em 2 arenas**, não 1 | 1 arena | Separa "problema do produto" de "problema daquela arena". (No perfil enxuto a 2ª arena **não** economiza nuvem; vale pelo aprendizado, não pelo custo) |
| P-07 | Preços rev. 3 (4 quadras): piloto R$ 690, fundador R$ 1.490, lista R$ 1.890 com **piso interno R$ 1.740** (40% de margem a 6 arenas); 2 quadras: R$ 490 / 950 / 1.190 (piso R$ 1.110). Piloto já se paga (+R$ 201/mês) | voltar a R$ 1.390 | Custo de servir 4 quadras = R$ 1.041/mês e **não dilui com escala** (curva R$ 329 → 444 → 478/arena). A R$ 1.390 a margem seria 25%. **Risco: R$ 1.890 encosta no teto da faixa inferida e não há para onde recuar** → G-08 é urgente |
| P-09 | **Não prometer 7 dias de sessão completa por escrito** a nenhuma arena antes de decidir a retenção; 7 → 3 dias vale −R$ 116/arena/mês e é a maior alavanca de margem que resta | prometer 7 | Curva de custo plana: a margem vem de guardar menos vídeo, não de vender mais arenas |
| P-08 | Patrocínio no vídeo fora do piloto, mas reservar 2º slot de marca no modelo de dados | — | É a monetização padrão dos concorrentes; não custa reservar |

## 3. Só o Gabriel fecha (bloqueiam a próxima leva)

| # | Decisão | Bloqueia |
|---|---|---|
| G-01 | ~~Confirmar stack~~ **Fechado em 2026-09-12**: Next.js na Vercel (conta já paga), **Neon** (já pago) em vez de Supabase, auth portada do Sentinela (OTP via Resend) + Google, **sem Sentry**, R2 para clipes, relay em EC2. ADR em rev. 3 | B1 scaffold, C1 design system |
| G-02 | ~~fork vs evoluir~~ **Fechado em 2026-09-12: fork enxuto** do relay2 em `replay/relay/` | A1 (em execução) |
| G-03 | ~~retenção~~ **Fechado: clipes 90 dias, sessão completa 7 dias** | alinhamento dos docs em execução |
| G-04 | ~~jurisdição~~ **Fechado: "só Brasil"** — Neon em `aws-sa-east-1` (confirmado); clipes em **S3 `sa-east-1` + CloudFront Price Class All** (upload do relay grátis na mesma região; piloto ≈ US$ 9,5/mês). Plano B de custo: OCI São Paulo a partir da 6ª arena; plano B jurídico: Magalu (operador nacional). Cloudflare CDN na frente do relay **vedado por contrato**. Ressalva registrada: UE com adequação da ANPD seria juridicamente mais simples que EUA sem CPC; Gabriel decidiu Brasil sabendo disso | criação do bucket/distribuição (junto com a infra do relay) |
| G-05 | ~~arena~~ **Fechado: piloto na arena "Vasco"** (a detalhar: endereço, nº de quadras, esporte principal, contato; Spike U de 48 h antes de assinar) | D1 assinatura, calibração de câmera |
| G-06 | ~~kit de bancada~~ **Aprovado.** Lista de compra em `hardware/kit-bancada.md` (≈ R$ 1.560). Compra é do Gabriel | A1–A4 |
| G-07 | Domínio `replayja.com.br`: DNS `relay-1.` e `stream.` → 15.229.94.105; domínio no Resend; e-mail transacional (`login@`, `privacidade@`) | TLS do relay, B3, legal |
| G-10 | ~~repo remoto~~ **Feito**: https://github.com/gabrueks/replayja (**público** — contém docs comerciais/jurídicas; se quiser privado, mudar no GitHub e o clone no relay passa a precisar de token), 2 commits, Git conectado ao projeto Vercel, Root Directory = `web`. Push em `main` = deploy de produção | — |
| G-08 | Pedir orçamento por WhatsApp a 3 concorrentes como dono de arena (40 min) — valida a premissa de preço nº 1 | P-07 |
| G-09 | Conferir no Cost Explorer se o relay do Sentinela paga excedente de entrada no Lightsail (US$ 630–855/mês se a regra valer) | não bloqueia o Replay já; é dinheiro do Sentinela |

## 3b. Spikes da semana 1 com dono
- **Spike F**: confirmar se os planos flat do CloudFront (Pro US$ 15/mês, 50 TB) valem para vídeo/Price Class All — vale ~R$ 173/arena/mês a 20 arenas.
- **Spike U**: uplink da arena Vasco por 48 h.
- **T5**: câmera VIP 3230 reconecta sozinha após queda (bancada).
- **DPA/SCC da AWS** assinado na conta (transferência internacional por acesso do exterior).

## 4. Inconsistências entre docs a corrigir na próxima passada
- ~~ADR §9 citava Mibo~~ corrigido na rev. 3.
- ~~Retenção de clipe~~ 90 dias fixado em ADR, modelo, API. Conferir `gtm/proposta-piloto.md`.
- ~~Docs legais~~ atualizados para Neon SP + S3 SP + CloudFront. Resend é agora o único operador com dado pessoal em repouso fora do Brasil (inclui e-mail de terceiros nos convites).
- ~~Sessão completa 7 vs 14~~ padronizado em 7 na rev. 3.
- ~~legal citava Supabase/Sentry~~ corrigido. `gtm/proposta-piloto.md` em rev. 3.
- **Sem RLS = uma camada só de autorização** num produto que expõe vídeo de pessoas. Registrado como dívida de segurança assumida (ADR §4.5, RIPD §6.4). Compensação: checks de autorização em `db/queries/` + testes.
- **Resend free é 100 e-mails/dia compartilhados com o Sentinela**; o piloto sozinho deve usar 60–80/dia. Monitorar; subir para o plano pago (US$ 20) no primeiro estouro.
- **Sem economia de escala após o primeiro relay cheio**: custo estaciona em ~R$ 450/arena/mês (R$ 362 com 3 dias de retenção). Isso precisa entrar na conversa de preço.
- Proposta comercial rev. 1 dizia "arena controladora, nós operadores"; rev. 2 já corrigiu para controladoria conjunta. Conferir se sobrou menção no anexo do contrato.

## 5. Bloqueantes antes de gravar a primeira partida (checklist legal)
1. Placa em cada quadra (entrada + área de jogo), fotografada.
2. Política de Privacidade e Termos publicados com data de vigência.
3. Canal de remoção público, sem login, testado ponta a ponta: URL assinada anterior para de funcionar, DELETE no S3 sem versionamento (senão só cria delete marker) e invalidação do CloudFront confirmada nas bordas.
4. Contrato da arena assinado com anexo LGPD.
5. Encarregado indicado; `privacidade@replayja.com.br` monitorado.
6. DPA da AWS confirmado no AWS Artifact (com ou sem cláusulas-padrão da Res. 19/2024) e PDF arquivado; decisão escrita sobre thumbnails.
7. Horários de escolinha mapeados e gravação bloqueada neles.
8. Spike U aprovado na arena.

## 6. Leva de código (Opus) — lançada em 2026-09-12 — **E2E em produção validado às 21:05 UTC**
1. **A1** — ✅ `relay/` entregue (108 testes unitários; e2e escrito, não executado — sem WSL/Docker aqui). Infra Terraform pronta, sem `apply`.
2. **B1 + B3 + base de B2** — ✅ `web/` entregue e verificado (80 testes, build ok). Projeto Vercel `replayja` criado no time do Sentinela (18 envs, sem deploy). Neon **não** criado: falta CLI/API key → `docs/setup-contas.md` §3.
3. **ADR** — armazenamento de clipes só no Brasil + retenção 90 fixada. ⏳
4. **C1** — design system em código. ⏳
5. **Estado do E2E (2026-09-12 21:05 UTC)**: login por bypass → botão (webhook) → relay corta/encoda → S3 → thumbnail pública e MP4 assinado no CloudFront → player. Tudo 200. Câmera é simulada (`replayja-camsim` na EC2): **parar** (`systemctl stop replayja-camsim`) quando a câmera real entrar, senão consome crédito de CPU. Código de bypass e webhooks dos botões ficaram **fora do repositório** (repo público) — estão com o Gabriel.
5b. **Pendências após esta leva**: ~~`terraform apply`~~ ✅ feito via CloudShell (EIP 15.229.94.105, `i-04bb3a7f14df569ca`, SSM online; detalhes em `docs/setup-contas.md`); ~~app~~ ✅ no ar em https://replayja.vercel.app; ~~repositório Git remoto~~ ✅; ~~bucket S3 + CloudFront~~ ✅; ~~segredos do relay~~ ✅ (Parameter Store); ~~instalar relay~~ ✅; **PNG da marca d'água do Replay já** (`relay/watermark.png`) — sem ele clipe sai sem marca; **DNS** (segurado pelo Gabriel); **Resend** (limite de domínios do plano Free — decisão pendente); **repo público** (contém docs comerciais/jurídicas); segredos `RELAY_KEY`/`RELAY_TOKEN_SECRET` iguais no relay e na Vercel; DNS `relay-1.` e `stream.replayja.com.br`; PNG da marca d'água do Replay já; `RETAIN_HOURS` 72 vs 168; rodar `make test-e2e` na EC2 antes de apontar câmera; chaves Resend/Google; compra do kit de bancada; detalhes da arena Vasco. **Do app**: ~~Neon~~ ✅ criado via integração da Vercel em `aws-sa-east-1` (projeto `rough-bread-27863452`), migrações aplicadas, compute com escala a zero; banco do Sentinela desconectado do replayja. Falta na Vercel: **Root Directory = `web`** e conectar o Git (precisa de repo remoto — ainda sem commit); ligar Spend Management no time (o uso entra na fatura do Sentinela); DNS do domínio; verificar domínio no Resend. **Nesta máquina Windows o WSL está desabilitado** (serviço) e o Docker não sobe — habilitar o WSL é configuração de sistema sua, se quiser testar o relay localmente.
6. **Divergências de contrato a fechar** (registradas em `relay/README.md`): claim `GET /relay/clip-jobs` (YAML) vs `POST .../claim` (briefing) — relay segue o YAML; bitrate do clipe 4 Mbps (ADR/spec) vs 6000 no `encodeProfile` do YAML — padronizar em **4 Mbps** no YAML e no app.
