# Capturas da revisão de UX — 2026-09-13

**Não há PNG nesta pasta, e isso é de propósito.** A revisão foi feita com o
navegador do MCP, que devolve a imagem para o revisor mas **não exporta arquivo
para o disco** — e inventar um "print" que não saiu do produto seria pior que não
ter print nenhum.

O que está aqui no lugar é melhor para quem vai consertar: **como reproduzir cada
achado em menos de trinta segundos**, com a medida exata que prova o problema. Os
números do relatório (`../revisao-2026-09-13.md`) saíram todos daqui.

As capturas do visual v2 que existem no repositório continuam em
`web/docs/capturas/v2/` — inclusive as quatro telas do painel em 390 e 1280, que
foram usadas nesta revisão (achados P2-24 a P2-26).

---

## Como reproduzir

Abra o Chrome, ative a emulação de **390 × 844** (DevTools → Toggle device
toolbar → Responsive → 390 × 844) e cole o trecho no Console. Onde o achado
depende de estar **deslogado**, use uma janela anônima.

### P0-1 · O CTA fixo cobre o fim da página (arena e sessão, deslogado)

`https://replayja.com.br/arena-vasco` e
`https://replayja.com.br/arena-vasco/s/2026-09-12-18h-19h`, **anônimo**, 390 × 844:

```js
scrollTo(0, 1e5);
const cta = document.querySelector('[class*=CtaFixo]').getBoundingClientRect();
const m = document.querySelector('main');
console.log('padding-bottom do main:', getComputedStyle(m).paddingBottom);   // 28px — devia ser 116px
console.log('topo do CTA:', Math.round(cta.top));                            // 729
console.log([...m.querySelectorAll('a,button,p,h2')]
  .filter(e => !e.closest('[class*=CtaFixo]'))
  .filter(e => e.getBoundingClientRect().bottom > cta.top + 2)
  .map(e => e.tagName + ': ' + e.innerText.slice(0, 40)));
```

Saída medida em 2026-09-13 na sessão: `A: WhatsApp | bottom=765`,
`P: Quem abrir o link vê que a pelada existe… | bottom=816`. Ou seja: a barra de
compartilhar inteira fica debaixo do CTA, com a página rolada até o fim.

### P0-2 e P0-3 · Data americana e o AM/PM cortado na busca

`https://replayja.com.br/app/buscar?arena=arena-vasco`, **logado**, 390 × 844,
com o Chrome em locale `en-US` (o padrão de qualquer perfil não configurado):

```js
console.table([...document.querySelectorAll('input')].map(i => ({
  tipo: i.type, valor: i.value,
  fonte: getComputedStyle(i).fontFamily.split(',')[0],
  tamanho: getComputedStyle(i).fontSize,
  largura: Math.round(i.getBoundingClientRect().width),
})));
```

Saída medida: `date` → `2026-09-13` renderizado como **09/13/2026**;
`time` (Início) → **16px Archivo**, mostra `07:17 AM`;
`time` (Fim) → **24px Bricolage Grotesque**, mesma largura de 112px, mostra
`07:47` — **o AM/PM não cabe e some sem aviso**.

### P0-4 · 404 cru

`https://replayja.com.br/pagina-que-nao-existe` — fundo preto, texto em inglês
(“This page could not be found.”), sem marca e sem link de volta. O
`theme-color` continua `#F6F3EF` enquanto a página é preta, e o link “Pular para
o conteúdo” do layout aponta para um `#conteudo` que não existe nessa página.

### P1-6 · “A câmera da todas as quadras estava lá”

`https://replayja.com.br/app/buscar?arena=arena-vasco`, quadra **Todas**, atalho
**Acabei de jogar**, tocar na lupa numa janela sem lance. O texto do estado
vazio sai com o artigo colado no nome do filtro.

### P1-13 · “3 na pelada” e “3 pessoas” na mesma tela

`https://replayja.com.br/arena-vasco/fut-de-segunda`, logado como membro:

```js
console.log([...document.querySelectorAll('*')]
  .filter(e => !e.children.length && /na pelada|pessoas?$/.test(e.textContent.trim()))
  .map(e => e.textContent.trim()));
// ["3 na pelada", "3 pessoas"]
```

### P1-10 · Horário em UTC no editar

`https://replayja.com.br/arena-vasco/fut-de-segunda/editar` — “Última mudança
13 de set., **10:45**” e “vale até 27 de set., **10:36**” enquanto o relógio da
arena marcava 07:45. Três horas à frente: é UTC.

### P1-15 · A emenda do botão virtual

`https://replayja.com.br/app/botao?arena=arena-vasco&quadra=quadra-1`:

```js
console.log({
  themeColor: document.querySelector('meta[name=theme-color]').content, // #0F1419
  body: getComputedStyle(document.body).backgroundColor,                // rgb(246,243,239)
  topoDoEscuro: document.querySelector('main').getBoundingClientRect().top, // 62
});
```

### Contraste (o que está bom)

Rodado em `/`, `/entrar`, `/arena-vasco`, `/app`, `/app/buscar`: **zero pares
abaixo de AA**. O script está em `../revisao-2026-09-13.md`, seção “O que foi
medido e passou”.
