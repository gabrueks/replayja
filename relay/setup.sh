#!/bin/sh
# Provisiona o relay do Replay já numa máquina nova.
#
# ALVO: Ubuntu 24.04 LTS **arm64** (Graviton), EC2 `t4g.medium` em `sa-east-1`
# com modo de crédito `standard` (ADR §9, rev. 3).
#
# Por que arm64 funciona sem asterisco nenhum aqui: tudo que este relay roda
# vem do `apt` do Ubuntu e tem pacote `arm64` oficial — `ffmpeg` (com libx264),
# `python3` 3.12, `sqlite3`, `caddy` (o repositório do Caddy publica arm64) e
# `lvm2`. NÃO HÁ nenhuma dependência Python fora da biblioteca padrão, nenhuma
# roda nativa compilada, nenhum binário baixado de fora do apt. Foi por isso
# que o detector (torch/ultralytics, ~1,6 GB de wheels) ficou de fora do fork:
# ele é a única coisa do relay v2 que teria feito o arm64 doer.
#
# PRÉ-REQUISITOS (nesta ordem):
#   1. arquivos do repo copiados para /tmp/relay  (scp -r relay/ ...)
#   2. /etc/replayja/rec.env já escrito           (ver rec.env.example)
#   3. o volume st1 anexado                       (ver a seção LVM abaixo)
#
# Idempotente: rodar de novo só atualiza binários/configs e recarrega.
#
# ⚠️ NÃO rode isto para publicar UM arquivo. Ver README §"Subir uma alteração".
set -eu

DEST=/opt/replayja-relay
SRC=${SRC:-/tmp/relay}
ENV_FILE=/etc/replayja/rec.env

[ -f "$ENV_FILE" ] || { echo "falta $ENV_FILE (copie rec.env.example e preencha)"; exit 1; }
[ -d "$SRC" ] || { echo "falta $SRC (scp -r relay/ ... primeiro)"; exit 1; }
[ "$(id -u)" = 0 ] || { echo "rode como root"; exit 1; }

echo "== arquitetura: $(dpkg --print-architecture) / $(uname -m)"

# ─── 1. PACOTES ────────────────────────────────────────────────────────────
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
# ffmpeg do apt, não build próprio: o do Ubuntu 24.04 arm64 traz libx264 e
# libfdk ausente (que não usamos, por não gravar áudio). Manter no apt é o que
# faz `unattended-upgrades` cuidar de CVE de codec sem nós.
apt-get install -y -qq ffmpeg python3 sqlite3 lvm2 curl ca-certificates \
  debian-keyring debian-archive-keyring apt-transport-https >/dev/null

if ! command -v caddy >/dev/null 2>&1; then
  echo "== instalando caddy (repositorio oficial, arm64)"
  curl -fsSL https://dl.cloudsmith.io/public/caddy/stable/gpg.key \
    | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -fsSL https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt \
    > /etc/apt/sources.list.d/caddy-stable.list
  apt-get update -qq
  apt-get install -y -qq caddy >/dev/null
fi

ffmpeg -hide_banner -version | head -1
python3 --version

