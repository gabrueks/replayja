#!/bin/sh
# Reconcilia este relay com a lista de câmeras da API do Replay já.
#
# Substitui os DOIS scripts do Sentinela (`sync-cams.sh` + `sync-rtmp.sh`) por
# um só, porque a nossa API entrega tudo numa chamada: `GET /relay/cameras`
# devolve id, porta, chave, tipo de ingestão e se a câmera está ligada. Dois
# timers batendo na mesma origem para dividir um objeto em dois era herança da
# ordem em que as features nasceram lá, não desenho.
#
# O que este script faz, em ordem:
#   1. materializa /etc/replayja/rtmp/<id>.conf (PORT, KEY) e
#      /etc/replayja/rtsp/<id>.conf (URL) — modo 600;
#   2. liga/desliga as unidades `replayja-rec@<id>` para bater com a lista;
#   3. reescreve RECORD_CAMS no rec.env e reinicia o rec-server (que lê essa
#      variável SÓ na subida e é quem calcula cobertura, `expected` e
#      watchdog);
#   4. grava a versão aplicada, que vai no `POST /relay/health`.
#
# ─── GUARDA-CHUVA: O RELAY PREFERE ERRAR PARA MAIS ─────────────────────────
# A API é a fonte da verdade, mas não a ponto de desligar gravador sem
# conferir. Qualquer uma destas condições aborta o ciclo INTEIRO sem mexer em
# nada:
#   - curl falhou (rede, DNS, Vercel fora, 401 por RELAY_KEY errada)
#   - resposta não é JSON válido / não tem `cameras`
#   - lista veio vazia
#   - algum registro fora do formato (id, porta, chave, URL de RTSP)
#   - a lista removeria mais que METADE dos gravadores de uma vez
#
# Sobra é desperdício de disco; falta é LANCE PERDIDO — e no Sentinela três
# câmeras passaram um dia inteiro sem gravar exatamente por uma falha
# silenciosa deste tipo.
#
# ─── E O SYNC NUNCA APAGA CONF ─────────────────────────────────────────────
# Sumir da lista da API desliga o gravador, mas NÃO apaga o segredo daqui: a
# câmera pararia de conectar e a chave nova teria que ser digitada de novo,
# presencialmente, no app dela. Encerrar uma câmera é uma ação explícita —
# `retire-camera.sh`.
#
# sh puro (dash no Ubuntu): nada de process substitution nem arrays.
set -eu

ENV_FILE=${ENV_FILE:-/etc/replayja/rec.env}
CONF_RTMP=/etc/replayja/rtmp
CONF_RTSP=/etc/replayja/rtsp
[ -f "$ENV_FILE" ] || { echo "sync: falta $ENV_FILE"; exit 1; }
# shellcheck disable=SC1090
. "$ENV_FILE"

: "${API_URL:?sync: API_URL ausente no rec.env}"
: "${RELAY_KEY:?sync: RELAY_KEY ausente no rec.env}"
VERSION_FILE="${CAMERAS_VERSION_FILE:-/var/lib/replayja/cameras.version}"
# A faixa que o Security Group abre de fato. Só serve para AVISAR: uma câmera
# com porta fora daqui é válida pelo contrato (openapi aceita 19350–19599) mas
# nunca vai conectar, e o sintoma do lado de fora é um timeout de 8 s que não
# diz nada. No Sentinela isso custou meio dia — só a 19350 estava aberta.
PORTAS_ABERTAS="${RTMP_PORTS_OPEN:-19350-19399}"

log() { echo "sync: $*"; }

TMP=$(mktemp -d)
cleanup() { rm -rf "$TMP"; }
trap cleanup EXIT

mkdir -p "$CONF_RTMP" "$CONF_RTSP" "$(dirname "$VERSION_FILE")"
chmod 700 "$CONF_RTMP" "$CONF_RTSP"

VERSAO_LOCAL=$(cat "$VERSION_FILE" 2>/dev/null || echo "")

# `?since=` permite à API responder 304 quando nada mudou — 1 requisição por
# relay a cada 2 min já é pouco, mas 304 é mais barato dos dois lados.
CODE=$(curl -sS --max-time 20 -o "$TMP/resp" -w '%{http_code}' \
  -H "x-relay-key: ${RELAY_KEY}" \
  "${API_URL}/relay/cameras?since=${VERSAO_LOCAL}" 2>/dev/null) || {
  log "API nao respondeu — ciclo abortado, nada alterado"
  exit 0
}
case "$CODE" in
  304) exit 0 ;;
  200) ;;
  *)
    log "API respondeu $CODE — ciclo abortado, nada alterado"
    exit 0
    ;;
