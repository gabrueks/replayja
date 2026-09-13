# Replay já 2.0 — Registro de decisões (PM)

> Fechamento da Fase 0 em 2026-09-12. Fonte de verdade para o que já está decidido, o que o PM propõe e o que só o Gabriel fecha. Backlog em `PLANO.md`.

## 1. Decididas (não reabrir sem motivo novo)

| # | Decisão | Quem | Onde está detalhado |
|---|---|---|---|
| D-01 | **Sem PC na arena.** Câmera faz push RTMP para relay nosso na AWS (fork enxuto do relay v2 do Sentinela). Botão = webhook HTTPS. PC de borda é plano B **por arena** (uplink ruim / IA local). ⚠️ **Parcialmente substituída por D-15 (2026-09-13)**: entra uma **caixinha** barata na LAN da arena (não é PC de borda, não grava vídeo) | Gabriel | `adr/0001` §1, `hardware/spec-captura.md`, §10 abaixo |
| D-02 | Relay em **máquina separada** da do Sentinela (produção com clientes pagantes) | PM | `adr/0001` §3 |
| D-13 | **Stack reaproveita o Sentinela**: Vercel e Neon já pagos, Resend (mesma conta, domínio `replayja.com.br`), OTP em cookie HMAC sem tabela, Google por OIDC manual (não Auth.js), `pg` puro (não Drizzle), autorização na API (sem RLS), erros em tabela `app_error` (sem Sentry). Piloto enxuto: t4g.medium em modo de crédito `standard`, 3 dias de sessão, ≈ R$ 329/mês | Gabriel + ADR rev. 3 | `adr/0001` §4, §7, §9 |
| D-03 | Marca d'água **na nuvem**, no worker da própria VM do relay; opcional por parceiro; sem logo do parceiro aplica a do Replay já | PM (conflito hardware×ADR resolvido pela D-01) | `adr/0001` §4 |
| D-04 | Login **OTP por e-mail + Google**, sem senha; busca e compartilhamento exigem login; página do parceiro é pública | PRD + design | `design/README.md`, `api/README.md` |
| D-05 | **Visibilidade do clipe**: qualquer usuário logado que informe arena + janela ≤ 6 h vê os clipes. Grupo organiza, não restringe. Sessão completa (12 h) só admin da arena | ADR/API | `api/README.md` §autorização, `legal/analise-lgpd.md` |
| D-06 | Base legal: **legítimo interesse** em **controladoria conjunta** Replay já + arena. Nunca consentimento | Jurídico | `legal/analise-lgpd.md` §4–5 |
| D-07 | Modelo comercial: **SaaS mensal sem entrada e sem fidelidade** (reavaliar comodato na 5ª arena ou CAPEX imobilizado > R$ 60 mil) | GTM | `gtm/proposta-piloto.md` rev. 2 |
| D-08 | **Spike U** (medir uplink da arena por 48 h) acontece **antes** de assinar e tem veto | Plano técnico + GTM | `plano-tecnico.md`, `hardware/spec-captura.md` §8.3 |
| D-09 | Quadra é filtro de busca no piloto; grupo aberto por link (aprovação do dono na Fase 3) | PM | `PLANO.md` decisões 7–8 |
| D-10 | Câmera do kit: **Intelbras VIP 3230 B SL G3** (push RTMP nativo, 1080p30, obturador manual, GOP ajustável, PoE, microSD). Mibo só para prova de conceito. ⚠️ **Substituída por D-14 (2026-09-13)**: a câmera passa a depender do tipo de estrutura da arena (Wi-Fi × cabeada); a 3230 continua sendo a da arena **cabeada** | Hardware | `hardware/pesquisa-cameras.md`, §10 abaixo |
| D-11 | Gatilho principal do piloto: **botão virtual no celular**; físico: Sonoff Zigbee + ZBBridge-Pro (Tasmota, HTTPS) | Hardware | `hardware/pesquisa-botao.md` |
| D-12 | Parâmetros de captura: 1080p30 a 3 Mbps, GOP 1–2 s, IR desligado, corte [ts−24 s, ts+1 s] ajustado a keyframe; "estender lance" ±8 s | ADR + spec | `hardware/spec-captura.md` |
| D-14 | **Câmera por tipo de estrutura da arena** (2026-09-13): arena **com Wi-Fi** (sem cabo até o poste) → **Intelbras VIPW 1230 B** + 1 AP outdoor por arena; arena **cabeada** → **VIP 3230 B SL G3** a **R$ 634** (ML, loja oficial Teledatica) | Gabriel | §10 abaixo, `hardware/pesquisa-cameras-wifi.md`, `hardware/bom-e-custos.md` §1–§2 |
| D-15 | **O lance chega mesmo com a arena offline, sem recuperação manual** (2026-09-13): **Opção A** — microSD em cada câmera + **caixinha na LAN** que recebe o botão localmente, detecta janelas sem vídeo e baixa sozinha o trecho do SD, subindo quando a internet volta. **Condicionada a teste de bancada** | Gabriel | `adr/0002-lance-garantido-offline.md` (em redação), §10 abaixo |
| D-16 | **microSD volta a ser obrigatório** (2026-09-13), mas **cartão de vigilância de 64 GB**, não o 128 GB a R$ 256 | Gabriel + PM | §10 abaixo, `hardware/bom-e-custos.md` §1–§2 |
| D-17 | **DPS PoE (ETH-SP-G2) sai do kit Wi-Fi** (2026-09-13). No kit **cabeado** fica "recomendado — **decisão pendente do Gabriel**" | Gabriel | §10 abaixo, `hardware/bom-e-custos.md` §2 |

