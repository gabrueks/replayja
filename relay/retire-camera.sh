#!/bin/sh
# Encerra uma câmera DE VERDADE: desliga o gravador, apaga a conf de ingest e
# remove a gravação do disco E do índice.
#
# ─── POR QUE ISTO É UM SCRIPT À MÃO E NÃO PARTE DO SYNC ────────────────────
# Porque sumir da lista da API é INDISTINGUÍVEL de uma leitura truncada, e
# apagar o segredo por engano é irreversível do lado de quem instalou: a
# câmera para de conectar e a chave nova tem de ser digitada de novo,
# presencialmente, no app dela, em cima de um poste. O `sync-cameras.sh`
# desliga o gravador quando a câmera sai da lista, mas NUNCA apaga conf.
#
# Encerrar é uma decisão humana, e ela é IRREVERSÍVEL: a gravação some.
#
#   sudo /opt/replayja-relay/retire-camera.sh <camera_id>
set -eu

CAM="${1:-}"
ENV_FILE=${ENV_FILE:-/etc/replayja/rec.env}
case "$CAM" in
  '' ) echo "uso: retire-camera.sh <camera_id>"; exit 2 ;;
esac
# O id vira CAMINHO QUE SERÁ APAGADO. Mesmo formato que o resto do sistema
# exige (openapi: RelayCamera.id).
printf '%s' "$CAM" | grep -Eq '^[a-z0-9]{6,32}$' || {
  echo "id fora do formato ([a-z0-9]{6,32}): $CAM"; exit 2
}
[ -f "$ENV_FILE" ] || { echo "falta $ENV_FILE"; exit 1; }
# shellcheck disable=SC1090
. "$ENV_FILE"
REC_ROOT_DIR="${REC_ROOT:-/srv/rec}"

printf 'Encerrar a camera %s? A gravacao dela sera APAGADA. [digite ENCERRAR] ' "$CAM"
read -r resposta
[ "$resposta" = "ENCERRAR" ] || { echo "abortado"; exit 1; }

# O gravador sai PRIMEIRO: com ele vivo, o ffmpeg continuaria escutando a porta
# e podia escrever um segmento novo depois de apagarmos a gravação.
systemctl disable --now "replayja-rec@${CAM}" >/dev/null 2>&1 || true
echo "gravador desligado"

rm -f "/etc/replayja/rtmp/${CAM}.conf" "/etc/replayja/rtsp/${CAM}.conf"
echo "confs de ingest apagadas"

# Disco E índice num pedido só. Um `rm -rf` aqui deixaria o índice anunciando
# câmera que não existe mais, e o /stats serviria playlist para arquivos que
# sumiram.
if [ -d "$REC_ROOT_DIR/$CAM" ]; then
  if curl -sS --max-time 60 -X POST -H "x-relay-key: ${RELAY_KEY}" \
      "http://127.0.0.1:9900/cam/${CAM}/forget"; then
    echo "gravacao apagada (disco + indice)"
  else
    echo "AVISO: o rec-server nao apagou a gravacao. Rode de novo, ou pare o"
    echo "servico e limpe a mao — NAO use rm -rf sem limpar o indice."
    exit 1
  fi
fi

echo
echo "Feito. Lembre de:"
echo "  1. marcar a camera como encerrada no painel (senao o sync a religa)"
echo "  2. liberar a porta no Security Group, se ela era a ultima da faixa"
