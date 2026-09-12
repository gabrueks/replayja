#!/bin/sh
# Gravador 24/7 de UMA câmera do Replay já. Chamado pelo systemd
# (replayja-rec@<camera_id>).
#
# Fork do `record.sh` do relay v2 do Sentinela (produção desde 29/08/2026).
# O que veio junto, o que ficou de fora:
#   - FICOU: o ramo RTMP push (o padrão do piloto — a câmera Intelbras disca
#     pra nós) e o ramo RTSP pull (plano B: câmera na LAN atrás de um PC de
#     borda, e a bancada).
#   - SAIU: a origem Tuya inteira (allocate, portão de preroll, chave AES,
#     catálogo de enlatados, `pump.py`). Nenhuma câmera do Replay já passa por
#     nuvem de terceiro; a Tuya trazia ~400 linhas de tratamento de dialeto
#     que aqui não têm sobre o que operar.
#
# REGRA DE OURO, herdada e não negociável: UMA sessão da origem = UM ffmpeg =
# UM diretório de gravação. Emendar sessões no mesmo ffmpeg (tentado duas
# vezes no Sentinela) sempre termina no mesmo bug: timestamps de sessões
# diferentes embaralham o relógio do muxer e ele PARA DE CORTAR ARQUIVOS EM
# SILÊNCIO — processo vivo, dados entrando, nada saindo. O custo da regra é
# uma descontinuidade por sessão, que a playlist expressa com EXT-X-MAP +
# EXT-X-DISCONTINUITY e que o `/clip` atravessa.
#
# A SAÍDA é idêntica nos dois ramos, e é isso que faz o rec-server, o Caddy, o
# worker de clipe e a API não precisarem saber qual origem alimentou o
# diretório:
#     /srv/rec/<camera_id>/<epoch>-<pid>/{init.mp4, N.m4s, index.m3u8}
#
# Ambiente (de /etc/replayja/rec.env): REC_ROOT. Nada mais — este script não
# fala com a API. Quem fala é o sync-cameras.sh, e o contrato entre os dois é
# um arquivo de conf em disco.
set -u

camera_id="$1"
REC_ROOT="${REC_ROOT:-/srv/rec}"
RTMP_CONF="/etc/replayja/rtmp/${camera_id}.conf"
RTSP_CONF="/etc/replayja/rtsp/${camera_id}.conf"

# Segmento de 2 s: é "pedido, não garantia" — o muxer HLS só fecha em
# keyframe, então quem manda é o GOP configurado NA CÂMERA (spec-captura §2.1
# pede GOP de 1–2 s). Com GOP de 4 s os segmentos sairiam em 4 s e a
# granularidade do índice dobraria; o recorte final continuaria exato, porque
# quem corta ao quadro é o passe de marca d'água do worker.
SEG_SECONDS="${SEG_SECONDS:-2}"

# Teto por sessão. Não é vida útil esperada (uma câmera saudável fica
# conectada por dias): é só o limite que impede um diretório de crescer sem
# fim. Cortar antes não custa nada — a sessão seguinte emenda com uma
# descontinuidade que a playlist já sabe expressar.
SESSION_MAX_S="${SESSION_MAX_S:-21600}"

log() { echo "$*" >&2; }

# ÁUDIO: NUNCA. A VIP 3230 B SL G3 não tem microfone e empurra o FLV com o
# "RTMP Virtual Áudio" (trilha silenciosa) só para o FLV ficar bem-formado —
# ver spec-captura §2.6. Gravar essa trilha seria guardar bytes de silêncio;
# gravar áudio de verdade seria captar conversa de terceiros numa quadra, o
# que abriria uma base legal, um aviso e uma política de retenção que o
# produto hoje não tem. `-an` é decisão de LGPD, não de economia.
# (O Sentinela tem uma allowlist AUDIO_CAMS por causa de câmeras com mic; aqui
# não há caso de uso, e a allowlist seria um pé na porta sem dono.)
AFLAGS="-an"

# Batimento de vida do gravador. O watchdog do rec-server reinicia a unidade
# quando não chega segmento novo há muito tempo — regra certa para o
# travamento clássico (ffmpeg vivo com pipe morto), mas que confundiria
# "travado" com "esperando conexão de propósito". Com o batimento o watchdog
# distingue os dois: no Sentinela, sem ele, eram 6 restarts/h por câmera
# offline, cada um zerando o recuo do backoff.
HB_DIR="${HB_DIR:-/run/replayja}"
HB="${HB_DIR}/${camera_id}.hb"
mkdir -p "$HB_DIR" 2>/dev/null || true
beat() { touch "$HB" 2>/dev/null || true; }
beat

# Conta os segmentos que a sessão deixou. `grep -c` no índice é mais barato
# que `ls | wc` num diretório com milhares de arquivos.
conta_segs() {
  grep -c '\.m4s' "$1/index.m3u8" 2>/dev/null || echo 0
}

