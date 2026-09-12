#!/bin/sh
# Teste ponta a ponta do relay, SEM câmera e SEM AWS. Precisa de Linux (ou
# WSL2/container): usa `/dev/shm`, `timeout`, `ffmpeg` e portas locais.
#
#   cd relay && make test-e2e
#   # ou:  sh tests/e2e.sh
#
# O que ele prova, na ordem, e o que cada passo significa:
#
#   1. uma câmera de mentira (`ffmpeg -f lavfi -i testsrc2`) empurra RTMP;
#      o `record.sh` escreve SEGMENTOS fMP4 no disco             → gravação
#   2. o `rec-server` INDEXA esses segmentos e publica `/spans`  → índice
#   3. `/clip?from&to` devolve um MP4 faststart de ~25 s         → corte
#   4. `/thumb?t=` devolve um JPEG                               → miniatura
#   5. um job posto na API de mentira vira clipe COM MARCA D'ÁGUA,
#      validado por ffprobe, subido por PUT pré-assinado e
#      confirmado com sha256 conferido do outro lado             → worker
#   6. `DISK_HIGH` forçado para baixo faz a poda derrubar sessão → poda
#
# NÃO usa systemd: os processos sobem à mão, com o mesmo ambiente que o
# `EnvironmentFile` daria. Por isso o watchdog (que chama `systemctl`) fica
# quieto — ele erra e segue, que é o comportamento desejado.
set -eu

RAIZ=$(cd "$(dirname "$0")/.." && pwd)
BASE=${E2E_BASE:-/tmp/replayja-e2e}
PORTA_RTMP=${E2E_PORTA_RTMP:-19350}
PORTA_API=${E2E_PORTA_API:-8787}
CAM=${E2E_CAM:-quadra1teste}
CHAVE=e2echavedetestelonga
SEGUNDOS=${E2E_SEGUNDOS:-45}

export REC_ROOT="$BASE/rec"
export REC_DB="$BASE/rec.db"
export RELAY_ID=relay-e2e
export RELAY_KEY=chave-de-teste
export RELAY_TOKEN_SECRET=segredo-de-teste
export API_URL="http://127.0.0.1:$PORTA_API/api"
export RECORD_CAMS="$CAM"
export HB_DIR="$BASE/run"
export THUMB_DIR="$BASE/thumb"
export WORKER_WORK_DIR="$BASE/work"
export WORKER_RAW_DIR="$BASE/raw"
export WORKER_WM_CACHE="$BASE/wm"
export WORKER_STATUS="$BASE/run/worker.json"
export WORKER_DONE_FILE="$BASE/jobs-done.json"
export WORKER_WM_DEFAULT="$BASE/watermark-replayja.png"
export WORKER_WM_ASSINATURA="$BASE/watermark-assinatura.png"
export CAMERAS_VERSION_FILE="$BASE/cameras.version"
export RETAIN_HOURS=168
export LIVE_WINDOW_S=1800
export WORKER_POLL_S=1

PIDS=""
limpa() {
  set +e
  for p in $PIDS; do kill "$p" 2>/dev/null; done
  sleep 1
  for p in $PIDS; do kill -9 "$p" 2>/dev/null; done
}
trap limpa EXIT INT TERM

falha() { echo; echo "FALHOU: $*"; exit 1; }
ok()    { echo "  ok — $*"; }

command -v ffmpeg  >/dev/null || falha "ffmpeg nao encontrado"
command -v ffprobe >/dev/null || falha "ffprobe nao encontrado"

rm -rf "$BASE"
mkdir -p "$REC_ROOT" "$HB_DIR" "$BASE/etc/rtmp" "$BASE/work" "$BASE/raw" "$BASE/bucket"

echo "== 0. preparacao"
# Marca d'água de teste: um quadrado vermelho translúcido. Basta para provar
# que o overlay foi aplicado (o clipe com e sem ela têm tamanhos diferentes, e
# o ffprobe do resultado tem de continuar válido).
ffmpeg -hide_banner -loglevel error -y -f lavfi \
  -i "color=c=red@0.9:s=300x120,format=rgba" -frames:v 1 "$BASE/watermark.png"