esac

# ─── VALIDAÇÃO ─────────────────────────────────────────────────────────────
# Estes valores viram NOME DE UNIDADE systemd, PORTA DE ESCUTA, CONTEÚDO DE
# ARQUIVO DE SEGREDO e — no caso da URL de RTSP — TEXTO EXECUTADO COMO ROOT
# (o record.sh faz `. "$RTSP_CONF"`). Nada disso pode vir da rede sem filtro.
#
# Sem pipe para outro comando: num pipeline o `$?` é o da ÚLTIMA etapa, e foi
# assim que TODOS os guardas do `sync-cams.sh` do Sentinela viraram letra morta
# por um tempo — uma resposta corrompida chegava como lista vazia e só a trava
# de remoção em massa segurava.
set +e
python3 -c '
import json, re, sys

ID = re.compile(r"^[a-z0-9]{6,32}$")          # openapi: RelayCamera.id
CHAVE = re.compile(r"^[A-Za-z0-9_-]{8,128}$")
APP = re.compile(r"^[A-Za-z0-9_-]{1,32}$")
# A MESMA trava de injeção do Sentinela. O conf de RTSP e SOURCED pelo
# record.sh como root: uma URL com ";", "$(...)", crase, aspas ou espaco
# viraria comando nesta maquina.
URL_OK = re.compile(
    r"^rtsp://[A-Za-z0-9._~%!*+,=:@-]+@?[A-Za-z0-9.-]+(:[0-9]{1,5})?"
    r"(/[A-Za-z0-9._~%!*+,=:@/-]*)?(\?[A-Za-z0-9._~%!*+,=:@/&-]*)?$"
)

try:
    body = json.load(open(sys.argv[1]))
    cams = body["cameras"]
    versao = body.get("version") or ""
except Exception:
    sys.exit(3)
if not isinstance(cams, list) or not cams:
    sys.exit(4)
if not isinstance(versao, str) or len(versao) > 200:
    sys.exit(5)

ligar, confs_rtmp, confs_rtsp = [], [], []
for c in cams:
    if not isinstance(c, dict):
        sys.exit(5)
    i = c.get("id")
    if not isinstance(i, str) or not ID.match(i):
        sys.exit(5)
    kind = c.get("ingestKind")
    if kind not in ("rtmp_push", "rtsp_pull"):
        sys.exit(5)
    if kind == "rtmp_push":
        r = c.get("rtmp") or {}
        p, k = r.get("port"), r.get("streamKey")
        app = r.get("appPath") or "live"
        if not isinstance(p, int) or isinstance(p, bool) or not (19350 <= p <= 19599):
            sys.exit(5)
        if not isinstance(k, str) or not CHAVE.match(k):
            sys.exit(5)
        if not isinstance(app, str) or not APP.match(app):
            sys.exit(5)
        confs_rtmp.append("%s %d %s %s" % (i, p, k, app))
    else:
        u = c.get("rtspUrl")
        mau = (not isinstance(u, str)) or len(u) > 500 or chr(39) in u
        if mau or not URL_OK.match(u):
            sys.exit(5)
        confs_rtsp.append("%s %s" % (i, u))
    # Camera desligada ganha conf (o segredo continua valendo) mas NAO ganha
    # gravador: e o mesmo "sem destino nao ha gravador" do Sentinela.
    if c.get("enabled") is True:
        ligar.append(i)

if not ligar:
    sys.exit(4)

# Porta repetida entre cameras seria uma calada: a segunda escuta morre com
# "address already in use" e o gravador entra em laco.
portas = [l.split()[1] for l in confs_rtmp]
if len(set(portas)) != len(portas):
    sys.exit(7)