# ─── 2. DISCO ──────────────────────────────────────────────────────────────
# LVM sobre o volume st1, montado em /srv/rec. LVM e não partição direta pelo
# motivo que já se provou no Sentinela: crescer o disco vira `pvcreate` +
# `vgextend` + `lvextend -r`, com os gravadores rodando e sem lacuna nenhuma
# na cobertura.
#
# O volume de MÍDIA é st1 (US$ 0,086/GB-mês contra 0,152 do gp3) porque
# gravação de vídeo é exatamente a carga sequencial para a qual o st1 existe: a
# 250 GB ele entrega ~12 MB/s de baseline e o nosso fluxo de escrita com 4
# câmeras a 3 Mbps é de ~1,5 MB/s. O SO e o ÍNDICE SQLite ficam no gp3, que
# tem IOPS — um índice com milhões de linhas num st1 seria a decisão errada.
if ! mountpoint -q /srv/rec; then
  DISCO=${MEDIA_DISK:-}
  if [ -z "$DISCO" ]; then
    # O maior disco sem sistema de arquivos e sem montagem. Conferido, não
    # adivinhado: um `wipefs` no disco errado apaga o SO.
    DISCO=$(lsblk -bdno NAME,SIZE,TYPE,FSTYPE,MOUNTPOINT | awk '$3=="disk" && $4=="" && $5=="" {print $1, $2}' | sort -k2 -n | tail -1 | cut -d' ' -f1)
    [ -n "$DISCO" ] && DISCO="/dev/$DISCO"
  fi
  if [ -n "$DISCO" ] && [ -b "$DISCO" ]; then
    echo "== preparando $DISCO para /srv/rec (LVM + xfs)"
    lsblk "$DISCO"
    wipefs -n "$DISCO"
    pvcreate -ff -y "$DISCO"
    vgcreate vgrec "$DISCO"
    lvcreate -l 100%FREE -n rec vgrec
    # xfs e não ext4: `xfs_growfs` cresce online e o desempenho com muitos
    # arquivos pequenos (milhões de segmentos de 2 s) é melhor.
    mkfs.xfs -q /dev/vgrec/rec
    mkdir -p /srv/rec
    grep -q '/srv/rec' /etc/fstab || \
      echo "/dev/vgrec/rec /srv/rec xfs defaults,nofail 0 2" >> /etc/fstab
    mount /srv/rec
    echo "== /srv/rec montado: $(df -h /srv/rec | tail -1)"
  else
    echo "AVISO: nenhum volume de midia encontrado. /srv/rec vai para o disco"
    echo "de SISTEMA — aceitavel so em bancada. Em producao isso enche a raiz."
    mkdir -p /srv/rec
  fi
fi

# ─── 3. ARQUIVOS ───────────────────────────────────────────────────────────
mkdir -p "$DEST" /srv/rec /var/lib/replayja /var/cache/replayja/thumb \
  /etc/replayja/rtmp /etc/replayja/rtsp /var/backups/replayja /run/replayja
chmod 700 /etc/replayja /etc/replayja/rtmp /etc/replayja/rtsp
chmod 600 "$ENV_FILE"

# Cópia ATÔMICA via mktemp + mv, não `install` direto: o `install(1)` TRUNCA o
# destino no lugar, e o `sh` dos gravadores em execução lê o record.sh
# INCREMENTALMENTE — um deploy no meio de uma leitura pode quebrar a frota
# inteira (quase mordeu no Sentinela em 30/08/2026). O `mv` troca o inode:
# quem está rodando continua no arquivo antigo até o próprio restart.
inst() {
  t=$(mktemp "$DEST/.inst.XXXXXX")
  cp "$SRC/$1" "$t"
  chmod 755 "$t"
  mv -f "$t" "$DEST/$1"
}
for f in record.sh rec-server.py auth-sidecar.py clip-worker.py \
         health-report.py sync-cameras.sh backup.sh retire-camera.sh; do
  inst "$f"
done
# Ferramenta de operação: liga/desliga a CÂMERA SIMULADA. Não é serviço, não
# tem unidade, e não roda sozinha — existe para alguém desligar o simulador
# antes de apontar a câmera de verdade (README §"Câmera simulada").
mkdir -p "$DEST/tools"
if [ -f "$SRC/tools/camsim.sh" ]; then
  install -m 755 "$SRC/tools/camsim.sh" "$DEST/tools/"
fi
# As marcas d'água do Replay já. SEM `|| true` na primeira: uma instalação sem
# a marca padrão produz clipes crus em toda arena que ainda não enviou logo, e
# esse foi o defeito que ficou meses em produção sem ninguém ver (os clipes
# saíam, só que sem marca).
for wm in watermark-replayja.png watermark-replayja-assinatura.png; do
  if [ -f "$SRC/$wm" ]; then
    install -m 644 "$SRC/$wm" "$DEST/"
  else
    echo "AVISO: $wm ausente em $SRC — clipe pode sair sem marca"
  fi
