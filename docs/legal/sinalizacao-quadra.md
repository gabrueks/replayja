# Sinalização da quadra, aviso no checkout e aviso no primeiro login

> Escrito em 12/09/2026. Documento **operacional**: o que precisa ser impresso, onde colar, o que escrever na tela.
> Marcações **[REVISAR COM ADVOGADO]** onde há risco relevante.
>
> **Por que isto é bloqueante.** A base legal da captação é o **legítimo interesse** (art. 7º, IX, da LGPD).
> No teste de balanceamento do [Guia Orientativo da ANPD (fev/2024)](https://www.gov.br/anpd/pt-br/centrais-de-conteudo/materiais-educativos-e-publicacoes/guia_legitimo_interesse.pdf),
> o item que decide o resultado é a **legítima expectativa do titular** — e a expectativa **só se forma se a pessoa
> for avisada antes**. Sem placa na quadra, o legítimo interesse não se sustenta e o produto fica sem base legal.
> Ver `analise-lgpd.md` §4 e §13 (item 1 do checklist).
>
> **Regra de ouro:** a placa é para ser **lida por quem está entrando na quadra com a bola na mão**, em 4 segundos.
> Tudo que não couber nesses 4 segundos vai para o QR code.

---

## Sumário

1. [Princípio: aviso em duas camadas](#1-princípio-aviso-em-duas-camadas)
2. [Placa da quadra — texto oficial](#2-placa-da-quadra--texto-oficial)
3. [Especificação física da placa](#3-especificação-física-da-placa)
4. [Aviso curto para o checkout de reserva da arena](#4-aviso-curto-para-o-checkout-de-reserva-da-arena)
5. [Aviso de primeiro login no app](#5-aviso-de-primeiro-login-no-app)
6. [O que não fazer (dark patterns)](#6-o-que-não-fazer-dark-patterns)
7. [Verificação antes de ligar a câmera](#7-verificação-antes-de-ligar-a-câmera)
8. [Fontes](#8-fontes)

---

## 1. Princípio: aviso em duas camadas

Adotamos a lógica de **aviso em camadas**, que é o padrão consolidado para videomonitoramento:

- **Camada 1 — a placa.** Curta, grande, legível a 3 metros, na entrada e na área de jogo. Diz **o essencial**:
  que filma, que outros podem compartilhar, quem é responsável, como pedir remoção.
- **Camada 2 — a Política de Privacidade**, alcançada por QR code e por URL curta digitável. Diz o resto.

> Referência metodológica: as *Guidelines 3/2019 on processing of personal data through video devices* do
> European Data Protection Board recomendam exatamente essa estrutura de duas camadas para câmeras
> ([EDPB, versão 2.0, 29/01/2020](https://www.edpb.europa.eu/our-work-tools/our-documents/guidelines/guidelines-32019-processing-personal-data-through-video_en)).
> **Não é norma brasileira** e não vincula a ANPD — é citada como boa prática, e porque a LGPD e o GDPR foram
> reconhecidos como de proteção essencialmente equivalente na Resolução CD/ANPD nº 32, de 26/01/2026.

---

## 2. Placa da quadra — texto oficial

### 2.1 Versão principal (use esta)

```
┌────────────────────────────────────────────────────────┐
│                                                        │
│   [ícone de câmera]                                    │
│                                                        │
│   ESTE ESPAÇO É FILMADO                                │
│                                                        │
│   A quadra é gravada durante o horário de              │
│   funcionamento. Lances de até 22 segundos podem       │
│   ser vistos, baixados e compartilhados por outras     │
│   pessoas com conta no Replay já.                      │
│                                                        │
│   Não usamos reconhecimento facial.                    │
│                                                        │
│   ┌────────────┐   PARA PEDIR A REMOÇÃO DE UM VÍDEO    │
│   │            │   em que você aparece, ou saber mais: │
│   │  QR CODE   │                                       │
│   │            │   replayja.com.br/remover             │
│   └────────────┘   privacidade@replayja.com.br         │
│                                                        │
│   Não precisa ter conta, nem explicar o motivo.        │
│   Tiramos do ar em até 72 horas.                       │
│                                                        │
│   Responsáveis: [NOME DA ARENA] e Replay já            │
│   [RAZÃO SOCIAL] · CNPJ [•]                            │
│                                                        │
└────────────────────────────────────────────────────────┘
```

**Texto corrido, para o arquivo de arte:**

> **ESTE ESPAÇO É FILMADO**
>
> A quadra é gravada durante o horário de funcionamento. Lances de até 22 segundos podem ser vistos, baixados e
> compartilhados por outras pessoas com conta no Replay já.
>
> Não usamos reconhecimento facial.
>
> **Para pedir a remoção de um vídeo em que você aparece, ou saber mais:**
> **replayja.com.br/remover** · privacidade@replayja.com.br
> Não precisa ter conta, nem explicar o motivo. Tiramos do ar em até 72 horas.
>
> Responsáveis pelo tratamento: [NOME DA ARENA] e Replay já — [RAZÃO SOCIAL], CNPJ [•].

### 2.2 Por que cada frase está aí

| Frase | Por quê |
|---|---|
| "Este espaço é filmado" | Núcleo do aviso. Verbo no presente, sem eufemismo |
| "durante o horário de funcionamento" | Informa que é **contínuo**, não só quando alguém aperta o botão. Sem isso, o aviso esconde a gravação de 12 h/dia — que é o ponto mais sensível do produto |
| "podem ser **vistos, baixados e compartilhados por outras pessoas**" | 🔴 **A frase mais importante da placa.** É o que separa "tem câmera aqui" (o que todo mundo já espera) de "um estranho pode postar seu vídeo no Instagram" (o que ninguém espera). É ela que forma a legítima expectativa |
| "com conta no Replay já" | Informa que há login e que não é a internet aberta |
| "Não usamos reconhecimento facial" | Reduz o medo real das pessoas, e é verdade. Se um dia deixar de ser, **a placa muda no mesmo dia** |
| Canal de remoção **antes** do nome da empresa | O direito vem antes da formalidade |
| "Não precisa ter conta, nem explicar o motivo" | Elimina a fricção que faria o direito não ser exercido |
| "em até 72 horas" | Compromisso verificável. Só escreva prazo que o `fluxo-remocao.md` cumpre |
| Os dois responsáveis nomeados | Controladoria conjunta (art. 9º, LGPD): o titular precisa saber a quem recorrer |

### 2.3 Placa adicional para quadra com uso infantil

Quando houver escolinha, aula infantil ou categoria de base na quadra, **acrescentar um adesivo abaixo da placa
principal**:

> **CRIANÇAS E ADOLESCENTES**
> A gravação fica **desligada** nos horários de escolinha e aulas infantis.
> Se mesmo assim seu filho ou filha aparecer em um vídeo, peça a remoção em **replayja.com.br/remover** —
> atendemos em **24 horas**, sem nenhuma exigência.

### 2.4 Versão mínima (só para pilar estreito / poste)

Quando não houver superfície para a placa completa, usar uma tarja adicional **sem substituir** a placa principal,
que precisa existir em pelo menos um ponto da quadra:

> **ESTE ESPAÇO É FILMADO** — lances podem ser compartilhados por outros jogadores.
> Remoção: **replayja.com.br/remover** · [QR]

---

## 3. Especificação física da placa

| Item | Especificação |
|---|---|
| **Dimensão mínima** | **30 × 20 cm** para a placa completa. Para quadra grande (society/campo) ou visada a mais de 5 m, usar **40 × 30 cm** |
| **Altura do centro da placa** | **1,40 m a 1,80 m** do solo — altura dos olhos |
| **Posição — obrigatória** | (a) **Na entrada da quadra**, no ponto por onde o atleta passa; (b) **na área de jogo**, visível de dentro da quadra (alambrado, poste de refletor, parede lateral) |
| **Posição — recomendada** | (c) na **recepção** da arena, uma placa consolidada listando as quadras filmadas |
| **Quantidade** | **No mínimo 2 por quadra coberta** (entrada + área de jogo). Quadra com dois acessos: uma por acesso |
| **Corpo de texto** | Mínimo **14 pt** na placa de 30 × 20 cm; título em **caixa alta, mínimo 36 pt**. Regra prática: o título deve ser legível a **3 metros** |
| **Contraste** | Mínimo **4.5:1** entre texto e fundo. Preferência: fundo claro, texto escuro. Nada de texto sobre foto |
| **QR code** | Mínimo **3 × 3 cm**, com margem branca ("quiet zone") de 4 módulos. **Testar com 3 celulares diferentes, um deles antigo, antes de imprimir o lote** |
| **URL digitável** | Sempre ao lado do QR. Muita gente não escaneia — e o QR sujo de terra não lê |
| **Material** | PVC expandido 3 mm ou ACM, impressão UV; ou adesivo vinílico com laminação. **Resistente a sol, chuva e bola** |
| **Fixação** | Parafuso/rebite em superfície rígida; abraçadeira em alambrado. **Não usar fita dupla-face em área externa** |
| **Iluminação** | Precisa ser legível **à noite**, que é o horário de pico da pelada. Instalar dentro do alcance da iluminação da quadra ou usar material com boa reflexão |
| **Versionamento** | Rodapé com `v1 · MM/AAAA` em corpo 8 pt, para saber qual versão está instalada quando o texto mudar |

**Quem fornece:** o Replay já, no kit, sem custo (já prometido em `proposta-piloto.md` §6).
**Quem instala e mantém:** a arena (cláusula 4 do `contrato-arena-anexo-lgpd.md`).
**Evidência obrigatória:** **fotografia datada de cada placa instalada**, arquivada, **antes** de ativar a câmera
daquela quadra.

> **[REVISAR COM ADVOGADO]** Não há norma brasileira que fixe dimensão, altura ou tipografia mínima para aviso de
> videomonitoramento — os números acima são boa prática, calibrados por legibilidade, não por exigência legal.
> Verificar se o município da arena piloto tem **lei local** sobre sinalização de câmeras em estabelecimento aberto
> ao público (existem leis municipais e estaduais esparsas sobre o tema).

---

## 4. Aviso curto para o checkout de reserva da arena

Para o fluxo de reserva da arena (site, app de agendamento, WhatsApp, comprovante). Precisa caber em uma linha e
meia e ser **exibido antes de confirmar**, não depois.

### 4.1 Versão para tela de confirmação

> 📹 **As quadras desta arena são filmadas.** Os lances podem ser vistos e compartilhados por outros jogadores no
> Replay já. Para saber mais ou pedir a remoção de um vídeo: **replayja.com.br/remover**.

### 4.2 Versão de uma linha (WhatsApp, SMS, rodapé de comprovante)

> Quadras filmadas — lances podem ser compartilhados por outros jogadores. Saiba mais e peça remoção:
> replayja.com.br/remover

### 4.3 Versão para o regulamento interno da arena

> **Captação de imagens.** As quadras são filmadas durante o horário de funcionamento por sistema operado pelo
> Replay já em conjunto com a [ARENA]. Trechos de até 22 segundos ("lances") podem ser acessados, baixados e
> compartilhados por usuários cadastrados na plataforma. A gravação contínua é mantida por 7 dias e acessível
> apenas à administração da arena. Não há reconhecimento facial nem identificação de pessoas. Qualquer pessoa pode
> solicitar a remoção de vídeo em que apareça, sem justificativa e sem cadastro, em replayja.com.br/remover ou
> privacidade@replayja.com.br, com atendimento em até 72 horas úteis (24 horas quando envolver menor de idade).
> Nos horários de escolinha e atividades infantis, a gravação permanece desligada.

**Onde exibir, em ordem de importância:** (1) tela de confirmação da reserva; (2) regulamento interno;
(3) comprovante/confirmação por mensagem; (4) mensagem de boas-vindas ao grupo de WhatsApp da turma.

---

## 5. Aviso de primeiro login no app

Aparece **uma vez**, na primeira entrada de cada usuário, **depois** do login e **antes** da primeira busca.

### 5.1 Tela

```
────────────────────────────────────────────

  Antes de você começar

  Três coisas que a gente prefere dizer agora,
  e não esconder num contrato.


  📹  As quadras das arenas parceiras são filmadas
      durante o horário de funcionamento.

  👥  Qualquer pessoa com conta aqui pode encontrar
      os lances de uma quadra sabendo o horário —
      inclusive lances em que você aparece.
      A gente não sabe quem está em qual vídeo:
      não usamos reconhecimento facial.

  📲  Quem baixa um vídeo pode postar onde quiser.
      Se isso acontecer, essa cópia sai do nosso
      controle e não conseguimos apagá-la.


  Você pode pedir a remoção de qualquer vídeo em que
  apareça, sem explicar o motivo, em replayja.com.br/remover.
  Tiramos do ar em até 72 horas.

  Lances ficam 90 dias no ar. Depois, são apagados.

  Leia a Política de Privacidade →   Leia os Termos de Uso →


            [  Entendi, quero começar  ]

────────────────────────────────────────────
```

### 5.2 Regras de implementação

| Regra | Motivo |
|---|---|
| **Um único botão**, com rótulo neutro ("Entendi, quero começar") | Não há escolha a tomar aqui: é **informação**, não consentimento. Fingir que é consentimento seria pior — criaria a impressão de que dá para "não aceitar" e ainda usar |
| **Não é caixa de consentimento e não deve parecer uma** | A base legal é legítimo interesse (art. 7º, IX), não consentimento (art. 7º, I). Ver `analise-lgpd.md` §3 |
| Links de Política e Termos **abrem**, não baixam, e mantêm o estado da tela | Fricção zero para quem quer ler |
| Registrar `notice_version` e `notice_accepted_at` no perfil | Prova de cumprimento do art. 9º. Quando o texto mudar, a tela volta |
| Marketing por e-mail é **opt-in separado**, em outra tela, **desmarcado** | Consentimento (art. 7º, I) tem que ser específico e destacado |
| Tela **rolável** em telas pequenas, com o botão sempre alcançável | Nada de texto cortado |
| Contraste dos links igual ao do corpo do texto | Ver §6 |

### 5.3 Aviso permanente no rodapé de todo clipe

Independentemente da tela de primeiro acesso, **toda página de clipe** exibe, sempre:

> Este vídeo pode ter outras pessoas. Apareceu e não quer? **Peça a remoção** — sem justificativa, em até 72 h.

Este link é o que sustenta o compromisso de takedown da `api/README.md` §3 e o `fluxo-remocao.md`.

---

## 6. O que não fazer (dark patterns)

Lista do que está **proibido** no nosso próprio produto. Vale para design, produto e marketing.

| ❌ Não fazer | Por quê |
|---|---|
| Botão "Aceitar tudo" grande e colorido contra "Ver opções" cinza e pequeno | Escolha enviesada por contraste é dark pattern clássico |
| Pré-marcar a caixa de marketing | Consentimento tem que ser inequívoco (art. 5º, XII) |
| Esconder "só o essencial" atrás de dois cliques a mais que "aceitar tudo" | Dificultar o "não" é obstáculo ao direito |
| Escrever "ao continuar você **concorda** em ser filmado" | **Mentira jurídica.** A base é legítimo interesse; ninguém está consentindo. E quem é filmado muitas vezes nem tem conta |
| Pedir a leitura da Política em fonte 10 pt cinza-claro | Transparência é art. 6º, VI — texto ilegível é o contrário dela |
| Colocar o link de remoção só no rodapé da Política | O direito tem que estar onde a pessoa está: na placa, no clipe, no primeiro acesso |
| Exigir conta, CPF, foto do documento ou justificativa para remover um vídeo | Fricção que inviabiliza o direito. Remover por engano é barato; manter indevidamente é caro |
| Usar "seu vídeo", "seus lances" na interface | Cria a impressão falsa de propriedade e de controle sobre um vídeo que tem 15 pessoas |
| Dizer "grupo privado" sem explicar que o vídeo continua acessível | `api/README.md` §3 é explícito: a UI **não** pode sugerir que grupo é ACL |
| Usar contagem regressiva, "última chance", "só hoje" em qualquer tela de privacidade | Pressão temporal em decisão de direitos |

---

## 7. Verificação antes de ligar a câmera

Checklist de campo. Uma linha por quadra, preenchida na instalação, anexada ao Anexo Técnico do contrato.

| # | Item | Como verificar | OK |
|---|---|---|:--:|
| 1 | Placa completa **na entrada** da quadra | Foto, com data e nome da quadra | ☐ |
| 2 | Placa completa **visível da área de jogo** | Foto tirada do centro da quadra, mostrando a placa legível | ☐ |
| 3 | Texto da placa é a **versão vigente** | Conferir `v1 · MM/AAAA` no rodapé | ☐ |
| 4 | QR code funciona | Escanear com 3 celulares, um deles antigo | ☐ |
| 5 | URL `replayja.com.br/remover` **está no ar** e o formulário envia | Teste real, ponta a ponta | ☐ |
| 6 | Placa legível **à noite** | Foto após o pôr do sol, com a iluminação da quadra ligada | ☐ |
| 7 | Adesivo infantil, se a quadra tiver escolinha | Foto | ☐ |
| 8 | Aviso no checkout da arena publicado | Print do fluxo de reserva | ☐ |
| 9 | Regulamento interno atualizado | Foto/PDF | ☐ |
| 10 | Enquadramento da câmera **não** pega vestiário, banheiro, arquibancada, caixa ou via pública | Print do preview da câmera | ☐ |
| 11 | Horários de escolinha configurados e bloqueio testado | Print da agenda no painel | ☐ |
| 12 | Política e Termos publicados com data de vigência | URLs no ar | ☐ |

> 🔴 **Regra operacional: nenhum item em branco liga câmera.** Os itens 1, 2, 5 e 12 são os que, se faltarem,
> tiram a base legal do tratamento — não é burocracia de instalação, é a condição de legalidade da gravação.

---

## 8. Fontes

- [LGPD — Lei nº 13.709/2018](https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709.htm) — art. 6º, VI (transparência), art. 7º, IX (legítimo interesse), art. 9º (informação ao titular), art. 18 (direitos). Consultada em 12/09/2026
- [ANPD — Guia Orientativo sobre Legítimo Interesse (fev/2024)](https://www.gov.br/anpd/pt-br/centrais-de-conteudo/materiais-educativos-e-publicacoes/guia_legitimo_interesse.pdf) — teste em três fases; **legítima expectativa** do titular como critério de balanceamento; necessidade de salvaguardas e de canal de oposição. Consultado em 12/09/2026
- [ANPD — Transferência Internacional de Dados / Resolução CD/ANPD nº 32, de 26/01/2026](https://www.gov.br/anpd/pt-br/assuntos/assuntos-internacionais/transferencia-internacional-de-dados) — equivalência essencial entre LGPD e GDPR reconhecida na decisão de adequação recíproca. Consultada em 12/09/2026
- [EDPB — Guidelines 3/2019 on processing of personal data through video devices, v2.0, 29/01/2020](https://www.edpb.europa.eu/our-work-tools/our-documents/guidelines/guidelines-32019-processing-personal-data-through-video_en) — modelo de **aviso em camadas** para câmeras. **Norma europeia, citada como boa prática; não vincula no Brasil**
- [ANPD — Mapa de Temas Prioritários 2026–2027 (24/12/2025)](https://www.gov.br/anpd/pt-br/assuntos/noticias/anpd-publica-mapa-de-temas-prioritarios-para-o-bienio-2026-2027-e-atualiza-agenda-regulatoria-2025-2026) — **direitos dos titulares** e **crianças e adolescentes** entre os quatro temas prioritários de fiscalização
- Internas: `docs/legal/analise-lgpd.md` §4 e §13 · `docs/legal/fluxo-remocao.md` · `docs/legal/contrato-arena-anexo-lgpd.md` cl. 4 e 9 · `docs/api/README.md` §3 · `docs/gtm/proposta-piloto.md` §6