open(sys.argv[2], "w").write("".join(l + "\n" for l in sorted(ligar)))
open(sys.argv[3], "w").write("".join(l + "\n" for l in confs_rtmp))
open(sys.argv[4], "w").write("".join(l + "\n" for l in confs_rtsp))
open(sys.argv[5], "w").write(versao)
' "$TMP/resp" "$TMP/desired" "$TMP/rtmp" "$TMP/rtsp" "$TMP/versao"
rc=$?
set -e
if [ "$rc" -ne 0 ]; then
  case "$rc" in
    3) log "resposta da API nao e JSON valido — ciclo abortado" ;;
    4) log "API devolveu lista vazia (ou nenhuma camera ligada) — ciclo abortado, nada desligado" ;;
    5) log "API devolveu registro fora do formato — ciclo abortado" ;;
    7) log "duas cameras na mesma porta — ciclo abortado" ;;
    *) log "falha ao ler a resposta da API — ciclo abortado" ;;
  esac
  exit 0
fi

# ─── 1. CONFS DE INGEST ────────────────────────────────────────────────────
# Antes dos gravadores, de propósito: o `record.sh` escolhe o ramo (RTMP/RTSP)
# no ARRANQUE, então uma câmera cujo conf ainda não existisse subiria sem conf
# e sairia com erro até o próximo tique.
mudou_conf=0

