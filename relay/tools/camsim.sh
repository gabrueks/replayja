#!/bin/sh
# Câmera SIMULADA do Replay já — liga/desliga/mostra.
#
# ─── POR QUE ESTE SCRIPT EXISTE ────────────────────────────────────────────
#
# O E2E de 2026-09-12 foi validado sem câmera nenhuma: um `ffmpeg` rodando NA
# PRÓPRIA EC2 empurra `testsrc` para `rtmp://127.0.0.1:<porta>/live/<chave>`, e
# do relay para frente tudo é idêntico ao caminho real. Isso destravou a leva
# inteira — e agora atrapalha, por dois motivos:
#
#  1. **A porta é de uma câmera só.** O gravador é `ffmpeg -listen 1`, que
#     atende UMA conexão (`spec-captura.md` §3.1). Com o simulador conectado, a
#     câmera de verdade bate na porta e é recusada — e o sintoma, de dentro da
#     câmera, é um "falha ao conectar" que não diz por quê. **Desligue o
#     simulador ANTES de apontar a câmera real.**
#  2. **Ele queima crédito de CPU.** A instância é `t4g.medium` com crédito
#     `standard` (`docs/setup-contas.md`). Codificar 720p25 24/7 come baseline
#     que deveria estar sobrando para o `clip-worker`. Por isso `CPUQuota=80%` e
#     `Nice=10` — e por isso ele não deve ficar ligado por esquecimento.
#
# ─── ONDE RODAR ────────────────────────────────────────────────────────────
#
#   DENTRO da instância, como root:
#     aws ssm start-session --region sa-east-1 --target i-04bb3a7f14df569ca
#     sudo /opt/replayja-relay/tools/camsim.sh status
#
#   Do CloudShell, sem abrir sessão: use o `camsim-ssm.sh` (irmão deste).
#
# ─── O QUE É "OS MESMOS PARÂMETROS DE HOJE" ────────────────────────────────
#
# Documentado em `docs/setup-contas.md` §"E2E em produção": unidade transitória
# `replayja-camsim`, `testsrc 1280x720@25`, destino `rtmp://127.0.0.1:<porta>/
# live/<chave>`, `CPUQuota=80%`, `Nice=10`. Esses cinco são fato.
#
# O resto do comando do ffmpeg (codec, GOP, bitrate) **não foi registrado em
# lugar nenhum**. Os valores abaixo são os do `tests/e2e.sh` rebaixados para
# 720p25, e estão em variáveis justamente para não fingirem precisão que não
# têm. `status` imprime a linha de comando da unidade que está no ar: se ela
# divergir do que este script criaria, a diferença aparece ali.
set -eu

UNIDADE="replayja-camsim"
DIR_CONF="${DIR_CONF:-/etc/replayja/rtmp}"
LARGURA_ALTURA="${CAMSIM_SIZE:-1280x720}"
FPS="${CAMSIM_FPS:-25}"
GOP="${CAMSIM_GOP:-50}"          # 2 s a 25 fps, como a spec pede da câmera real
BITRATE="${CAMSIM_BITRATE:-2000k}"
COTA_CPU="${CAMSIM_CPUQUOTA:-80%}"
NICE="${CAMSIM_NICE:-10}"

uso() {
  cat <<'FIM'
uso: camsim.sh start|stop|status   [CAM=<id-da-camera>]

  start   sobe a câmera simulada (unidade transitória replayja-camsim)
  stop    derruba e limpa o estado (stop + reset-failed)
  status  diz se está no ar, com qual comando, e desde quando

Sem CAM=, o script usa a ÚNICA conf de ingest RTMP que existir em
/etc/replayja/rtmp/. Com mais de uma câmera cadastrada, CAM= é obrigatório —
subir o simulador na câmera errada é ocupar a porta de uma câmera de verdade.
FIM
}

# Precisa de root: systemd-run cria unidade de sistema e a conf é 600.
exigir_root() {
  [ "$(id -u)" = "0" ] || { echo "rode como root (sudo)"; exit 2; }
}

# Descobre a conf de ingest da câmera. `record.sh` lê exatamente este arquivo,
# então o simulador fala com a MESMA porta e a MESMA chave que o gravador
# espera — sem nenhum valor copiado à mão, que é como chave RTMP envelhece.
achar_conf() {
  if [ -n "${CAM:-}" ]; then
    echo "$DIR_CONF/$CAM.conf"
    return 0
  fi
  achadas=$(find "$DIR_CONF" -maxdepth 1 -name '*.conf' 2>/dev/null | sort)
  quantas=$(printf '%s\n' "$achadas" | grep -c . || true)
  if [ "$quantas" = "0" ]; then
    echo "nenhuma conf em $DIR_CONF — o sync-cameras ainda não materializou nenhuma câmera" >&2
    exit 1
  fi
  if [ "$quantas" != "1" ]; then
    echo "$quantas câmeras em $DIR_CONF — diga qual:" >&2
    printf '%s\n' "$achadas" | sed 's|.*/||; s|\.conf$||; s|^|  CAM=|' >&2
    exit 2
  fi
  printf '%s\n' "$achadas"
}

