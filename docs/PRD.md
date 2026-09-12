# PRD — Replay já 2.0

> Fonte: Google Doc "PRD - Replay já" (https://docs.google.com/document/d/1_nfT2E-hW5OkUuP-K6LYWgmm5TyC0Vth2GDoHBnPrV4). Espelhado em 2026-09-12.

## Tese / Oportunidade

- Existe no Brasil um modelo de negócio com baixa penetração: empresas fornecem como hardware uma **câmera + um botão** na quadra e um sistema que grava lances de esportes, mas com funcionalidades limitadas.
- Tese: com a experiência do time e as novas capacidades de IA, conseguimos entregar um **produto superior a custo similar ou inferior** aos concorrentes.
- Um produto superior gera mais tração/adoção em mais quadras e mais esportes/casos de uso, por ser diferencial real para o atleta.

## Objetivos

- Cobrir o caso de uso base do mercado com alguns ganhos "fáceis", para **fechar um contrato** e aprender para onde expandir.
- Principais pontos:
  1. Cobrir a solução base/core do mercado.
  2. Maior foco em **divulgação do parceiro**: página do parceiro + marca d'água do parceiro.
  3. **Gravar a partida inteira** para depois construir features de pós-processamento.
  4. **Página do grupo** ("pelada"): conveniência para o atleta, captura de e-mails por grupo e base para analytics.

## Solução base (escopo do produto)

### 1. Sistema de gravação
- Câmera com **gatilho salvando os últimos 22 segundos**.
  - Futuro: outros gatilhos — botão virtual no site/app, reconhecimento por IA.
- Câmera filmando a **sessão completa**, para desenvolver features de pós-processamento na sequência.

### 2. Interface de busca de vídeos (apenas usuários logados)
- Vindo da página principal: **Arena/parceiro → horário início/fim → vídeos disponíveis**.
- Vindo da página do parceiro: **horário início/fim → vídeos disponíveis**.

### 3. Compartilhamento (apenas usuários logados)
- **Vídeo**: baixar / compartilhar no WhatsApp / compartilhar no Instagram em **alta qualidade**.
- **Sessão** (filtro de início e fim): compartilhar a página da sessão (dentro da página do parceiro).
- **Página do parceiro**: compartilhar a página do parceiro.

### 4. Página do parceiro
- A página de busca de vídeos de uma arena funciona também como **landing page do parceiro**:
  - URL dedicada, ex.: `replayja.com.br/arena-calabouco`
  - Aba com telefone de contato / dados da arena
  - Nome/marca do parceiro com destaque na jornada de achar vídeos
  - **Marca d'água da arena nos vídeos** (opcional pelo parceiro)
- Vídeos já filtrados pela arena; para buscar, o usuário deve logar.

### 5. Página do grupo
- Dentro da página do parceiro, o usuário logado **salva um filtro recorrente** (ex.: toda segunda 20h–21h) com o nome do grupo, gerando um link fixo, ex.: `replayja.com.br/arena-calabouco/fut-segunda`
  - Vídeos já organizados por sessão/semana, atualizados automaticamente
  - Link de convite / registro de membros por e-mail
- Base para features futuras de analytics por grupo.

## Não-objetivos (por enquanto)
- App nativo (web mobile-first primeiro).
- Análise tática/IA (fase posterior, viabilizada pela gravação da sessão completa).
- Cobrança do atleta (modelo B2B: arena paga).

## Histórico — Replay já 1.0 (aprendizados)
O 1.0 usava o **celular dos usuários** como câmera (sem parceiro): sessões, modo câmera, botão "salvar lance" (30s retroativos, cooldown 10s), lances expiram em 48h, paywall por sessões premium (planos R$20/40/100), modo câmera em tela cheia, suporte a 2 câmeras por sessão. O 2.0 pivota para o modelo **câmera fixa + botão na arena**, com a arena como cliente pagante.