ok "marca d'agua de teste gerada"

cat >"$BASE/etc/rtmp/$CAM.conf" <<EOF
PORT=$PORTA_RTMP
KEY=$CHAVE
APP_PATH=live
EOF

cat >"$BASE/cams.json" <<EOF
{"version":"v1","cameras":[{"id":"$CAM","partnerId":"00000000-0000-0000-0000-000000000001",
 "courtId":"00000000-0000-0000-0000-000000000002","name":"Quadra de teste",
 "enabled":true,"ingestKind":"rtmp_push",
 "rtmp":{"port":$PORTA_RTMP,"streamKey":"$CHAVE","appPath":"live"},
 "segmentSeconds":2,"originLagMs":0,"retentionDays":7,"minCoverageRatio":0.6}]}
EOF

echo "== 1. subindo API de mentira, rec-server e worker"
python3 "$RAIZ/tests/mock_api.py" --port "$PORTA_API" --cameras "$BASE/cams.json" \
  --out "$BASE/bucket" --marca-parceiro "$BASE/marca-parceiro.png"   >"$BASE/mock.log" 2>&1 &
PIDS="$PIDS $!"
python3 "$RAIZ/rec-server.py" >"$BASE/recserver.log" 2>&1 &
PIDS="$PIDS $!"
python3 "$RAIZ/clip-worker.py" >"$BASE/worker.log" 2>&1 &
PIDS="$PIDS $!"
sleep 2
curl -fsS "http://127.0.0.1:9900/healthz" >/dev/null || falha "rec-server nao subiu"
ok "rec-server, worker e API de mentira no ar"

echo "== 2. gravador + camera de mentira ($SEGUNDOS s)"
# O record.sh acha o conf pelo caminho fixo /etc/replayja/rtmp — na bancada
# apontamos por um link. Se não der para escrever ali, roda o ffmpeg receptor
# direto, com os MESMOS parâmetros do record.sh.
if [ -w /etc ] 2>/dev/null && mkdir -p /etc/replayja/rtmp 2>/dev/null; then
  cp "$BASE/etc/rtmp/$CAM.conf" "/etc/replayja/rtmp/$CAM.conf"
  sh "$RAIZ/record.sh" "$CAM" >"$BASE/record.log" 2>&1 &
  PIDS="$PIDS $!"
  ok "record.sh escutando na porta $PORTA_RTMP"
else
  DIR="$REC_ROOT/$CAM/$(date +%s)-e2e"
  mkdir -p "$DIR"
  ffmpeg -nostdin -hide_banner -loglevel error \
    -listen 1 -f flv -i "rtmp://0.0.0.0:${PORTA_RTMP}/live/${CHAVE}" \
    -c:v copy -an -f hls -hls_time 2 -hls_list_size 0 \
    -hls_segment_type fmp4 -hls_fmp4_init_filename init.mp4 \
    -hls_flags program_date_time+temp_file+independent_segments \
    -hls_segment_filename "${DIR}/%d.m4s" "${DIR}/index.m3u8" \
    >"$BASE/record.log" 2>&1 &
  PIDS="$PIDS $!"
  ok "receptor RTMP direto (sem /etc: rode como root para exercitar o record.sh)"
fi
sleep 2

INICIO_MS=$(( $(date +%s) * 1000 ))
# GOP de 1 s (`-g 30` a 30 fps) — o mesmo que a spec-captura §2.1 pede da
# câmera real, e o que torna os segmentos de 2 s independentes.
ffmpeg -hide_banner -loglevel error -re \
  -f lavfi -i "testsrc2=size=1920x1080:rate=30" \
  -t "$SEGUNDOS" -c:v libx264 -preset ultrafast -g 30 -b:v 3M -pix_fmt yuv420p \
  -f flv "rtmp://127.0.0.1:${PORTA_RTMP}/live/${CHAVE}" \
  >"$BASE/camera.log" 2>&1 || falha "a camera de mentira nao conseguiu empurrar RTMP (log: $BASE/camera.log)"
