# Replay já 2.0 — Plano de execução (PM)

> Atualizado em 2026-09-12 (Fase 1: **pipeline ponta a ponta validado em produção em 2026-09-12; fluxo arenas→lances, sessão e grupos no ar** — botão → relay → S3/CloudFront → player; câmera ainda simulada; pendências em `decisoes.md` §6). Meta: **fechar e operar o primeiro piloto (1 arena, 2–4 quadras) em ~8 semanas.**
> Execução por subagents Claude (modelo **Opus**), um por task; este arquivo é a fonte de verdade do backlog.

Legenda de status: `⏳ rodando` · `☐ a fazer` · `✅ feito` · `🔒 bloqueado por`

## Princípios de priorização
1. **Piloto primeiro**: tudo que não é necessário para uma arena real usar o produto fica para a Fase 2+.
2. **Diferenciais baratos entram no piloto**: login sem fricção (OTP + Google), página do parceiro como landing page, marca d'água da arena, página do grupo. São o argumento de venda.
3. **Gravação da sessão completa entra no piloto só como captura** (gravar + guardar). Nenhuma feature de pós-processamento antes de termos dados reais.
4. Cada task tem um artefato verificável (doc, PR, deploy, vídeo de demo).

---

## Fase 0 — Fundação (semanas 1–2)

| # | Task | Entregável | Status | Depende de |
|---|------|-----------|--------|-----------|
| 0.1 | Espelhar PRD e análise de concorrentes no repo | `docs/PRD.md`, `docs/concorrentes.md` | ✅ | — |
| 0.2 | **Design canvas (Claude Design)**: 15 artboards (12 mobile, painel desktop, mapa de navegação, folha de tokens) | https://claude.ai/code/artifact/5c9ee8cb-8716-49a8-9479-8b9eea77ec09 + `design/README.md` | ✅ | 0.1 |
| 0.3 | **ADR de stack e arquitetura** + custos (rev. 3) | `docs/adr/0001-stack-e-arquitetura.md` — relay em EC2 (sa-east-1), Next.js na Vercel e Neon (já pagos, custo marginal), auth = OTP do Sentinela + Google OIDC manual, `pg` puro, Resend, clipes em **S3 sa-east-1 + CloudFront** (só Brasil), sem Sentry/RLS. **Piloto enxuto ≈ R$ 329/mês** (t4g.medium, 3 dias); 6 arenas ≈ R$ 444/arena; 20 arenas ≈ R$ 478/arena | ✅ | 0.1 |
| 0.4 | **Modelo de dados** + query central (clipes por arena/quadra/intervalo; sessões semanais do grupo) | `docs/modelo-de-dados.md` (Camera, Button, clip_job, coverage_gap, relay_node) | ✅ | 0.1 |
| 0.5 | **Contrato de API** relay↔nuvem, botão, app do atleta, painel do parceiro | `docs/api/openapi.yaml` (47 paths) + `docs/api/README.md` | ✅ | 0.4 |
| 0.6 | **Pesquisa de hardware** (sem PC): câmera Intelbras VIP 3230 B SL G3 com push RTMP nativo; botão virtual + Sonoff Zigbee via ZBBridge-P (Tasmota); BOM 4 quadras ≈ R$ 10,2–10,8 mil (R$ 2,5–2,7 mil/quadra), 2 quadras viável | `docs/hardware/*.md` | ✅ | 0.1 |
| 0.7 | **Spec de captura** (config da câmera, relay, gatilho → clipe, sessão completa, microSD como cópia, banda, Spike U) | `docs/hardware/spec-captura.md` | ✅ | 0.6 |
| 0.8 | Plano técnico com marcos e riscos | `docs/plano-tecnico.md` — M1 = fork do relay; **Spike U (uplink 48 h) com veto sobre a arena piloto, antes do contrato** | ✅ | 0.3–0.5 |
| 0.9 | Revisão do PM: consolidar 0.2–0.8, resolver conflitos, congelar escopo do piloto | `docs/decisoes.md` (decididas / propostas / só o Gabriel / inconsistências / próxima leva) | ✅ | 0.2–0.8 |
| 0.10 | Comprar kit de bancada — aprovado; lista em `docs/hardware/kit-bancada.md` | Pedido feito pelo Gabriel | ☐ (compra) | — |

