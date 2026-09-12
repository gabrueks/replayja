# Replay já 2.0 — design canvas

**Artifact (canvas editável):** https://claude.ai/code/artifact/5c9ee8cb-8716-49a8-9479-8b9eea77ec09

**Fonte:** `replay-ja-2.html` (arquivo publicado) + os artboards `*.dc.html` e o `canvas.json` nesta pasta.
Para atualizar o canvas: editar os `.dc.html` / `canvas.json`, regerar o `replay-ja-2.html` com o skill `design` e republicar na mesma URL.

Contexto usado: `docs/PRD.md` e `docs/concorrentes.md`.

---

## Artboards

O canvas tem duas páginas (menu de páginas na barra do editor).

### Página 1 — Jornada do atleta (mobile, 390px)

| # | Arquivo | Tela |
|---|---|---|
| 1 | `Main.dc.html` | Home pública (`replayja.com.br`): proposta de valor, busca "Onde você jogou?", CTA "Ver meus lances", bloco "Tem uma arena?" |
| 2 | `Login.dc.html` | Login — Google + e-mail, com a linha que explica por que logar |
| 2b | `LoginCodigo.dc.html` | Login — código de 6 dígitos, reenvio com contagem, o que acontece depois de entrar |
| 3 | `Parceiro.dc.html` | Página do parceiro `/arena-calabouco` deslogada: hero com marca da arena, abas Lances/Grupos/Sobre, gate de login amigável, grade borrada com contador de lances |
| 3b | `ParceiroSobre.dc.html` | Aba Sobre: endereço, WhatsApp, horários, quadras com câmera, compartilhar página |
| 4 | `Busca.dc.html` | Busca de lances: chips de quadra, atalhos (agora / última hora / ontem à noite), data, início/fim, grade de clipes com horário, duração e quadra |
| 4b | `BuscaVazia.dc.html` | Estado vazio "Nenhum lance nesse horário" com horários vizinhos sugeridos |
| 5 | `Player.dc.html` | Player do lance: vídeo com marca d'água da arena, anterior/próximo, Baixar / WhatsApp / Instagram / Copiar link, faixa de próximos lances |
| 6 | `Sessao.dc.html` | Página da sessão `/s/2026-09-08-20h-21h`: link copiável, lista de clipes, CTA "Salvar como grupo" |
| 7 | `CriarGrupo.dc.html` | Criar grupo: nome, esporte, quadra, dias, horário, preview do slug `fut-segunda`, aviso por e-mail |
| 8 | `Grupo.dc.html` | Página do grupo `/fut-segunda`: cabeçalho, membros, seções por semana, sheet de convite (link / WhatsApp / e-mail) |
| 9 | `BotaoVirtual.dc.html` | Botão virtual na sessão ao vivo: "Salvar lance", anel de cooldown, confirmação "Lance salvo 20:47", salvos da sessão |

### Página 2 — Parceiro, fluxo e sistema

| # | Arquivo | Tela |
|---|---|---|
| 10 | `Painel.dc.html` | Painel do parceiro, desktop 1280: KPIs, tabela de câmeras + gravação da sessão completa, lances por horário, configurações da página (logo, cor, contato), marca d'água com prévia e posição |
| 11 | `Fluxo.dc.html` | Mapa de navegação (1840px): 5 estágios (entrada → identificação → descoberta → consumo → recorrência), onde o login é exigido, e as 4 entradas por link compartilhado |
| — | `Sistema.dc.html` | Tokens (cores, tipografia, raios, espaçamentos) e componentes reutilizados, com a justificativa do acento |

Notas (post-its) no canvas registram direção visual, regra de login, o diferencial do grupo e o papel do painel.

---

## Tokens

### Cor

| Token | Hex | Uso |
|---|---|---|
| Fundo | `#0B0C0E` | fundo de todas as telas (player usa `#08090A`) |
| Superfície | `#15171A` | cards, campos, barras |
| Superfície 2 | `#1D2025` | chips neutros, linhas selecionadas, avatar |
| Borda | `#2A2E34` | contornos de 1px e divisores |
| **Acento** | `#FF6B1F` | ação primária, chip ativo, destaque da marca |
| Ao vivo / ok | `#00C46A` | câmera online, WhatsApp, confirmação |
| Gravando / erro | `#FF4D4D` | gravação em andamento, câmera offline |
| Texto | `#F2F4F6` / `#9AA1AA` / `#6E757E` | principal / secundário / apoio |
| Quadra (thumb) | `#1E7A42` → `#0E3E23` | gradiente de grama das miniaturas |

**Por que laranja elétrico (e não verde-limão):** a interface é dominada por grama — thumbnails, player, prévias. Verde-limão brigaria com o próprio conteúdo e sumiria sobre o fundo verde; laranja é complementar, então botão e chip ativo saltam de qualquer miniatura. Também separa a marca do segmento (dominado por verde e azul) e resolve legibilidade ao sol: `#FF6B1F` tem ~7:1 de contraste sobre o fundo escuro e texto preto sobre o laranja passa AA em botão grande. O acento é um *tweak* no canvas (chip acima de cada artboard), então dá pra testar outras cores sem reeditar tela por tela.

### Tipografia

