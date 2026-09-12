#!/bin/sh
# Backup do que NÃO se reconstrói sozinho neste relay.
#
# O que vale copiar e o que não vale:
#  - /etc/replayja/rec.env: os SEGREDOS (RELAY_KEY, RELAY_TOKEN_SECRET,
#    RELAY_TOKEN). Se forem perdidos, os tokens que a API assina param de ser
#    aceitos e TODO O VÍDEO CAI com 401. É o item mais crítico e o menor de
#    todos — está em primeiro lugar por isso.
#  - /etc/replayja/rtmp/*.conf e rtsp/*.conf: as chaves de ingest. Perdê-las
#    significa redigitar a chave DENTRO DE CADA CÂMERA, presencialmente, na
#    quadra. O sync as reescreve a partir da API, mas só se a API estiver de
#    pé — e "a API está fora" é exatamente quando se quer restaurar um backup.
#  - unidades systemd + scripts: reconstroem a máquina do zero em minutos.
#  - índice SQLite: tecnicamente o indexador o refaz lendo as playlists do
#    disco, mas isso leva tempo e CPU com milhões de segmentos.
#  - AS GRAVAÇÕES NÃO ENTRAM: são o volume inteiro (centenas de GB) e expiram
#    sozinhas em dias. Backup de dado efêmero é dinheiro jogado fora; quem
#    protege contra perda do disco é o snapshot EBS.
#
# Destino: o disco de DADOS (/srv/rec) e o disco de SISTEMA (/var/backups).
# São volumes diferentes de propósito — perder um ainda deixa o outro.
set -eu

STAMP=$(date -u +%Y%m%d-%H%M)
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

mkdir -p "$TMP/etc" "$TMP/systemd" "$TMP/opt" "$TMP/ingest"
cp /etc/replayja/rec.env "$TMP/etc/" 2>/dev/null || true
cp /etc/caddy/Caddyfile "$TMP/etc/" 2>/dev/null || true
cp -r /etc/replayja/rtmp /etc/replayja/rtsp "$TMP/ingest/" 2>/dev/null || true
cp /etc/systemd/system/replayja-*.service /etc/systemd/system/replayja-*.timer \
  "$TMP/systemd/" 2>/dev/null || true
cp /opt/replayja-relay/*.py /opt/replayja-relay/*.sh "$TMP/opt/" 2>/dev/null || true

DB=${REC_DB:-/var/lib/replayja/rec.db}
# ─── `VACUUM INTO`, NUNCA `.backup` ────────────────────────────────────────
# O `.backup` do sqlite3 RECOMEÇA DO ZERO a cada commit de um escritor
# externo, e o rec-server indexa segmento sem parar. Com o WAL grande ele NUNCA
# chega ao fim: no Sentinela, em 07/09/2026, ficou 7h28min queimando um vCPU
# inteiro para entregar um arquivo de 4 KB — e foi isso que empurrou a máquina
# para a zona de burst, sem uma linha de erro, porque de fora ele parece só um
# backup demorado.
#
# O `VACUUM INTO` tira o snapshot numa ÚNICA transação de leitura: não
# reinicia, sai compactado, e levou 47 s para o mesmo banco.
#
# O `timeout` é a rede embaixo disso: backup nenhum aqui tem o direito de
# passar de 10 minutos. Falhar e dizer que falhou é melhor que estrangular a
# máquina o dia inteiro em silêncio.
if [ -f "$DB" ]; then
  timeout -k 30 600 sqlite3 "$DB" "VACUUM INTO '$TMP/rec.db'" 2>/dev/null \
    || echo "aviso: copia do indice falhou ou estourou 10 min; backup segue sem ela" >&2
fi

# Jobs já confirmados: evita reprocessar clipe depois de um restore.
cp /var/lib/replayja/jobs-done.json "$TMP/" 2>/dev/null || true
cp /var/lib/replayja/cameras.version "$TMP/" 2>/dev/null || true

# fstab e a receita do LVM: sem isso, remontar o disco numa máquina nova é
# adivinhação.
cp /etc/fstab "$TMP/etc/" 2>/dev/null || true
{ lsblk -o NAME,SIZE,FSTYPE,UUID,MOUNTPOINT; echo; vgs 2>/dev/null; lvs 2>/dev/null; } \
  >"$TMP/disco.txt" 2>/dev/null || true

for DEST in /srv/rec/_backup /var/backups/replayja; do
  mkdir -p "$DEST" || continue
  tar -czf "$DEST/relay-$STAMP.tar.gz" -C "$TMP" . 2>/dev/null || continue
  chmod 600 "$DEST/relay-$STAMP.tar.gz" 2>/dev/null || true
  # Mantém os 7 mais recentes: o valor está em ter ALGUM backup recente, não
  # em ter histórico longo de um arquivo de configuração.
  ls -1t "$DEST"/relay-*.tar.gz 2>/dev/null | tail -n +8 | while read -r old; do
    rm -f "$old"
  done
done

echo "backup ok: relay-$STAMP.tar.gz ($(du -sh "$TMP" | cut -f1))"