# ---------------------------------------------------------------------------
# ORIGEM PUSH (RTMP) — o padrão do piloto.
#
# A câmera conecta em nós. Dispensa port-forward, DDNS e IP fixo, e atravessa
# CGNAT: quem disca é ela. O preço são duas coisas, ambas aceitas na ADR §2:
# um segredo fraco (RTMP é texto claro e sem autenticação) e UMA PORTA POR
# CÂMERA, porque `ffmpeg -listen` atende UMA conexão. Acima de ~24 câmeras por
# relay o caminho é um ingest de verdade (MediaMTX em modo RTMP-only), não
# esticar a faixa de portas.
# ---------------------------------------------------------------------------
if [ -f "$RTMP_CONF" ]; then
  # shellcheck disable=SC1090
  . "$RTMP_CONF"   # PORT, KEY, APP_PATH
  : "${PORT:?porta ausente em $RTMP_CONF}"
  : "${KEY:?chave ausente em $RTMP_CONF}"
  APP_PATH="${APP_PATH:-live}"
  log "modo RTMP: escutando na porta $PORT (app=$APP_PATH)"

  while :; do
    beat
    dir="${REC_ROOT}/${camera_id}/$(date +%s)-$$"
    mkdir -p "$dir"
    log "aguardando conexao RTMP na porta $PORT"

    # `-listen 1` bloqueia até alguém conectar (sem timeout próprio) e devolve
    # quando a câmera desconecta. O teto conta do início da ESPERA, não da
    # conexão — ver SESSION_MAX_S.
    timeout -k 10 "$SESSION_MAX_S" ffmpeg -nostdin -hide_banner -loglevel error \
      -listen 1 -f flv -i "rtmp://0.0.0.0:${PORT}/${APP_PATH}/${KEY}" \
      -c:v copy $AFLAGS \
      -f hls -hls_time "$SEG_SECONDS" -hls_list_size 0 \
      -hls_segment_type fmp4 -hls_fmp4_init_filename init.mp4 \
      -hls_flags program_date_time+temp_file+independent_segments \
      -hls_segment_filename "${dir}/%d.m4s" \
      "${dir}/index.m3u8"
    beat

    segs=$(conta_segs "$dir")
    if [ "$segs" -gt 0 ]; then
      log "sessao RTMP encerrada: $segs segmentos"
    else
      # Conexão que não virou vídeo: scanner de porta, ou a câmera desistindo
      # no meio do handshake. Não é evento de câmera e não polui o diário.
      rm -rf "$dir"
    fi

    # ESPERA FIXA E CURTA (2 s), de propósito. Recuo escalonado aqui viraria
    # negação de serviço de graça: bastaria alguém bater na porta algumas
    # vezes para nos deixar minutos sem escutar, e a câmera real sem conseguir
    # conectar. Não há API paga a proteger deste lado — ficar fora do ar é
    # justamente o que impede a câmera de voltar.
    sleep 2
  done
fi

# ---------------------------------------------------------------------------
# ORIGEM PULL (RTSP) — `ingest_kind = rtsp_pull`.
#
# Existe por dois motivos, e nenhum deles é o piloto: (a) a BANCADA, onde uma
# fonte RTSP local (mediamtx, ou um `ffmpeg -f lavfi` empurrando para ele)
# substitui a câmera; (b) o PLANO B da ADR §9 — arena de uplink ruim que ganhe
# um PC de borda entrega vídeo ao mesmo relay como `rtsp_pull`, sem mudar
# índice, `/clip` nem worker. Ter o campo e o ramo desde o dia 1 custa 30
# linhas; acrescentá-los depois custaria uma migração no caminho crítico de
# uma arena com problema.
#
# A URL contém credencial: o conf é 600 e NUNCA entra em log (o sed abaixo
# mascara antes de imprimir).
# ---------------------------------------------------------------------------
if [ -f "$RTSP_CONF" ]; then
  # shellcheck disable=SC1090
  . "$RTSP_CONF"   # URL
  : "${URL:?URL ausente em $RTSP_CONF}"
  log "modo RTSP: puxando de $(printf '%s' "$URL" | sed -E 's#//[^@]*@#//***@#')"
  fail=0
  while :; do
    beat
    dir="${REC_ROOT}/${camera_id}/$(date +%s)-$$"
    mkdir -p "$dir"
    # TCP: UDP atravessando NAT/porta encaminhada perde pacote e o H.264 vira
    # sopa. `-timeout` em microssegundos para que uma câmera que sumiu não
    # segure o ffmpeg para sempre.
    timeout -k 10 "$SESSION_MAX_S" ffmpeg -nostdin -hide_banner -loglevel error \
      -rtsp_transport tcp -timeout 10000000 -i "$URL" \
      -c:v copy $AFLAGS \
      -f hls -hls_time "$SEG_SECONDS" -hls_list_size 0 \
      -hls_segment_type fmp4 -hls_fmp4_init_filename init.mp4 \
      -hls_flags program_date_time+temp_file+independent_segments \
      -hls_segment_filename "${dir}/%d.m4s" \
      "${dir}/index.m3u8"
    beat

    segs=$(conta_segs "$dir")
    if [ "$segs" -gt 0 ]; then
      log "sessao RTSP encerrada: $segs segmentos"
      fail=0
      sleep 2
    else
      rm -rf "$dir"
      # Câmera fora / porta fechada: recua até 60 s. Ao contrário do push, aqui
      # quem martela somos nós — e martelar um roteador residencial a cada 2 s
      # não ajuda ninguém.
      fail=$((fail + 1))
      log "RTSP sem video (tentativa $fail)"
      case "$fail" in 1) sleep 2 ;; 2) sleep 5 ;; 3) sleep 15 ;; *) sleep 60 ;; esac
    fi
  done
fi

# ---------------------------------------------------------------------------
# Sem conf, sem gravador.
#
# O `sync-cameras.sh` escreve o conf ANTES de ligar a unidade, mas as duas
# coisas são timers independentes e a ordem pode inverter num reboot. Sair com
# erro (e não ficar em laço) deixa o systemd aplicar o RestartSec e tentar de
# novo, e o próximo ciclo do sync conserta. É o mesmo "não é corrida: o ciclo
# seguinte conserta" do cadastro de câmera nova (spec-captura §3.2).
# ---------------------------------------------------------------------------
log "sem conf de ingest para ${camera_id} (esperado $RTMP_CONF ou $RTSP_CONF)"
exit 1
