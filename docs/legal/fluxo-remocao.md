# Fluxo de remoção de vídeo (takedown) — processo operacional

> Escrito em 12/09/2026. Documento **operacional e técnico**, não jurídico-abstrato.
> Marcações **[REVISAR COM ADVOGADO]** onde há risco relevante.
>
> Este é o processo que sustenta três promessas feitas em documentos públicos: a placa da quadra
> (`sinalizacao-quadra.md`), a Política de Privacidade (§7) e a cláusula 5 do
> `contrato-arena-anexo-lgpd.md`. **Se ele não funcionar, os três documentos viram propaganda enganosa** —
> e a salvaguarda S8 do teste de legítimo interesse (`analise-lgpd.md` §4) cai, derrubando a base legal da captação.
>
> Base normativa: LGPD **art. 18, IV e VI** (eliminação), **art. 18, § 2º** (oposição), **art. 19** (prazos),
> **art. 37** (registro das operações).

---

## Sumário

1. [Princípios](#1-princípios)
2. [Canais de entrada](#2-canais-de-entrada)
3. [O formulário](#3-o-formulário)
4. [Fluxo ponta a ponta](#4-fluxo-ponta-a-ponta)
5. [Triagem: quem aprova o quê](#5-triagem-quem-aprova-o-quê)
6. [Prazos (SLA)](#6-prazos-sla)
7. [Execução técnica da remoção](#7-execução-técnica-da-remoção)
8. [O que fazer com cópias já baixadas por terceiros](#8-o-que-fazer-com-cópias-já-baixadas-por-terceiros)
9. [Registro, log e prova](#9-registro-log-e-prova)
10. [Casos especiais](#10-casos-especiais)
11. [Modelos de resposta](#11-modelos-de-resposta)
12. [Métricas e teste do processo](#12-métricas-e-teste-do-processo)
13. [Fontes](#13-fontes)

---

## 1. Princípios

Cinco decisões que explicam todo o resto do documento.

| # | Princípio | Consequência prática |
|---|---|---|
| **P1** | **Remover é barato; manter indevidamente é caro.** Um clipe de 22 s removido por engano custa quase nada — ele ia sumir em 90 dias de qualquer jeito | Na dúvida, **remove**. Não pedimos prova, não investigamos, não discutimos |
| **P2** | **Sem conta, sem justificativa, sem documento** | A maioria de quem aparece nos vídeos **não tem conta**. Exigir cadastro para pedir remoção é coletar mais dado de quem quer menos tratamento |
| **P3** | **Rápido vale mais que perfeito** | Ocultar em minutos; apagar de fato em até 72 h. A pessoa quer que pare **agora** |
| **P4** | **Nunca prometer o impossível** | Não dizemos "apagamos da internet". Dizemos o que fazemos e ajudamos com o resto |
| **P5** | **Tudo registrado** | Art. 37. Se não há log, não há prova de cumprimento — e o processo vira palavra contra palavra |

---

## 2. Canais de entrada

| Canal | Onde aparece | Quem usa |
|---|---|---|
| **`replayja.com.br/remover`** — formulário público, **sem login** | QR da placa da quadra; rodapé de toda página de clipe; Política; Termos; primeiro login | Principal. Qualquer pessoa |
| **`privacidade@replayja.com.br`** | Placa, Política, Termos, rodapé do site | Quem prefere e-mail, advogados, responsáveis por menores |
| **Botão "Pedir remoção" dentro do clipe** | Página do clipe, para quem está logado | Usuário que achou o vídeo — já vem com o `clipId` preenchido |
| **Arena** (presencial, telefone, redes sociais da arena) | Recepção | Quem fala com a arena primeiro. **A arena tem 24 h para encaminhar** (contrato, cl. 5.2) |
| **Ofício / notificação extrajudicial / ordem judicial** | `privacidade@replayja.com.br` e endereço da sede | Advogado, MP, Delegacia, Juizado |

**Todos os canais desembocam na mesma fila.** Um pedido recebido pela arena por WhatsApp tem exatamente o mesmo
tratamento e o mesmo SLA de um pedido pelo formulário.

---

## 3. O formulário

### 3.1 Campos

| Campo | Obrigatório | Observação |
|---|:--:|---|
| **Link do vídeo** *ou* **arena + quadra + data + horário aproximado** | ✅ (um dos dois) | Sem isso não conseguimos achar o vídeo. Aceitar horário aproximado ("umas 21h de terça") e resolver com janela de ±30 min |
| **E-mail ou WhatsApp para resposta** | ✅ | Único dado pessoal que coletamos aqui. Usado **só** para responder e apagado em 5 anos junto com o registro do pedido |
| **Você é:** ( ) a pessoa que aparece ( ) responsável por menor que aparece ( ) outro | ✅ | Define o SLA (24 h vs 72 h). **Não pedimos comprovação** |
| **Quer contar o motivo?** (campo livre) | ❌ | **Opcional e rotulado como opcional.** Existe para casos urgentes (assédio, exposição íntima), não como condição |
| **Há criança ou adolescente no vídeo?** | ❌ | Marca prioridade automática |
| Anexo (print, foto) | ❌ | Ajuda a localizar |

### 3.2 O que o formulário **não** pede

CPF · RG · foto de documento · selfie · comprovante de que estava na partida · justificativa obrigatória ·
cadastro · aceite de termos · captcha agressivo.

> **[REVISAR COM ADVOGADO]** Há uma leitura de que o controlador deve **confirmar a identidade** do titular antes de
> atender um pedido do art. 18 (para não atender impostor). Ela é correta para **acesso** e **portabilidade**, onde
> entregar dado ao impostor causa dano real. Para **eliminação de clipe**, aplicamos o P1: o "dano" de um pedido
> falso é apagar um vídeo de 22 s que sumiria em 90 dias. **Recomendação conservadora e assumida: não exigir
> identificação para remoção de clipe; exigir para acesso, portabilidade e exclusão de conta.**

### 3.3 Confirmação na tela

> **Recebemos seu pedido.** Protocolo **#RJ-2026-000123**.
> O vídeo sai do ar em até **72 horas úteis** — normalmente em algumas horas. Você recebe um e-mail quando
> estiver feito. Se envolver criança ou adolescente, o prazo é de 24 horas.
> Dúvidas: privacidade@replayja.com.br

---

## 4. Fluxo ponta a ponta

```
  PEDIDO                                             T+0
    │  formulário / e-mail / botão no clipe / arena / ofício
    ▼
  ┌──────────────────────────────────────────────┐
  │ 1. REGISTRO AUTOMÁTICO                       │   T+0, segundos
  │    protocolo #RJ-AAAA-NNNNNN                 │
  │    cria takedown_request (status=recebido)   │
  │    e-mail de confirmação ao solicitante      │
  │    alerta no canal #privacidade              │
  └──────────────────────────────────────────────┘
    ▼
  ┌──────────────────────────────────────────────┐
  │ 2. OCULTAÇÃO PREVENTIVA                      │   T+0 a T+4h
  │    se o clipe foi identificado com certeza:  │   (automática quando
  │    deleted_at = now()  → some da API         │    veio o clipId)
  │    revogação da URL assinada → links morrem  │
  └──────────────────────────────────────────────┘
    ▼
  ┌──────────────────────────────────────────────┐
  │ 3. TRIAGEM HUMANA                            │   T+0 a T+24h
  │    localizar o(s) clipe(s); classificar;     │   (24 h se menor,
  │    decidir escopo (1 clipe? a sessão toda?)  │    urgente ou grave)
  └──────────────────────────────────────────────┘
    ▼
  ┌──────────────────────────────────────────────┐
  │ 4. EXECUÇÃO DA EXCLUSÃO (§7)                 │   até T+72h
  │    banco → assinatura → CloudFront → S3 →    │   (24 h se menor)
  │    relay                                     │
  │    verificação automatizada de cada camada   │
  └──────────────────────────────────────────────┘
    ▼
  ┌──────────────────────────────────────────────┐
  │ 5. RESPOSTA AO SOLICITANTE                   │   até T+72h
  │    o que foi feito, o que não conseguimos,   │
  │    e o caminho para cópias de terceiros (§8) │
  └──────────────────────────────────────────────┘
    ▼
  ┌──────────────────────────────────────────────┐
  │ 6. FECHAMENTO E LOG                          │
  │    status=concluido; evidências anexadas;    │
  │    guarda por 5 anos (art. 37)               │
  └──────────────────────────────────────────────┘
```

**Nota sobre a etapa 2:** a ocultação preventiva acontece **antes** da triagem humana, de propósito. É o P3.
Se a triagem concluir depois que o pedido era improcedente (caso raríssimo — ver §10.4), o clipe pode ser
restaurado enquanto o objeto ainda existir.

---

## 5. Triagem: quem aprova o quê

| Tipo de pedido | Quem decide | Aprovação necessária? |
|---|---|---|
| Remoção de **1 a 5 clipes**, pedido comum | **Operador de plantão** (qualquer pessoa do time com acesso ao painel de privacidade) | **Nenhuma.** Executa direto — é o caso de 95% dos pedidos |
| Remoção envolvendo **criança ou adolescente** | Operador de plantão, prioridade máxima | Nenhuma. Executa imediatamente e **notifica o encarregado** |
| Remoção de **6 ou mais clipes**, ou de uma **sessão/janela inteira** | Operador propõe; **encarregado aprova** | Sim — evita apagão acidental do acervo de uma arena |
| Conteúdo **grave** (nudez, ato sexual, agressão, exposição íntima, ameaça) | Operador executa **na hora** e escala | Executa primeiro, **encarregado revisa depois**. Avaliar preservação de evidência (§10.3) |
| Pedido da **arena** para remover clipe (ex.: briga na quadra) | Encarregado | Sim. Cuidado: a arena **não pode** usar o canal para curadoria de imagem própria (§10.5) |
| **Ordem judicial / ofício** | Encarregado + advogado | Sim, sempre |
| **Restauração** de clipe removido | Encarregado | Sim, sempre, com justificativa escrita |
| Exclusão de **conta** | Automático na interface; operador trata exceções | Nenhuma |

**Plantão:** durante o piloto, o time é pequeno. Definir **uma pessoa responsável por dia** e um substituto, com o
alerta do `#privacidade` no celular. **[a definir na semana da instalação]**

---

## 6. Prazos (SLA)

| Etapa | Caso comum | Menor de idade | Grave (nudez, assédio, ameaça) |
|---|---|---|---|
| Confirmação automática do recebimento | **imediata** | imediata | imediata |
| Sai do ar (invisível na plataforma) | **até 4 h** | **até 1 h** | **até 1 h** |
| Arquivo apagado de todas as camadas | **até 72 h úteis** | **até 24 h** | **até 24 h** |
| Resposta final ao solicitante | até 72 h úteis | até 24 h | até 24 h |
| Resposta a pedido de **acesso/portabilidade** | 15 dias (art. 19, II) | — | — |
| Confirmação simplificada de existência de tratamento | **imediata** (art. 19, I) | — | — |
| Encaminhamento de pedido recebido pela arena | 24 h (contrato, cl. 5.2) | 24 h | **imediato** |

O prazo público é **72 horas úteis** porque é o que está na placa, na Política, nos Termos e na
`api/README.md` §3. **Não prometer 24 h em lugar nenhum sem mudar os quatro documentos juntos.**

---

## 7. Execução técnica da remoção

Um clipe existe em **seis** lugares. Remover só do banco é o erro clássico — e é o que transforma um takedown
em incidente quando alguém prova que o link assinado antigo ainda funciona.

| # | Camada | Ação | Efeito | Verificação |
|---|---|---|---|---|
| 1 | ✅ **Postgres** (`clip`) | `deleted_at = now()`, `deleted_reason`, `takedown_request_id` | Some de `GET /clips` e `GET /clips/{id}` (que passam a devolver `410`) | Query de conferência |
| 2 | **Revogação da URL assinada** (CloudFront) | Invalidar as assinaturas já emitidas para o clipe — na prática, girar/retirar a chave ou marcar o `clipId` na lista de revogados consultada na borda de entrega | 🔴 **Mata os links assinados já emitidos.** Sem isso, quem tem o link continua assistindo por até 6 h. **[PENDÊNCIA TÉCNICA]** definir o mecanismo exato na migração do R2/Worker para CloudFront (`adr/0001` §6.4) | `GET` com URL assinada ainda válida → deve dar 403 |
| 3 | ✅ **Amazon S3 `sa-east-1`** | `DELETE` do objeto do clipe (`wm.mp4`), da variante de download e do **thumbnail**, nos buckets `replayja-clips` e `replayja-public` | Arquivo deixa de existir na origem | `HeadObject` → 404 nos três |
| 4 | ✅ **CloudFront (cache de borda, Price Class All)** | **Invalidation** por caminho do MP4, do thumbnail e da OG image | Pré-visualização some do WhatsApp. ⚠️ A invalidação é **assíncrona** (minutos) e precisa alcançar **PoPs fora do Brasil** — é a camada mais lenta das seis, e a que precisa ser conferida de verdade, não presumida | `curl` sem cache contra `cdn.replayja.com.br` → 404 |
| 5 | **Relay / borda** | Apagar o segmento correspondente do buffer local (original **sem** marca d'água, 7 dias) | Remove a cópia que permite remarcar | Comando remoto + confirmação |
| 6 | **Páginas em cache (ISR)** | `revalidateTag` do grupo e da arena; regenerar mosaico de capa do grupo se usava o thumbnail removido | Clipe some das páginas públicas | Recarregar a página |

### Estado da implementação (13/09/2026)

**Camadas 1, 3 e 4 estão implementadas**, e nos **dois** caminhos:

| Caminho | Onde | Ordem |
|---|---|---|
| **Takedown** (painel) | `web/app/painel/_lib/expurgo.ts` → `executarExpurgo` | linha → objeto → cache |
| **Retenção** (job diário, 04:00 BRT) | `web/app/api/cron/purge-clips/route.ts` | objeto → cache → linha |

A ordem é **oposta de propósito**. No takedown o relógio do SLA corre e a primeira
coisa que precisa acontecer é o vídeo sair do ar para quem abrir a página: marcar
`deleted_at` é imediato e reversível, apagar o objeto não é. Na retenção não há
relógio, e vale a regra desta seção — objeto antes da linha, porque órfão de
registro é recuperável e órfão de objeto cresce para sempre sem ninguém ver.

Os dois se encontram em **`clip.purged_at`** (migração 0016). Um takedown cujo
`DeleteObjects` falhou fica com `deleted_at` preenchido e `purged_at` nulo — e o
job diário o recolhe na madrugada seguinte, mantendo o `deleted_reason` original.
Antes disso, esse caso ficava com o protocolo em `executado` e os bytes para
sempre, porque nada mais olhava para aquela linha.

**Camadas 2, 5 e 6 continuam pendentes**, e o código registra isso em
`takedown_request.verification.pendentes` a cada execução: o protocolo só vira
`concluido` quando as camadas implementadas passam; caso contrário fica
`executado`, que é o estado honesto — o vídeo saiu do ar, e ainda há trabalho
manual.

Rede de segurança: o bucket `replayja-clips` tem lifecycle de **100 dias**. Ele
cobre o job quebrado e o objeto órfão; **não** cumpre o prazo de 90 (é maior),
não sabe de `pinned` e não invalida a CDN. Prazo é do job; rede é do lifecycle.

**Adicional quando o pedido abrange a sessão contínua:** apagar os segmentos da janela **no disco do relay**
(EC2 `sa-east-1`), que é onde a gravação contínua vive, e registrar no log de acesso da arena.

> 🔴 **Este fluxo de 6 camadas precisa ser um job único, idempotente e com verificação automática de cada etapa,
> não um roteiro manual.** Um takedown parcial é pior do que nenhum: a pessoa foi avisada de que o vídeo saiu e ele
> não saiu. **Requisito técnico para o piloto:** job `execute_takedown(clip_id)` que executa 1→6, confere cada uma e
> **só marca o protocolo como concluído quando todas as seis verificações passarem**.

### 7.1 Backups

Backups criptografados do banco podem conter metadados do clipe por até 30 dias. Isso é aceitável e deve estar
**escrito** na resposta ao titular e na Política: o registro é expurgado no ciclo normal de retenção de backup,
não é restaurado para uso, e não há acesso a ele em operação normal. **O arquivo de vídeo não está em backup** —
mídia no S3 **não tem versionamento nem replicação** para backup de longo prazo — se o versionamento estiver ligado,
um `DELETE` só cria um *delete marker* e **a versão anterior continua existindo**. Confirmar isso na entrega do B2.

### 7.2 Exclusão de conta (fluxo diferente)

| Etapa | Ação |
|---|---|
| Pedido | Interface (`Conta → Excluir minha conta`) ou `privacidade@replayja.com.br` |
| Confirmação | Código por e-mail — **aqui sim** exigimos identificação (é o dado da própria pessoa) |
| Efeito imediato | Sessões encerradas, conta inacessível, e-mail e nome removidos das listas de grupo |
| Grupos que a pessoa criava | Perguntar antes: transferir a outro membro ou apagar o grupo |
| Prazo total | **30 dias** (backups) |
| O que **não** é apagado | Registros de acesso com IP (6 meses — obrigação legal, Marco Civil art. 15); registro de pedidos de titular (5 anos); **os vídeos em que a pessoa aparece** |
| Aviso obrigatório na tela | *"Excluir sua conta não apaga os vídeos em que você aparece. Se quiser remover algum, peça a remoção antes."* |

---

## 8. O que fazer com cópias já baixadas por terceiros

Esta é a parte em que é tentador enrolar. Não enrolar é a política.

### 8.1 O que dizemos ao titular — sempre, em toda resposta

> Apagamos a nossa cópia e derrubamos os links. **Se alguém já tinha baixado o vídeo antes disso, essa cópia está
> no celular ou no perfil dessa pessoa, e nós não temos acesso a ela.** Não conseguimos apagá-la, e não vamos
> prometer que conseguimos. O que podemos fazer está abaixo.

### 8.2 O que efetivamente fazemos

| # | Ação | Por quê |
|---|---|---|
| **A1** | **Levantar quem baixou** o clipe, a partir do `share_event` (temos `actor_user_id` de cada `download` e `share`), e informar ao titular **quantas pessoas** baixaram e por qual canal foi compartilhado | Dimensiona o problema. **Não entregamos a identidade de terceiros ao titular** sem ordem judicial — seria violar o dado de outra pessoa |
| **A2** | **Notificar quem baixou**, por e-mail, quando houver pedido de remoção: *"um vídeo que você baixou foi removido a pedido de alguém que aparece nele; pedimos que você apague sua cópia e não o compartilhe"* | É educado, é eficaz na maioria dos casos, e cria registro de que avisamos. **Sem expor quem pediu** |
| **A3** | **Suspender a conta** de quem, avisado, continuar compartilhando — Termos §6 | Única sanção que temos |
| **A4** | **Entregar ao titular um kit de notificação**: texto pronto de notificação extrajudicial e os links diretos dos formulários de denúncia de uso indevido de imagem das plataformas (Instagram/Facebook, WhatsApp, YouTube, TikTok, X) | É o que realmente resolve quando o vídeo está em outra plataforma. Não é conselho jurídico — é um caminho |
| **A5** | **Preservar a prova**: manter, no registro do protocolo, o hash do arquivo, os metadados e a lista de eventos de download, por 5 anos | Se virar processo, o titular precisará disso, e nós também |
| **A6** | **Atender ordem judicial** de fornecimento de dados de quem baixou, se houver | Art. 15 e 22 do Marco Civil |
| **A7** | **Nunca** contatar o terceiro em nome do titular, negociar, ameaçar ou intermediar conflito | Não é o nosso papel e cria exposição |

> **[REVISAR COM ADVOGADO]** A ação **A2** (notificar quem baixou) é a mais delicada: é eficaz, mas revela que houve
> um pedido de remoção e pode, em um caso de conflito pessoal, agravar a situação do titular. **Duas leituras:**
> (a) notificar sempre, porque é a única chance real de a cópia sumir; (b) notificar **só quando o titular pedir**,
> para não expô-lo. **Recomendação conservadora: (b) — perguntar ao titular, na resposta, se ele quer que
> notifiquemos quem baixou, e agir conforme a escolha dele.** Fazer disso uma pergunta de uma linha no e-mail.

### 8.3 Conteúdo de nudez ou ato sexual

Se a câmera captar, por acidente, nudez ou ato sexual (vestiário fora de enquadramento, incidente na quadra):

1. **Remoção imediata**, sem triagem e sem discussão — minutos, não horas.
2. Remoção **da sessão contínua** da janela inteira, não só do clipe.
3. Notificar **todos** que baixaram, com aviso expresso de que a redistribuição é crime.
4. Escalar ao encarregado e avaliar com advogado a comunicação de incidente (art. 48) e a preservação de prova.
5. O [Marco Civil, art. 21](https://www.planalto.gov.br/ccivil_03/_ato2011-2014/2014/lei/l12965.htm) prevê
   responsabilidade do provedor por **notificação extrajudicial** nesses casos — sem necessidade de ordem judicial.
   **Aqui a resposta tem que ser em minutos.**

---

## 9. Registro, log e prova

### 9.1 Tabela `takedown_request` (modelo mínimo)

| Campo | Conteúdo |
|---|---|
| `protocol` | `RJ-2026-000123` |
| `received_at`, `channel` | data/hora, canal de entrada |
| `requester_contact` | e-mail/telefone (único dado pessoal do solicitante) |
| `requester_role` | `titular` \| `responsavel_menor` \| `terceiro` \| `arena` \| `autoridade` |
| `scope` | `clip` \| `clips` \| `session_window` |
| `target_ids`, `partner_id`, `court_id`, `window_from`, `window_to` | alvo |
| `severity` | `comum` \| `menor` \| `grave` |
| `reason_free_text` | opcional, como veio |
| `hidden_at` | quando saiu do ar |
| `executed_at` | quando as 6 camadas foram concluídas |
| `verification` | JSON com o resultado de cada uma das 6 verificações |
| `notified_downloaders` | quantos, quando, se o titular autorizou |
| `responded_at`, `response_text` | resposta enviada |
| `decided_by`, `approved_by` | quem executou / quem aprovou |
| `status` | `recebido` \| `em_analise` \| `executado` \| `concluido` \| `improcedente` \| `restaurado` |

**Retenção do registro: 5 anos.** É a prova de cumprimento (arts. 37 e 50). O registro guarda **metadados**, nunca
uma cópia do vídeo removido.

### 9.2 Log de auditoria (imutável, append-only)

Toda ação sobre o protocolo gera evento: `criado`, `ocultado`, `triado`, `executado`, `verificado`, `respondido`,
`restaurado`, com ator, timestamp e IP interno. **O log não pode ser editável pelo operador.**

### 9.3 Para a arena

Relatório mensal com: número de pedidos recebidos por quadra, tempo médio de atendimento, quantos envolveram menores.
**Sem identificar o solicitante.** Serve de sinal precoce: uma quadra com muitos pedidos indica enquadramento ruim,
horário de escolinha mal mapeado ou sinalização insuficiente.

---

## 10. Casos especiais

**10.1 "Quero que TODOS os vídeos em que eu apareço sejam apagados."**
Não conseguimos — não sabemos quem está em qual vídeo (é o preço de não usar reconhecimento facial). O que fazemos:
(a) explicar isso com honestidade; (b) oferecer remoção de **todos os clipes de uma quadra em uma janela de tempo**
que a pessoa indicar (ex.: "terças, 20–22 h, últimos 3 meses, quadra 2"), o que na prática resolve o caso de quem
joga em horário fixo; (c) registrar a **oposição** (art. 18, § 2º) e comunicar a arena, para avaliação de bloqueio
de horário. Aprovação do encarregado, por ser escopo amplo.

**10.2 Pedido sobre vídeo que já expirou.**
Responder que o vídeo já foi eliminado pelo prazo de retenção, informando a data. **Responder mesmo assim** —
"não existe mais" é uma resposta ao art. 18, I, e a pessoa precisa recebê-la.

**10.3 Conteúdo que pode ser prova de crime** (agressão, furto, lesão).
Remover da plataforma normalmente **e** preservar o arquivo em cofre separado, com acesso restrito ao encarregado,
por 6 meses, informando o solicitante. **[REVISAR COM ADVOGADO]** — há tensão real entre o direito à eliminação
(art. 18, IV) e a preservação de prova (art. 7º, VI / art. 16, I). A preservação deve ser **exceção documentada**,
com prazo definido, e não deve ser oferecida como serviço.

**10.4 Pedido claramente abusivo** (ex.: pessoa que não estava na arena pedindo remoção do acervo inteiro).
Ainda assim, **executar a remoção do que foi indicado** se for escopo pequeno (P1). Recusar apenas escopo amplo,
com resposta fundamentada e registro. Nunca discutir o mérito do pedido com o solicitante.

**10.5 Arena pedindo remoção para "cuidar da imagem" dela** (uma briga na quadra, um jogo vazio).
🔴 **Não é o que o canal é.** A arena é controladora conjunta e pode pedir remoção por risco a titular, mas **não**
para curadoria da própria reputação. Encaminhar ao encarregado, exigir motivo escrito, e registrar. Se virar padrão,
tratar como questão contratual.

**10.6 Pedido por terceiro não identificado** ("meu amigo aparece e não gostou").
Atender (P1) e responder ao solicitante orientando que a própria pessoa pode escrever se quiser mais alguma coisa.

**10.7 Ordem judicial.**
Encaminhar imediatamente ao encarregado e ao advogado. Cumprir no prazo do ofício. **Nunca** ignorar por estar fora
do fluxo padrão. Preservar o material quando a ordem determinar preservação em vez de exclusão.

---

## 11. Modelos de resposta

### 11.1 Confirmação de recebimento (automática)

> **Assunto: Recebemos seu pedido — protocolo #RJ-2026-000123**
>
> Olá,
>
> Recebemos seu pedido de remoção. O protocolo é **#RJ-2026-000123**.
>
> O vídeo sai do ar em até **72 horas úteis** — na maioria das vezes, em algumas horas. Assim que estiver feito,
> avisamos por aqui.
>
> Você não precisa fazer mais nada. Se quiser acrescentar alguma informação, é só responder este e-mail.
>
> Replay já — privacidade@replayja.com.br

### 11.2 Conclusão

> **Assunto: Pronto — vídeo removido (protocolo #RJ-2026-000123)**
>
> Olá,
>
> O vídeo foi removido. Em concreto, isso significa que:
>
> - ele não aparece mais em nenhuma busca no Replay já;
> - os links que davam acesso a ele pararam de funcionar;
> - o arquivo e a imagem de capa foram apagados dos nossos servidores e do cache;
> - a gravação correspondente também foi apagada da nossa cópia local na arena.
>
> **O que não conseguimos fazer:** se alguém baixou o vídeo antes da remoção, aquela cópia está com essa pessoa e
> nós não temos acesso a ela. Pelos nossos registros, **[N] pessoa(s) baixaram este vídeo**.
>
> **Quer que a gente avise essas pessoas** que o vídeo foi removido a pedido de alguém que aparece nele, e peça que
> apaguem a cópia? É só responder "sim". Nós não dizemos quem pediu.
>
> Se o vídeo já estiver publicado em outra plataforma, responda este e-mail que enviamos um texto pronto de
> notificação e os links dos canais de denúncia de cada rede. (Isso é orientação prática, não aconselhamento jurídico.)
>
> Qualquer coisa, é só responder.
>
> Replay já — privacidade@replayja.com.br

### 11.3 Vídeo já expirado

> Olá, verificamos e **o vídeo já havia sido apagado** pelo nosso prazo de retenção: lances ficam disponíveis por
> 90 dias e depois são eliminados automaticamente. Não há mais nada desse período nos nossos sistemas.
> Se houver outro vídeo, é só nos dizer a arena, a quadra e o horário aproximado.

### 11.4 Não localizado

> Olá, não conseguimos localizar o vídeo com as informações que você enviou. Para achar, precisamos de **a arena,
> a quadra e o dia com um horário aproximado** (não precisa ser exato — uma faixa de 30 minutos resolve).
> Se preferir, mande o link do vídeo. Seu protocolo **#RJ-2026-000123** continua aberto e aguardando.

---

## 12. Métricas e teste do processo

### 12.1 Métricas a acompanhar no piloto

| Métrica | Alvo |
|---|---|
| Tempo mediano até sair do ar | **< 2 h** |
| Tempo mediano até a exclusão completa | **< 24 h** |
| % de pedidos dentro do SLA de 72 h | **100%** |
| Pedidos por 1.000 clipes gerados | medir — não temos base. É o termômetro de se a sinalização está funcionando |
| % de pedidos envolvendo menores | **deve ser ~0** se a cláusula 9 do contrato estiver funcionando; qualquer número acima de zero é sinal de alarme |
| Takedowns parciais (alguma camada falhou) | **0** |

### 12.2 Teste obrigatório antes de gravar a primeira partida

Roteiro, com evidência arquivada:

1. Gerar um clipe de teste em quadra vazia.
2. Compartilhar, baixar e **guardar a URL assinada** ainda válida.
3. Enviar pedido pelo formulário público, **de um navegador anônimo, sem login**.
4. Conferir: e-mail de confirmação chegou; protocolo criado.
5. Conferir, uma a uma, as **6 camadas** do §7 — incluindo que a URL assinada guardada no passo 2 **para de funcionar**.
6. Conferir que o thumbnail some da pré-visualização do WhatsApp (mandar o link para si mesmo antes e depois).
7. Conferir o e-mail de conclusão e o registro no log.
8. Cronometrar tudo.

**Enquanto este teste não passar inteiro, a captação não é ativada** (`analise-lgpd.md` §13, item 3).

### 12.3 Reteste

Trimestral, e sempre após mudança em storage, CDN, autenticação de mídia ou no job de retenção.

---

## 13. Fontes

- [LGPD — Lei nº 13.709/2018](https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709.htm) — art. 18, IV e VI; art. 18, § 2º (oposição); art. 19, I e II (prazos); art. 37 (registro das operações); art. 48 (incidentes); art. 50 (boas práticas). Consultada em 12/09/2026
- [Marco Civil da Internet — Lei nº 12.965/2014](https://www.planalto.gov.br/ccivil_03/_ato2011-2014/2014/lei/l12965.htm) — art. 15 (guarda de registros, 6 meses), art. 19 (remoção por ordem judicial, regra geral), **art. 21** (remoção por notificação extrajudicial em cena de nudez/ato sexual). Consultada em 12/09/2026
- [ANPD — Guia Orientativo sobre Legítimo Interesse (fev/2024)](https://www.gov.br/anpd/pt-br/centrais-de-conteudo/materiais-educativos-e-publicacoes/guia_legitimo_interesse.pdf) — garantia efetiva do direito de oposição como salvaguarda do teste de balanceamento
- [ANPD — Mapa de Temas Prioritários 2026–2027 (24/12/2025)](https://www.gov.br/anpd/pt-br/assuntos/noticias/anpd-publica-mapa-de-temas-prioritarios-para-o-bienio-2026-2027-e-atualiza-agenda-regulatoria-2025-2026) — **"direitos dos titulares"** é o primeiro dos quatro temas prioritários de fiscalização do biênio. O atendimento a pedidos de titular é, hoje, o ponto mais provável de fiscalização
- Internas: `docs/legal/analise-lgpd.md` §4, §7 e §13 · `docs/legal/politica-de-privacidade.md` §7 ·
  `docs/legal/termos-de-uso.md` §8 · `docs/legal/sinalizacao-quadra.md` · `docs/legal/contrato-arena-anexo-lgpd.md` cl. 5 ·
  `docs/api/README.md` §3 (takedown em 72 h, `deleted_at`, invalidação de cache) ·
  `docs/adr/0001-stack-e-arquitetura.md` §6.4 (S3 `sa-east-1` + CloudFront) e §4.2 (Neon `aws-sa-east-1`)