## Fase 1 — MVP do piloto (semanas 3–6)

### Workstream A — Captura (câmera → RTMP push → relay nosso)
> Decisão do Gabriel em 2026-09-12: **sem PC na arena**. A câmera empurra RTMP para um relay nosso na AWS (fork do relay v2 do Sentinela, `C:/Users/gabri/Documents/monitoring/relay2`), que grava 24/7 e corta o clipe pelo índice. O botão vira um webhook HTTPS. PC de borda fica como plano B (internet ruim / IA local).

| # | Task | Entregável | Status | Depende de |
|---|------|-----------|--------|-----------|
| A1 | Relay (fork + worker + sync + saúde + infra) | ✅ instalado e **validado ponta a ponta**: botão físico (webhook) → job → corte 125 ms + encode 23 s → upload 6,5 MB → clipe de 24 s disponível ~26 s após o toque. Fonte de vídeo ainda **simulada** (`replayja-camsim` na própria EC2, testsrc 720p25) até o kit de bancada | ✅ | 0.3 |
| A2 | Provisionamento de câmera pelo app (porta + chave RTMP gerados, sync no relay como o `/admin` do Sentinela) | Cadastrar câmera no painel basta para ela gravar | ☐ | A1, B2 |
| A3 | Job de clipe via `POST /triggers` → relay `/clip` → MP4 → S3 | ✅ validado em produção (clip `3e882457…`, coverage 0,96 → `partial`) | ✅ | A1, B2 |
| A4 | Botão físico com internet própria (webhook assinado por botão) → quadra; cooldown | ✅ endpoint validado com o webhook da quadra 1 (202 + latências aplicadas). Falta o botão de verdade (kit de bancada) | ✅ API / ☐ hardware | A3 |
| A5 | Sessão completa = retenção do relay (7 dias no piloto) + rota para o painel puxar trecho sob demanda | Admin da arena baixa qualquer trecho | ✅ código (no A1) / ☐ validado na EC2 | A1 |
| A6 | Saúde derivada do stream (cobertura, último segmento, bitrate) + alerta | ✅ `relay_health`/`camera_health` chegando a cada tique; `/api/health` mostra relay online | ✅ | A1, B6 |
| A7 | Botão virtual (usuário logado) usa o mesmo `POST /api/triggers`; botão físico `POST /api/triggers/b/{token}` sempre 202 | Cooldown por quadra testado | ✅ código (no B1) / ☐ validado ponta a ponta | A3, B5 |
| A8 | Plano B documentado: quando colocar PC na arena (internet ruim, >N quadras, IA local) | `docs/hardware/pesquisa-computador-borda.md` | ✅ | 0.6 (revisado) |

