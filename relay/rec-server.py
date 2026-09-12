#!/usr/bin/env python3
"""rec-server (Replay já): o único processo com estado do relay — e ele é
descartável. Indexa os segmentos que os gravadores (`record.sh`) vão deixando
no disco, gera playlists HLS sob demanda, corta trechos (`/clip`), tira
miniaturas (`/thumb`) e cuida de poda + watchdog. Se morrer, o systemd
reinicia e NADA se perde: os gravadores continuam escrevendo e o índice
retoma de onde parou.

Fork do `rec-server.py` do relay v2 do Sentinela (produção desde 29/08/2026).
O que saiu: avistamentos/detector, dataset de vereditos, playlist-mestra e o
nível 360p do transcodificador, e a varredura de "enlatados da Tuya". O que
ficou é o núcleo — e ele ficou porque cada pedaço dele é a cicatriz de um
incidente real, anotada no lugar onde dói.

Camadas (por que assim): o relay v1 do Sentinela servia o vivo por um muxer
HLS stateful (MediaMTX) que panicava sob troca de sessão — ~20/dia, nil
pointer, sem correção upstream. Aqui NÃO EXISTE muxer: o vivo é uma playlist
de janela deslizante montada por consulta ao índice sobre os mesmos arquivos
já gravados (o padrão nDVR de Flussonic/Wowza), e os bytes de mídia saem do
Caddy como arquivo estático. Playlist é texto; texto não panica.

HTTP (127.0.0.1:9900, atrás do Caddy que já validou token/chave):
  GET  /live/<cam>/index.m3u8            janela deslizante (DVR nativo)
  GET  /vod/<cam>/index.m3u8?from=&to=   trecho fechado (ENDLIST), epoch ms
  GET  /spans/<cam>?from=&to=            JSON dos intervalos gravados
  GET  /clip/<cam>?from=&to=             MP4 remuxado (-c copy), teto 5 min
  GET  /thumb/<cam>?t=                   JPEG de UM instante, com cache
  GET  /stats                            RelayHealthRequest (openapi.yaml)
  GET  /logs?cam=&limit=&journal=1       diário de bordo + journal
  GET  /healthz                          sonda curta (uptime externo)
  POST /jobs                             a nuvem ACORDA o worker (204)
  POST /cam/<id>/forget                  encerra uma câmera (x-relay-key)

Todas as rotas de leitura respondem HEAD com os mesmos cabeçalhos e sem corpo
— o `/thumb` com um atalho próprio, que responde a existência SEM gerar a
miniatura (sonda não paga ffmpeg).

ESCALA (por que o índice é incremental): 24 câmeras × 7 dias × segmentos de
~2 s = milhões de linhas. Reparsear a playlist inteira a cada ciclo fritava a
CPU e o disco. Aqui cada playlist é lida a partir da linha onde paramos, e
cada segmento já entra com o número de sequência (seq) e de descontinuidade
(disc) calculados — montar playlist é UMA consulta por faixa de tempo.
"""
import glob
import hmac
import json
import os
import re
import shutil
import sqlite3
import subprocess
import sys
import tempfile
import threading
import time
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, parse_qs

REC_ROOT = os.environ.get("REC_ROOT", "/srv/rec")
DB_PATH = os.environ.get("REC_DB", "/var/lib/replayja/rec.db")
RELAY_ID = os.environ.get("RELAY_ID", "relay-1")
# Retenção da SESSÃO COMPLETA no disco do relay. O piloto enxuto da ADR §9
# roda em 3 dias (72 h); o "piloto confortável" em 7 (168 h). É a maior
# alavanca de custo que existe neste sistema — cair de 7 para 3 dias tira
# US$ 456/mês a 20 arenas — e por isso mora numa variável de ambiente, não
# numa constante.
RETAIN_HOURS = float(os.environ.get("RETAIN_HOURS", "72"))
LIVE_WINDOW_S = int(os.environ.get("LIVE_WINDOW_S", "1800"))
# Derivado do `GET /relay/cameras` pelo sync-cameras.sh, lido UMA VEZ na
# subida. É daqui que saem o `expected` do /stats, a cobertura e o watchdog —
# por isso o sync reescreve a linha e reinicia este serviço.
RECORD_CAMS = os.environ.get("RECORD_CAMS", "").split()
# Versão da lista aplicada pelo sync. Vai no /stats e no POST /relay/health;
# quando diverge da do servidor, a API manda buscar a lista de novo.
CAMERAS_VERSION_FILE = os.environ.get(
    "CAMERAS_VERSION_FILE", "/var/lib/replayja/cameras.version"
)
# Retrato da fila do worker de clipe (escrito pelo clip-worker.py). Mesmo
# padrão do `detect.json` do Sentinela: um processo publica um JSON pequeno,
# o outro lê — sem IPC, sem banco compartilhado para escrita.
WORKER_STATUS = os.environ.get("WORKER_STATUS", "/run/replayja/worker.json")
VERSION_FILE = os.environ.get("RELAY_VERSION_FILE", "/opt/replayja-relay/VERSION")

# Vivo "honesto": se o segmento mais novo tem mais que isso, a câmera está
# fora — 404 em vez de servir borda congelada como se fosse agora.
LIVE_STALE_S = 120
# Acima disto uma câmera é declarada OFFLINE no relatório de saúde. 90 s são
# ~45 segmentos de 2 s: folga suficiente para uma reconexão normal da câmera
# (que leva ~2 s) e curto o bastante para o painel do parceiro dizer a verdade
# antes de alguém apertar o botão e perder o lance.
CAMERA_DOWN_S = int(os.environ.get("CAMERA_DOWN_S", "90"))

# ---------------------------------------------------------------------------
# ONDE O PLAYER ENTRA NA PLAYLIST AO VIVO (#EXT-X-START)
#
# Herdado inteiro do Sentinela, e a lição vale igual aqui: o
# `#EXT-X-TARGETDURATION` é, por definição do RFC 8216, o MAIOR EXTINF da
# playlist — e a nossa janela ao vivo tem 30 min. Um ÚNICO segmento longo
# enterrado nela (a assinatura de um buraco de uplink: 68 s declarados com
# 323 KB, medido na frota do Sentinela em 11/09/2026) leva o número a dezenas
# de segundos, e o hls.js, quando a playlist não diz onde se entra, entra em
# 3 × TARGETDURATION atrás da borda. Medido: 192 s de atraso por causa de um
# segmento de um minuto atrás — e o atraso sumia sozinho quando aquele
# segmento saía da janela, o que é exatamente o pior tipo de bug.
#
# O conserto é dizer explicitamente onde se entra (RFC 8216 §4.3.5.2). O `n`
# sai da duração TÍPICA (mediana da cauda), não do máximo: é a mediana que
# descreve a ponta, que é onde o player vai ficar.
#
# Houve uma 1ª tentativa com `-45` que deixava o hls.js ~40 s congelado no
# arranque. É por causa dela que este `n` tem teto de 20 s.
LIVE_START_SEGMENTS = 3
LIVE_START_MIN_S = 8.0
LIVE_START_MAX_S = 20.0
LIVE_START_AMOSTRA = 20

# Buraco menor que isto não quebra o intervalo na timeline (troca de sessão
# custa alguns segundos; virar dois blocos por causa disso poluiria a barra e,
# pior, inflaria `gaps` no relatório de saúde).
SPAN_GAP_MS = 15_000
# Segmento acima disto é a assinatura direta de buraco no uplink da arena, e é
# o número que o painel do parceiro mostra como "a internet oscilou N vezes".
# Na frota do Sentinela: 68 em 24 h, TODOS em câmeras por push; as por RTSP
# (puxadas de dentro da LAN) não tiveram nenhum.
LONG_SEGMENT_MS = 10_000

HB_DIR = os.environ.get("HB_DIR", "/run/replayja")
HB_STALE_S = 60
RELAY_KEY = os.environ.get("RELAY_KEY", "")

# ---- download de trecho (/clip) ----
# Teto do trecho. O job de clipe pede ~38 s; o "estender lance" e a auditoria
# do painel pedem mais. 5 min é o mesmo teto do Sentinela e o mesmo que o
# contrato declara (`CLIP_MAX_MS` em openapi.yaml).
CLIP_MAX_MS = int(os.environ.get("CLIP_MAX_MS", 5 * 60 * 1000))
# Remux é `-c copy` (sem recodificar): custa I/O, não CPU. Ainda assim, dois
# de cada vez — esta máquina existe para GRAVAR. Cheio responde 503.
CLIP_SLOTS = threading.Semaphore(int(os.environ.get("CLIP_SLOTS", "2")))
CLIP_TIMEOUT_S = int(os.environ.get("CLIP_TIMEOUT_S", "120"))

# ---- miniatura de um instante (/thumb) ----
THUMB_DIR = os.environ.get("THUMB_DIR", "/var/cache/replayja/thumb")
THUMB_W = int(os.environ.get("THUMB_W", "320"))
# O instante pedido é arredondado para baixo neste passo ANTES de virar chave
# de cache: dois pedidos vizinhos caem no mesmo arquivo e não geram dois
# ffmpeg. O segmento tem ~2 s de qualquer jeito.
THUMB_QUANTUM_MS = int(os.environ.get("THUMB_QUANTUM_MS", "2000"))
THUMB_SLOTS = threading.Semaphore(int(os.environ.get("THUMB_SLOTS", "2")))
THUMB_TIMEOUT_S = int(os.environ.get("THUMB_TIMEOUT_S", "20"))
THUMB_RETAIN_H = float(os.environ.get("THUMB_RETAIN_H", "48"))
# Teto de TAMANHO além do de idade. Só a idade não é rede de segurança:
# quantas miniaturas cabem em 48 h depende de quanta gente passeou pela
# timeline, e o disco é o mesmo em que os gravadores escrevem.
THUMB_MAX_BYTES = int(os.environ.get("THUMB_MAX_BYTES", 2 * 1024**3))
THUMB_PRUNE_S = 600
_thumb_prune_at = 0.0

# Id de câmera vira NOME DE DIRETÓRIO e trecho de URL. O contrato
# (openapi.yaml, `RelayCamera.id`) já o restringe a `^[a-z0-9]{6,32}$`; aqui a
# regra é repetida porque este processo recebe o valor pela rede.
CAM_VALIDA = re.compile(r"^[a-z0-9]{6,32}$")

# Rede de segurança do disco: acima de HIGH apaga as sessões mais antigas até
# voltar abaixo de LOW, independente da retenção. Gravador nunca pode parar
# por disco cheio — e na hierarquia deste produto um dia a menos de sessão
# completa vale infinitamente menos que um segmento perdido agora.
DISK_HIGH = float(os.environ.get("DISK_HIGH", "0.85"))
DISK_LOW = float(os.environ.get("DISK_LOW", "0.78"))

