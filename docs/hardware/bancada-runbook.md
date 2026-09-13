# Bancada do Replay já — roteiro completo

> **Para quem é:** para você, sozinho, com o kit em cima da mesa. Não precisa
> saber programar. Onde aparecer um comando, ele é para copiar e colar inteiro.
> **Tempo:** meio dia para montar e configurar; os testes T4 e T5 comem mais
> **1 h 20** de espera (dá para fazer outra coisa enquanto roda).
>
> **O que esta bancada prova:** que a câmera que escolhemos empurra vídeo para o
> nosso relay sozinha, que o clipe sai certo, que ela **volta sozinha depois de
> uma queda de internet**, e que o botão físico aperta e vira lance. Enquanto
> isso não estiver provado, não se compra kit de arena.
>
> Kit: `kit-bancada.md` · Câmera: `pesquisa-cameras.md` · Botão:
> `pesquisa-botao.md` e `tasmota-botao.md` · Parâmetros: `spec-captura.md`

---

## Sumário

1. [Antes de começar](#1-antes-de-começar)
2. [Desembalar e ligar](#2-desembalar-e-ligar)
3. [Primeiro acesso à câmera](#3-primeiro-acesso-à-câmera)
4. [Atualizar o firmware](#4-atualizar-o-firmware)
5. [Configurar a câmera](#5-configurar-a-câmera-a-parte-que-decide-a-qualidade)
6. [Onde pegar o servidor e a chave](#6-onde-pegar-o-servidor-e-a-chave)
7. [Desligar a câmera simulada](#7-desligar-a-câmera-simulada-obrigatório)
8. [Apontar a câmera para o relay](#8-apontar-a-câmera-para-o-relay)
9. [Testes de aceite T1–T7](#9-testes-de-aceite)
10. [Tabela de resultados](#10-tabela-de-resultados)
11. [Kit aprovado para a arena?](#11-kit-aprovado-para-a-arena)
12. [O que este roteiro não conseguiu confirmar](#12-o-que-este-roteiro-não-conseguiu-confirmar)

---

## 1. Antes de começar

**O que precisa estar na mesa:**

- [ ] Câmera **Intelbras VIP 3230 B SL G3** (confira no corpo da câmera: tem de
      dizer **SL G3**. A "VIP 3230" sem SL G3 é outro produto e **não serve**)
- [ ] microSD de alta resistência (Samsung PRO Endurance ou SanDisk High Endurance)
- [ ] Injetor PoE 802.3af/at
- [ ] 2 cabos de rede (um do roteador ao injetor, outro do injetor à câmera)
- [ ] Notebook com Windows, no **mesmo roteador**
- [ ] Celular com o app do Replay já aberto e logado como admin da arena de teste
- [ ] Uma bola (sim, de verdade — o teste T3 é com bola em movimento)
- [ ] Um refletor ou lâmpada forte, para simular quadra à noite

**O que precisa estar aberto no notebook:**

- [ ] O painel: **https://replayja.com.br/painel** → sua arena de teste
- [ ] O CloudShell da AWS (console AWS → ícone `>_` no topo → região
      **São Paulo / sa-east-1**). É de onde você desliga a câmera simulada.

> **Antes de subir a câmera:** o microSD entra **com a câmera desligada**. O slot
> fica sob a tampa de borracha na traseira/lateral do corpo. Cartão inserido com
> a câmera ligada às vezes não é reconhecido até um reboot — e você vai achar que
> o cartão veio com defeito.

---

## 2. Desembalar e ligar

- [ ] **2.1** Encaixe o microSD na câmera (câmera **sem energia**).
- [ ] **2.2** Ligue o **injetor PoE** na tomada.
- [ ] **2.3** Cabo do **roteador** → porta **`LAN` / `DATA IN`** do injetor.
- [ ] **2.4** Cabo do injetor, porta **`PoE` / `P+D OUT`**, → **câmera**.

> ⚠️ **As duas portas do injetor não são iguais.** Se inverter, a câmera não
> liga (não queima, mas não liga). Se nada acontecer em 1 min, inverta os dois
> cabos antes de suspeitar da câmera.

- [ ] **2.5** Espere **60–90 s**. A câmera dá um "clique" (é o filtro de IR
      entrando e saindo — sinal de que ela inicializou).
- [ ] **2.6** Confirme que o LED do injetor indicando PoE acendeu.

**Se não ligar:**
| Sintoma | Provável causa |
|---|---|
| Nenhum LED no injetor | tomada / fonte do injetor |
| LED de dados sim, PoE não | cabos invertidos (§2.3/2.4) |
| Injetor ok, câmera muda | cabo ruim — troque pelo outro patch cord |

---

## 3. Primeiro acesso à câmera

A câmera **não tem senha de fábrica**: ela pede que você **crie** uma no
primeiro acesso. Isso é bom (é o que a Anatel/boas práticas exigem hoje) e é
diferente das câmeras antigas.

- [ ] **3.1** Baixe o **IP Utility Next** (Intelbras → Ajuda e Downloads →
      "Software para câmeras IP"). É o programinha que **encontra a câmera na
      rede** e mostra o IP dela. Instale e abra.
- [ ] **3.2** Clique em **Buscar / Pesquisar**. A câmera aparece na lista com
      modelo, IP e MAC.
- [ ] **3.3** Anote o IP que apareceu: `________________`

> **Se a câmera não aparecer na lista:** ela está em `192.168.1.108` (o IP de
> fábrica, usado quando não há DHCP). Nesse caso, ou você a liga num roteador
> que dê IP automático, ou coloca o notebook na faixa `192.168.1.x` para
> alcançá-la. O IP Utility Next também permite mudar o IP dela em lote.

- [ ] **3.4** Abra o navegador em `http://<IP-da-câmera>`.
- [ ] **3.5** A tela de **inicialização** pede uma senha nova. Crie uma senha
      forte e **guarde no seu cofre de senhas**. Usuário: `admin`.
- [ ] **3.6** Cadastre um **e-mail de recuperação** quando ela pedir. Vale a
      pena: sem ele, senha esquecida = reset físico.
- [ ] **3.7** Marque as perguntas de segurança se ela oferecer.

> ⚠️ **Cinco tentativas erradas de senha e a câmera bloqueia sozinha.** Se isso
> acontecer, espere (ou reinicie tirando o cabo PoE) antes de tentar de novo.

- [ ] **3.8** Entrou? Anote a **versão de firmware** que ela mostra
      (normalmente em *Informação → Versão*): `________________`

---

## 4. Atualizar o firmware

**Por que isto não é opcional:** o manual do RTMP da VIP 3230 SL G3 é de
**07/2022** e a build mais recente publicada é **`Firmware_VIP_3230_SL_G3_17-06-24.zip`**
(17/06/2024). Firmware de CFTV muda comportamento de protocolo entre versões, e
**não se faz atualização em massa de câmera instalada em poste**. A regra é:
sobe o firmware agora, **anota a versão exata**, e **congela essa versão** no
kit da arena.

- [ ] **4.1** No site da Intelbras, página do produto **VIP 3230 B SL G3** →
      aba **Downloads** → baixe o arquivo de firmware
      (`Firmware_VIP_3230_SL_G3_<data>.zip`, data ≥ **17-06-24**).
- [ ] **4.2** **Descompacte o .zip.** Dentro há um arquivo **`.bin`** — é ele que
      a câmera pede.
- [ ] **4.3** Na interface web da câmera, procure o menu de atualização. Nas
      versões atuais da linha VIP ele fica em **Configurações → Ajustes →
      Atualização**; em versões um pouco mais antigas o mesmo item aparece como
      **Configurar → Sistema → Atualizar**. É a tela que tem um botão
      **"Abrir"/"Procurar"** e um **"Atualizar"**.
- [ ] **4.4** Selecione o `.bin` e confirme.
- [ ] **4.5** **NÃO feche a aba, não desligue, não tire o cabo.** Leva de 2 a 5
      min e a câmera reinicia sozinha.
- [ ] **4.6** Depois que voltar: aplique o **padrão de fábrica**
      (**Ajustes → Padrão → Padrão de fábrica**). A própria Intelbras manda
      fazer isso: configuração antiga com firmware novo é a receita de
      comportamento inexplicável. Você vai reconfigurar tudo no §5 mesmo.
- [ ] **4.7** Refaça o §3.5 (criar senha) e anote a versão nova:
      `________________`

> **Se a atualização falhar no meio:** não entre em pânico. Tire o PoE, espere
> 30 s, religue. A VIP mantém a partição anterior. Se voltar na versão velha,
> tente de novo com o navegador **Edge/Chrome** e o antivírus desligado — já
> houve caso de upload interrompido por inspeção de arquivo.

---

## 5. Configurar a câmera (a parte que decide a qualidade)

> **Leia isto antes:** todos os valores abaixo vêm de `spec-captura.md` §2 e
> foram escolhidos por um motivo escrito lá. Se você mudar um, anote qual e por
> quê — a tabela do §10 tem coluna para isso. Os nomes de menu podem variar uma
> palavra entre versões de firmware; **procure pelo campo, não pela frase
> exata**. A árvore da VIP G3 é a padrão da linha: um menu **Configurar** com
> **Câmera**, **Rede**, **Armazenamento**, **Sistema**, **Informação**.

### 5.1 Vídeo — *Configurar → Câmera → Vídeo → Stream principal*

- [ ] Tipo de compressão: **H.264** — não H.264B, não H.265
- [ ] **Compressão inteligente / Smart Codec: DESLIGADA**
- [ ] Perfil: **Main**
- [ ] Resolução: **1920 × 1080**
- [ ] Taxa de quadros (FPS): **30**
- [ ] Tipo de taxa de bits: **CBR**
- [ ] Taxa de bits: **3072 kbps**
- [ ] **Intervalo do frame I: 30** (na bancada usamos 1 s para ver se ela aceita;
      o padrão de arena é 60)
- [ ] Marca d'água da câmera: **desligada** (a nossa marca é aplicada na nuvem)
- [ ] **Stream extra**: pode deixar habilitado em 640×360/15 fps — serve para
      olhar a câmera pela LAN sem brigar com o push. **Não** empurre o extra.

> **Por que H.264 e não H.265:** o RTMP clássico, que é o protocolo que a câmera
> fala com o nosso relay, **não transporta H.265**. Se você marcar H.265, o push
> simplesmente não conecta e nada no erro diz por quê.
>
> **Por que desligar a compressão inteligente:** ela mexe no bitrate sozinha, e
> o alarme de "bitrate anormal" do painel deixa de significar qualquer coisa.

### 5.2 Imagem — *Configurar → Câmera → Condições*

- [ ] **Exposição → Modo: Manual**
- [ ] **Obturador: 1/250 s** ← **o ajuste mais importante da lista**
- [ ] Ganho: **automático**, teto **60–80**
- [ ] Antiflicker: **60 Hz** (ou *Exterior*, se a bancada for perto de janela)
- [ ] **Dia & Noite: Colorido (fixo)** — não "Automático"
- [ ] **IR / Iluminador: Desligado**
- [ ] Compensação de luz: **desligada** na bancada (WDR só em quadra descoberta)
- [ ] Foco: **travado manualmente** depois de apontar

> **O obturador, em português claro:** no automático, quando escurece, a câmera
> deixa o "olho" aberto por mais tempo para clarear a imagem — e a bola, que
> anda 22 metros por segundo, vira um risco borrado. Travando em 1/250 s a
> imagem fica um pouco mais escura **e a bola fica nítida**. É essa a troca, e
> ela é a razão de termos escolhido uma câmera profissional em vez de uma Wi-Fi
> de R$ 300. O teste **T3** existe só para provar isso.
>
> **O IR, em português claro:** o iluminador infravermelho ilumina 8 metros e
> deixa a imagem em preto e branco. Num campo de 45 m ele cria um clarão perto e
> escuridão longe. Numa quadra com refletor, ele só atrapalha. Desligado.

### 5.3 OSD — *Configurar → Câmera → Vídeo → Sobreposição*

- [ ] Nome do canal: **desligado**
- [ ] **Data/hora sobreposta: veja a caixa abaixo**

> **Aqui a bancada diverge da arena, de propósito.** Em produção a data/hora
> queimada na imagem fica **DESLIGADA** (`spec-captura.md` §2.3): ela é feia no
> Instagram e vira uma mentira permanente se o relógio estiver errado.
>
> **Na bancada, ligue.** O teste **T2** compara o horário queimado na imagem com
> o horário que o clipe diz ter — é a única forma barata de provar que o relógio
> da câmera e o do relay concordam. **Desligue de novo** antes de declarar o kit
> aprovado, e anote na tabela do §10 se deixou ligado ou não.

### 5.4 Data e hora — *Configurar → Sistema → Geral → Data e hora*

- [ ] **NTP: habilitado**
- [ ] Servidor: `a.ntp.br` (reserva: `b.ntp.br`, `pool.ntp.org`)
- [ ] Intervalo de sincronismo: **30 min**
- [ ] Horário de verão: **desligado**
- [ ] **Fuso horário:** leia a caixa abaixo antes de escolher

> ⚠️ **Divergência a decidir e registrar.** A `spec-captura.md` §2.4 (decisão
> D10) manda a câmera ficar em **UTC (GMT+00:00)**, porque o carimbo que o relay
> publica é UTC e todo diagnóstico compara os dois. O roteiro de compra do kit
> falava em **−03:00**.
>
> **Recomendação: use UTC (GMT+00:00)**, para bater com a spec e com o relay.
> A consequência prática é que, no teste T2, o relógio queimado na imagem vai
> aparecer **3 horas à frente** do horário de Brasília — isso é o esperado, não
> é erro. Se você preferir −03:00 para facilitar a leitura na bancada, pode —
> mas **anote na tabela do §10 qual usou**, senão o T2 vai parecer reprovado por
> três horas de diferença.

### 5.5 Rede — *Configurar → Rede*

- [ ] **TCP/IP**: IP **fixo**, ou reserva de DHCP pelo MAC no roteador
- [ ] **UPnP: desligado**
- [ ] **P2P / Nuvem do fabricante: desligado**
- [ ] **SMTP (e-mail): desligado**
- [ ] **HTTPS: ligado**
- [ ] Anote o IP fixo escolhido: `________________`

> **Por que desligar o P2P:** é o serviço que deixa a câmera acessível pela
> nuvem da Intelbras. Numa arena de cliente isso é uma porta que não controlamos
> e que não precisamos.

### 5.6 Cartão SD — *Configurar → Armazenamento*

- [ ] Confirme que o cartão **aparece** e está **Normal** (se aparecer como
      "sem formatação", formate ali mesmo — leva ~1 min)
- [ ] Modo: **Gravação contínua**, stream **principal**, **24/7**
- [ ] **Sobrescrita: habilitada** (quando encher, apaga o mais antigo)
- [ ] Anote a capacidade que ela reconheceu: `________ GB`

> **Para que serve o cartão:** é a **cópia de segurança** de quando a internet da
> arena cai. O vídeo continua sendo gravado dentro da câmera; depois alguém
> recupera à mão. Não é automático, e o teste **T7** existe para você ver com os
> próprios olhos que funciona — e para medir quanto trabalho dá recuperar.

---

## 6. Onde pegar o servidor e a chave

**Estes dois valores nascem no app, não são inventados.**

- [ ] **6.1** No painel: **Painel → Câmeras**. Se a quadra 1 ainda não tem
      câmera, clique em **cadastrar câmera** — o app **sorteia a porta e a
      chave** sozinho.
- [ ] **6.2** Abra a câmera da **quadra 1**. A tela
      (`/painel/cameras/<id>`) mostra, com botão de copiar e um QR:

```
Servidor:  rtmp://stream.replayja.com.br:19350/live
Chave:     <32 caracteres, só desta câmera>
```

- [ ] **6.3** Copie os dois para um bloco de notas. O que a câmera vai receber é
      **os dois emendados com uma barra**:

```
rtmp://stream.replayja.com.br:19350/live/<chave>
```

- [ ] **6.4** Anote a porta que o painel mostrou: `19350` ou `______`

> **Esta é a única tela do produto que mostra a chave.** Ela é o equivalente de
> uma senha da câmera: quem tem a chave consegue empurrar vídeo para a quadra.
> Não mande por WhatsApp de grupo; se vazar, o próprio painel tem **"gerar nova
> chave"** — e aí é preciso redigitar na câmera.

### Por que `stream.replayja.com.br` e **não** o IP `15.229.94.105`

Os dois apontam para o mesmo servidor **hoje**. A diferença aparece no dia em
que o servidor mudar:

| | Se a câmera tiver o **nome** | Se a câmera tiver o **IP** |
|---|---|---|
| Trocamos a máquina do relay | mudamos **um** registro de DNS e todas as câmeras seguem sozinhas | alguém sobe numa escada **em cada quadra de cada arena** para redigitar |
| A AWS nos obriga a trocar de IP | idem | idem |
| Diagnóstico | o nome diz o que é | um número que ninguém reconhece em log nenhum |

O endereço fica **digitado dentro da câmera**, onde mudar custa uma visita
física. Por isso o `stream.` existe separado do `relay-1.`: é o nome cuja única
função é nunca precisar mudar. **Regra: câmera nenhuma recebe IP. Nunca.**

---

## 7. Desligar a câmera simulada (**obrigatório**)

Hoje existe uma **câmera de mentira** rodando dentro do nosso servidor: um
`ffmpeg` empurrando um padrão de barras coloridas para a porta 19350. Foi ela
que provou o caminho inteiro em 12/09 sem hardware nenhum.

**Ela ocupa a porta.** O gravador atende **uma** conexão por porta. Com a
simulada ligada, a câmera de verdade tenta conectar e é recusada — e o erro que
aparece na câmera é um genérico "falha ao conectar" que não explica nada. Você
perderia uma hora nisso.

- [ ] **7.1** Abra o **CloudShell** da AWS (console → ícone `>_` → região
      **sa-east-1**).
- [ ] **7.2** Cole, uma linha por vez:

```bash
git clone --depth 1 https://github.com/gabrueks/replayja.git ~/replayja-deploy
sh ~/replayja-deploy/relay/tools/camsim-ssm.sh status
```

- [ ] **7.3** Se disser **ATIVO**, desligue:

```bash
sh ~/replayja-deploy/relay/tools/camsim-ssm.sh stop
```

- [ ] **7.4** Confirme que agora diz **"parado — a porta RTMP está livre"**.

> **Guarde este comando.** Se um dia você precisar testar o produto sem a câmera
> (para mexer no app, por exemplo), `camsim-ssm.sh start` liga tudo de novo. Mas
> **deixe desligada** enquanto a câmera real estiver na bancada: ela consome
> crédito de CPU da instância, que é o mesmo crédito que o processador de clipes
> usa. Ver `relay/README.md` §"Câmera simulada".

---

## 8. Apontar a câmera para o relay

*Configurar → Rede → RTMP*

- [ ] **8.1** **Habilitar: sim**
- [ ] **8.2** **Tipo de Stream: Principal**
- [ ] **8.3** **Tipo de endereço: Personalizado**
      (o "não personalizado" pede IP + porta em campos separados; o nosso é um
      link, então é o personalizado)
- [ ] **8.4** **Endereço personalizado:** cole o endereço inteiro —
      `rtmp://stream.replayja.com.br:19350/live/<chave>`
- [ ] **8.5** **RTMP Virtual Áudio: LIGADO**
- [ ] **8.6** **Salvar**.

> **Cuidados ao colar:**
> - **Uma barra só** entre `live` e a chave. Duas barras não funcionam.
> - **Sem espaço** no fim (o copiar/colar do Windows adora levar um). O manual
>   diz literalmente que *"o link não deve conter caracteres especiais"*.
> - Se a câmera reclamar de "H.264 necessário", volte ao §5.1: o RTMP só
>   funciona com H.264 habilitado.

> **O que é "RTMP Virtual Áudio":** esta câmera (o modelo bullet) **não tem
> microfone**, e muitos servidores de streaming recusam um vídeo sem trilha de
> áudio. Essa opção manda uma trilha de áudio **vazia e silenciosa**, só para o
> formato ficar completo. Para nós é perfeito: resolve a compatibilidade **e**
> garante que não gravamos conversa de ninguém na quadra — o que nos tira uma
> discussão inteira de LGPD.

- [ ] **8.7** Deixe a câmera apontada para algo com movimento e **espere 2 min**.

---

## 9. Testes de aceite

> Preencha a tabela do §10 conforme for passando. **T5 é bloqueante:** se ele
> reprovar mesmo depois do conserto, o kit não vai para arena nenhuma.

---

### T1 — A câmera aparece "gravando" no painel em menos de 2 min

**O que fazer:** com a câmera já apontada (§8), abra **Painel → Câmeras** e
recarregue a página.

**O que observar:**
- [ ] A quadra 1 aparece como **gravando / online**
- [ ] **Último segmento** com data/hora de agora (atualiza a cada ~1 min)
- [ ] **Bitrate** perto de **3000 kbps**
- [ ] Em 5 min, **cobertura de 1 h** começa a subir

**Anote:** quanto tempo levou do "Salvar" até aparecer: `______ s`

**Se falhar:**

| Sintoma | Causa provável | O que fazer |
|---|---|---|
| Nada aparece, nunca | simulada ainda ligada | refaça o §7 |
| Nada aparece, nunca | chave errada ou com espaço | recopie do painel, §6 |
| Nada aparece, nunca | porta bloqueada na saída da sua internet | teste de outra rede (4G do celular compartilhado) |
| Aparece e some, aparece e some | dois "clientes" disputando a porta | garanta que só a câmera está apontada para ela |
| Aparece com bitrate errado | §5.1 não foi salvo | reabra e confira |

**Teste de porta, se precisar** (do CloudShell):
`nc -vz stream.replayja.com.br 19350`

---

### T2 — Botão virtual → clipe pronto em menos de 60 s

**O que fazer:**
- [ ] Com a câmera gravando, **role a bola na frente dela** e, no meio do
      movimento, aperte o **botão virtual** no app (quadra 1).
- [ ] Anote o horário do relógio de parede no instante do toque: `__:__:__`
- [ ] Cronometre até o clipe aparecer pronto.

**O que observar no clipe:**
- [ ] Ficou pronto em **menos de 60 s** (o E2E de 12/09 deu ~26 s)
- [ ] **Duração entre 22 e 25 s**
- [ ] **Marca d'água do Replay já** visível no canto
- [ ] O lance está **dentro** da janela — o toque do botão cai perto do fim
      (a janela é ~21 s antes e ~4 s depois)
- [ ] **Abre no WhatsApp** (mande para você mesmo e assista)
- [ ] Se você deixou a data/hora queimada ligada (§5.3): o horário na imagem, no
      momento do toque, bate com o horário que você anotou **(lembrando das
      3 horas de diferença se a câmera está em UTC)**

**Anote:** tempo até ficar pronto `______ s` · duração `______ s`

**Se falhar:**

| Sintoma | O que significa | O que fazer |
|---|---|---|
| Clipe sai "parcial" | faltou vídeo na janela | veja a cobertura no painel; se estiver < 0,95, é o T4 falhando junto |
| Clipe sem marca d'água | o relay está com código velho | `sh relay/deploy-ssm.sh` no CloudShell |
| Clipe de 4 s ou vazio | a câmera acabou de conectar e não há 21 s gravados | espere 2 min e repita |
| Horário errado por minutos | NTP não pegou | refaça §5.4 e espere 30 min |
| Horário errado por exatamente 3 h | fuso — está certo | veja a caixa do §5.4 |
| Demora > 60 s | fila do processador ou CPU estrangulada | confirme que a simulada está **desligada** (§7) |

---

### T3 — Qualidade noturna: a bola aparece?

**Este é o teste que decidiu a compra da câmera.** É ele que separa "o atleta
compartilha o vídeo" de "a arena cancela o contrato".

**O que fazer:**
- [ ] Apague as luzes do ambiente, deixe **só o refletor**.
- [ ] Role/chute a bola na frente da câmera, com força.
- [ ] Gere um clipe pelo botão virtual e assista **no celular**, em tela cheia.

**O que observar:**
- [ ] A **bola é visível em movimento** — uma bola, não um risco
- [ ] A imagem está **colorida**, não preto e branco
- [ ] **Não há clarão** branco na frente com escuridão no fundo

**Se falhar:**

| Sintoma | Causa | Conserto |
|---|---|---|
| Bola vira um risco borrado | obturador no automático | §5.2 → Manual, 1/250 s |
| Imagem em preto e branco | Dia&Noite no automático | §5.2 → Colorido (fixo) |
| Clarão na frente, breu no fundo | IR ligado | §5.2 → IR desligado |
| Imagem escura demais com 1/250 | pouca luz mesmo | teste 1/125 s e **anote**; se ainda assim ficar escuro, a conclusão é sobre o **refletor da arena**, não sobre a câmera |
| Imagem granulada | ganho no teto alto | baixe o teto de ganho para 50 |

> **O que este teste responde de verdade:** qual é o **mínimo de iluminação** que
> precisamos exigir da arena no contrato. Anote em que condição a bola ficou boa
> e em qual não ficou — esse é o número que vai para a proposta comercial.

---

### T4 — Upload sustentado por 30 min sem "parcial"

**O que fazer:**
- [ ] Deixe a câmera gravando **30 min sem tocar em nada**.
- [ ] Programe um alarme e vá fazer outra coisa.
- [ ] No fim, gere **3 clipes seguidos** pelo botão virtual.

**O que observar:**
- [ ] Os 3 clipes saem **completos** (não "parcial")
- [ ] **Cobertura de 1 h ≥ 0,98** no painel
- [ ] O painel não registrou nenhum **buraco** (gap) nesses 30 min

**Anote:** cobertura 1 h `______` · clipes parciais `___ de 3`

**Se falhar:**

| Sintoma | O que significa |
|---|---|
| Cobertura ~0,96 com "parcial" | a internet da sua bancada está entregando menos do que 3 Mbps de subida constante — **meça a subida** (fast.com/speedtest) antes de culpar a câmera |
| Buracos em horários redondos | algum outro uso da sua internet (backup, streaming) — repita à noite |
| Buracos aleatórios de 60–70 s | é exatamente o sintoma medido na frota do Sentinela: **queda de uplink**. Se acontecer na sua casa, vai acontecer na arena: é o que justifica o microSD (T7) |

> Se a sua internet de casa não sustentar 3 Mbps de **subida**, baixe para
> **2048 kbps** no §5.1, refaça o T4 e **anote**. O teste não é da câmera, é do
> link — e é a mesma medida que o Spike U faz na arena antes de assinar.

---

### T5 — **BLOQUEANTE** — a câmera reconecta sozinha?

**Por que é bloqueante:** se a câmera não voltar sozinha depois de uma queda de
internet, cada oscilação do provedor da arena deixa a quadra **fora do ar até
alguém ir lá reiniciar a câmera**. Isso não é produto, é chamado técnico. A
pesquisa avisou que câmera RTMP "tipicamente precisa de reinício" — e ninguém
mediu esta em particular. **Você vai medir.**

#### T5a — queda de 2 minutos

- [ ] **Tire o cabo do roteador** (o cabo `LAN` do injetor, §2.3). A câmera
      continua **energizada**, só sem internet. Marque a hora: `__:__:__`
- [ ] Espere **2 min** exatos.
- [ ] Recoloque o cabo. Marque a hora: `__:__:__`
- [ ] Fique olhando o painel. Anote quando voltar a gravar: `__:__:__`

**Aprovado se:** voltou sozinha em **≤ 3 min** depois do cabo de volta.

#### T5b — queda de 15 minutos

- [ ] Mesmo procedimento, **15 min** fora.
- [ ] Anote quanto demorou para voltar: `______ min`

**Aprovado se:** voltou sozinha, sem ninguém tocar na câmera.

#### Se **não** reconectar (em qualquer um dos dois)

Não descarte a câmera ainda. Faça, nesta ordem:

- [ ] **Conserto 1 — reboot agendado.** *Configurar → Sistema → Automanutenção*
      (ou *Ajustes → Manutenção automática*): **Reinício automático, todo dia,
      03:00**. Salve.
- [ ] Refaça **T5a e T5b**. O reboot diário não faz a câmera voltar em 3 min —
      ele **limita o estrago a no máximo 24 h**. Anote isso como o que é: um
      curativo, não uma cura.
- [ ] **Conserto 2 — desligar e religar o PoE.** Tire o cabo PoE da câmera por
      10 s e recoloque. Se ela voltar, confirma que o problema é o cliente RTMP
      preso, e a saída de arena é um **injetor/switch PoE gerenciável** (dá para
      desligar a porta remotamente). Isso **encarece o kit** — registre.
- [ ] **Se nem o reboot agendado resolver:** pare. Escreva o resultado na tabela
      e no `decisoes.md`. A decisão D-10 (a câmera escolhida) **volta para a
      mesa**, e as alternativas estão em `pesquisa-cameras.md` §4 (ponte
      RTSP→RTMP com uma caixinha na arena).

**Anote:** T5a `______` · T5b `______` · precisou de reboot agendado? `sim/não`

---

### T6 — Botão físico

> O passo a passo de flash, pareamento e regra está em **`tasmota-botao.md`**.
> Volte aqui quando o botão já estiver mandando o webhook.

- [ ] **6.1** Siga o `tasmota-botao.md` até o fim (flash do ZBBridge-P,
      pareamento do SNZB-01P, regra `WebQuery`).
- [ ] **6.2** Pegue o **token do botão** no painel: **Painel → Botões** →
      criar botão na quadra 1. **A URL do webhook aparece UMA vez** — copie
      agora, com QR se preferir. Se perder, é só revogar e criar outro.
- [ ] **6.3** A regra aponta para
      `https://replayja.com.br/api/triggers/b/<TOKEN>`.

**O que observar:**
- [ ] Um toque no botão físico → **clipe aparece**, igual ao do botão virtual
- [ ] **20 toques cronometrados**: meça do "clique" audível até o app
      registrar o gatilho. Anote os 20 e tire a **mediana** e o **pior caso**.
- [ ] Respeite o **cooldown de 8 s** entre toques (o segundo toque dentro de
      8 s é recusado de propósito — não é falha)
- [ ] Alcance: teste o botão a **1 m, 10 m e 25 m** da ponte

**Anote:** mediana `______ ms` · pior caso `______ ms` · alcance útil `______ m`

**Se falhar:** tabela de sintomas no `tasmota-botao.md` §7.

---

### T7 — microSD: gravação de emergência

**O que fazer:**
- [ ] Com a câmera gravando normalmente, **tire o cabo do roteador** (como no
      T5a). Marque a hora: `__:__:__`
- [ ] Deixe **5 min** sem internet, com a bola rolando de vez em quando.
- [ ] Recoloque o cabo.
- [ ] Na interface da câmera: **Reprodução / Playback** → escolha a janela
      daqueles 5 min.

**O que observar:**
- [ ] O vídeo **está lá**, gravado no cartão, mesmo com a internet fora
- [ ] Dá para **baixar o trecho** pelo navegador
- [ ] Cronometre: quanto tempo levou para recuperar 1 minuto de vídeo?
      `______ min`
- [ ] Abra o arquivo baixado no computador. Anote a **extensão** (`.dav`?
      `.mp4`?) e se **abriu** no VLC: `________________`

**Por que este teste importa mais do que parece:** o arquivo do cartão sai num
formato do fabricante (`.dav`) e **ninguém validou se o nosso processador abre**.
Se não abrir, a "cópia de segurança" é um arquivo que não serve para nada — e
isso precisa ser descoberto na sua mesa, não num sábado à noite com a arena
cobrando um gol perdido.

**Se falhar:**

| Sintoma | O que fazer |
|---|---|
| Cartão não aparece | formate pela própria câmera (§5.6) |
| Gravou só até a internet cair | o modo não é contínuo — §5.6 |
| Não deixa baixar pelo navegador | tente pelo **Intelbras SIM Next** / player da Intelbras |
| Baixa mas não abre no VLC | é `.dav`: **anote como incerteza confirmada** e leve para o `decisoes.md` |

---

## 10. Tabela de resultados

> Preencha e cole o resultado em `docs/decisoes.md` (seção de pendências).

**Identificação**

| | |
|---|---|
| Data da bancada | |
| Modelo confirmado (SL G3?) | |
| Firmware **antes** | |
| Firmware **depois** (é este que congelamos) | |
| Número de série | |
| Fuso escolhido (UTC ou −03:00) | |
| Data/hora queimada ficou ligada? | |
| Bitrate final (3072 ou outro) | |
| Intervalo de frame I final (30 ou 60) | |
| Obturador final (1/250 ou outro) | |

**Testes**

| # | Teste | Critério | Resultado | Medida | Passou? |
|---|---|---|---|---|---|
| T1 | Aparece gravando no painel | < 2 min | | ____ s | ☐ |
| T2 | Botão virtual → clipe | < 60 s, 22–25 s, com marca | | ____ s / ____ s | ☐ |
| T2b | Horário confere | sem desvio (fora o fuso) | | | ☐ |
| T3 | Bola visível à noite | nítida, colorida, sem clarão | | | ☐ |
| T4 | 30 min sustentados | cobertura ≥ 0,98, 0 parciais | | ____ | ☐ |
| **T5a** | **Reconexão 2 min** | **volta sozinha ≤ 3 min** | | ____ min | ☐ |
| **T5b** | **Reconexão 15 min** | **volta sozinha** | | ____ min | ☐ |
| T5c | Precisou de reboot agendado? | — | | sim/não | — |
| T6 | Botão físico, 20 toques | mediana < 1 s | | ____ ms / ____ ms | ☐ |
| T6b | Alcance do botão | ≥ 25 m | | ____ m | ☐ |
| T7 | microSD grava sem rede | vídeo existe e baixa | | | ☐ |
| T7b | Arquivo do cartão abre | abre no VLC/ffmpeg | | ______ | ☐ |

**Observações livres** (o que te surpreendeu, o que demorou, o que você mudaria):

```
_______________________________________________________________________
_______________________________________________________________________
_______________________________________________________________________
```

---

## 11. Kit aprovado para a arena?

**Aprovado** — pode comprar o kit da arena — se **todas** forem verdade:

- [ ] **T5a e T5b passaram**, com ou sem reboot agendado. *(bloqueante)*
- [ ] T1, T2 e T4 passaram sem conserto criativo.
- [ ] T3 passou **na iluminação que a arena piloto realmente tem** — se você
      testou com um refletor mais forte do que o da quadra, o teste não vale.
- [ ] T7 mostrou vídeo no cartão **e** você conseguiu baixar um trecho.
- [ ] A versão de firmware está anotada e é essa que vai no pedido.

**Aprovado com ressalva** — compra segue, com um item extra no orçamento:

- [ ] T5 só passou **com reboot agendado** → registre que a arena aceita até
      24 h de indisponibilidade no pior caso, e avalie **injetor PoE
      gerenciável** no BOM.
- [ ] T4 só passou baixando o bitrate → o **Spike U** (medir o uplink da arena
      por 48 h) passa a ter **poder de veto de verdade** sobre a arena piloto.
- [ ] T6 falhou, mas T2 passou → **vá para a arena só com o botão virtual**. Ele
      sempre foi o gatilho principal (decisão D-11); o físico é complemento.
- [ ] T7b falhou (arquivo `.dav` não abre) → o microSD vira "existe mas não
      sabemos usar". Abra uma pendência antes de prometer recuperação a cliente.

**Reprovado** — **não compre kit de arena**:

- [ ] **T5 falhou nos dois cenários mesmo com reboot agendado.** A decisão D-10
      reabre. Próximo passo: `pesquisa-cameras.md` §4.1 (ponte RTSP→RTMP).
- [ ] T3 falhou e nenhum ajuste de obturador/ganho salvou. Idem: a escolha da
      câmera reabre.

---

## 12. O que este roteiro não conseguiu confirmar

Escrito aqui para você não achar que é certeza o que é aposta. Confirme **na
bancada** e corrija este documento depois.

| Item | Situação |
|---|---|
| **Nomes exatos dos menus do firmware 17-06-24** | O site da Intelbras (`intelbras.com` e `backend.intelbras.com`) **recusa leitura automatizada** (HTTP 403) — manual e guia de firmware não puderam ser lidos nesta passada. Os caminhos aqui vêm do manual do usuário citado em `pesquisa-cameras.md`, de manuais da mesma linha VIP G3 e de material de apoio da Intelbras. **`Configurar → Rede → RTMP`** e os campos *Tipo de Stream / Tipo de endereço / Endereço personalizado* estão confirmados em manual da linha G3. Os demais caminhos podem ter uma palavra diferente. |
| **Menu de atualização de firmware** | Material da Intelbras mostra **"Configurações → Ajustes → Atualização"** e, depois, **"Ajustes → Padrão → Padrão de fábrica"**; versões anteriores usavam *Configurar → Sistema → Atualizar*. Ambos estão no §4. |
| **Que a build ≥ 17-06-24 continua sendo a mais recente** | Confirme na aba Downloads do produto no dia da bancada. |
| **Reconexão automática após queda de link** | **Desconhecida. É o T5, e é por isso que ele é bloqueante.** |
| **GOP de 30 aceito no push** | O campo "Intervalo do frame I" é ajustável, mas a faixa aceita não foi lida. Se 30 for recusado, use 60 e anote. |
| **"RTMP Virtual Áudio" funciona com o nosso `ffmpeg -f flv`** | Plausível, nunca testado. Se o push não conectar com ele ligado, **desligue e teste de novo** — o relay já aceita vídeo sem áudio. |
| **Formato do arquivo do microSD** | `.dav` (contêiner Dahua) é o esperado. Se o ffmpeg abre, não foi validado. É o T7b. |
| **Homologação Anatel do ZBBridge-P e do SNZB-01P** | Não confirmada por número. Bloqueante para **instalar em cliente com nota fiscal**, não para a bancada. |
| **Parâmetros exatos da câmera simulada de hoje** | Resolução, taxa, `CPUQuota` e `Nice` estão registrados; codec/GOP/bitrate não. O `camsim.sh status` imprime o comando real da unidade no ar — compare se quiser fechar essa lacuna. |

---

## Fontes

- [Intelbras — VIP 3230 B SL G3, página do produto e downloads](https://www.intelbras.com/pt-br/camera-bullet-com-30-metros-de-ir-vip-3230-b-sl-g3) — firmware `Firmware_VIP_3230_SL_G3_17-06-24.zip` (leitura automatizada bloqueada; ver `pesquisa-cameras.md`)
- [Intelbras — Manual do usuário VIP 3230 B SL G3 / D SL G3 (PDF, 07/2022)](https://backend.intelbras.com/sites/default/files/2022-07/manual-do-usuario-vip-3230-b-sl-g3-vip-3230-d-sl-g3-pt.pdf) — seção RTMP e Exposição
- [Intelbras — Manual do usuário VIP 1130/1230 B e D G3 (PDF)](https://backend.intelbras.com/sites/default/files/2022-10/Manual_VIP%201130_1230_BD_G3_02-22.pdf) — **menu `Configurar > Rede`**, campos *Tipo de Stream*, *Tipo de endereço*, *Endereço personalizado*, e a nota de que o RTMP exige **H.264**
- [Intelbras — Guia de atualização de firmware, câmera VIP 3230 (PDF)](https://backend.intelbras.com/sites/default/files/2021-02/Guia_de_atualizacao_Camera_VIP3230_0.pdf) — descompactar o `.zip`, selecionar o `.bin`, aplicar padrão de fábrica depois
- [Intelbras — Manual do IP Utility Next (PDF)](https://backend.intelbras.com/sites/default/files/2021-07/Manual_IP_Utility_Next_01-21_V4.pdf) — descoberta de câmeras na rede, alteração de IP em lote
- [Intelbras — Localizar e configurar câmera IP ponto a ponto (PDF)](https://backend.intelbras.com/sites/default/files/2022-11/cameras-ip-localizar-configurar-ponto-a-ponto.pdf) — IP de fábrica `192.168.1.108`
- Documentos internos: `docs/hardware/pesquisa-cameras.md`, `docs/hardware/spec-captura.md`, `docs/hardware/kit-bancada.md`, `docs/setup-contas.md`, `relay/README.md`