### Workstream B — Backend / nuvem
| # | Task | Entregável | Status | Depende de |
|---|------|-----------|--------|-----------|
| B1 | Scaffold `web/`, Neon, Vercel, Git | ✅ tudo: repo GitHub conectado (push em `main` = produção), Root Directory `web`, Neon sa-east-1 migrado, S3+CloudFront+role OIDC, app em https://replayja.vercel.app | ✅ | 0.3 rev. 3 |
| B2 | Banco + migrações + endpoints do relay (câmeras, claim com lease, confirm com 409 checksum, health) | Testes de integração passando | ✅ código (no B1) / ☐ validado com o relay real | B1, 0.4, 0.5 |
| B3 | Auth: OTP portado do Sentinela + Google OIDC manual (`jose`), sessão HMAC, rate limit | Testes unitários passando; login real depende de `RESEND_API_KEY` e domínio | ✅ código / ☐ validado no celular | B1 |
| B4 | Worker de vídeo: marca d'água, thumbnail, variante de download | ✅ thumbnail e OG públicos no CloudFront; download assinado 200. **Marca d'água não aplicada** (parceiro sem logo e `relay/watermark.png` do Replay já ainda não existe — P5) | ✅ / ☐ PNG | A3 |
| B9 | **Spike F**: planos flat do CloudFront valem para nosso caso? (vale ~R$ 173/arena/mês em escala) | Resposta documentada na ADR §6 | ☐ | — |
| B5 | API do atleta: busca, detalhe, download, link de sessão | ✅ busca/detalhe/download validados logado (bypass) | ✅ | B2, B3 |
| B6 | API do parceiro: branding, contato, dispositivos/status, métricas básicas | — | ☐ | B2 |
| B7 | Grupos: CRUD, slug, convite por link/e-mail, sessões semanais derivadas | ✅ (edição/saída de grupo e revogação de convite ainda sem tela) | ✅ parcial | B5 |
| B8 | Métricas de compartilhamento (por canal) e eventos de produto | Dashboard interno mínimo | ☐ | B5 |

### Workstream C — Web app (atleta + parceiro)
| # | Task | Entregável | Status | Depende de |
|---|------|-----------|--------|-----------|
| C1 | Design system em código (20 componentes, páginas aplicadas, OG, PWA mínimo, catálogo `/dev/ui`) | 89 testes; Lighthouse mobile home 97/100/100/91; **no ar em https://replayja.vercel.app** | ✅ | 0.2, B1 |
| C2 | Home pública + login (OTP/Google) | — | ☐ | C1, B3 |
| C3 | Página do parceiro (`/<arena>`): hero com marca, abas Lances/Grupos/Sobre, Open Graph, gate de login | Página indexável e bonita no WhatsApp | ☐ | C1, B6 |
| C4 | Busca de lances lendo clipes reais | ✅ (`/app/buscar`, aba Lances) | ✅ | C3, B5 |
| C5 | Player do lance com URL assinada, Baixar/WhatsApp/Instagram/Copiar | ✅ `/[arena]/c/[clipId]` 200 logado; download 302 → CloudFront 200 | ✅ | C4, B4 |
| C6 | Página da sessão compartilhável + "Salvar como grupo" | ✅ em produção (`/[arena]/s/[quadra-]AAAA-MM-DD-HHh-HHh`), com gate de login e registro de compartilhamento | ✅ | C4 |
| C7 | Criar grupo + página do grupo (semanas, membros, convidar) + convite por link | ✅ em produção (`/[arena]/grupos/novo`, `/[arena]/[grupo]`, `/convite/[token]`, `/app/grupos`); grupo "Fut Sexta" criado na Arena Vasco no smoke | ✅ | C6, B7 |
| C8 | Botão virtual (`/app/botao`) com cooldown e polling até "pronto" | ✅ | ✅ | C4, A7 |
| C9 | Painel do parceiro com câmeras reais e saúde | ✅ (`/painel`, `/painel/cameras`); upload de logo/marca d'água ainda desabilitado | ✅ parcial | C1, B6 |
| C10 | PWA (instalável, ícone, splash), performance mobile, acessibilidade básica | Lighthouse ≥ 90 mobile | ☐ | C2–C7 |