# Teto do WAL. Ver wal_loop() e o README §"O WAL do índice é um sinal vital".
WAL_MAX_BYTES = int(os.environ.get("WAL_MAX_BYTES", str(512 * 1024 * 1024)))
WAL_CHECK_S = int(os.environ.get("WAL_CHECK_S", "300"))
WAL_BYTES = 0
WAL_LAST_CHECKPOINT = None

# Verdadeiro enquanto a poda por ESPAÇO (DISK_HIGH) esteve ativa nos últimos
# minutos. Vai para o `disk.pruningActive` do relatório de saúde: é a
# diferença entre "a retenção configurada está sendo cumprida" e "o disco está
# cortando o acervo antes da hora".
PRUNING_ACTIVE_UNTIL = 0.0

_local = threading.local()


def db():
    conn = getattr(_local, "conn", None)
    if conn is None:
        conn = sqlite3.connect(DB_PATH, timeout=30)
        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute("PRAGMA synchronous=NORMAL")
        conn.execute("PRAGMA busy_timeout=30000")
        _local.conn = conn
    return conn


def db_release():
    """Encerra a transação de leitura da conexão desta thread.

    ESTA FUNÇÃO É A CICATRIZ MAIS CARA DO RELAY v2, e foi copiada palavra por
    palavra. Sem ela o Sentinela passou 19 HORAS sem fazer um único
    checkpoint (06/09/2026 16:36 → 07/09 12:00): WAL de 7,1 GB contra um banco
    de 703 MB, sem UM ERRO em lugar nenhum.

    O caminho: a conexão é thread-local e o servidor fala HTTP/1.1, então a
    thread sobrevive à requisição esperando a próxima no keep-alive. Se o
    cliente some no meio de uma resposta que está iterando um cursor — o
    comportamento NORMAL de um player HLS, e o `QuietServer` engole justamente
    essa desconexão — o cursor fica aberto segurando um snapshot do WAL. O
    checkpoint não pode passar do frame mais antigo que alguém ainda lê, e o
    arquivo cresce para sempre.

    O rollback é barato e seguro: não há escrita pendente por desenho (o
    `log_event` commita na hora) e ele reseta qualquer statement pendurada.
    """
    conn = getattr(_local, "conn", None)
    if conn is not None:
        try:
            conn.rollback()
        except Exception:
            pass


def init_db():
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    conn = sqlite3.connect(DB_PATH, timeout=30)
    conn.execute("PRAGMA journal_mode=WAL")
    conn.executescript(
        """
        CREATE TABLE IF NOT EXISTS segments(
          cam TEXT NOT NULL,
          sess TEXT NOT NULL,
          seg TEXT NOT NULL,
          start_ms INTEGER NOT NULL,
          dur_ms INTEGER NOT NULL,
          seq INTEGER NOT NULL,
          disc INTEGER NOT NULL,
          size_bytes INTEGER NOT NULL DEFAULT 0,
          PRIMARY KEY (cam, sess, seg)
        );
        CREATE INDEX IF NOT EXISTS idx_seg_time ON segments(cam, start_ms);

        -- Contadores por câmera, mantidos INCREMENTALMENTE. O /stats do
        -- Sentinela somava a tabela inteira por câmera a cada ciclo — com 3 M
        -- de linhas isso virou 15 s de CPU por minuto e o painel estourava o
        -- timeout. Aqui a leitura é O(1).
        CREATE TABLE IF NOT EXISTS cam_state(
          cam TEXT PRIMARY KEY,
          next_seq INTEGER NOT NULL DEFAULT 0,
          disc_count INTEGER NOT NULL DEFAULT 0,
          last_sess TEXT,
          last_end_ms INTEGER NOT NULL DEFAULT 0,
          last_span_id INTEGER,
          seg_count INTEGER NOT NULL DEFAULT 0,
          dur_total INTEGER NOT NULL DEFAULT 0,
          bytes_total INTEGER NOT NULL DEFAULT 0,
          oldest_ms INTEGER
        );

        -- Intervalos contínuos gravados. É o que responde `coverageRatio` em
        -- milissegundos em vez de varrer segmentos.
        CREATE TABLE IF NOT EXISTS spans(
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          cam TEXT NOT NULL,
          start_ms INTEGER NOT NULL,
          end_ms INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_span_time ON spans(cam, start_ms);

        -- Diário de bordo: o que aconteceu e quando. Existe para responder
        -- "por que essa câmera falhou às 3h da manhã?" sem SSH. No banco (e
        -- não só no journald) porque sobrevive a restart e é consultável.
        CREATE TABLE IF NOT EXISTS events(
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          ts_ms INTEGER NOT NULL,
          cam TEXT,
          kind TEXT NOT NULL,
          detail TEXT
        );
        CREATE INDEX IF NOT EXISTS idx_events_ts ON events(ts_ms DESC);

        -- Até onde já lemos cada playlist (retomada sem reprocessar tudo).
        CREATE TABLE IF NOT EXISTS pl_state(
          path TEXT PRIMARY KEY,
          lines_done INTEGER NOT NULL,
          size INTEGER NOT NULL
        );
        """
    )
    conn.commit()
    conn.close()


def log_event(conn, kind, cam=None, detail=None):
    """Registra um acontecimento no diário E no journald. Dois destinos de
    propósito: o banco é consultável pela API, o journald sobrevive a um banco
    corrompido e casa com o log dos gravadores."""
    try:
        conn.execute(
            "INSERT INTO events(ts_ms, cam, kind, detail) VALUES(?,?,?,?)",
            (int(time.time() * 1000), cam, kind, detail),
        )
        conn.commit()
    except Exception as e:
        print(f"log_event falhou: {e}", flush=True)
    print(f"EVENT {kind} cam={cam or '-'} {detail or ''}", flush=True)


# ---------------------------------------------------------------- indexador

_PDT_RE = re.compile(r"^#EXT-X-PROGRAM-DATE-TIME:(.+)$")
_INF_RE = re.compile(r"^#EXTINF:([0-9.]+)")


def _parse_pdt(s: str):
    s = s.strip()
    # ffmpeg escreve +0000 (sem dois-pontos); fromisoformat quer +00:00.
    m = re.search(r"([+-]\d{2})(\d{2})$", s)
    if m:
        s = s[: m.start()] + m.group(1) + ":" + m.group(2)
    try:
        return datetime.fromisoformat(s).timestamp()
    except ValueError:
        return None


def parse_playlist(path: str, skip_lines: int):
    """Segmentos NOVOS de uma playlist de sessão do ffmpeg, a partir da linha
    `skip_lines`. Cada segmento carrega o próprio `EXT-X-PROGRAM-DATE-TIME`
    (flag `program_date_time`), então ler pelo meio é seguro — não há estado
    acumulado entre linhas.

    ATENÇÃO AO QUE ESSE CARIMBO É: hora de CHEGADA ao relay (início da sessão
    + duração acumulada da mídia), não hora da cena. A perna câmera → relay é
    invisível a qualquer conta feita contra este processo — no Sentinela ela
    chegou a ~12 s pelo caminho da nuvem e a prova de que a conta estava errada
    foi uma amostra dar latência NEGATIVA de −0,13 s. Pelo RTMP direto a perna
    é muito menor, mas continua existindo: quem a compensa é o
    `camera.originLagMs`, medido na instalação e aplicado pela API ao montar a
    janela do corte. Não tente descobri-lo aqui.

    Devolve ([(seg, start_ms, dur_ms)], total_de_linhas_lidas)."""
    out = []
    pdt = None
    dur = None
    n = 0
    try:
        with open(path, "r", encoding="utf-8", errors="replace") as f:
            for i, line in enumerate(f):
                n = i + 1
                if i < skip_lines:
                    continue
                line = line.strip()
                if not line:
                    continue
                m = _PDT_RE.match(line)
                if m:
                    t = _parse_pdt(m.group(1))
                    if t is not None:
                        pdt = t
                    continue
                m = _INF_RE.match(line)
                if m:
                    dur = float(m.group(1))
                    continue
                if line.startswith("#"):
                    continue
                if dur is None or pdt is None:
                    dur = None
                    continue
                out.append((line, int(pdt * 1000), int(dur * 1000)))
                pdt = None
                dur = None
    except OSError:
        return [], skip_lines
    return out, n


def index_segment(conn, cam, sess, seg, start_ms, dur_ms):
    """Insere UM segmento já com seq/disc e estende o intervalo aberto."""
    row = conn.execute(
        "SELECT next_seq, disc_count, last_sess, last_end_ms, last_span_id"
        " FROM cam_state WHERE cam=?",
        (cam,),
    ).fetchone()
    if row is None:
        conn.execute("INSERT INTO cam_state(cam) VALUES(?)", (cam,))
        row = (0, 0, None, 0, None)
    next_seq, disc_count, last_sess, last_end_ms, last_span_id = row

    # Sessão nova = descontinuidade (init map e timestamps trocam).
    if sess != last_sess:
        if last_sess is not None:
            disc_count += 1
        last_sess = sess

    try:
        size_b = os.path.getsize(os.path.join(REC_ROOT, cam, sess, seg))
    except OSError:
        size_b = 0
    cur = conn.execute(
        "INSERT OR IGNORE INTO segments"
        "(cam,sess,seg,start_ms,dur_ms,seq,disc,size_bytes) VALUES(?,?,?,?,?,?,?,?)",
        (cam, sess, seg, start_ms, dur_ms, next_seq, disc_count, size_b),
    )
    if cur.rowcount == 0:
        # Já indexado (restart no meio de uma playlist): não consome seq.
        return
    next_seq += 1
    conn.execute(
        "UPDATE cam_state SET seg_count=seg_count+1, dur_total=dur_total+?,"
        " bytes_total=bytes_total+?, oldest_ms=CASE WHEN oldest_ms IS NULL"
        " OR ?<oldest_ms THEN ? ELSE oldest_ms END WHERE cam=?",
        (dur_ms, size_b, start_ms, start_ms, cam),
    )

    end_ms = start_ms + dur_ms
    if last_span_id is not None and 0 <= start_ms - last_end_ms <= SPAN_GAP_MS:
        conn.execute("UPDATE spans SET end_ms=? WHERE id=?", (end_ms, last_span_id))
    else:
        cur = conn.execute(
            "INSERT INTO spans(cam,start_ms,end_ms) VALUES(?,?,?)",
            (cam, start_ms, end_ms),
        )
        last_span_id = cur.lastrowid

    conn.execute(
        "UPDATE cam_state SET next_seq=?, disc_count=?, last_sess=?,"
        " last_end_ms=?, last_span_id=? WHERE cam=?",
        (next_seq, disc_count, last_sess, max(end_ms, last_end_ms), last_span_id, cam),
    )