FIM_MS=$(( $(date +%s) * 1000 ))
ok "${SEGUNDOS}s empurrados por RTMP"
sleep 3

echo "== 3. segmentos e indice"
N=$(find "$REC_ROOT/$CAM" -name '*.m4s' | wc -l)
[ "$N" -ge 10 ] || falha "so $N segmentos no disco (esperado >= 10)"
ok "$N segmentos fMP4 escritos"

SPANS=$(curl -fsS -H "x-relay-key: $RELAY_KEY" \
  "http://127.0.0.1:9900/spans/$CAM?from=$INICIO_MS&to=$FIM_MS")
echo "$SPANS" | grep -q '"coverage"' || falha "/spans sem cobertura: $SPANS"
COB=$(echo "$SPANS" | python3 -c 'import json,sys; print(json.load(sys.stdin)["coverage"])')
ok "/spans responde · cobertura da janela = $COB"

echo "== 4. /clip devolve MP4 faststart de 22-25 s"
DE=$(( FIM_MS - 27000 ))
ATE=$(( FIM_MS - 2000 ))
curl -fsS -D "$BASE/clip.headers" -o "$BASE/clip.mp4" \
  -H "x-relay-key: $RELAY_KEY" \
  "http://127.0.0.1:9900/clip/$CAM?from=$DE&to=$ATE" || falha "/clip falhou"
DUR=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$BASE/clip.mp4")
python3 -c "import sys; d=float('$DUR'); sys.exit(0 if 22.0 <= d <= 25.6 else 1)" \
  || falha "/clip devolveu ${DUR}s (esperado 22-25)"
# `+faststart` põe o `moov` na frente. É literalmente o que faz o vídeo abrir
# no WhatsApp — e o teste disso é procurar o átomo nos primeiros bytes.
head -c 64 "$BASE/clip.mp4" | grep -aq moov || falha "MP4 sem faststart (moov nao esta no inicio)"
grep -qi 'X-Coverage-Ratio' "$BASE/clip.headers" || falha "/clip sem X-Coverage-Ratio"
grep -qi 'X-Window-Start-Ms' "$BASE/clip.headers" || falha "/clip sem X-Window-Start-Ms"
ok "/clip: ${DUR}s, faststart, com os cabecalhos de cobertura e de keyframe"

echo "== 5. /thumb"
T=$(( FIM_MS - 5000 ))
curl -fsS -o "$BASE/t.jpg" -H "x-relay-key: $RELAY_KEY" \
  "http://127.0.0.1:9900/thumb/$CAM?t=$T" || falha "/thumb falhou"
file "$BASE/t.jpg" 2>/dev/null | grep -qi jpeg || \
  ffprobe -v error -show_entries stream=codec_name -of csv=p=0 "$BASE/t.jpg" | grep -q mjpeg \
  || falha "/thumb nao devolveu JPEG"
# HEAD nunca pode disparar ffmpeg — a sonda do app é um HEAD.
curl -fsS -I -H "x-relay-key: $RELAY_KEY" \
  "http://127.0.0.1:9900/thumb/$CAM?t=$(( FIM_MS - 9000 ))" | grep -q '200' \
  || falha "HEAD /thumb nao respondeu 200"
ok "/thumb serve JPEG e responde HEAD sem gerar imagem"