### Workstream D — Go-to-market / piloto
| # | Task | Entregável | Status | Depende de |
|---|------|-----------|--------|-----------|
| D1 | Proposta comercial (rev. 3): SaaS mensal sem fidelidade. 4 quadras: piloto R$ 690 (já se paga), fundador R$ 1.490, lista R$ 1.890 (piso 40% = R$ 1.740); 2 quadras: R$ 490 / 950 / 1.190. Curva de custo plana (~R$ 450/arena) → margem vem de guardar menos vídeo, não de volume | `docs/gtm/proposta-piloto.md` | ✅ | 0.3 |
| D2 | Landing page "Sou dono de arena" + pitch de 1 página | Página no ar | ☐ | C1 |
| D3 | Guia de instalação do kit para o dono da arena (10 passos, com fotos) | PDF | ☐ | 0.6, A6 |
| D4 | Termos de uso / privacidade (LGPD), anexo do contrato da arena, sinalização da quadra, fluxo de remoção | `docs/legal/*.md` — base legal: legítimo interesse em controladoria conjunta; checklist bloqueante em `analise-lgpd.md` §13 | ✅ (minutas; revisar com advogado) | — |
| D5 | Roteiro de onboarding da arena piloto e métricas de sucesso (clipes/dia, % compartilhados, grupos criados, e-mails capturados) | `docs/gtm/metricas-piloto.md` **rev. 3** — norte: lances compartilhados/quadra/dia, alvo 12; guarda-corpos de uplink (G5–G7), Spike U na S−1, preços de entrevista atualizados | ✅ | — |

## Fase 2 — Instalação e operação do piloto (semanas 7–8)
- Instalação na arena, calibração de câmera por quadra, teste de botão em jogo real.
- Semana de operação assistida: bugs, latência, qualidade dos clipes à noite.
- Retro com o dono da arena e com 3–5 atletas; decidir Fase 3.

