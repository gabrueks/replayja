#!/bin/sh
# Publica uma alteração do relay NA EC2, via SSM Run Command.
#
# ─── POR QUE ESTE SCRIPT EXISTE ────────────────────────────────────────────
#
# **A máquina não se atualiza sozinha.** Um push em `main` faz a Vercel
# redeployar o app em ~1 min; o relay continua rodando o código do dia em que
# alguém o instalou à mão. Isso é deliberado (o relay tem de sobreviver a um
# deploy quebrado do app — README §"Quem manda em quem"), mas significa que
# toda leva que mexe no worker tem um SEGUNDO passo, humano, que é este.
#
# Ele NÃO é o `setup.sh`: publica os arquivos nomeados, confere o md5 antes e
# depois, e reinicia só a unidade que usa cada um. Ver README §"Subir uma
# alteração" — publicar a pasta inteira já devolveu código velho a produção.
#
# ─── COMO RODAR (CloudShell da conta do Gabriel, sa-east-1) ────────────────
#
#   sh relay/deploy-ssm.sh                       # worker + as duas marcas
#   sh relay/deploy-ssm.sh rec-server.py         # um arquivo específico
#   REF=main sh relay/deploy-ssm.sh              # de outro branch/tag
#
# Não roda desta máquina de desenvolvimento: a CLI da AWS daqui é de outra
# conta (`docs/setup-contas.md` §"Infra do relay aplicada").
set -eu

REGIAO="${AWS_REGION:-sa-east-1}"
INSTANCIA="${RELAY_INSTANCE_ID:-i-04bb3a7f14df569ca}"
REPO="${RELAY_REPO:-https://github.com/gabrueks/replayja.git}"
REF="${REF:-main}"
CLONE="${RELAY_CLONE:-/tmp/replayja}"
DEST="${RELAY_DEST:-/opt/replayja-relay}"

# O que publicar, e o que reiniciar depois. O padrão é a leva da marca d'água.
ARQUIVOS="${*:-clip-worker.py watermark-replayja.png watermark-replayja-assinatura.png}"

command -v aws >/dev/null || { echo "aws CLI ausente — rode no CloudShell"; exit 2; }

# ─── o script que roda DENTRO da instância ─────────────────────────────────
#
# Escrito num arquivo e mandado por `--parameters file://`, não colado inline:
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

SRC="$CLONE/relay"
DEST="$DEST"
REINICIAR=""
for f in $ARQUIVOS; do
  [ -f "\$SRC/\$f" ] || { echo "ERRO: \$f nao existe no repo"; exit 1; }
  # md5 ANTES e DEPOIS: se o destino não bate com o que o último deploy
  # publicou, alguém editou a máquina à mão — e este deploy apagaria isso em
  # silêncio. É a regra do README §"Subir uma alteração".
  antes=\$(md5sum "\$DEST/\$f" 2>/dev/null | cut -c1-8 || true)
  novo=\$(md5sum "\$SRC/\$f" | cut -c1-8)
  echo "  \$f: \${antes:-ausente} -> \$novo"
  if [ -f "\$DEST/\$f" ]; then
    cp -p "\$DEST/\$f" "\$DEST/\$f.bak-\$(date +%Y%m%d-%H%M%S)"
  fi
  case "\$f" in
    *.py) python3 -m py_compile "\$SRC/\$f" || { echo "ERRO: \$f nao compila"; exit 1; } ;;
  esac
  # \`cp\`, nunca \`install\`: o install(1) TRUNCA o destino no lugar e um
  # processo lendo o arquivo veria metade dele.
  cp "\$SRC/\$f" "\$DEST/\$f"
  case "\$f" in
    *.png) chmod 644 "\$DEST/\$f" ;;
    *)     chmod 755 "\$DEST/\$f" ;;
  esac
  case "\$f" in
    clip-worker.py|watermark-*.png) REINICIAR="\$REINICIAR replayja-clip-worker" ;;
    rec-server.py)                  REINICIAR="\$REINICIAR replayja-recserver" ;;
    auth-sidecar.py)                REINICIAR="\$REINICIAR replayja-auth" ;;
    # record.sh NAO entra aqui: cada restart custa 30-90 s de lacuna POR
    # CAMERA na cobertura. Reiniciar a frota e decisao humana, a parte.
  esac
done

for u in \$(printf '%s\n' \$REINICIAR | sort -u); do
  systemctl restart "\$u"
  sleep 2
  systemctl is-active --quiet "\$u" && echo "  \$u ativo" || { journalctl -u "\$u" -n 30 --no-pager; exit 1; }
done
echo "OK"
REMOTE_EOF

PARAMS=$(mktemp)
python3 - "$REMOTO" >"$PARAMS" <<'PY'
import json, sys
with open(sys.argv[1], encoding="utf8") as f:
    print(json.dumps({"commands": f.read().splitlines()}))
PY

echo "publicando em $INSTANCIA ($REGIAO): $ARQUIVOS"
ID=$(aws ssm send-command \
  --region "$REGIAO" \
  --instance-ids "$INSTANCIA" \
  --document-name AWS-RunShellScript \
  --comment "deploy relay $REF" \
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