done
# Compatibilidade com a instalação anterior, que esperava `watermark.png`.
[ -f "$SRC/watermark.png" ] && install -m 644 "$SRC/watermark.png" "$DEST/" || true
git -C "$SRC" rev-parse --short HEAD >"$DEST/VERSION" 2>/dev/null \
  || date -u +%Y%m%d-%H%M >"$DEST/VERSION"

install -m 644 "$SRC/units/replayja-rec.slice" /etc/systemd/system/
for u in replayja-rec@.service replayja-recserver.service replayja-auth.service \
         replayja-clip-worker.service replayja-sync-cameras.service \
         replayja-sync-cameras.timer replayja-health.service \
         replayja-health.timer replayja-backup.service replayja-backup.timer; do
  install -m 644 "$SRC/units/$u" /etc/systemd/system/
done
install -m 644 "$SRC/Caddyfile" /etc/caddy/Caddyfile

# `systemd-analyze verify` ANTES do daemon-reload: é o que denuncia um
# `OnCalendar` que o systemd não entendeu (e que ele carregaria em silêncio,
# disparando no fuso errado).
systemd-analyze verify /etc/systemd/system/replayja-backup.timer || true
systemctl daemon-reload

# ─── 4. SERVIÇOS ───────────────────────────────────────────────────────────
systemctl enable replayja-recserver replayja-auth replayja-clip-worker >/dev/null 2>&1 || true
systemctl restart replayja-recserver replayja-auth
systemctl restart replayja-clip-worker
systemctl reload caddy || systemctl restart caddy

# Bootstrap com o estado declarado LOCALMENTE: liga um gravador por câmera de
# RECORD_CAMS e desliga os que saíram. Roda antes do sync porque não depende de
# rede — se a API estiver fora na hora da instalação, a frota sobe assim mesmo,
# com a última lista conhecida.
# shellcheck disable=SC1090
. "$ENV_FILE"
for unit in $(systemctl list-units --plain --no-legend "replayja-rec@*.service" | awk '{print $1}'); do
  cam="${unit#replayja-rec@}"; cam="${cam%.service}"
  case " ${RECORD_CAMS:-} " in
    *" ${cam} "*) ;;
    *) systemctl disable --now "$unit" ;;
  esac
done
for cam in ${RECORD_CAMS:-}; do
  systemctl enable --now "replayja-rec@${cam}" >/dev/null 2>&1 \
    || systemctl restart "replayja-rec@${cam}"
done

# E agora o sync assume: a partir daqui RECORD_CAMS é DERIVADO da API, não
# editado à mão. Esta primeira rodada é síncrona só para a instalação já sair
# convergida — e para a falha aparecer aqui, e não daqui a 2 minutos no log.
systemctl enable --now replayja-sync-cameras.timer >/dev/null 2>&1 || true
"$DEST/sync-cameras.sh" || echo "sync inicial falhou — o timer tenta em 2 min"

systemctl enable --now replayja-health.timer replayja-backup.timer >/dev/null 2>&1 || true

# ─── 5. CONFERÊNCIA ────────────────────────────────────────────────────────
. "$ENV_FILE"
echo
echo "== relay do Replay ja instalado (versao $(cat "$DEST/VERSION"))"
echo "   gravando: ${RECORD_CAMS:-<vazio>}"
echo
echo "   Confira agora:"
echo "     sudo curl -s localhost:9900/stats | python3 -m json.tool | head -30"
echo "     systemctl list-timers 'replayja-*'"
echo "     sudo journalctl -u replayja-clip-worker -n 20"
echo
echo "   E do lado de FORA (a pegadinha que custou meio dia no Sentinela):"
echo "     abrir uma porta no Security Group NAO abre a faixa. Teste a faixa"
echo "     inteira antes de mandar o instalador subir no poste:"
echo "       nc -vz <ip-publico> 19350 && nc -vz <ip-publico> 19351"