acao="${1:-}"
case "$acao" in
  start)
    exigir_root
    conf=$(achar_conf)
    [ -f "$conf" ] || { echo "conf não existe: $conf"; exit 1; }
    cam=$(basename "$conf" .conf)

    if systemctl is-active --quiet "$UNIDADE"; then
      echo "$UNIDADE já está no ar (câmera $cam). Nada a fazer."
      exit 0
    fi

    # shellcheck disable=SC1090  # o caminho é derivado, não literal
    . "$conf"   # PORT, KEY, APP_PATH
    : "${PORT:?porta ausente em $conf}"
    : "${KEY:?chave ausente em $conf}"
    caminho="${APP_PATH:-live}"

    echo "câmera $cam · porta $PORT · destino rtmp://127.0.0.1:$PORT/$caminho/<chave>"
    echo
    echo "⚠️  Se a câmera REAL já estiver apontada para esta porta, o gravador"
    echo "    (ffmpeg -listen 1) atende UMA conexão só: o simulador vai falhar"
    echo "    ao conectar — e isso é o comportamento certo, não um bug daqui."
    echo

    # Unidade TRANSITÓRIA de propósito: ela não sobrevive a um reboot da
    # instância, e não existe arquivo em /etc para alguém esquecer ligado.
    # Um simulador que volta sozinho depois de um reboot é exatamente o modo
    # de falha que este script existe para evitar.
    #
    # `Restart=always` sem StartLimit explícito: o padrão do systemd
    # (5 partidas em 10 s) já para o laço sozinho quando a porta está ocupada
    # pela câmera de verdade — e aí a unidade vai para `failed`, que é
    # justamente o estado que o `stop` daqui limpa com `reset-failed`.
    systemd-run \
      --unit="$UNIDADE" \
      --description="Replay ja — camera SIMULADA (testsrc). Desligar quando a real entrar." \
      --property="CPUQuota=$COTA_CPU" \
      --property="Nice=$NICE" \
      --property=Restart=always \
      --property=RestartSec=2 \
      /usr/bin/ffmpeg -nostdin -hide_banner -loglevel error -re \
        -f lavfi -i "testsrc=size=$LARGURA_ALTURA:rate=$FPS" \
        -c:v libx264 -preset ultrafast -pix_fmt yuv420p \
        -g "$GOP" -b:v "$BITRATE" -maxrate "$BITRATE" -bufsize "$BITRATE" \
        -an -f flv "rtmp://127.0.0.1:$PORT/$caminho/$KEY"

    sleep 3
    if systemctl is-active --quiet "$UNIDADE"; then
      echo "$UNIDADE no ar."
      echo "confira em ~60 s: o painel deve mostrar a quadra gravando."
    else
      echo "$UNIDADE não subiu:"
      journalctl -u "$UNIDADE" -n 30 --no-pager || true
      exit 1
    fi
    ;;

  stop)
    exigir_root
    systemctl stop "$UNIDADE" 2>/dev/null || true
    # `reset-failed` é o passo que todo mundo esquece: sem ele o nome fica
    # preso em estado `failed` e o próximo `systemd-run --unit=` recusa com
    # "Unit replayja-camsim.service already exists" — que parece que o
    # simulador continua no ar quando ele já morreu.
    systemctl reset-failed "$UNIDADE" 2>/dev/null || true
    if systemctl is-active --quiet "$UNIDADE"; then
      echo "ainda ativo — algo recriou a unidade. Investigue:"
      systemctl status "$UNIDADE" --no-pager || true
      exit 1
    fi
    echo "$UNIDADE desligado e limpo."
    echo "a porta RTMP está livre para a câmera de verdade."
    ;;

  status)
    if systemctl is-active --quiet "$UNIDADE"; then
      echo "ATIVO — a câmera simulada está ocupando a porta."
      systemctl show "$UNIDADE" \
        -p ActiveEnterTimestamp -p CPUQuotaPerSecUSec -p Nice --no-pager || true
      echo "comando no ar:"
      systemctl show "$UNIDADE" -p ExecStart --no-pager \
        | tr ';' '\n' | sed -n 's/.*argv\[\]=\(.*\)/  \1/p' || true
      echo
      echo "para apontar a câmera real: sudo $0 stop"
    else
      echo "parado — a porta RTMP está livre."
    fi
    if [ -d "$DIR_CONF" ]; then
      echo
      echo "câmeras com conf de ingest RTMP:"
      find "$DIR_CONF" -maxdepth 1 -name '*.conf' -printf '  %f\n' 2>/dev/null \
        | sed 's/\.conf$//' || true
    fi
    ;;

  ""|-h|--help|help) uso ;;
  *) uso; exit 2 ;;
esac