## 2. Propostas do PM — confirmar ou trocar

| # | Proposta | Alternativa | Por quê |
|---|---|---|---|
| P-01 | **Retenção de clipes: 90 dias.** Sessão completa: ~~7 dias~~ 3 dias (§9, 2026-09-13) | 30 dias (ADR/API/proposta) | Página do grupo precisa de histórico; política de privacidade já foi escrita com 90. **Conflito aberto entre docs; publicar prazo que o sistema não cumpre viola a LGPD** |
| P-02 | ~~Bucket R2 `eu`~~ **superada por G-04**: S3 São Paulo + CloudFront | — | — |
| P-03 | **Thumbnails borradas antes do login** | thumbnails nítidas públicas | Única superfície com imagem de pessoa sem login; o design já mostra grade borrada com contador |
| P-04 | **Fork enxuto do relay2 dentro do repo `replay/relay/`** (sem Tuya, detector, transcoder) | evoluir o Sentinela para multi-produto | Não arriscar a produção do Sentinela; o código útil (record.sh RTMP, rec-server, auth-sidecar, Caddy) é pequeno |
| P-05 | **Relay em EC2** (t4g.medium no piloto enxuto; c7g.large quando a 6ª câmera entrar ou o crédito de CPU não recuperar à noite), não Lightsail | Lightsail | Lightsail cobra ENTRADA na franquia e SP tem metade dela → ~US$ 370/mês de excedente. Confirmar com o Support da AWS |
| P-06 | **Piloto em 2 arenas**, não 1 | 1 arena | Separa "problema do produto" de "problema daquela arena". (No perfil enxuto a 2ª arena **não** economiza nuvem; vale pelo aprendizado, não pelo custo) |
| P-07 | Preços rev. 3 (4 quadras): piloto R$ 690, fundador R$ 1.490, lista R$ 1.890 com **piso interno R$ 1.740** (40% de margem a 6 arenas); 2 quadras: R$ 490 / 950 / 1.190 (piso R$ 1.110). Piloto já se paga (+R$ 201/mês) | voltar a R$ 1.390 | Custo de servir 4 quadras = R$ 1.041/mês e **não dilui com escala** (curva R$ 329 → 444 → 478/arena). A R$ 1.390 a margem seria 25%. **Risco: R$ 1.890 encosta no teto da faixa inferida e não há para onde recuar** → G-08 é urgente |
| P-09 | ~~Não prometer 7 dias de sessão completa por escrito~~ **Fechada em 2026-09-13: sessão completa em 3 dias** (§9). Original: não prometer 7 dias a nenhuma arena antes de decidir a retenção; 7 → 3 dias vale −R$ 116/arena/mês e é a maior alavanca de margem que resta | prometer 7 | Curva de custo plana: a margem vem de guardar menos vídeo, não de vender mais arenas |
| P-08 | Patrocínio no vídeo fora do piloto, mas reservar 2º slot de marca no modelo de dados | — | É a monetização padrão dos concorrentes; não custa reservar |