def indexer_loop():
    seen = {}  # path -> (mtime_ns, size)
    last_full = 0.0
    while True:
        try:
            conn = db()
            pending = []
            # Só as 2 sessões MAIS NOVAS de cada câmera mudam (o gravador
            # escreve sempre na última; a penúltima pode estar fechando).
            # Antes era glob + stat de TODAS as playlists — ~7.000 por segundo
            # com 3 M de segmentos no acervo do Sentinela — e isso era 63% da
            # CPU do processo. A varredura completa fica para 1×/min, como
            # rede de segurança contra um diretório que o atalho não enxergou.
            full = (time.time() - last_full) > 60
            if full:
                playlists = glob.glob(os.path.join(REC_ROOT, "*", "*", "index.m3u8"))
                last_full = time.time()
            else:
                playlists = []
                try:
                    camdirs = list(os.scandir(REC_ROOT))
                except OSError:
                    camdirs = []
                for camdir in camdirs:
                    if not camdir.is_dir() or camdir.name.startswith("_"):
                        continue
                    try:
                        sess = sorted(
                            (
                                e.name
                                for e in os.scandir(camdir.path)
                                if e.is_dir() and not e.name.startswith("_")
                            ),
                            reverse=True,
                        )[:2]
                    except OSError:
                        continue
                    playlists.extend(
                        os.path.join(camdir.path, x, "index.m3u8") for x in sess
                    )
            for pl in playlists:
                try:
                    st = os.stat(pl)
                except OSError:
                    continue
                if seen.get(pl) == (st.st_mtime_ns, st.st_size):
                    continue
                row = conn.execute(
                    "SELECT lines_done, size FROM pl_state WHERE path=?", (pl,)
                ).fetchone()
                lines_done, prev_size = row if row else (0, 0)
                # Arquivo menor que antes = playlist recriada: relê do zero.
                if st.st_size < prev_size:
                    lines_done = 0
                segs, total_lines = parse_playlist(pl, lines_done)
                sess_dir = os.path.dirname(pl)
                sess = os.path.basename(sess_dir)
                cam = os.path.basename(os.path.dirname(sess_dir))
                for seg, start_ms, dur_ms in segs:
                    pending.append((cam, start_ms, sess, seg, dur_ms))
                conn.execute(
                    "INSERT INTO pl_state(path,lines_done,size) VALUES(?,?,?)"
                    " ON CONFLICT(path) DO UPDATE SET lines_done=?, size=?",
                    (pl, total_lines, st.st_size, total_lines, st.st_size),
                )
                seen[pl] = (st.st_mtime_ns, st.st_size)
            # Ordena por tempo dentro de cada câmera: seq/disc/spans precisam
            # nascer na ordem cronológica mesmo com várias sessões no lote.
            pending.sort(key=lambda r: (r[0], r[1]))
            for cam, start_ms, sess, seg, dur_ms in pending:
                index_segment(conn, cam, sess, seg, start_ms, dur_ms)
            conn.commit()
            if full:
                for pl in [p for p in seen if not os.path.exists(p)]:
                    del seen[pl]
        except Exception as e:  # o indexador nunca morre por um arquivo torto
            print(f"indexer: {e}", flush=True)
        time.sleep(1)


# ------------------------------------------------------------------- poda


def rebuild_spans(conn, cam, from_ms, to_ms):
    """Refaz os intervalos de uma câmera na janela afetada, a partir dos
    segmentos que SOBRARAM.

    Os spans são mantidos incrementalmente, então apagar segmentos no MEIO do
    acervo deixaria o span mentindo — e span mentindo aqui não é cosmético: é
    `coverageRatio` mentindo, ou seja, um clipe entregue como íntegro sobre um
    buraco. Só a poda por IDADE escapa disso (`trim_spans` corta pela borda).
    """
    lo, hi = from_ms - SPAN_GAP_MS, to_ms + SPAN_GAP_MS
    # Um span que encosta na janela pode se estender muito além dela: some com
    # ele, mas amplia a janela para reconstruí-lo inteiro.
    for _id, s_ms, e_ms in conn.execute(
        "SELECT id, start_ms, end_ms FROM spans WHERE cam=? AND end_ms>=? AND start_ms<=?",
        (cam, lo, hi),
    ).fetchall():
        lo, hi = min(lo, s_ms), max(hi, e_ms)
    conn.execute(
        "DELETE FROM spans WHERE cam=? AND end_ms>=? AND start_ms<=?",
        (cam, from_ms - SPAN_GAP_MS, to_ms + SPAN_GAP_MS),
    )
    cur_start = cur_end = None
    for s_ms, d_ms in conn.execute(
        "SELECT start_ms, dur_ms FROM segments"
        " WHERE cam=? AND start_ms>=? AND start_ms<=? ORDER BY start_ms",
        (cam, lo, hi),
    ):
        if cur_end is not None and 0 <= s_ms - cur_end <= SPAN_GAP_MS:
            cur_end = s_ms + d_ms
            continue
        if cur_start is not None:
            conn.execute(
                "INSERT INTO spans(cam,start_ms,end_ms) VALUES(?,?,?)",
                (cam, cur_start, cur_end),
            )
        cur_start, cur_end = s_ms, s_ms + d_ms
    if cur_start is not None:
        conn.execute(
            "INSERT INTO spans(cam,start_ms,end_ms) VALUES(?,?,?)",
            (cam, cur_start, cur_end),
        )
    # O ponteiro do intervalo aberto pode ter apontado para um span que sumiu.
    # NULL é seguro: o próximo segmento abre um span novo em vez de estender.
    row = conn.execute(
        "SELECT id FROM spans WHERE cam=?"
        " AND end_ms=(SELECT last_end_ms FROM cam_state WHERE cam=?)"
        " ORDER BY id DESC LIMIT 1",
        (cam, cam),
    ).fetchone()
    conn.execute(
        "UPDATE cam_state SET last_span_id=? WHERE cam=?", (row[0] if row else None, cam)
    )


def drop_session(conn, cam, sess, keep_spans=False):
    span = None
    if not keep_spans:
        span = conn.execute(
            "SELECT MIN(start_ms), MAX(start_ms + dur_ms) FROM segments"
            " WHERE cam=? AND sess=?",
            (cam, sess),
        ).fetchone()
    gone = conn.execute(
        "SELECT COUNT(*), COALESCE(SUM(dur_ms),0), COALESCE(SUM(size_bytes),0),"
        " MIN(start_ms) FROM segments WHERE cam=? AND sess=?",
        (cam, sess),
    ).fetchone()
    shutil.rmtree(os.path.join(REC_ROOT, cam, sess), ignore_errors=True)
    conn.execute("DELETE FROM segments WHERE cam=? AND sess=?", (cam, sess))
    if gone and gone[0]:
        conn.execute(
            "UPDATE cam_state SET seg_count=MAX(0, seg_count-?),"
            " dur_total=MAX(0, dur_total-?), bytes_total=MAX(0, bytes_total-?)"
            " WHERE cam=?",
            (gone[0], gone[1], gone[2], cam),
        )
        conn.execute(
            "UPDATE cam_state SET oldest_ms=(SELECT MIN(start_ms) FROM segments"
            " WHERE cam=?) WHERE cam=? AND (oldest_ms IS NULL OR oldest_ms>=?)",
            (cam, cam, gone[3] or 0),
        )
    conn.execute(
        "DELETE FROM pl_state WHERE path=?",
        (os.path.join(REC_ROOT, cam, sess, "index.m3u8"),),
    )
    # keep_spans: a poda por idade/disco tira sempre a sessão MAIS ANTIGA e já
    # corta os intervalos pela borda (trim_spans) — refazer ali seria trabalho
    # repetido em milhares de sessões.
    if span and span[0] is not None:
        rebuild_spans(conn, cam, span[0], span[1])


def trim_spans(conn, cam, cutoff_ms):
    conn.execute("DELETE FROM spans WHERE cam=? AND end_ms<=?", (cam, cutoff_ms))
    conn.execute(
        "UPDATE spans SET start_ms=? WHERE cam=? AND start_ms<? AND end_ms>?",
        (cutoff_ms, cam, cutoff_ms, cutoff_ms),
    )


def prune_loop():
    global PRUNING_ACTIVE_UNTIL
    while True:
        try:
            conn = db()

            # 1) Retenção por IDADE: derruba sessões inteiras (um rmtree é
            # muito mais barato que apagar milhares de arquivos soltos).
            cutoff = int((time.time() - RETAIN_HOURS * 3600) * 1000)
            aged = conn.execute(
                "SELECT cam, sess FROM segments GROUP BY cam, sess"
                " HAVING MAX(start_ms + dur_ms) < ?",
                (cutoff,),
            ).fetchall()
            for cam, sess in aged:
                drop_session(conn, cam, sess, keep_spans=True)
            if aged:
                log_event(
                    conn,
                    "prune_age",
                    None,
                    f"{len(aged)} sessoes removidas por idade (>{RETAIN_HOURS:g}h)",
                )
            for (cam,) in conn.execute("SELECT cam FROM cam_state").fetchall():
                trim_spans(conn, cam, cutoff)
            conn.commit()

            # 2) Marca d'água de DISCO: independente da idade, garante espaço
            # para o gravador. Apaga sempre a sessão mais antiga do acervo.
            # Esta é a regra que nunca pode ser suavizada: a alternativa a um
            # dia a menos de sessão completa é o disco encher e TODAS as
            # câmeras pararem ao mesmo tempo.
            for _ in range(200):
                du = shutil.disk_usage(REC_ROOT)
                if (du.total - du.free) / du.total < DISK_HIGH:
                    break
                row = conn.execute(
                    "SELECT cam, sess, MIN(start_ms) FROM segments"
                    " GROUP BY cam, sess ORDER BY MIN(start_ms) LIMIT 1"
                ).fetchone()
                if not row:
                    break
                cam, sess, _ = row
                pct = round(100 * (du.total - du.free) / du.total, 1)
                log_event(
                    conn,
                    "prune_disk",
                    cam,
                    f"disco em {pct}% — removida a sessao mais antiga ({sess})",
                )
                drop_session(conn, cam, sess)
                conn.commit()
                # Fica de pé por 15 min depois do último corte: o relatório de
                # saúde é de 60 em 60 s e não pode perder o episódio.
                PRUNING_ACTIVE_UNTIL = time.time() + 900
                du = shutil.disk_usage(REC_ROOT)
                if (du.total - du.free) / du.total < DISK_LOW:
                    break

            # 3) Diretórios órfãos (sessão abortada sem playlist útil) > 2 h.
            for d in glob.glob(os.path.join(REC_ROOT, "*", "*")):
                try:
                    sess = os.path.basename(d)
                    cam = os.path.basename(os.path.dirname(d))
                    # Prefixo `_` é infraestrutura (_backup), não sessão.
                    if sess.startswith("_") or cam.startswith("_"):
                        continue
                    if os.stat(d).st_mtime > time.time() - 2 * 3600:
                        continue
                    n = conn.execute(
                        "SELECT COUNT(*) FROM segments WHERE cam=? AND sess=?",
                        (cam, sess),
                    ).fetchone()[0]
                    if n == 0:
                        shutil.rmtree(d, ignore_errors=True)
                except OSError:
                    pass
            conn.execute(
                "DELETE FROM events WHERE ts_ms < ?",
                (int((time.time() - 30 * 86400) * 1000),),
            )
            conn.commit()
        except Exception as e:
            print(f"prune: {e}", flush=True)
        time.sleep(300)