echo "== 6. worker: job -> clipe com marca d'agua -> upload -> confirm"
D_FROM=$(python3 -c "import datetime;print(datetime.datetime.fromtimestamp($FIM_MS/1000-27,datetime.timezone.utc).isoformat(timespec='milliseconds').replace('+00:00','Z'))")
D_TO=$(python3 -c "import datetime;print(datetime.datetime.fromtimestamp($FIM_MS/1000-2,datetime.timezone.utc).isoformat(timespec='milliseconds').replace('+00:00','Z'))")
C_FROM=$(python3 -c "import datetime;print(datetime.datetime.fromtimestamp($FIM_MS/1000-35,datetime.timezone.utc).isoformat(timespec='milliseconds').replace('+00:00','Z'))")
C_TO=$(python3 -c "import datetime;print(datetime.datetime.fromtimestamp($FIM_MS/1000-1,datetime.timezone.utc).isoformat(timespec='milliseconds').replace('+00:00','Z'))")
cat >"$BASE/job.json" <<EOF
{"jobId":"11111111-1111-1111-1111-111111111111",
 "clipId":"22222222-2222-2222-2222-222222222222",
 "cameraId":"$CAM",
 "cutFrom":"$C_FROM","cutTo":"$C_TO",
 "deliverFrom":"$D_FROM","deliverTo":"$D_TO",
 "watermark":{"kind":"default","version":0,"url":null,
              "position":"bottom-right","opacityPct":85,"widthPct":14},
 "outputs":["watermarked","thumbnail","og"],
 "minCoverageRatio":0.6,"attempt":1}
EOF
curl -fsS -X POST -H 'content-type: application/json' \
  --data @"$BASE/job.json" "http://127.0.0.1:$PORTA_API/_enqueue" >/dev/null

i=0
while [ "$i" -lt 60 ]; do
  if [ -f "$BASE/bucket/22222222-2222-2222-2222-222222222222/watermarked.mp4" ]; then break; fi
  i=$((i+1)); sleep 1
done
CLIPE="$BASE/bucket/22222222-2222-2222-2222-222222222222/watermarked.mp4"
[ -f "$CLIPE" ] || falha "o worker nao entregou o clipe em 60 s (log: $BASE/worker.log)"
DUR2=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$CLIPE")
PIX=$(ffprobe -v error -select_streams v:0 -show_entries stream=pix_fmt -of csv=p=0 "$CLIPE")
LARG=$(ffprobe -v error -select_streams v:0 -show_entries stream=width -of csv=p=0 "$CLIPE")
[ "$PIX" = "yuv420p" ] || falha "pix_fmt $PIX — nao tocaria no iOS"
[ "$LARG" = "1920" ] || falha "largura $LARG (esperado 1920)"
python3 -c "import sys; d=float('$DUR2'); sys.exit(0 if 24.5 <= d <= 25.5 else 1)" \
  || falha "clipe final com ${DUR2}s (esperado ~25)"
head -c 64 "$CLIPE" | grep -aq moov || falha "clipe final sem faststart"
[ -f "$BASE/bucket/22222222-2222-2222-2222-222222222222/thumbnail.jpg" ] \
  || falha "miniatura nao subiu"
[ -f "$BASE/bucket/22222222-2222-2222-2222-222222222222/og.jpg" ] \
  || falha "imagem de Open Graph nao subiu"
grep -q 'CONFIRMADO' "$BASE/mock.log" || falha "a API nao recebeu o confirm"
grep -q 'watermarkApplied' "$BASE/mock.log" 2>/dev/null || true
ok "clipe final: ${DUR2}s, 1920x?, yuv420p, faststart, com marca d'agua"
ok "miniatura + Open Graph subiram e o sha256 conferiu no confirm"

# O bruto FICA em disco (para "estender lance" e para reprocessar quando a
# arena trocar o logo).
[ -f "$BASE/raw/22222222-2222-2222-2222-222222222222.mp4" ] \
  || falha "o recorte bruto nao ficou em disco"
ok "recorte bruto retido para estender/reprocessar"