## 3. Só o Gabriel fecha (bloqueiam a próxima leva)

| # | Decisão | Bloqueia |
|---|---|---|
| G-01 | ~~Confirmar stack~~ **Fechado em 2026-09-12**: Next.js na Vercel (conta já paga), **Neon** (já pago) em vez de Supabase, auth portada do Sentinela (OTP via Resend) + Google, **sem Sentry**, R2 para clipes, relay em EC2. ADR em rev. 3 | B1 scaffold, C1 design system |
| G-02 | ~~fork vs evoluir~~ **Fechado em 2026-09-12: fork enxuto** do relay2 em `replay/relay/` | A1 (em execução) |
| G-03 | ~~retenção~~ **Fechado: clipes 90 dias, sessão completa 3 dias** (era 7; reduzida em 2026-09-13, §9) | alinhamento dos docs em execução |
| G-04 | ~~jurisdição~~ **Fechado: "só Brasil"** — Neon em `aws-sa-east-1` (confirmado); clipes em **S3 `sa-east-1` + CloudFront Price Class All** (upload do relay grátis na mesma região; piloto ≈ US$ 9,5/mês). Plano B de custo: OCI São Paulo a partir da 6ª arena; plano B jurídico: Magalu (operador nacional). Cloudflare CDN na frente do relay **vedado por contrato**. Ressalva registrada: UE com adequação da ANPD seria juridicamente mais simples que EUA sem CPC; Gabriel decidiu Brasil sabendo disso | criação do bucket/distribuição (junto com a infra do relay) |
| G-05 | ~~arena~~ **Fechado: piloto na arena "Vasco"** (a detalhar: endereço, nº de quadras, esporte principal, contato; Spike U de 48 h antes de assinar) | D1 assinatura, calibração de câmera |
| G-06 | ~~kit de bancada~~ **Aprovado.** Lista de compra em `hardware/kit-bancada.md` (≈ R$ 1.560). Compra é do Gabriel | A1–A4 |
| G-07 | ~~DNS~~ **Feito em 2026-09-12** (Hostinger): TXT `_vercel`, A `@`→216.150.1.1, A `relay-1`/`stream`→15.229.94.105. Domínio verificado no projeto Vercel; **https://replayja.com.br no ar**. ~~Resend~~ ✅ plano Pro, domínio verificado em 2026-09-13, OTP real entregue. Falta só `cdn.replayja.com.br` (ACM, cosmético) | — |
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
- ~~Sessão completa 7 vs 14~~ padronizado em 7 na rev. 3; reduzido para 3 em 2026-09-13 (§9).
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