# ---------------------------------------------------------------- watchdog

STATS_CACHE: dict = {}


def seed_counters():
    """Uma varredura completa (a ÚLTIMA): popula os contadores a partir do que
    já está no índice. Roda a cada subida do serviço e corrige qualquer deriva
    acumulada."""
    conn = db()
    cams = [r[0] for r in conn.execute("SELECT DISTINCT cam FROM segments")]
    done = 0
    for cam in cams:
        # Uma câmera por vez: a leitura fica FORA da transação e a escrita é um
        # UPDATE só. A versão "tudo numa transação" segurava a escrita atrás do
        # indexador e morria em "database is locked".
        oldest, n, dur, byt = conn.execute(
            "SELECT MIN(start_ms), COUNT(*), COALESCE(SUM(dur_ms),0),"
            " COALESCE(SUM(size_bytes),0) FROM segments WHERE cam=?",
            (cam,),
        ).fetchone()
        for attempt in range(5):
            try:
                conn.execute("INSERT OR IGNORE INTO cam_state(cam) VALUES(?)", (cam,))
                # Soma o que o indexador inseriu ENQUANTO a leitura corria:
                # zerar para o valor lido perderia esses segmentos.
                conn.execute(
                    "UPDATE cam_state SET oldest_ms=?, seg_count=?+"
                    " (SELECT COUNT(*) FROM segments WHERE cam=? AND start_ms>?),"
                    " dur_total=?, bytes_total=? WHERE cam=?",
                    (oldest, n, cam, int(time.time() * 1000), dur, byt, cam),
                )
                conn.commit()
                done += 1
                break
            except sqlite3.OperationalError as e:
                conn.rollback()
                time.sleep(1 + attempt)
                if attempt == 4:
                    print(f"stats: seed {cam} falhou: {e}", flush=True)
    print(f"stats: contadores semeados para {done}/{len(cams)} cameras", flush=True)


def stats_loop():
    """Recalcula o /stats numa thread própria: com os contadores o cálculo é
    barato, mas continua fora do caminho da requisição. No Sentinela, computar
    ao vivo custava 3–5 s e o painel do admin acusava 'relay indisponível' com
    o relay de pé."""
    try:
        seed_counters()
    except Exception as e:
        print(f"stats: seed falhou: {e}", flush=True)
    while True:
        try:
            body = Handler.compute_stats()
            STATS_CACHE["body"], STATS_CACHE["ts"] = body, time.time()
        except Exception as e:
            print(f"stats: {e}", flush=True)
        time.sleep(30)


def watchdog_loop():
    """Duas funções: (a) vigia o FRESCOR DO DADO — o modo de falha clássico é
    ffmpeg vivo com pipe morto, então checar processo não basta; (b) registra
    no diário quando uma câmera cai e quando volta, que é a informação que
    permite investigar depois ("caiu 03:12, voltou 03:14").

    O restart só acontece se o BATIMENTO do gravador também estiver velho. Sem
    essa condição o watchdog confundia "travado" com "esperando conexão de
    propósito", e o restart zerava o recuo do gravador numa câmera offline."""
    last_restart = {}
    online = {}
    down_since = {}
    while True:
        try:
            conn = db()
            now = time.time()
            for cam in RECORD_CAMS:
                row = conn.execute(
                    "SELECT last_end_ms FROM cam_state WHERE cam=?", (cam,)
                ).fetchone()
                newest = (row[0] if row else 0) / 1000
                age = now - newest if newest else 1e9
                up = age < CAMERA_DOWN_S

                # Transições viram evento (só a borda, não o estado).
                if cam in online and online[cam] != up:
                    if up:
                        secs = int(now - down_since.get(cam, now))
                        log_event(
                            conn, "camera_online", cam, f"voltou apos {secs}s sem video"
                        )
                        down_since.pop(cam, None)
                    else:
                        down_since[cam] = now - age
                        log_event(
                            conn, "camera_offline", cam, f"sem video ha {int(age)}s"
                        )
                online[cam] = up

                if age < 150 or now - last_restart.get(cam, 0) < 600:
                    continue
                try:
                    hb = time.time() - os.path.getmtime(f"{HB_DIR}/{cam}.hb")
                except OSError:
                    hb = None
                if hb is not None and hb < HB_STALE_S:
                    continue
                unit = f"replayja-rec@{cam}.service"
                if (
                    subprocess.run(["systemctl", "is-active", "--quiet", unit]).returncode
                    == 0
                ):
                    log_event(
                        conn, "watchdog_restart", cam, f"sem segmento novo ha {int(age)}s"
                    )
                    subprocess.run(["systemctl", "restart", unit])
                    last_restart[cam] = now
        except Exception as e:
            print(f"watchdog: {e}", flush=True)
        time.sleep(15)


# ------------------------------------------------------------------- HTTP


def rel_uri(cam: str, sess: str, name: str) -> str:
    # As playlists moram em /(live|vod)/<cam>/...: `../../` resolve para a raiz
    # do site MANTENDO o prefixo /t/<token> no navegador — as URLs relativas
    # herdam o token de graça.
    return f"../../rec/{cam}/{sess}/{name}"


def live_start_offset(rows) -> float:
    """Quantos segundos atrás da borda o player deve ENTRAR.

    Três segmentos TÍPICOS de colchão, com piso e teto. "Típico" é a mediana
    da cauda da janela e não o máximo (que é o que o TARGETDURATION é): um
    buraco de uplink de 68 s enterrado 15 min atrás não pode decidir onde
    alguém entra agora."""
    durs = sorted(d for _, _, _, d, _, _ in rows[-LIVE_START_AMOSTRA:])
    meio = len(durs) // 2
    tipica = (
        durs[meio] if len(durs) % 2 else (durs[meio - 1] + durs[meio]) / 2
    ) / 1000
    n = min(LIVE_START_SEGMENTS * tipica, LIVE_START_MAX_S)
    # O piso nunca pode cair DENTRO do último segmento: entrar a 20 s da borda
    # com segmentos de 30 s é entrar num segmento que ainda nem começou.
    return max(n, LIVE_START_MIN_S, tipica + 2)


def build_playlist(cam: str, rows, live: bool) -> str:
    target = max(d for _, _, _, d, _, _ in rows) / 1000
    mseq = rows[0][4]
    dseq = rows[0][5]
    lines = [
        "#EXTM3U",
        "#EXT-X-VERSION:7",
        "#EXT-X-INDEPENDENT-SEGMENTS",
        f"#EXT-X-TARGETDURATION:{int(target + 0.999)}",
        f"#EXT-X-MEDIA-SEQUENCE:{mseq}",
        f"#EXT-X-DISCONTINUITY-SEQUENCE:{dseq}",
    ]
    if live:
        # SÓ no vivo. No VOD quem escolhe a posição é a pessoa (o scrub do
        # painel abre num instante pedido), e um EXT-X-START roubaria isso.
        lines.append(f"#EXT-X-START:TIME-OFFSET=-{live_start_offset(rows):.3f}")
    else:
        lines.insert(1, "#EXT-X-PLAYLIST-TYPE:VOD")
    prev_sess = None
    prev_end = None
    for sess, seg, start_ms, dur_ms, _, _ in rows:
        # Troca de sessão OU buraco no tempo: o player precisa saber que os
        # timestamps quebram, senão trava tentando emendar o inemendável.
        gap = prev_end is not None and start_ms - prev_end > 1500
        if prev_sess is not None and (sess != prev_sess or gap):
            lines.append("#EXT-X-DISCONTINUITY")
        if sess != prev_sess:
            lines.append(f'#EXT-X-MAP:URI="{rel_uri(cam, sess, "init.mp4")}"')
            prev_sess = sess
        t = datetime.fromtimestamp(start_ms / 1000, tz=timezone.utc)
        lines.append(
            "#EXT-X-PROGRAM-DATE-TIME:"
            + t.strftime("%Y-%m-%dT%H:%M:%S.")
            + f"{t.microsecond // 1000:03d}+00:00"
        )
        lines.append(f"#EXTINF:{dur_ms / 1000:.5f},")
        lines.append(rel_uri(cam, sess, seg))
        prev_end = start_ms + dur_ms
    if not live:
        lines.append("#EXT-X-ENDLIST")
    return "\n".join(lines) + "\n"


def build_clip_playlist(cam: str, rows, rec_root=None) -> str:
    """Mesma playlist do VOD, mas com CAMINHOS ABSOLUTOS DE DISCO: é consumida
    pelo ffmpeg aqui dentro, não pelo navegador.

    Manter o formato HLS (em vez de concatenar arquivos na mão) é o que faz a
    troca de sessão funcionar: o demuxer entende `EXT-X-MAP` mudando no meio e
    `EXT-X-DISCONTINUITY`, que é exatamente o que quebra quando se concatena
    fMP4 no braço — o arquivo resultante só toca até a primeira sessão."""
    root = (rec_root if rec_root is not None else REC_ROOT).rstrip("/")
    target = max(d for _, _, _, d, _, _ in rows) / 1000
    lines = [
        "#EXTM3U",
        "#EXT-X-VERSION:7",
        "#EXT-X-PLAYLIST-TYPE:VOD",
        "#EXT-X-INDEPENDENT-SEGMENTS",
        f"#EXT-X-TARGETDURATION:{int(target + 0.999)}",
        "#EXT-X-MEDIA-SEQUENCE:0",
    ]
    prev_sess = None
    prev_end = None
    for sess, seg, start_ms, dur_ms, _, _ in rows:
        gap = prev_end is not None and start_ms - prev_end > 1500
        if prev_sess is not None and (sess != prev_sess or gap):
            lines.append("#EXT-X-DISCONTINUITY")
        if sess != prev_sess:
            # Barra normal, não os.path.join: URI de playlist é sempre "/", e
            # este arquivo é gerado num relay Linux mesmo quando os testes
            # rodam no Windows.
            lines.append(f'#EXT-X-MAP:URI="{root}/{cam}/{sess}/init.mp4"')
            prev_sess = sess
        lines.append(f"#EXTINF:{dur_ms / 1000:.5f},")
        lines.append(f"{root}/{cam}/{sess}/{seg}")
        prev_end = start_ms + dur_ms
    lines.append("#EXT-X-ENDLIST")
    return "\n".join(lines) + "\n"