while read -r id port key app; do
  [ -n "${id:-}" ] || continue
  conf="$CONF_RTMP/$id.conf"

  # Porta já é de OUTRA câmera neste disco? Pode acontecer com conf antiga de
  # uma câmera que saiu da lista (e cuja conf nós, de propósito, não apagamos).
  dono=$(grep -l "^PORT=$port\$" "$CONF_RTMP"/*.conf 2>/dev/null | grep -v "/$id.conf\$" | head -1 || true)
  if [ -n "$dono" ]; then
    log "porta $port ainda e de $(basename "$dono" .conf) — $id NAO configurada"
    continue
  fi

  case "$PORTAS_ABERTAS" in
    *-*)
      pmin=${PORTAS_ABERTAS%-*}; pmax=${PORTAS_ABERTAS#*-}
      if [ "$port" -lt "$pmin" ] || [ "$port" -gt "$pmax" ]; then
        log "AVISO: porta $port de $id esta FORA da faixa aberta ($PORTAS_ABERTAS) — a camera nunca vai conectar"
      fi
      ;;
  esac

  cat >"$TMP/novo" <<EOF
# Camera RTMP provisionada pela API do Replay ja.
# Escrita por sync-cameras.sh — editar a mao nao adianta, o proximo ciclo desfaz.
PORT=$port
KEY=$key
APP_PATH=$app
EOF

  if [ -f "$conf" ] && cmp -s "$TMP/novo" "$conf"; then
    rm -f "$TMP/novo"
    continue
  fi
  novo_arquivo=no
  [ -f "$conf" ] || novo_arquivo=sim
  # Escrita atômica com chmod ANTES do rename: sem isso existe uma janela em
  # que o segredo está no lugar final legível por todo mundo.
  chmod 600 "$TMP/novo"
  mv "$TMP/novo" "$conf"
  mudou_conf=1
  log "conf RTMP $([ "$novo_arquivo" = sim ] && echo criada || echo atualizada): $id (porta $port)"
  # Gravador que já roda não enxerga o conf novo sozinho (o ramo é escolhido no
  # arranque). Reiniciar só o que está ATIVO — o que ainda não foi ligado vai
  # ler o conf certo quando subir.
  if systemctl is-active --quiet "replayja-rec@${id}"; then
    systemctl restart "replayja-rec@${id}" &&
      log "gravador reiniciado com o conf novo: $id" ||
      log "FALHOU ao reiniciar $id"
  fi
done <"$TMP/rtmp"

while read -r id url; do
  [ -n "${id:-}" ] || continue
  conf="$CONF_RTSP/$id.conf"
  # A URL entre ASPAS SIMPLES: este arquivo é executado pelo record.sh como
  # root, e o conf inteiro é segredo do cliente (a senha da câmera dele).
  cat >"$TMP/novo" <<EOF
# Camera RTSP provisionada pela API do Replay ja.
# Escrita por sync-cameras.sh — editar a mao nao adianta, o proximo ciclo desfaz.
URL='$url'
EOF
  if [ -f "$conf" ] && cmp -s "$TMP/novo" "$conf"; then
    rm -f "$TMP/novo"
    continue
  fi
  novo_arquivo=no
  [ -f "$conf" ] || novo_arquivo=sim
  chmod 600 "$TMP/novo"
  mv "$TMP/novo" "$conf"
  mudou_conf=1
  log "conf RTSP $([ "$novo_arquivo" = sim ] && echo criada || echo atualizada): $id"
  if systemctl is-active --quiet "replayja-rec@${id}"; then
    systemctl restart "replayja-rec@${id}" >/dev/null 2>&1 || log "FALHOU ao reiniciar $id"
  fi
done <"$TMP/rtsp"

# ─── 2. GRAVADORES ─────────────────────────────────────────────────────────
# Estado atual = unidades HABILITADAS (o que sobrevive a reboot). Não uso o
# RECORD_CAMS do rec.env como verdade porque ele pode ter sido editado à mão e
# ficado fora de sincronia com o systemd.
find /etc/systemd/system/multi-user.target.wants -maxdepth 1 \
  -name 'replayja-rec@*.service' -printf '%f\n' 2>/dev/null |
  sed -e 's/^replayja-rec@//' -e 's/\.service$//' | sort >"$TMP/current" || : >"$TMP/current"
[ -f "$TMP/current" ] || : >"$TMP/current"

# Linhas de um arquivo que não estão no outro. Arquivo de padrões vazio faz o
# grep não casar nada, então o -v devolve tudo — que é o certo nos dois casos.
grep -Fxv -f "$TMP/current" "$TMP/desired" >"$TMP/add" || true
grep -Fxv -f "$TMP/desired" "$TMP/current" >"$TMP/remove" || true

n_add=$(wc -l <"$TMP/add")
n_remove=$(wc -l <"$TMP/remove")
n_current=$(wc -l <"$TMP/current")

if [ "$n_remove" -gt 0 ] && [ "$n_current" -gt 0 ] &&
   [ $((n_remove * 2)) -gt "$n_current" ]; then
  log "recusando desligar ${n_remove} de ${n_current} gravadores de uma vez —"
  log "cheira a lista truncada. Rode a mao se a remocao for real mesmo."
  exit 0
fi

while read -r cam; do
  [ -n "$cam" ] || continue
  if systemctl enable --now "replayja-rec@${cam}" >/dev/null 2>&1; then
    log "gravador LIGADO: ${cam}"
  else
    log "FALHOU ao ligar ${cam}"
  fi
done <"$TMP/add"

while read -r cam; do
  [ -n "$cam" ] || continue
  # A conf FICA. Só a unidade sai.
  if systemctl disable --now "replayja-rec@${cam}" >/dev/null 2>&1; then
    log "gravador desligado: ${cam} (conf preservada)"
  else
    log "FALHOU ao desligar ${cam}"
  fi
done <"$TMP/remove"

# ─── 3. RECORD_CAMS + rec-server ───────────────────────────────────────────
NEW_CAMS=$(tr '\n' ' ' <"$TMP/desired" | sed 's/ *$//')
ATUAL_CAMS=$(printf '%s' "${RECORD_CAMS:-}" | tr -s ' ' | sed 's/^ *//; s/ *$//')

if [ "$NEW_CAMS" != "$ATUAL_CAMS" ] || [ "$n_add" -gt 0 ] || [ "$n_remove" -gt 0 ]; then
  export NEW_CAMS ENV_FILE
  python3 - <<'PY'
import os
path, value = os.environ["ENV_FILE"], os.environ["NEW_CAMS"]
with open(path) as f:
    linhas = f.read().splitlines()
saida, achou = [], False
for l in linhas:
    if l.startswith("RECORD_CAMS="):
        saida.append('RECORD_CAMS="%s"' % value)
        achou = True
    else:
        saida.append(l)
if not achou:
    saida.append('RECORD_CAMS="%s"' % value)
tmp = path + ".tmp"
with open(tmp, "w") as f:
    f.write("\n".join(saida) + "\n")
os.chmod(tmp, 0o600)
os.replace(tmp, path)
PY
  # Sem reiniciar, os gravadores novos gravariam sem aparecer em lugar nenhum
  # do painel: o rec-server lê RECORD_CAMS uma vez, na subida, e é dele que
  # saem cobertura, `expected` e watchdog.
  systemctl restart replayja-recserver
  log "rec.env atualizado e rec-server reiniciado ($(wc -l <"$TMP/desired") cameras)"
fi

# ─── 4. VERSÃO APLICADA ────────────────────────────────────────────────────
# Vai no `POST /relay/health`; quando diverge da do servidor, o próprio
# relatório de saúde acorda este script sem esperar o tique.
cp "$TMP/versao" "$VERSION_FILE"

[ "$mudou_conf" = 1 ] && log "confs de ingest atualizadas"
exit 0