echo "== 6b. marca do PARCEIRO: baixada por URL, composta com a assinatura"
# O caminho que faltava ate 2026-09-12 e o motivo de todo clipe de producao sair
# com watermark_applied=false. Aqui o job traz `kind: partner` e uma URL (que em
# producao e assinada pelo S3); o worker baixa, cacheia por versao e compoe DUAS
# camadas: a do parceiro no canto configurado e a assinatura no oposto inferior.
cat >"$BASE/job-parceiro.json" <<EOF
{"jobId":"33333333-3333-3333-3333-333333333333",
 "clipId":"44444444-4444-4444-4444-444444444444",
 "cameraId":"$CAM",
 "cutFrom":"$C_FROM","cutTo":"$C_TO",
 "deliverFrom":"$D_FROM","deliverTo":"$D_TO",
 "watermark":{"kind":"partner","version":4,
              "url":"http://127.0.0.1:$PORTA_API/branding/p-teste/watermark.png",
              "position":"bottom-left","opacityPct":85,"widthPct":18},
 "outputs":["watermarked","thumbnail"],
 "minCoverageRatio":0.6,"attempt":1}
EOF
curl -fsS -X POST -H 'content-type: application/json'   --data @"$BASE/job-parceiro.json" "http://127.0.0.1:$PORTA_API/_enqueue" >/dev/null
i=0
while [ "$i" -lt 60 ]; do
  if [ -f "$BASE/bucket/44444444-4444-4444-4444-444444444444/watermarked.mp4" ]; then break; fi
  i=$((i+1)); sleep 1
done
[ -f "$BASE/bucket/44444444-4444-4444-4444-444444444444/watermarked.mp4" ]   || falha "o clipe com marca de parceiro nao saiu (log: $BASE/worker.log)"
grep -q 'marca partner v4' "$BASE/worker.log"   || falha "o worker nao registrou a marca do parceiro (log: $BASE/worker.log)"
# O PNG tem de estar em cache: o proximo clipe do mesmo parceiro NAO pode
# rebaixar. A URL de producao e reassinada a cada claim, entao cachear por URL
# seria o mesmo que nao cachear.
[ "$(find "$BASE/wm" -name '*.png' | wc -l)" -eq 1 ]   || falha "o PNG do parceiro nao entrou no cache local"
ok "marca do parceiro baixada, cacheada por versao e composta com a assinatura"

echo "== 7. idempotencia: o MESMO job de novo nao refaz o trabalho"
curl -fsS -X POST -H 'content-type: application/json' \
  --data @"$BASE/job.json" "http://127.0.0.1:$PORTA_API/_enqueue" >/dev/null
sleep 4
grep -q 'ja feito' "$BASE/worker.log" || falha "o worker refez um job ja confirmado"
ok "job repetido reconhecido (sem re-encode)"

echo "== 8. saude"
sleep 1
python3 "$RAIZ/health-report.py" || falha "health-report falhou"
grep -q 'mock: saude' "$BASE/mock.log" || falha "a API nao recebeu o POST /relay/health"
ok "POST /relay/health aceito com cobertura por camera"

echo "== 9. poda respeita DISK_HIGH"
# Forçar o limiar para baixo faz a poda por ESPAÇO derrubar a sessão mais
# antiga já no primeiro ciclo, independente da retenção — é a regra que impede
# o disco de encher e parar TODAS as câmeras de uma vez.
ANTES=$(find "$REC_ROOT/$CAM" -name '*.m4s' | wc -l)
kill %2 2>/dev/null || true
pkill -f "$RAIZ/rec-server.py" 2>/dev/null || true
sleep 1
DISK_HIGH=0.00001 DISK_LOW=0.000001 timeout 25 python3 "$RAIZ/rec-server.py" \
  >"$BASE/poda.log" 2>&1 || true
grep -q 'prune_disk' "$BASE/poda.log" || falha "a poda por disco nao rodou (log: $BASE/poda.log)"
DEPOIS=$(find "$REC_ROOT/$CAM" -name '*.m4s' 2>/dev/null | wc -l)
[ "$DEPOIS" -lt "$ANTES" ] || falha "a poda nao removeu nada ($ANTES -> $DEPOIS)"
ok "poda por DISK_HIGH removeu sessao ($ANTES -> $DEPOIS segmentos)"

echo
echo "======================================================================"
echo " TUDO PASSOU. Artefatos em $BASE"
echo "   clipe final: $CLIPE"
echo "   logs: mock.log recserver.log worker.log record.log poda.log"
echo "======================================================================"
