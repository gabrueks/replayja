#!/bin/sh
# Liga/desliga/inspeciona a câmera SIMULADA na EC2, sem abrir sessão.
#
# ─── POR QUE ESTE SCRIPT EXISTE ────────────────────────────────────────────
#
# O `camsim.sh` roda DENTRO da instância. Chegar lá é `aws ssm start-session`,
# esperar o shell, lembrar do `sudo` e do caminho — e é justamente no momento
# em que você está no alto de uma escada com a câmera na mão que isso não pode
# levar dois minutos. Este aqui faz o mesmo pelo `send-command`, do CloudShell,
# em uma linha. É o mesmo desenho do `relay/deploy-ssm.sh`.
#
# ─── COMO RODAR (CloudShell da conta do Gabriel, sa-east-1) ────────────────
#
#   sh relay/tools/camsim-ssm.sh status
#   sh relay/tools/camsim-ssm.sh stop      # ANTES de apontar a câmera real
#   sh relay/tools/camsim-ssm.sh start     # para voltar a testar sem câmera
#   CAM=arenavascoq1 sh relay/tools/camsim-ssm.sh start
#
# Não roda desta máquina de desenvolvimento: a CLI da AWS daqui é de outra
# conta (`docs/setup-contas.md` §"Infra do relay aplicada").
set -eu

REGIAO="${AWS_REGION:-sa-east-1}"
INSTANCIA="${RELAY_INSTANCE_ID:-i-04bb3a7f14df569ca}"
REPO="${RELAY_REPO:-https://github.com/gabrueks/replayja.git}"
REF="${REF:-main}"
CLONE="${RELAY_CLONE:-/tmp/replayja}"

ACAO="${1:-status}"
case "$ACAO" in
  start|stop|status) ;;
  *) echo "uso: camsim-ssm.sh start|stop|status   (CAM=<id> opcional)"; exit 2 ;;
esac

command -v aws >/dev/null || { echo "aws CLI ausente — rode no CloudShell"; exit 2; }

# ─── o script que roda DENTRO da instância ─────────────────────────────────
#
# Ele puxa o repo e executa o `tools/camsim.sh` de lá, em vez de carregar uma
# cópia inline: uma cópia inline é um segundo lugar onde os parâmetros da
# câmera simulada podem divergir, e divergir em silêncio.
#
# Escrito em arquivo e mandado por `--parameters file://`, nunca colado inline:
# o Safe Paste do CloudShell pede confirmação em colagem multilinha e a sessão
# cai por inatividade no meio (pegadinha 5 de `docs/setup-contas.md`).
REMOTO=$(mktemp)
cat >"$REMOTO" <<REMOTE_EOF
set -eu
export GIT_TERMINAL_PROMPT=0
if [ -d "$CLONE/.git" ]; then
  git -C "$CLONE" fetch --quiet origin "$REF"
  git -C "$CLONE" reset --hard --quiet "origin/$REF"
else
  rm -rf "$CLONE"
  git clone --quiet --depth 20 --branch "$REF" "$REPO" "$CLONE"
fi
echo "commit: \$(git -C "$CLONE" rev-parse --short HEAD)"
export CAM="${CAM:-}"
sh "$CLONE/relay/tools/camsim.sh" "$ACAO"
REMOTE_EOF

PARAMS=$(mktemp)
python3 - "$REMOTO" >"$PARAMS" <<'PY'
import json, sys
with open(sys.argv[1], encoding="utf8") as f:
    print(json.dumps({"commands": f.read().splitlines()}))
PY

echo "camsim $ACAO em $INSTANCIA ($REGIAO)"
ID=$(aws ssm send-command \
  --region "$REGIAO" \
  --instance-ids "$INSTANCIA" \
  --document-name AWS-RunShellScript \
  --comment "camsim $ACAO" \
  --parameters "file://$PARAMS" \
  --query 'Command.CommandId' --output text)

echo "command: $ID — aguardando…"
aws ssm wait command-executed --region "$REGIAO" --command-id "$ID" \
  --instance-id "$INSTANCIA" 2>/dev/null || true
aws ssm get-command-invocation --region "$REGIAO" --command-id "$ID" \
  --instance-id "$INSTANCIA" \
  --query '{status:Status,saida:StandardOutputContent,erro:StandardErrorContent}' \
  --output text

rm -f "$REMOTO" "$PARAMS"