- **Archivo** 700/800 — títulos, abas, botões principais, números grandes. Fallback: Helvetica Neue / Arial.
- **Barlow** 400/500/600/700 — corpo e UI. Fallback: Helvetica Neue / Arial.
- Escala: 40/32/27 (títulos de tela) · 22/17 (seções) · 16 (corpo) · 13–14 (apoio) · 12 (legenda) · 11–12 uppercase com `letter-spacing: .09em` (rótulos).
- Todo horário e contador usa `font-variant-numeric: tabular-nums` — horário é a informação que o atleta procura.

### Forma e espaço

- Raios: 6 (badge) · 10–12 (chip, campo, botão secundário) · 13–14 (botão principal, card) · 16–18 (painéis) · 20–24 (hero, sheet) · 999 (pílulas).
- Espaçamentos: 4 · 8 · 12 · 16 · 20 · 24 · 32.
- Alvos de toque: 44px mínimo, 52px padrão, 56–58px na ação principal. Layouts em flex/grid com `gap`.
- Ícones: SVG inline, traço 1.8–2.2, grade 16/18/20/22. Sem emoji.

---

## Decisões de UX tomadas além do briefing

1. **O gate de login aparece na ação, não na chegada.** A página do parceiro carrega inteira (é a landing page da arena); o login é pedido quando o atleta busca, baixa, compartilha ou cria grupo — e depois devolve ele exatamente para a tela de origem. Isso preserva a função de divulgação da página sem abrir a busca.
2. **Prévia borrada na página deslogada** com "132 lances gravados hoje": mostra que existe conteúdo antes de pedir o e-mail, em vez de um formulário seco.
3. **Login dividido em dois artboards** (e-mail → código), porque a tela do código tem estados próprios (reenvio com contagem, trocar e-mail).
4. **Atalhos de tempo antes do seletor de horário** ("agora", "última hora", "ontem à noite"): o caso comum é o atleta abrindo o celular ainda na quadra. O ponto fraco dos concorrentes é exigir que ele lembre o horário exato.
5. **Estado vazio propositivo**: em vez de só dizer que não achou, sugere horários vizinhos com lances e cita a causa provável (botão sem bateria) com caminho pra falar com a arena.
6. **"Salvar este horário como grupo" aparece em dois lugares** — no fim do resultado da busca e como CTA principal da página da sessão. É a ponte do caso de uso pontual para o recorrente.
7. **Link de vídeo e de sessão são públicos para assistir; baixar e compartilhar pedem login.** Sem isso, cada link compartilhado no WhatsApp viraria um muro de cadastro e mataria a divulgação orgânica da arena.
8. **Página do grupo abre em modo leitura para convidados**; entrar vira membro e liga o aviso por e-mail (é assim que o grupo captura e-mails sem bloquear quem só quer ver).
9. **Marca d'água em três superfícies** — thumbnail, player e vídeo exportado — com canto configurável no painel. Só um concorrente entrega vídeo marcado.
10. **Botão virtual é complemento, não substituto** do botão físico: aparece só para quem está logado e dentro do horário de uma sessão ao vivo, com cooldown visível (herdado do aprendizado do 1.0).
11. **Painel do parceiro mostra a gravação da sessão completa como status por quadra** (com cronômetro), preparando o discurso de pós-processamento/IA sem prometer feature que ainda não existe.
12. **Nada de chrome falso de celular** (sem barra de status ou teclado desenhados) e nenhuma imagem bitmap: thumbnails, marca e logo são desenhados em CSS/SVG, então o canvas abre leve e a arena fictícia é claramente um placeholder.

---

## Pontos ambíguos do PRD para o design

- **Retenção dos clipes:** o 1.0 expirava lances em 48h. O 2.0 não define prazo — a página do grupo e o histórico por semana só fazem sentido com retenção longa. As telas assumem histórico permanente (grupo mostra semanas anteriores).
- **Quem é dono do lance:** o botão físico é da quadra, então todo mundo que jogou naquele horário vê o mesmo clipe. O PRD não diz se existe algum vínculo atleta↔lance (marcar quem aparece, "meus lances"). O design trata o recorte como público por horário/quadra.
- **Quadra como dimensão de busca:** o PRD fala "arena → horário", mas uma arena tem várias quadras com câmeras distintas. Adicionei a quadra como filtro (chips) — sem isso o resultado mistura jogos diferentes.
- **Botão virtual:** aparece no PRD como "futuro" (outros gatilhos), mas foi pedido como artboard. Está desenhado como feature de sessão ao vivo; falta definir quem pode acionar (qualquer logado na arena? só membro do grupo?) e o tempo de cooldown real.
- **Gravação da sessão completa:** o PRD diz que não precisa aparecer para o atleta agora. O painel mostra status; falta decidir retenção desse arquivo (custo de storage) e se a arena baixa/assiste.
- **Grupos e privacidade:** não está definido se um grupo é aberto (qualquer um com o link entra) ou fechado (admin aprova), nem o que acontece quando o horário do grupo é ocupado por outra turma na mesma quadra — os vídeos apareceriam para o grupo errado.
- **Marca d'água opcional:** o PRD diz "opcional pelo parceiro". O painel tem o toggle, mas falta a regra de negócio: arena sem marca d'água leva marca do Replay já?
- **Patrocínio:** todos os concorrentes monetizam com patrocinador no vídeo e o PRD não menciona. Não há espaço reservado para isso no player nem no painel.