## Fase 3 — Depois do piloto (candidatos, não priorizados)
- Highlights automáticos a partir da sessão completa (IA), detecção de gol/ponto como gatilho.
- Analytics por grupo (presença, lances por atleta), notificações por e-mail/WhatsApp quando novos lances do grupo chegam.
- Patrocínio nos vídeos (segunda marca d'água) como receita da arena.
- Telão/ReplayTV na arena, live no YouTube.
- App nativo se o compartilhamento web mostrar limitação real.

---

## Riscos de produto (a validar no piloto)
| Risco | Sinal | Mitigação |
|---|---|---|
| Atleta não loga (fricção) | Taxa de gate de login → busca < 50% | OTP + Google; pré-visualizar thumbnails antes do login |
| Clipe com horário errado | Reclamação "meu lance não está lá" | Relógio do relay é a referência (hora de chegada); margem no corte; tolerância de ±2 min na busca; atalhos "última hora" |
| **Uplink da arena cai e o lance se perde** (sem buffer local) | Buracos na cobertura; clipe vazio | Pré-requisito de banda no contrato (cabo, upload ≥ 2× soma dos bitrates); microSD na câmera como cópia; alerta de cobertura baixa |
| Compartilhamento perde qualidade no WhatsApp/Instagram | Vídeo pixelado | Gerar variante otimizada (H.264 high, 1080p, ≤ 16 MB) para download |
| Custo de egress explode com viralização | Conta de CDN | CDN com egress barato (R2/Bunny), thumbnails leves |
| Arena não vê valor | Não renova | Página do parceiro + métricas de alcance no painel desde o dia 1 |

## Decisões em aberto para o Gabriel
1. Modelo comercial do piloto (comodato / venda / SaaS) e preço-alvo — bloqueia D1.
2. Aprovar compra do kit de bancada assim que a pesquisa de hardware (0.6) chegar — bloqueia A1.
3. Domínio `replayja.com.br` já é nosso? Precisa de e-mail transacional (OTP) no domínio.
4. Arena candidata ao piloto e esporte principal (society vs futevôlei muda câmera e posição).

### Levantadas pelo design (0.2) — propostas do PM, confirmar
5. **Retenção de clipes**: proposta 90 dias para clipes (a página do grupo precisa de histórico), 7 dias para a sessão completa no piloto.
6. **Visibilidade do clipe**: qualquer usuário logado vê os clipes da arena por quadra/horário (não há vínculo atleta↔lance). Grupo é só organização, não restrição de acesso.
7. **Quadra como filtro**: sim, entra no piloto (arena tem várias quadras com câmeras distintas).
8. **Privacidade do grupo**: aberto por link no piloto; aprovação do dono fica para a Fase 3.
9. **Marca d'água**: se o parceiro não enviar logo, aplica a marca do Replay já; se enviar, marca do parceiro + assinatura discreta do Replay já.
10. **Patrocínio no vídeo**: fora do piloto, mas reservar no modelo de dados um segundo slot de marca (Fase 3). O design não reservou espaço; ajustar depois.

### Levantadas pelo jurídico (D4) — decidir antes do primeiro bucket / primeira gravação
11. **Retenção de clipes: 30 ou 90 dias?** PLANO diz 90, ADR/API/proposta dizem 30. Proposta do PM: **90 dias** (a página do grupo precisa de histórico); alinhar todos os docs e a mensagem de erro do app. Sessão completa: **7 dias** (não 14).
12. **Jurisdição do bucket R2** (irreversível após criar): R2 não tem região na América do Sul; criar com jurisdição `eu` cai na decisão de adequação da ANPD (Res. 32/2026). Proposta: `eu`.
13. **Thumbnails públicos**: única superfície com imagem de pessoa sem login. Proposta: thumbnail borrada/genérica antes do login (o design já mostra grade borrada com contador).
14. **Escolinhas/menores**: mapear horários e bloquear gravação neles no piloto; ECA Digital (Lei 15.211/2025) em vigor.
15. **Papéis LGPD**: Replay já e arena como controladoras conjuntas (corrigir a proposta comercial, que dizia "arena controladora, nós operadores").

### Levantadas pela arquitetura revisada (0.3)
16. **EC2 em vez de Lightsail para o relay**: no Lightsail a ENTRADA conta na franquia (e São Paulo tem metade dela); 3,9 TB/mês de ingresso por arena dariam ~US$ 370/mês de excedente. EC2 não cobra ingresso. Confirmar com o Support da AWS antes de pagar.
17. **Checar a conta do Sentinela**: se a regra vale, o relay dele (~7,2 TB/mês de entrada) pode estar pagando US$ 630–855/mês de excedente. 5 minutos no Cost Explorer.
18. **Spike U antes do contrato**: medir o uplink da arena candidata por 48 h; a internet do cliente vira pré-requisito contratual.
19. **PC de borda por arena, não global**: em regime (20 arenas) o relay custa R$ 347/arena/mês vs R$ 149 do PC; o PC volta a compensar após ~14 meses nas arenas de uplink ruim. O contrato já prevê `ingest_kind = rtsp_pull`.

### Levantadas pelo hardware revisado (0.6) — para a revisão do PM (0.9)
20. **ADR §9 descreve o desenho com câmera Mibo; o hardware reprovou a Mibo** (20 fps em H.264, sem obturador/GOP/PoE, RTMP exige áudio). Câmera do kit é a **Intelbras VIP 3230 B SL G3** (push RTMP nativo, obturador manual, GOP ajustável, PoE, microSD). Corrigir a ADR.
21. **ANR não existe para nós** (é função de NVR proprietário). Rede de segurança do buraco de uplink é o microSD com recuperação manual; no piloto, assistida por videochamada. Saída futura: caixinha Tailscale (R$ 300–500) para alcançar a câmera atrás do CGNAT.
22. **Teste bloqueante T5**: a câmera precisa reconectar sozinha após queda de rede em push RTMP. Mitigação: reboot agendado diário + alarme de cobertura.
23. **Botão**: Shelly Button1 descontinuado e com 5 s de latência; ESP32 Wi-Fi 1,4–3,1 s por causa do TLS. Ficou Zigbee via ZBBridge-**Pro** (ESP32; o não-Pro não faz HTTPS). Botão virtual é o gatilho principal do piloto.