def coverage_from_spans(spans, frm_ms, to_ms) -> float:
    """Fração da janela [frm, to) que existe de fato em disco.

    É o número que decide se o clipe sai `ready`, `partial` ou `failed`
    (`no_coverage`) — ver `docs/api/README.md` §4. Função pura de propósito: é
    a conta mais carregada de consequência do relay, e ela precisa ser
    testável sem disco, sem SQLite e sem ffmpeg.

    `spans` é uma lista de `(start_ms, end_ms)` em qualquer ordem; sobreposição
    entre eles é tratada (a união é que conta, não a soma)."""
    span_ms = to_ms - frm_ms
    if span_ms <= 0:
        return 0.0
    pedacos = []
    for a, b in spans:
        a2, b2 = max(a, frm_ms), min(b, to_ms)
        if b2 > a2:
            pedacos.append((a2, b2))
    if not pedacos:
        return 0.0
    pedacos.sort()
    coberto = 0
    cur_a, cur_b = pedacos[0]
    for a, b in pedacos[1:]:
        if a > cur_b:
            coberto += cur_b - cur_a
            cur_a, cur_b = a, b
        else:
            cur_b = max(cur_b, b)
    coberto += cur_b - cur_a
    return min(1.0, coberto / span_ms)


def window_offset_ms(first_segment_start_ms: int, deliver_from_ms: int) -> int:
    """Deslocamento, em ms, do início entregue dentro do recorte bruto.

    O `/clip` remuxa com `-c copy` a partir do segmento que CONTÉM `from` —
    logo o arquivo bruto começa em `first_segment_start_ms`, que é <= `from`
    (sobra menos de um segmento de cabeça). Como os segmentos são
    `independent_segments`, esse início é sempre um KEYFRAME: é aqui que mora
    o "ajustado a keyframe" da janela.

    O `-ss` do passe de marca d'água usa este valor como seek DE SAÍDA, e é ele
    que transforma um corte alinhado a segmento (granularidade de 2 s) num
    corte exato ao quadro. Nunca pode ser negativo: se for, o recorte bruto não
    contém o início pedido e alguma coisa está errada na janela."""
    return max(0, deliver_from_ms - first_segment_start_ms)


SEG_COLS = "sess, seg, start_ms, dur_ms, seq, disc"


def _leia_arquivo(path, default=None):
    try:
        with open(path) as f:
            return f.read().strip()
    except OSError:
        return default


def _iso(ms):
    if not ms:
        return None
    return (
        datetime.fromtimestamp(ms / 1000, tz=timezone.utc)
        .isoformat(timespec="milliseconds")
        .replace("+00:00", "Z")
    )


# --------------------------------------------------------------- CPU/steal
#
# `stealPercent` é SINAL VITAL numa instância burstable, e o piloto roda numa
# `t4g.medium` em modo de crédito `standard` (ADR §9). A Lightsail do Sentinela
# chegou a 53% de steal em 04/09/2026, sobrando ~1,9 de 4 vCPU — e isso só foi
# descoberto porque alguém leu /proc/stat à mão. Aqui o número sai de graça, a
# cada ciclo do cache de stats, e vai para o painel.
_CPU_PREV = {}