## 7. Leva 2 (Opus) — lançada em 2026-09-12 ~22:30 UTC
1. **Direção visual v2** (canvas no Claude Design): sair da "cara de IA auto-gerada" para app de consumo (referências Zé Delivery/iFood): hierarquia forte, cards grandes com foto, barra inferior, CTA fixo, microcopy com personalidade. **Sem código até o Gabriel aprovar o canvas.** Canvas publicado: https://claude.ai/code/artifact/423ba6ef-08fa-4f1b-9018-6ecabed99667 ("Luz de quadra": app claro, player escuro, laranja em dois tons, barra inferior, foto como herói). **Aprovada pelo Gabriel e implementada** (commits `b90ea57`…`020e474`; `design/v2/` versionado). Divergências do canvas registradas em `web/docs/design-system.md` §12.
2. **Painel do parceiro completo** (`app/painel/**`): KPIs reais, câmeras com dados de configuração e rotação de chave, botões com token único, quadras, marca/página (upload de logo e marca d'água PNG para `branding/<partnerId>/watermark.png`), equipe, privacidade (fila de remoção + horários bloqueados de escolinha). ✅ em produção (migração 0011; 272 testes).
3. **Marca d'água ponta a ponta** — ✅ **código entregue em 2026-09-12.** O PNG do Replay já e a assinatura discreta estão versionados em `relay/watermark-replayja*.png` (gerados por `relay/tools/gerar-marca-dagua.py`); o claim entrega `watermark` **nunca nula** (URL assinada de leitura do bucket privado, ou `kind: default` com o PNG local do relay); o worker compõe as duas camadas no mesmo passe de re-encode; o confirm grava `watermark_applied`, `watermark_version` e `watermark_kind` (`partner` | `default` | `default-fallback`). Migração `0012-marca-dagua.sql`. Relay: **127 testes verdes** (eram 108). ⏳ **Falta o passo humano**: o relay NÃO se atualiza sozinho — `sh relay/deploy-ssm.sh` a partir do CloudShell (`i-04bb3a7f14df569ca`, `sa-east-1`), e depois apertar o botão da quadra 1 e conferir `watermark_applied = true` no banco **e a marca visível no MP4**.
Fila seguinte: grupos v2 (editar/sair/revogar convite, resumo semanal por e-mail), onboarding e PWA polido (depende da direção visual), "estender lance" ±8 s, Google OAuth (credenciais), desligar bypass quando o Resend verificar.

### Pendências operacionais após a leva 2
- ~~Branches Neon de teste~~ apagados com aprovação do Gabriel.
- Largura da marca do piloto voltou a **18%** (a 0011 tinha rebaixado para 12% no backfill).
- ~~grade borrada com marca de fixture; contador escondendo clipe em processamento~~ corrigidos no visual v2. Pendentes: expurgo sem as camadas de invalidação de URL assinada/relay; bloqueio de horário não atravessa meia-noite.
- Câmera simulada `replayja-camsim` continua ligada na EC2 até o kit de bancada. **Já existe o desligamento por comando**: `sh relay/tools/camsim-ssm.sh stop` do CloudShell (ou `make camsim-stop`), com `status` e `start`. Ela **ocupa a porta RTMP** da câmera real (`ffmpeg -listen 1` atende uma conexão) e queima crédito de CPU da `t4g.medium` — desligar é o §7 do runbook da bancada, **antes** de apontar a câmera.

### Pendências da bancada (leva 3) — `docs/hardware/bancada-runbook.md`

O roteiro está escrito e é executável por uma pessoa sozinha. O que ele **vai
resolver** e que hoje é incerteza aberta:

| Pendência | Onde é decidida | Status |
|---|---|---|
| **Reconexão da câmera após queda de link** — desconhecida, e é o maior risco do desenho sem PC | **T5** (bloqueante: 2 min e 15 min; conserto por reboot agendado; se falhar, **D-10 reabre**) | ☐ |
| Versão de firmware a congelar no kit (`Firmware_VIP_3230_SL_G3` ≥ 17-06-24) | §4 do runbook + tabela do §10 | ☐ |
| GOP de 30 (1 s) é aceito no push? | §5.1 do runbook | ☐ |
| `RTMP Virtual Áudio` funciona com o nosso `ffmpeg -f flv` | §8 do runbook | ☐ |
| Formato do arquivo do microSD (`.dav`?) abre no ffmpeg | **T7b** | ☐ |
| **Fuso da câmera: UTC (spec §2.4 / D10) × −03:00** — divergência registrada; recomendação é **UTC**, e a escolha vai na tabela de resultados | §5.4 do runbook | ☐ |
| Atributo Zigbee real do **SNZB-01P** no Zigbee2Tasmota — `#Click` **não existe**; fontes divergem entre `0006!01`, `0006!02` e `0006!FD` e todas são do SNZB-01 (geração anterior) | `tasmota-botao.md` §4 (ler no console, não copiar regra pronta) | ☐ |
| `WebQuery … POST` sem corpo é confiável? (mandamos `{}` por precaução) | `tasmota-botao.md` §5.1 e §10 | ☐ |
| Homologação **Anatel** do ZBBridge-P e do SNZB-01P | bloqueante para instalar com nota fiscal, não para a bancada | ☐ |
| Latência real do botão físico (20 toques) e alcance útil | **T6** | ☐ |

**Critério de "kit aprovado para a arena"**: §11 do runbook. Resumo — T5 é
bloqueante; T6 falhando não impede o piloto (o gatilho principal sempre foi o
botão virtual, D-11); T4 só passando com bitrate reduzido dá poder de veto real
ao Spike U (D-08).

## 8. Leva 3 (Opus) — lançada em 2026-09-13
1. **Grupos v2**: ✅ em produção (editar, sair/remover, convite com 14 dias/revogar/reenviar, resumo semanal por e-mail com opt-in e descadastro em 1 clique, seletor de rodada, melhor da rodada, `.ics`). Migrações 0013/0014. **`CRON_SECRET` criado na Vercel** (Production+Preview) e redeploy feito — cron `0 11 * * *` UTC (8h BRT). 325 testes.
2. **Painel no visual v2**: ✅ em produção (Lighthouse desktop 100/100/100 em 3 telas; capturas em `web/docs/capturas/v2/painel-*`; pendências PV-1..PV-6 no README).
3. **Bancada**: ✅ entregue. `docs/hardware/bancada-runbook.md` (desembalar → primeiro acesso → firmware → configuração da VIP 3230 → onde pegar servidor/chave no painel → desligar a simulada → T1–T7 com **T5 bloqueante** → tabela de resultados → critério de aprovação), `relay/tools/camsim.sh` + `relay/tools/camsim-ssm.sh` (`start|stop|status` da câmera simulada, via SSM do CloudShell; `make camsim-*`; `relay/README.md` §"Câmera simulada"), `docs/hardware/tasmota-botao.md` (flash do ZBBridge-P, pareamento, regra `WebQuery`, teste sem apertar, bateria, 2 quadras). ⏳ **Falta o passo humano**: executar com o kit na mão e preencher a tabela do §10.
Fora desta leva: Google login (precisa de credenciais OAuth criadas pelo Gabriel); desligar o bypass quando o piloto abrir para atletas.

## 9. Decisões do Gabriel em 2026-09-13 (pós-QA) e leva 4
- **Retenção de clipes: 90 dias** confirmada. O expurgo real (consultas filtrando `expires_at`, cron diário apagando S3 + invalidação + `deleted_at`) entra na leva 4.
- **Bypass de login** (`OTP_BYPASS_EMAILS`) **mantido por enquanto**, mesmo com o domínio verificado; desligar ao abrir para atletas.
- **E-mail de membros mascarado**: nome + inicial para membros; e-mail completo só para o dono do grupo.
- **Clipe vencido responde 410** (`clip-expired`).
- Seis bugs de UX reportados pelo Gabriel corrigidos e em produção (`09369a3`); QA fechou 9 de 15 achados (redirect aberto, seed dando admin a e-mails de bypass, rate limit de convite, `objectKey` arbitrário no confirm, slug reservado) — relatório em `web/docs/qa/relatorio-2026-09-13.md`; revisão de UX com 40 achados em `web/docs/ux/revisao-2026-09-13.md`.
- **Sessão completa no disco do relay: 3 dias** (era 7). O disco de mídia (`gb_midia` = 250 GB, `relay/infra/variables.tf`) foi dimensionado para 4 câmeras × 3 dias a 3 Mbps × 12 h/dia (~195 GB); o padrão de 7 dias no código e no banco (~454 GB) faria a poda por disco (`DISK_HIGH` 85%) cortar a sessão antes do prazo publicado. É o degrau enxuto da ADR §9 e fecha a P-09. Migração `0017-sessao-em-3-dias` (DEFAULT 3 em `partner.session_retention_days` e `camera.retention_days`; linhas em 7 → 3), `SESSION_RETENTION_DIAS_PADRAO = 3`, seed e teste de migração; Política, Termos, placa, anexo do contrato, RIPD e fluxo de remoção alinhados. `RETAIN_HOURS` do relay já era 72 por padrão. **Retenção de clipes (90 dias) não muda.** ⏳ migração ainda não aplicada no Neon; conferir `RETAIN_HOURS` no `rec.env` da EC2.

**Leva 4 (Opus), lançada 2026-09-13:**
1. UX: 4 P0 (CTA fixo que reserva espaço, campos de data/hora pt-BR 24 h, 404/erro/carregando com marca, locale), 7 padrões (`lib/datas`, `lib/copy`, `lib/plural`, `CampoDeData/Horario`, `RodapeFixo`), P1 do atleta (aba Grupos com criar, aba Sobre com contato, UTC→fuso, fixtures), clareza de papéis (dono da pelada × administra a arena), membros mascarados na tela. ✅ 33/40 achados fechados, 4 P0 fechados, 523 testes (commit `ad4b718`).
2. Backend: expurgo de 90 dias (consultas + cron `purge-clips` + takedown pelo mesmo caminho), 410, `emailMascarado` nas consultas, oráculo de enumeração, câmera nunca conectada = `down`, sitemap. ✅ (cron `purge-clips` 04:00 BRT; 471 testes; commit `76a9eb3`).

## 10. Decisões de hardware do Gabriel em 2026-09-13

> Quatro decisões tomadas depois da pesquisa de câmeras Wi-Fi (`hardware/pesquisa-cameras-wifi.md`). Refletidas em `hardware/bom-e-custos.md` (revisão de 13/09), `hardware/kit-bancada.md` e `hardware/spec-captura.md` §7.5.

### D-14 — Câmera por tipo de estrutura da arena

**Decisão.** Deixa de existir "a câmera do kit". Passa a existir **um kit por tipo de estrutura**:

| Estrutura da arena | Câmera | Enlace |
|---|---|---|
| **Com Wi-Fi** (sem cabo até o poste) | **Intelbras VIPW 1230 B** — R$ 289,86 PIX [F] | Wi-Fi 2,4 GHz + **1 AP outdoor por arena** (TP-Link EAP225-Outdoor ou equivalente) |
| **Cabeada** | **Intelbras VIP 3230 B SL G3** (Starlight) — **R$ 634** no Mercado Livre, loja oficial **Teledatica**, frete grátis, **preço informado pelo Gabriel** | PoE, cabo CAT6 outdoor CCU |

**Motivo.** Puxar 60–90 m de cabo até o poste é a parte cara, lenta e mais sujeita a obra da instalação — e boa parte das arenas não tem infraestrutura para isso. A VIPW 1230 B é a **única câmera Wi-Fi com Anatel, nota fiscal e reposição no Brasil** que fecha push RTMP nativo + 1080p30 H.264 + obturador manual + GOP ajustável no papel (`pesquisa-cameras-wifi.md` §3.1). Custa **menos da metade** da versão cabeada. E o preço de R$ 634 da 3230 derruba a premissa de R$ 893,75 que estava no BOM: a arena cabeada ficou ~R$ 260/quadra mais barata sem mudar nada.

**Alternativas descartadas.** (a) **Kit único cabeado para todas as arenas** — descartada: exclui comercialmente a arena sem infraestrutura de cabo e mantém a instalação cara. (b) **Kit único Wi-Fi** — descartada: o sensor 1/3" da VIPW não é Starlight e **vai decepcionar primeiro em pelada noturna mal iluminada**, que é quando a quadra fatura mais; onde há cabo, a 3230 continua melhor por R$ 344 a mais. (c) **VIP 3230 + CPE 5 GHz no poste** (`pesquisa-cameras-wifi.md` §5.2) — não descartada, **fica como saída para a arena cuja medição de rádio reprovar** (§7.2 da pesquisa: RSSI pior que −67 dBm ou mais de 2 câmeras por canal).

**Ressalva que fica aberta.** A VIPW 1230 B é **2,4 GHz com antena de 2,35 dBi** e teto de 20 Mbps. O rádio é o elo mais fraco do sistema, e a medição no alto do poste (Spike U, etapa de rádio) tem **poder de veto por arena**. No kit Wi-Fi o bitrate padrão é **2 Mbps**; 3 Mbps só com a medição aprovada.

### D-15 — O lance tem que chegar mesmo com a arena offline, sem recuperação manual

**Decisão.** **Opção A**: **microSD em cada câmera + uma caixinha barata na LAN da arena**, que (i) recebe o botão localmente, (ii) detecta janelas sem vídeo e (iii) **baixa sozinha o trecho do SD da câmera**, subindo quando a internet volta. **Condicionada a teste de bancada.** **Fallback: Opção B** — mini PC N100 gravando local, que é o plano B por arena já previsto na D-01/ADR 0001.

**Desenho detalhado:** `docs/adr/0002-lance-garantido-offline.md` (em redação nesta mesma data). Preço da caixinha entra no BOM como **R$ 300–500 [E]** até a ADR fechar o modelo.

**Motivo.** O plano anterior (`spec-captura.md` §7.5) era **recuperação manual**: alguém na arena abre a interface da câmera pelo Wi-Fi, baixa o arquivo e sobe pelo `/admin`. Isso depende de boa vontade, é lento e na prática significa que **o lance perdido fica perdido**. Com o Wi-Fi da D-14 o problema piora: passa a haver **dois enlaces instáveis em série** (rádio + uplink), e a medição do Sentinela já registra **68 buracos > 10 s em 24 h** só no uplink. Sem a busca automática, "o lance está no cartão" é promessa que o produto não cumpre.

**Alternativas descartadas.** (a) **Recuperação manual no piloto** — substituída; era o plano de `spec-captura.md` §7.5. (b) **ANR** (a câmera reenvia sozinha o trecho) — tecnicamente impossível aqui: só funciona câmera ↔ NVR do mesmo fabricante em protocolo proprietário (`spec-captura.md` §7.3). (c) **SFTP "Emergência (cartão SD)"** — não resolve: **não há reenvio do trecho perdido** e dobra o tráfego de subida, que é o recurso escasso (`spec-captura.md` §7.3.1). (d) **Opção B (mini PC N100) já de saída** — descartada como primeira escolha por custo e por reintroduzir um computador com SO, atualização e suporte remoto em cada arena; **fica como fallback** se a bancada reprovar a caixinha.

**Consequência.** Um **ponto único de falha por arena** entra no desenho (a caixinha cai → cai a recuperação de todas as quadras, embora o push RTMP continue). A ADR 0002 é quem trata disso.

### D-16 — microSD obrigatório, mas cartão de vigilância de 64 GB

**Decisão.** O microSD **volta a ser obrigatório em todas as câmeras** (era "sem microSD" na pesquisa de câmeras Wi-Fi de hoje de manhã). Não precisa ser o **Samsung PRO Endurance 128 GB a R$ 256,44**: basta um cartão de **alta resistência (linha de vigilância)** com **64 GB**.

**Conta que define o tamanho** — retenção de **3 dias** a **2–3 Mbps × 12 h/dia**:

| Bitrate | Por dia | **3 dias** | Cartão |
|---:|---:|---:|---|
| 2 Mbps | 10,8 GB | **32,4 GB** | 64 GB sobra |
| 3 Mbps | 16,2 GB | **48,6 GB** | 64 GB cabe com ~25 % de folga |
| 3 Mbps **24 h/dia** | 32,4 GB | 97,2 GB | aí sim precisa de 128 GB |

**Escolhido: Intelbras/WD Purple SC QD101 64 GB (32 TBW, Health Monitor) — R$ 174,80 à vista [F]** (HGM Systems). É o cartão que a própria Intelbras homologa para as câmeras VIP/VIPW, e a VIPW 1230 aceita **até 256 GB**.

**Motivo.** O cartão é a **única cópia do lance quando o enlace cai** — sem ele a D-15 não existe. Mas 128 GB a R$ 256 é dimensionamento para 7 dias, prazo que **não é mais o nosso** desde que a sessão completa caiu para 3 dias (§9). Pagar por 4 dias de vídeo que ninguém vai buscar é R$ 82/quadra de desperdício.

**Alternativas descartadas.** (a) **Sem microSD** (decisão da manhã de 13/09, em `pesquisa-cameras-wifi.md` §1, critério C10) — **substituída por esta**: sem cartão, todo buraco de Wi-Fi vira lance perdido de vez. (b) **Samsung PRO Endurance 128 GB a R$ 256,44** — superdimensionado para 3 dias. (c) **Cartão comum de consumo** — não: gravação contínua 24/7 queima cartão sem TBW de vigilância, e a falha é silenciosa.

### D-17 — Protetor de surto (DPS ETH-SP-G2): sai do kit Wi-Fi, fica pendente no cabeado

**Decisão.** No **kit Wi-Fi**, o DPS PoE **sai** (decisão do Gabriel). No **kit cabeado**, fica como **"recomendado — decisão pendente do Gabriel"**.

**Motivo.** No arranjo Wi-Fi **não existe cabo de rede saindo do poste**: não há a linha metálica longa que o DPS de Ethernet protege. O que sobra no poste é a alimentação 12 V, cujo risco é outro (e é tratado com fonte em caixa hermética e, se a arena quiser, DPS de rede elétrica no quadro). **No kit cabeado o raciocínio original continua de pé**: 60–90 m de cabo externo até o topo de um poste é exatamente a geometria que pega surto induzido de raio, e é a causa nº 1 de queima em CFTV externo no Brasil — R$ 99 contra uma câmera de R$ 634 mais uma revisita com escada.

**Alternativa descartada.** Tirar o DPS **dos dois kits** — descartada: economiza R$ 99/quadra e transfere para o cliente o risco de perder a câmera no primeiro verão. Fica registrado como **decisão pendente**, não como item removido.

### Sobras da leva 4 (próxima leva)
- Consultas que faltam para 3 P1 da UX: `horariosVizinhosComLance`, contagem pública por janela (contador "hoje" da arena deslogada), `opening_hours` na projeção pública do parceiro.
- Takedown camadas 2/5/6 (revogar URL assinada, apagar segmento no relay, `revalidateTag`); jobs `detect_camera_down`, `detect_coverage_gaps`, `rollup_share_events`, `reconcile_storage` (modelo §8).
- Painel: P2-24/25/26/32 (plural, faixa, ordenação de tabela, `Select`).
- Operação: olhar a 1ª execução do `purge-clips`; alertas por e-mail de câmera fora; backup do índice do relay para S3; `cdn.replayja.com.br` (ACM).
- Produto: UX-5/UX-7 (redesenhos), Google OAuth (credenciais do Gabriel), desligar bypass ao abrir para atletas, kit de bancada.

### Incidente 2026-09-13 — 404 virando 200 (corrigido em `181c512`/`198c58d`)
- **Causa:** o visual v2 acrescentou `loading.tsx` na raiz e em `[arenaSlug]`. Com um boundary de `loading` acima, a resposta é transmitida antes de qualquer `notFound()`, e arena/grupo inexistentes respondiam **200** com a tela de "não encontrada" (crawlers, monitoramento e o QA medem status).
- **Correção:** sem `loading.tsx` na raiz; existência de **arena** decidida em `app/[arenaSlug]/layout.tsx` e de **grupo** em `app/[arenaSlug]/[groupSlug]/layout.tsx` (renderizam fora do boundary); a página da arena e seu esqueleto foram para o route group `app/[arenaSlug]/(arena)/` para o esqueleto não envolver grupo e sessão. URLs inalteradas. Teste `telas-de-excecao` agora garante a ausência do loading da raiz e a presença dos layouts.
- **Regra:** `loading.tsx` só em segmentos cuja existência já foi decidida por um layout acima, nunca na raiz.