def cpu_snapshot():
    """(load1m, stealPercent, recorderPercent, workerPercent). Qualquer parte
    indisponível vira None — este bloco nunca pode derrubar o /stats."""
    load1m = None
    try:
        load1m = round(os.getloadavg()[0], 2)
    except (OSError, AttributeError):
        pass

    steal = None
    try:
        with open("/proc/stat") as f:
            campos = f.readline().split()
        vals = [int(x) for x in campos[1:]]
        total = sum(vals)
        st = vals[7] if len(vals) > 7 else 0
        ant = _CPU_PREV.get("proc")
        _CPU_PREV["proc"] = (total, st)
        if ant and total > ant[0]:
            steal = round(100 * (st - ant[1]) / (total - ant[0]), 2)
    except (OSError, ValueError, IndexError):
        pass

    def cgroup_pct(chave, padroes):
        """Uso de CPU de um conjunto de cgroups, em % de um núcleo."""
        usec = 0
        achou = False
        for padrao in padroes:
            for caminho in glob.glob(padrao):
                try:
                    with open(caminho) as f:
                        for linha in f:
                            if linha.startswith("usage_usec"):
                                usec += int(linha.split()[1])
                                achou = True
                except (OSError, ValueError):
                    continue
        if not achou:
            return None
        agora = time.time()
        ant = _CPU_PREV.get(chave)
        _CPU_PREV[chave] = (agora, usec)
        if not ant or agora <= ant[0]:
            return None
        return round(100 * (usec - ant[1]) / 1e6 / (agora - ant[0]), 1)

    base = "/sys/fs/cgroup/system.slice"
    rec = cgroup_pct(
        "rec",
        [
            f"{base}/system-replayja\\x2drec.slice/*/cpu.stat",
            f"{base}/replayja-rec@*.service/cpu.stat",
        ],
    )
    wrk = cgroup_pct("wrk", [f"{base}/replayja-clip-worker.service/cpu.stat"])
    return load1m, steal, rec, wrk


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    # Conexão keep-alive ociosa não pode ficar eterna: a thread parada guarda
    # uma conexão SQLite, e conexão SQLite parada no lugar errado trava o
    # checkpoint do WAL. Aplica-se a cada operação de socket, não à requisição
    # inteira — o /clip pode levar os seus 120 s gerando o MP4.
    timeout = 65

    # Ligado só durante um HEAD. A instância é REUTILIZADA na mesma conexão
    # (keep-alive), então cada do_* zera o estado no começo.
    _so_cabecalho = False

    # ------------------------------------------------------------- despacho

    def do_GET(self):  # noqa: N802
        self._so_cabecalho = False
        return self._roteia()

    def do_HEAD(self):  # noqa: N802
        """Mesma rota do GET, mesmos cabeçalhos, sem corpo.

        Sem isto o `BaseHTTPRequestHandler` responde 501 a QUALQUER HEAD. No
        Sentinela era esse 501 que fazia o app concluir "este relay não serve
        miniatura" e cair na captura local por 5 minutos — com o `/thumb`
        funcionando por GET o tempo todo. O corpo é suprimido nos três
        remetentes (`_send`, `_send_jpeg`, `_send_file`) e não aqui: assim cada
        rota calcula os cabeçalhos que calcularia de verdade, inclusive os
        400/404/503, em vez de existir uma segunda tabela de rotas que
        envelheceria em silêncio."""
        self._so_cabecalho = True
        return self._roteia()

    def do_POST(self):  # noqa: N802
        self._so_cabecalho = False
        try:
            u = urlparse(self.path)
            parts = u.path.strip("/").split("/")
            # ACORDAR O WORKER. Chamada fire-and-forget que a API faz logo
            # depois de gravar o `clip_job` no Postgres. Payload MÍNIMO de
            # propósito: o relay **não confia** nele — usa só como aviso e vai
            # buscar a verdade em `GET /relay/clip-jobs`. Se esta chamada
            # falhar (relay reiniciando, rede), nada se perde: o ciclo de 2 s
            # do worker pega o job. Ela existe só para tirar até 2 s da
            # latência percebida pelo atleta.
            #
            # A autorização (`relayToken`) já aconteceu no Caddy/sidecar; aqui
            # basta não deixar um processo local qualquer escrever no arquivo.
            if u.path == "/jobs":
                if not (self._tem_chave() or self.headers.get("Authorization")):
                    return self._send(401, "nao autorizado\n", "text/plain")
                try:
                    os.makedirs(HB_DIR, exist_ok=True)
                    with open(os.path.join(HB_DIR, "wake"), "w") as f:
                        f.write(str(time.time()))
                except OSError:
                    pass
                self.send_response(204)
                self.send_header("Content-Length", "0")
                self.end_headers()
                return
            if not self._tem_chave():
                return self._send(401, "nao autorizado\n", "text/plain")
            # ENCERRAR UMA CÂMERA: apaga a gravação dela do disco E do índice.
            # Quem chama é o `sync-cameras.sh`, ao executar a lápide que a API
            # publicou. `rm -rf` no shell não bastaria: o índice continuaria
            # anunciando a câmera no /stats e servindo playlist para arquivos
            # que sumiram. IRREVERSÍVEL — por isso o id é conferido contra o
            # mesmo formato que o resto do sistema exige antes de virar
            # caminho. Este é o único ponto do relay que apaga por nome vindo
            # de fora.
            if len(parts) == 3 and parts[0] == "cam" and parts[2] == "forget":
                cam = parts[1]
                if not CAM_VALIDA.match(cam):
                    return self._send(400, "cam invalida\n", "text/plain")
                conn = db()
                sess = [
                    r[0]
                    for r in conn.execute(
                        "SELECT DISTINCT sess FROM segments WHERE cam=?", (cam,)
                    ).fetchall()
                ]
                for s in sess:
                    drop_session(conn, cam, s, keep_spans=True)
                shutil.rmtree(os.path.join(REC_ROOT, cam), ignore_errors=True)
                shutil.rmtree(os.path.join(THUMB_DIR, cam), ignore_errors=True)
                conn.execute("DELETE FROM spans WHERE cam=?", (cam,))
                conn.execute("DELETE FROM cam_state WHERE cam=?", (cam,))
                conn.commit()
                log_event(conn, "cam_forget", cam, f"{len(sess)} sessoes apagadas")
                return self._send(
                    200,
                    json.dumps({"ok": True, "cam": cam, "sessoes": len(sess)}) + "\n",
                    "application/json",
                )
            return self._send(404, "not found\n", "text/plain")
        except Exception as e:
            print(f"http post: {e}", flush=True)
            return self._send(500, "erro\n", "text/plain")

    def _roteia(self):
        try:
            u = urlparse(self.path)
            parts = u.path.strip("/").split("/")
            q = parse_qs(u.query)
            if u.path == "/healthz":
                return self._healthz()
            if u.path == "/stats":
                return self._stats()
            if u.path == "/logs":
                return self._logs(q)
            if len(parts) == 3 and parts[0] == "live" and parts[2] == "index.m3u8":
                return self._live(parts[1])
            if len(parts) == 3 and parts[0] == "vod" and parts[2] == "index.m3u8":
                return self._vod(parts[1], q)
            if len(parts) == 2 and parts[0] == "spans":
                return self._spans(parts[1], q)
            if len(parts) == 2 and parts[0] == "clip":
                return self._clip(parts[1], q)
            if len(parts) == 2 and parts[0] == "thumb":
                return self._thumb(parts[1], q)
            return self._send(404, "not found\n", "text/plain")
        except Exception as e:
            print(f"http: {e}", flush=True)
            return self._send(500, "erro\n", "text/plain")

    def _tem_chave(self):
        k = self.headers.get("x-relay-key", "")
        return bool(RELAY_KEY and k and hmac.compare_digest(k, RELAY_KEY))

    # --------------------------------------------------------- playlists

    def _live(self, cam):
        now_ms = int(time.time() * 1000)
        # BORDA NO RITMO DO RELÓGIO: o ffmpeg carimba o PROGRAM-DATE-TIME pela
        # DURAÇÃO da mídia, não pela hora de chegada. Quando a origem entrega
        # uma rajada (reconexão, recuperação de queda), vários segundos entram
        # de uma vez e os carimbos saltam à frente do relógio — a borda pulava
        # para a frente e o player corria atrás dela. Só publicamos o que já
        # COMEÇOU no tempo real. Tolerância de +8 s porque o PDT nasce do
        # relógio do ffmpeg e pode correr alguns segundos à frente.
        rows = (
            db()
            .execute(
                f"SELECT {SEG_COLS} FROM segments"
                " WHERE cam=? AND start_ms >= ? AND start_ms <= ?"
                " ORDER BY start_ms LIMIT 2000",
                (cam, now_ms - LIVE_WINDOW_S * 1000, now_ms + 8000),
            )
            .fetchall()
        )
        if not rows:
            return self._send(404, "sem gravacao\n", "text/plain")
        newest = rows[-1][2] + rows[-1][3]
        if now_ms - newest > LIVE_STALE_S * 1000:
            # Borda parada: "indisponível" honesto é melhor que passado servido
            # como vivo.
            return self._send(404, "camera sem sinal\n", "text/plain")
        # Câmera de RAJADAS (uplink instável, sessões curtas que morrem a cada
        # ~30 s): colado na borda real o player toca 10 s e trava 20 s
        # esperando a próxima rajada — e os buracos NÃO existem na linha do
        # tempo da playlist (EXTINF só conta mídia). Para essas câmeras a
        # playlist TERMINA 45 s atrás do relógio: o player persegue uma borda
        # atrasada que avança suave. Semântica 100% padrão de HLS, sem depender
        # de configuração do player.
        recent_sess = {r[0] for r in rows if r[2] >= now_ms - 600_000}
        if len(recent_sess) >= 4:
            cut = now_ms - 45_000
            delayed = [r for r in rows if r[2] + r[3] <= cut]
            if not delayed:
                return self._send(404, "aguardando janela\n", "text/plain")
            rows = delayed
        return self._send(
            200, build_playlist(cam, rows, live=True), "application/vnd.apple.mpegurl"
        )

    def _vod(self, cam, q):
        try:
            frm = int(q["from"][0])
            to = int(q["to"][0])
        except (KeyError, ValueError, IndexError):
            return self._send(400, "from/to (epoch ms)\n", "text/plain")
        if to <= frm or to - frm > 6 * 3600 * 1000:
            return self._send(400, "faixa invalida (max 6h)\n", "text/plain")
        rows = self._rows_da_janela(cam, frm, to, limite=12000)
        if not rows:
            return self._send(404, "sem gravacao nessa faixa\n", "text/plain")
        return self._send(
            200, build_playlist(cam, rows, live=False), "application/vnd.apple.mpegurl"
        )

    def _rows_da_janela(self, cam, frm, to, limite):
        """Segmentos que cobrem [frm, to). Começa no segmento que CONTÉM `frm`
        — é por isso que o `-10 s` na consulta e o filtro depois: a busca pega
        um pouco antes e descarta o que termina antes da janela."""
        rows = (
            db()
            .execute(
                f"SELECT {SEG_COLS} FROM segments"
                " WHERE cam=? AND start_ms >= ? AND start_ms < ?"
                " ORDER BY start_ms LIMIT ?",
                (cam, frm - 10_000, to, limite),
            )
            .fetchall()
        )
        return [r for r in rows if r[2] + r[3] > frm]

    # -------------------------------------------------------------- /clip

    def _clip(self, cam, q):
        """Trecho gravado como MP4 único, pronto para baixar ou processar.

        Três consumidores: o `clip-worker.py` (que pede a janela bruta de ~38 s
        e depois recorta ao quadro), o "estender lance" do app e o painel do
        parceiro auditando um trecho da sessão.

        Por que remuxar em vez de entregar a playlist: o que está no disco é
        fMP4 fatiado em ~2 s e, pela regra de ouro do gravador, qualquer janela
        longa cruza troca de sessão. Emendar isso no cliente gera arquivo que
        só toca até a primeira sessão. Aqui o ffmpeg copia os pacotes
        (`-c copy`, sem recodificar) atravessando as descontinuidades.

        Dois cabeçalhos de resposta que o worker consome e que o contrato
        declara (`openapi.yaml`, `/t/{relayToken}/clip/{cameraId}`):
          X-Coverage-Ratio  — fração da janela pedida que existe em disco
          X-Window-Start-Ms — início real do arquivo (keyframe do 1º segmento)
        """
        if not CAM_VALIDA.match(cam or ""):
            return self._send(400, "camera invalida\n", "text/plain")
        try:
            frm = int(q["from"][0])
            to = int(q["to"][0])
        except (KeyError, ValueError, IndexError):
            return self._send(400, "from/to (epoch ms)\n", "text/plain")
        if to <= frm:
            return self._send(400, "faixa invalida\n", "text/plain")
        if to - frm > CLIP_MAX_MS:
            return self._send(
                400,
                f"trecho maior que o limite ({CLIP_MAX_MS // 60000} min)\n",
                "text/plain",
            )
        rows = self._rows_da_janela(cam, frm, to, limite=4000)
        if not rows:
            return self._send(404, "sem gravacao nessa faixa\n", "text/plain")

        spans = (
            db()
            .execute(
                "SELECT start_ms, end_ms FROM spans"
                " WHERE cam=? AND end_ms > ? AND start_ms < ?",
                (cam, frm, to),
            )
            .fetchall()
        )
        cobertura = coverage_from_spans(spans, frm, to)
        inicio_real = rows[0][2]

        # Cheio: 503 honesto em vez de fila crescendo em cima da gravação.
        if not CLIP_SLOTS.acquire(blocking=False):
            self.send_response(503)
            self.send_header("Retry-After", "20")
            self.send_header("Content-Length", "0")
            self.end_headers()
            return
        t0 = time.time()
        try:
            with tempfile.TemporaryDirectory(prefix="clip-") as tmp:
                pl = os.path.join(tmp, "in.m3u8")
                out = os.path.join(tmp, "out.mp4")
                with open(pl, "w") as fh:
                    fh.write(build_clip_playlist(cam, rows))
                cmd = [
                    "ffmpeg", "-nostdin", "-y", "-loglevel", "error",
                    # `.m4s` não está na lista padrão, e a playlist local só
                    # pode abrir arquivo — sem isto o demuxer recusa tudo.
                    "-allowed_extensions", "ALL",
                    "-protocol_whitelist", "file,crypto,data",
                    "-i", pl,
                    "-c", "copy",
                    # A janela começa no segmento que CONTÉM `from`, então a
                    # sobra de cabeça é < 1 segmento; `-t` garante que o
                    # arquivo nunca passe do pedido.
                    "-t", f"{(to - frm) / 1000:.3f}",
                    # Descontinuidade entre sessões deixa DTS negativo; sem
                    # isto o mux descarta os primeiros pacotes de cada trecho.
                    "-avoid_negative_ts", "make_zero",
                    "-movflags", "+faststart",
                    "-f", "mp4", out,
                ]
                try:
                    p = subprocess.run(cmd, capture_output=True, timeout=CLIP_TIMEOUT_S)
                except subprocess.TimeoutExpired:
                    log_event(db(), "clip_timeout", cam, f"{frm}-{to}")
                    return self._send(504, "remux demorou demais\n", "text/plain")
                except OSError as e:
                    log_event(db(), "clip_erro", cam, f"ffmpeg: {e}")
                    return self._send(500, "ffmpeg indisponivel\n", "text/plain")
                if p.returncode != 0 or not os.path.exists(out):
                    err = p.stderr.decode("utf8", "replace")[-300:]
                    log_event(db(), "clip_erro", cam, err)
                    print(f"clip {cam}: {err}", flush=True)
                    return self._send(500, "falha ao gerar o arquivo\n", "text/plain")
                started = datetime.fromtimestamp(rows[0][2] / 1000, tz=timezone.utc)
                name = f"{cam}_{started.strftime('%Y-%m-%d_%H-%M-%S')}Z.mp4"
                size = os.path.getsize(out)
                log_event(
                    db(),
                    "clip",
                    cam,
                    f"{(to - frm) // 1000}s · {size // 1024}KB ·"
                    f" cobertura {cobertura:.3f} · {int((time.time()-t0)*1000)}ms",
                )
                return self._send_file(
                    out,
                    name,
                    size,
                    extra={
                        "X-Coverage-Ratio": f"{cobertura:.4f}",
                        "X-Window-Start-Ms": str(inicio_real),
                        "X-Cut-Ms": str(int((time.time() - t0) * 1000)),
                    },
                )
        finally:
            CLIP_SLOTS.release()

    # ------------------------------------------------------------- /thumb

    def _thumb(self, cam, q):
        """JPEG do quadro que estava no ar em `t` (epoch ms).

        Cache em disco e não em memória: o quadro de um instante PASSADO nunca
        muda, então ele também sai com `immutable` para o navegador."""
        if not CAM_VALIDA.match(cam or ""):
            return self._send(400, "camera invalida\n", "text/plain")
        try:
            t = int(q["t"][0])
        except (KeyError, ValueError, IndexError):
            return self._send(400, "t (epoch ms)\n", "text/plain")
        # Quantiza ANTES de virar chave: é o que faz dois pedidos vizinhos
        # caírem no mesmo arquivo.
        t = (t // THUMB_QUANTUM_MS) * THUMB_QUANTUM_MS
        destino = os.path.join(THUMB_DIR, cam, f"{t}.jpg")
        if os.path.exists(destino):
            return self._send_jpeg(destino)

        # O segmento que CONTÉM o instante. Sem ele não há quadro: instante
        # fora da gravação é 404 honesto, não uma imagem preta — imagem preta
        # seria mentira, e este produto entrega prova visual.
        row = (
            db()
            .execute(
                f"SELECT {SEG_COLS} FROM segments"
                " WHERE cam=? AND start_ms <= ? AND start_ms + dur_ms > ?"
                " ORDER BY start_ms DESC LIMIT 1",
                (cam, t, t),
            )
            .fetchone()
        )
        if not row:
            return self._send(404, "sem gravacao nesse instante\n", "text/plain")
        deslocamento = max(0.0, (t - row[2]) / 1000)

        if self._so_cabecalho:
            # Sonda: a rota existe, o token vale e HÁ gravação nesse instante —
            # o GET devolveria um JPEG. Dizer isso custa uma consulta; gerar a
            # imagem custaria um ffmpeg que ninguém pediu. `Content-Length`
            # fica de fora de propósito (RFC 9110 §9.3.2 permite omitir campo
            # que só se determina ao produzir o conteúdo) e `no-store` para que
            # ninguém guarde a resposta da sonda no lugar da miniatura.
            self.send_response(200)
            self.send_header("Content-Type", "image/jpeg")
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            return

        if not THUMB_SLOTS.acquire(blocking=False):
            self.send_response(503)
            self.send_header("Retry-After", "5")
            self.send_header("Content-Length", "0")
            self.end_headers()
            return
        try:
            self._podar_thumbs()
            with tempfile.TemporaryDirectory(prefix="thumb-") as tmp:
                pl = os.path.join(tmp, "in.m3u8")
                out = os.path.join(tmp, "out.jpg")
                with open(pl, "w") as fh:
                    fh.write(build_clip_playlist(cam, [row]))
                cmd = [
                    "ffmpeg", "-nostdin", "-y", "-loglevel", "error",
                    "-allowed_extensions", "ALL",
                    "-protocol_whitelist", "file,crypto,data",
                    "-i", pl,
                    # `-ss` DEPOIS do -i (seek de saída): decodifica o segmento
                    # desde o início e para no quadro certo. Num segmento de
                    # ~2 s isso é barato e, ao contrário do seek de entrada,
                    # não erra o alvo quando o keyframe está antes. É a mesma
                    # receita do passe de marca d'água do worker.
                    "-ss", f"{deslocamento:.3f}",
                    "-frames:v", "1",
                    "-vf", f"scale={THUMB_W}:-2",  # -2 mantém proporção e altura par
                    "-q:v", "4",
                    "-f", "image2", out,
                ]
                try:
                    p = subprocess.run(cmd, capture_output=True, timeout=THUMB_TIMEOUT_S)
                except subprocess.TimeoutExpired:
                    log_event(db(), "thumb_timeout", cam, str(t))
                    return self._send(504, "miniatura demorou demais\n", "text/plain")
                except OSError as e:
                    log_event(db(), "thumb_erro", cam, f"ffmpeg: {e}")
                    return self._send(500, "ffmpeg indisponivel\n", "text/plain")
                if p.returncode != 0 or not os.path.exists(out):
                    err = p.stderr.decode("utf8", "replace")[-300:]
                    log_event(db(), "thumb_erro", cam, err)
                    return self._send(500, "falha ao gerar a miniatura\n", "text/plain")
                os.makedirs(os.path.dirname(destino), exist_ok=True)
                # Move atômico: outra requisição nunca enxerga meio arquivo.
                parcial = destino + ".parcial"
                shutil.move(out, parcial)
                os.replace(parcial, destino)
                return self._send_jpeg(destino)
        finally:
            THUMB_SLOTS.release()

    @staticmethod
    def _podar_thumbs():
        """Apaga miniatura mais velha que THUMB_RETAIN_H e, o que sobrar acima
        de THUMB_MAX_BYTES, apaga da mais velha para a mais nova.

        Dois critérios porque a idade sozinha não é teto: quantas miniaturas
        cabem em 48 h depende de quanta gente passeou pela timeline, não do
        tempo. O disco aqui é o mesmo em que os gravadores escrevem."""
        global _thumb_prune_at
        agora = time.time()
        if agora - _thumb_prune_at < THUMB_PRUNE_S:
            return
        _thumb_prune_at = agora
        corte = agora - THUMB_RETAIN_H * 3600
        vivas, total = [], 0
        try:
            for caminho in glob.glob(os.path.join(THUMB_DIR, "*", "*.jpg")):
                try:
                    st = os.stat(caminho)
                except OSError:
                    continue
                if st.st_mtime < corte:
                    try:
                        os.remove(caminho)
                    except OSError:
                        pass
                    continue
                vivas.append((st.st_mtime, st.st_size, caminho))
                total += st.st_size
        except OSError:
            return
        if total <= THUMB_MAX_BYTES:
            return
        vivas.sort()  # mais velha primeiro
        apagadas = 0
        for _mtime, tam, caminho in vivas:
            if total <= THUMB_MAX_BYTES:
                break
            try:
                os.remove(caminho)
            except OSError:
                continue
            total -= tam
            apagadas += 1
        if apagadas:
            print(
                f"thumb: cache acima do teto, {apagadas} miniaturas apagadas"
                f" (sobrou {total // 1024 // 1024} MB)",
                flush=True,
            )

    # ------------------------------------------------------------- /spans

    def _spans(self, cam, q):
        now_ms = int(time.time() * 1000)
        try:
            frm = int(q.get("from", [now_ms - 24 * 3600 * 1000])[0])
            to = int(q.get("to", [now_ms])[0])
        except (ValueError, IndexError):
            return self._send(400, "from/to invalidos\n", "text/plain")
        if to <= frm or to - frm > 15 * 24 * 3600 * 1000:
            return self._send(400, "faixa invalida\n", "text/plain")
        rows = (
            db()
            .execute(
                "SELECT start_ms, end_ms FROM spans"
                " WHERE cam=? AND end_ms > ? AND start_ms < ? ORDER BY start_ms",
                (cam, frm, to),
            )
            .fetchall()
        )
        spans = [
            {"from": max(a, frm), "to": min(b, to)}
            for a, b in rows
            if min(b, to) > max(a, frm)
        ]
        # `coverage` vem junto porque quem chama /spans quase sempre quer a
        # conta, não a lista — e é a MESMA função que decide ready/partial.
        return self._send(
            200,
            json.dumps(
                {"spans": spans, "coverage": round(coverage_from_spans(rows, frm, to), 6)}
            ),
            "application/json",
        )

    # ------------------------------------------------------------- /stats

    def _stats(self):
        """Serve o retrato do CACHE (ver stats_loop). Se estiver velho (> 150 s),
        computa inline para nunca mentir."""
        now = time.time()
        cached = STATS_CACHE.get("body")
        if cached and now - STATS_CACHE.get("ts", 0) < 150:
            return self._send(200, cached, "application/json")
        body = Handler.compute_stats()
        STATS_CACHE["body"], STATS_CACHE["ts"] = body, time.time()
        return self._send(200, body, "application/json")

    @staticmethod
    def compute_stats():
        """Retrato de saúde do relay NO FORMATO DO CONTRATO.

        O corpo é exatamente o `RelayHealthRequest` do `docs/api/openapi.yaml`
        (camelCase, ISO-8601). Isso é decisão, não acidente: o contrato já
        declara que `GET /stats` devolve esse schema, e com os dois iguais o
        `health-report.py` é um cano de três linhas em vez de um tradutor que
        envelhece em silêncio quando alguém acrescenta um campo.
        """
        now = time.time()
        now_ms = int(now * 1000)
        conn = db()
        H1, H24 = 3600_000, 24 * 3600_000

        def coverage(cam, window_ms, since_ms):
            """Fração do tempo com vídeo gravado na janela (0–1).

            O denominador é a janela OU o tempo desde que ESTA câmera começou a
            gravar, o que for menor: sem isso uma instalação de 5 h mostra
            "cobertura 20%" em 24 h e parece perda de vídeo quando não é."""
            frm = now_ms - window_ms
            if since_ms:
                frm = max(frm, since_ms)
            if now_ms - frm <= 0:
                return None, 0
            rows = conn.execute(
                "SELECT start_ms, end_ms FROM spans"
                " WHERE cam=? AND end_ms > ? AND start_ms < ?",
                (cam, frm, now_ms),
            ).fetchall()
            return coverage_from_spans(rows, frm, now_ms), max(0, len(rows) - 1)

        cams = []
        bytes_1h_total = 0
        for cam in RECORD_CAMS:
            agg = conn.execute(
                "SELECT last_end_ms, oldest_ms, bytes_total FROM cam_state WHERE cam=?",
                (cam,),
            ).fetchone()
            newest, oldest, _bytes = agg or (0, None, 0)
            cov1, _ = coverage(cam, H1, oldest)
            cov24, _ = coverage(cam, H24, oldest)

            # Uma consulta por câmera, com `cam` na frente: `WHERE start_ms > ?`
            # sem `cam` NÃO usa o índice (cam, start_ms) e varria a tabela
            # inteira — era metade do custo do /stats no Sentinela.
            b1h = conn.execute(
                "SELECT COALESCE(SUM(size_bytes),0) FROM segments"
                " WHERE cam=? AND start_ms > ?",
                (cam, now_ms - H1),
            ).fetchone()[0]
            bytes_1h_total += b1h or 0
            long24 = conn.execute(
                "SELECT COUNT(*) FROM segments WHERE cam=? AND start_ms > ? AND dur_ms > ?",
                (cam, now_ms - H24, LONG_SEGMENT_MS),
            ).fetchone()[0]
            sess10m = conn.execute(
                "SELECT COUNT(DISTINCT sess) FROM segments WHERE cam=? AND start_ms > ?",
                (cam, now_ms - 600_000),
            ).fetchone()[0]
            b24h = conn.execute(
                "SELECT COALESCE(SUM(size_bytes),0) FROM segments"
                " WHERE cam=? AND start_ms > ?",
                (cam, now_ms - H24),
            ).fetchone()[0]

            # Maior buraco em 24 h: as fronteiras ENTRE spans (e a distância da
            # ponta do último span até agora, que é o buraco em curso).
            sp = conn.execute(
                "SELECT start_ms, end_ms FROM spans"
                " WHERE cam=? AND end_ms > ? ORDER BY start_ms",
                (cam, now_ms - H24),
            ).fetchall()
            maior_gap = None
            if sp:
                maior = 0
                ant = max(sp[0][0], now_ms - H24)
                for a, b in sp:
                    if a > ant:
                        maior = max(maior, a - ant)
                    ant = max(ant, b)
                maior = max(maior, now_ms - ant)
                maior_gap = int(maior / 1000)

            idade = round(now - newest / 1000, 1) if newest else None
            cams.append(
                {
                    "cameraId": cam,
                    "recorderUp": _unidade_ativa(f"replayja-rec@{cam}.service"),
                    "lastSegmentAt": _iso(newest),
                    "secondsSinceLastSegment": int(idade) if idade is not None else None,
                    "coverage1h": round(cov1, 4) if cov1 is not None else None,
                    "coverage24h": round(cov24, 4) if cov24 is not None else 0.0,
                    "bitrateKbps": round((b1h or 0) * 8 / 3600 / 1000, 1) if b1h else 0.0,
                    "gbPerDay": round((b24h or 0) / 2**30, 2),
                    "longSegments24h": long24,
                    "longestGapSeconds24h": maior_gap,
                    "sessionsLast10m": sess10m,
                    "diskBytes": _bytes or 0,
                    # `down` não está no schema do contrato, mas o contrato
                    # manda ignorar campo desconhecido — e é ele que responde
                    # "a câmera está fora AGORA?" sem obrigar a API a repetir
                    # o limiar de 90 s em outro lugar.
                    "down": idade is None or idade > CAMERA_DOWN_S,
                }
            )

        du = shutil.disk_usage(REC_ROOT)
        used = du.total - du.free
        load1m, steal, rec_pct, wrk_pct = cpu_snapshot()

        try:
            db_bytes = os.path.getsize(DB_PATH)
        except OSError:
            db_bytes = 0
        try:
            with open("/proc/uptime") as f:
                uptime_s = int(float(f.read().split()[0]))
        except (OSError, ValueError):
            uptime_s = None

        # Fila do worker: retrato publicado pelo clip-worker. Ausente = worker
        # nunca subiu (ou está fora), e dizer `null` é diferente de dizer zero.
        try:
            with open(WORKER_STATUS) as f:
                jobs = json.load(f)
            # Retrato velho é retrato mentiroso: o worker reescreve a cada
            # ciclo, então mais de 60 s parado significa worker fora.
            if now - jobs.get("at", 0) > 60:
                jobs = {"inFlight": None, "slotsTotal": jobs.get("slotsTotal"),
                        "stale": True}
        except (OSError, ValueError):
            jobs = None

        body = {
            "relayId": RELAY_ID,
            "reportedAt": _iso(now_ms),
            "version": _leia_arquivo(VERSION_FILE, os.environ.get("RELAY_VERSION", "dev")),
            "uptimeSeconds": uptime_s,
            "camerasVersion": _leia_arquivo(CAMERAS_VERSION_FILE, ""),
            "disk": {
                "totalBytes": du.total,
                "freeBytes": du.free,
                "usedPercent": round(100 * used / du.total, 1),
                "pruningActive": time.time() < PRUNING_ACTIVE_UNTIL,
            },
            "cpu": {
                "load1m": load1m,
                "stealPercent": steal,
                "recorderPercent": rec_pct,
                "workerPercent": wrk_pct,
            },
            "index": {
                "walBytes": WAL_BYTES,
                "dbBytes": db_bytes,
                "lastCheckpointAt": WAL_LAST_CHECKPOINT,
            },
            "jobs": jobs,
            "cameras": cams,
            # Fora do schema, para o runbook: quantos gravadores o systemd tem
            # de pé contra quantos a lista pede, e a retenção que está de fato
            # acontecendo (se for muito menor que a configurada, a poda por
            # disco está cortando antes da hora).
            "recorders": {
                "up": sum(1 for c in cams if c["recorderUp"]),
                "expected": len(RECORD_CAMS),
            },
            "retention": {
                "configuredHours": RETAIN_HOURS,
                "effectiveHours": _retencao_efetiva(conn, now_ms),
                "gbPerDay": round((bytes_1h_total or 0) * 24 / 2**30, 2),
            },
        }
        return json.dumps(body)

    # ------------------------------------------------------------- outros

    def _logs(self, q):
        """Diário de bordo + saída bruta do gravador.

        Duas camadas de propósito: `events` é a narrativa (caiu, voltou, podou,
        reiniciou) — curta e legível; `journal` é o detalhe cru do processo
        daquela câmera, que é onde se olha quando a narrativa não basta."""
        cam = (q.get("cam") or [None])[0]
        try:
            limit = min(500, max(1, int((q.get("limit") or ["120"])[0])))
        except ValueError:
            limit = 120
        if cam:
            rows = (
                db()
                .execute(
                    "SELECT ts_ms, cam, kind, detail FROM events"
                    " WHERE cam=? ORDER BY ts_ms DESC LIMIT ?",
                    (cam, limit),
                )
                .fetchall()
            )
        else:
            rows = (
                db()
                .execute(
                    "SELECT ts_ms, cam, kind, detail FROM events"
                    " ORDER BY ts_ms DESC LIMIT ?",
                    (limit,),
                )
                .fetchall()
            )
        events = [{"ts_ms": a, "cam": b, "kind": c, "detail": d} for a, b, c, d in rows]

        journal = []
        if (q.get("journal") or ["0"])[0] == "1":
            unit = (
                f"replayja-rec@{cam}.service" if cam else "replayja-recserver.service"
            )
            try:
                out = subprocess.run(
                    ["journalctl", "-u", unit, "-n", "80", "--no-pager",
                     "-o", "short-iso", "--output-fields=MESSAGE"],
                    capture_output=True, text=True, timeout=10,
                )
                journal = [l for l in out.stdout.splitlines() if l.strip()][-80:]
            except (subprocess.SubprocessError, OSError) as e:
                journal = [f"(journal indisponivel: {e})"]

        return self._send(
            200, json.dumps({"events": events, "journal": journal}), "application/json"
        )

    def _healthz(self):
        """Sonda curta e barata, para o uptime externo (Better Stack). Não é o
        /stats: aqui ninguém pode pagar por um cálculo."""
        cams = {}
        for cam in RECORD_CAMS:
            row = (
                db()
                .execute("SELECT last_end_ms FROM cam_state WHERE cam=?", (cam,))
                .fetchone()
            )
            cams[cam] = (
                round(time.time() - row[0] / 1000, 1) if row and row[0] else None
            )
        du = shutil.disk_usage(REC_ROOT)
        body = {
            "relayId": RELAY_ID,
            "newestAgeS": cams,
            "disk": {
                "usedPct": round(100 * (du.total - du.free) / du.total, 1),
                "freeGb": round(du.free / 2**30, 1),
            },
            "retainHours": RETAIN_HOURS,
        }
        return self._send(200, json.dumps(body), "application/json")

    # ---------------------------------------------------------- remetentes

    def _send_file(self, path, filename, size, extra=None):
        """Manda o MP4 em pedaços: o arquivo é pequeno, mas não há razão para
        carregá-lo inteiro na memória deste processo."""
        try:
            self.send_response(200)
            self.send_header("Content-Type", "video/mp4")
            self.send_header("Content-Length", str(size))
            self.send_header("Content-Disposition", f'attachment; filename="{filename}"')
            self.send_header("Cache-Control", "no-store")
            for k, v in (extra or {}).items():
                self.send_header(k, v)
            self.end_headers()
            if self._so_cabecalho:
                return
            with open(path, "rb") as fh:
                shutil.copyfileobj(fh, self.wfile, 256 * 1024)
        except (BrokenPipeError, ConnectionResetError):
            pass  # cliente cancelou o download: rotina, não erro

    def _send_jpeg(self, path):
        """Miniatura pronta. `immutable`: o quadro de um instante passado não
        muda, então o navegador pode guardá-la sem revalidar."""
        try:
            tamanho = os.path.getsize(path)
            self.send_response(200)
            self.send_header("Content-Type", "image/jpeg")
            self.send_header("Content-Length", str(tamanho))
            self.send_header("Cache-Control", "public, max-age=86400, immutable")
            self.end_headers()
            if self._so_cabecalho:
                return
            with open(path, "rb") as fh:
                shutil.copyfileobj(fh, self.wfile, 64 * 1024)
        except (BrokenPipeError, ConnectionResetError):
            pass
        except OSError:
            self._send(500, "falha ao ler a miniatura\n", "text/plain")

    def _send(self, code, body, ctype):
        data = body.encode()
        try:
            self.send_response(code)
            self.send_header("Content-Type", ctype)
            self.send_header("Content-Length", str(len(data)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            if self._so_cabecalho:
                return
            self.wfile.write(data)
        except (BrokenPipeError, ConnectionResetError):
            pass

    def handle_one_request(self):
        """Toda requisição devolve o snapshot do WAL ao sair.

        Aqui e não em cada `do_*`: é o único ponto por onde todas as rotas
        passam, inclusive as que ainda não existem. Ver `db_release()`."""
        try:
            super().handle_one_request()
        finally:
            db_release()

    def log_message(self, *args):  # volume alto por design
        pass


def _unidade_ativa(unit):
    try:
        return (
            subprocess.run(["systemctl", "is-active", "--quiet", unit]).returncode == 0
        )
    except OSError:
        return False


def _retencao_efetiva(conn, now_ms):
    row = conn.execute("SELECT MIN(start_ms) FROM segments").fetchone()
    if not row or not row[0]:
        return 0.0
    return round((now_ms - row[0]) / 3600_000, 1)


class QuietServer(ThreadingHTTPServer):
    """ThreadingHTTPServer que não trata desconexão de cliente como incidente.

    Um player HLS aborta requisições o tempo todo — troca de câmera, seek, aba
    fechada — e cada aborto virava um traceback de ~13 linhas no journal. No
    Sentinela, 20 desconexões produziram a maior parte de 1.598 linhas em 1 h,
    soterrando o log justamente quando ele é mais necessário. Erros de verdade
    continuam aparecendo."""

    daemon_threads = True

    def handle_error(self, request, client_address):
        exc = sys.exc_info()[1]
        if isinstance(exc, (BrokenPipeError, ConnectionResetError, TimeoutError)):
            return
        super().handle_error(request, client_address)


def wal_loop():
    """Checkpoint periódico do WAL, e alarme quando ele para de andar.

    O autocheckpoint do SQLite é PASSIVO: copia até o frame mais antigo que
    algum leitor ainda usa e desiste do resto, EM SILÊNCIO. Um leitor preso,
    portanto, nunca dá erro — só faz o arquivo crescer até alguém reparar. Aqui
    o TRUNCATE tenta de 5 em 5 minutos (também em silêncio quando há leitor:
    devolve busy=1 e não faz nada) e o tamanho vira número no /stats, que é
    onde o painel consegue enxergar.

    Isto é rede de segurança, não a correção: quem fecha o buraco é o
    `db_release()` no fim de cada requisição."""
    global WAL_BYTES, WAL_LAST_CHECKPOINT
    alarmado = False
    while True:
        try:
            r = db().execute("PRAGMA wal_checkpoint(TRUNCATE)").fetchall()
            db_release()
            # r = [(busy, log_frames, checkpointed)]; busy=0 significa que
            # passou de verdade — só então o carimbo avança.
            if r and r[0] and r[0][0] == 0:
                WAL_LAST_CHECKPOINT = _iso(int(time.time() * 1000))
        except Exception as e:
            print(f"wal: checkpoint falhou: {e}", flush=True)
        try:
            WAL_BYTES = os.path.getsize(DB_PATH + "-wal")
        except OSError:
            WAL_BYTES = 0
        if WAL_BYTES > WAL_MAX_BYTES and not alarmado:
            log_event(
                db(), "wal_travado", None,
                f"WAL em {WAL_BYTES / 2**30:.2f} GB apos checkpoint:"
                " algum leitor segura o snapshot",
            )
            alarmado = True
        elif alarmado and WAL_BYTES < WAL_MAX_BYTES // 2:
            log_event(db(), "wal_ok", None, f"WAL de volta a {WAL_BYTES / 2**20:.0f} MB")
            alarmado = False
        time.sleep(WAL_CHECK_S)


if __name__ == "__main__":
    init_db()
    log_event(
        db(), "server_start", None,
        f"rec-server subiu · retencao {RETAIN_HOURS:g}h · {len(RECORD_CAMS)} cameras",
    )
    for fn in (indexer_loop, prune_loop, watchdog_loop, stats_loop, wal_loop):
        threading.Thread(target=fn, daemon=True).start()
    QuietServer(("127.0.0.1", 9900), Handler).serve_forever()
