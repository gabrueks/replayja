#!/usr/bin/env python3
"""clip-worker (Replay já): tira jobs de corte da fila da API, produz o clipe
final e o entrega no armazenamento de objetos.

NÃO EXISTE NO SENTINELA. É a peça nova deste fork, e o desenho inteiro dela
segue a regra herdada de "quem manda em quem" (docs/api/README.md §1):

    O app NÃO escreve no relay. O relay pergunta — e a resposta é sempre uma
    LISTA, nunca um comando.

Por isso este processo é um cliente que faz polling, não um servidor. O
`POST /jobs` que a API manda ao relay apenas ACORDA (ver README §Portas); se
ele falhar, nada se perde: o ciclo de 2 s pega o job. E um job atrasado deixou
de ser perigoso — a janela é ABSOLUTA e a sessão está gravada, então executar
o corte cinco minutos depois produz exatamente o mesmo clipe.

O caminho de um job, e por que ele tem dois passos de ffmpeg:

    A. /clip do rec-server    `-c copy`    corta em KEYFRAME (segmento)
       → busca material com folga: a janela bruta [cutFrom, cutTo] (~38 s).
         Custa I/O, não CPU. Sobra menos de um segmento de cabeça.

    B. aqui                   re-encode    corta AO QUADRO
       → recorte exato de [deliverFrom, deliverTo] (25 s), marca d'água do
         parceiro, miniatura, imagem de Open Graph e `+faststart`, tudo num
         passe só, porque o re-encode já vai acontecer de qualquer jeito para
         aplicar a marca d'água (ADR §5).

O passo B é a única coisa cara que este relay faz. Contenção, copiada do que
já funciona: WORKER_SLOTS=2, `CPUQuota=120%` e `Nice=10` no unit. **Os
gravadores têm prioridade absoluta.** É melhor um clipe sair 40 s depois do
que um segmento de sessão se perder — o clipe atrasado é um incômodo, o
segmento perdido é irrecuperável.
"""
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone

# ---------------------------------------------------------------- ambiente

API_URL = os.environ.get("API_URL", "").rstrip("/")
RELAY_KEY = os.environ.get("RELAY_KEY", "")
RELAY_ID = os.environ.get("RELAY_ID", "relay-1")
REC_SERVER = os.environ.get("REC_SERVER", "http://127.0.0.1:9900")

# Onde o passe B trabalha. `/dev/shm` é tmpfs: evita ~14 MB de escrita em disco
# por clipe, e o disco deste relay está ocupado gravando 24/7.
WORK_DIR = os.environ.get("WORKER_WORK_DIR", "/dev/shm/replayja")
# O recorte BRUTO sobrevive ao clipe, em DISCO e não em tmpfs. Dois motivos:
# (a) "estender lance" ±8 s não precisa cortar a sessão de novo; (b) trocar o
# logo da arena permite reprocessar os clipes recentes (ADR §5). 48 h × 200
# clipes × ~14 MB ≈ 5,6 GB de disco — que cabe; os mesmos 5,6 GB em /dev/shm
# seriam RAM, que não cabe numa t4g.medium.
RAW_DIR = os.environ.get("WORKER_RAW_DIR", "/srv/rec/_raw")
RAW_RETAIN_H = float(os.environ.get("WORKER_RAW_RETAIN_H", "48"))
# Cache dos PNGs de marca d'água do PARCEIRO, por (caminho no bucket, versão).
#
# ⚠️ A chave do cache NÃO pode conter a URL. Desde 2026-09-12 o `claim` entrega
# uma URL ASSINADA (S3 GET, 1 h), e assinatura muda a cada chamada: cachear por
# URL significaria rebaixar o PNG a cada clipe, que é justamente o que este
# cache existe para evitar. Quem identifica a marca é o CAMINHO da URL
# (`/branding/<partnerId>/watermark.png`, estável e único por parceiro) mais a
# `version` — e o `sha256`, quando o contrato o traz, manda em tudo.
WM_CACHE = os.environ.get("WORKER_WM_CACHE", "/var/cache/replayja/watermark")
# Marca d'água do Replay já. VERSIONADA NO REPO (`relay/watermark-replayja.png`)
# e instalada junto com o código, de propósito: ela é o padrão de TODO clipe de
# arena sem logo (decisão 9 do PLANO / D-03), e fazer o padrão depender de rede,
# de bucket e de credencial seria pôr o caso mais comum na dependência da coisa
# mais frágil. Arquivo local não expira, não dá 403 e não cobra egress.
WM_DEFAULT = os.environ.get(
    "WORKER_WM_DEFAULT", "/opt/replayja-relay/watermark-replayja.png"
)
# A assinatura discreta, aplicada NO CANTO OPOSTO quando o parceiro tem logo.
WM_ASSINATURA = os.environ.get(
    "WORKER_WM_ASSINATURA", "/opt/replayja-relay/watermark-replayja-assinatura.png"
)

STATUS_FILE = os.environ.get("WORKER_STATUS", "/run/replayja/worker.json")
DONE_FILE = os.environ.get("WORKER_DONE_FILE", "/var/lib/replayja/jobs-done.json")

SLOTS = int(os.environ.get("WORKER_SLOTS", "2"))
POLL_S = float(os.environ.get("WORKER_POLL_S", "2"))
CLAIM_MAX = int(os.environ.get("WORKER_CLAIM_MAX", "5"))
HTTP_TIMEOUT = float(os.environ.get("WORKER_HTTP_TIMEOUT", "30"))
UPLOAD_TIMEOUT = float(os.environ.get("WORKER_UPLOAD_TIMEOUT", "180"))
# `timeout` no ffmpeg: matar o processo travado em vez de segurar a fila.
ENCODE_TIMEOUT_S = float(os.environ.get("WORKER_ENCODE_TIMEOUT_S", "120"))

# COMO SE REIVINDICA UM JOB. O `openapi.yaml` declara `GET /relay/clip-jobs`
# (reivindicação atômica no Postgres com SKIP LOCKED, resposta com
# `leaseSeconds`); o briefing da task A1 pediu `POST /relay/clip-jobs/claim`.
# Como `docs/api/README.md` diz com todas as letras que "o YAML é a fonte da
# verdade sobre o quê", o padrão segue o YAML — e as duas variáveis abaixo
# fazem a troca custar uma linha no rec.env, sem deploy de código.
# Ver README §"Decisões e pendências", item 1.
CLAIM_PATH = os.environ.get("WORKER_CLAIM_PATH", "/relay/clip-jobs")
CLAIM_METHOD = os.environ.get("WORKER_CLAIM_METHOD", "GET").upper()

# Abaixo disto o clipe é RECUSADO em vez de entregue capenga. O valor vem no
# job (`minCoverageRatio` da câmera); este é só o padrão do contrato.
MIN_COVERAGE = float(os.environ.get("WORKER_MIN_COVERAGE", "0.6"))

# Perfil de saída quando o job não traz `encodeProfile`. 4 Mbps sobre uma fonte
# de 3 Mbps: dá folga para o overlay sem inventar qualidade que a fonte não
# tem (ADR §5). O contrato declara 6000 como padrão do campo — divergência
# registrada no README §"Decisões e pendências", item 2.
ENC_BITRATE_KBPS = int(os.environ.get("WORKER_BITRATE_KBPS", "4000"))
ENC_MAXRATE_KBPS = int(os.environ.get("WORKER_MAXRATE_KBPS", "4500"))
ENC_PRESET = os.environ.get("WORKER_PRESET", "veryfast")
THUMB_W = int(os.environ.get("WORKER_THUMB_W", "640"))

CAM_VALIDA = re.compile(r"^[a-z0-9]{6,32}$")
_slots = threading.Semaphore(SLOTS)
_lock = threading.Lock()
_estado = {
    "inFlight": 0,
    "slotsTotal": SLOTS,
    "failedLastHour": 0,
    "falhas": [],      # timestamps, para a janela de 1 h
    "cutMs": [],       # amostras recentes, para a mediana
    "encodeMs": [],
}


def log(*a):
    print(*a, flush=True)


def agora_iso():
    return (
        datetime.now(timezone.utc)
        .isoformat(timespec="milliseconds")
        .replace("+00:00", "Z")
    )


def parse_iso(s):
    """ISO-8601 do contrato → epoch ms. Aceita o `Z` que o `fromisoformat` do
    Python 3.10 ainda não engole."""
    if s is None:
        return None
    s = s.strip()
    if s.endswith("Z"):
        s = s[:-1] + "+00:00"
    return int(datetime.fromisoformat(s).timestamp() * 1000)


# ------------------------------------------------------------------ HTTP


def api(metodo, caminho, corpo=None, idem=None, timeout=None):
    """Uma chamada à API do Replay já, autenticada com `x-relay-key`.

    Devolve (status, objeto) e NUNCA levanta por erro de rede ou HTTP: este
    processo não pode morrer porque a Vercel piscou. Quem trata o desfecho é
    quem chamou — e, na dúvida, o job volta para a fila quando o lease vence.
    """
    url = f"{API_URL}{caminho}"
    dados = json.dumps(corpo).encode() if corpo is not None else None
    req = urllib.request.Request(url, data=dados, method=metodo)
    req.add_header("x-relay-key", RELAY_KEY)
    req.add_header("accept", "application/json")
    if dados is not None:
        req.add_header("content-type", "application/json")
    if idem:
        # Camada 2 da idempotência (docs/api/README.md §5): mesma chave +
        # mesmo corpo devolve a resposta original sem reexecutar.
        req.add_header("Idempotency-Key", idem)
    try:
        with urllib.request.urlopen(req, timeout=timeout or HTTP_TIMEOUT) as r:
            bruto = r.read()
            if not bruto:
                return r.status, None
            try:
                return r.status, json.loads(bruto)
            except ValueError:
                return r.status, None
    except urllib.error.HTTPError as e:
        # O corpo de erro do contrato é RFC 9457 (`application/problem+json`) e
        # traz `type`, `detail` e o `traceId` que liga a reclamação do usuário
        # à linha em `app_error`. Devolver isso PARSEADO (e não uma string
        # truncada) é o que faz o log do worker dizer "checksum-mismatch no
        # objeto X" em vez de "confirm 409".
        bruto = ""
        try:
            bruto = e.read().decode("utf8", "replace")
        except Exception:
            pass
        try:
            corpo_err = json.loads(bruto)
            if not isinstance(corpo_err, dict):
                raise ValueError
        except ValueError:
            corpo_err = {"_erro": bruto[:300]}
        return e.code, corpo_err
    except Exception as e:
        return 0, {"_erro": str(e)}


def baixa(url, destino, timeout=None, headers=None):
    """GET para arquivo. Devolve (status, headers) — o corpo vai para o disco
    em pedaços, porque um recorte bruto de 38 s tem ~14 MB e não há motivo
    para carregá-lo na memória deste processo."""
    req = urllib.request.Request(url)
    for k, v in (headers or {}).items():
        req.add_header(k, v)
    try:
        with urllib.request.urlopen(req, timeout=timeout or HTTP_TIMEOUT) as r:
            with open(destino, "wb") as f:
                shutil.copyfileobj(r, f, 256 * 1024)
            return r.status, dict(r.headers)
    except urllib.error.HTTPError as e:
        return e.code, dict(e.headers or {})
    except Exception as e:
        return 0, {"_erro": str(e)}


def put_presigned(url, caminho, content_type, headers=None, timeout=None):
    """PUT genérico numa URL pré-assinada.

    Genérico de propósito: o bucket ainda não está decidido (R2 na ADR §6, mas
    a jurisdição é a decisão G-04 do `decisoes.md`, e a alternativa é S3). Nada
    aqui sabe quem é o provedor — é um `PUT` com o corpo e os cabeçalhos que a
    própria API mandou, que é o mínimo comum entre todo armazenamento
    S3-compatível. Trocar de provedor não toca neste arquivo.

    Repetir um PUT é inofensivo por construção: a `objectKey` é determinística
    (`clips/<partner>/<court>/<date>/<clipId>/wm.mp4`) e object storage não é
    append log — reescrever com os mesmos bytes não muda nada."""
    with open(caminho, "rb") as f:
        dados = f.read()
    req = urllib.request.Request(url, data=dados, method="PUT")
    req.add_header("content-type", content_type)
    for k, v in (headers or {}).items():
        req.add_header(k, v)
    try:
        with urllib.request.urlopen(req, timeout=timeout or UPLOAD_TIMEOUT) as r:
            return r.status, ""
    except urllib.error.HTTPError as e:
        try:
            return e.code, e.read().decode("utf8", "replace")[:300]
        except Exception:
            return e.code, ""
    except Exception as e:
        return 0, str(e)


# ------------------------------------------------------- estado persistido


def carrega_feitos():
    """Jobs já confirmados. Idempotência por `clip_job.id`, camada 3.

    Reexecutar um job é SEGURO (a janela é absoluta: o mesmo job rodado três
    vezes produz três arquivos idênticos na mesma chave de objeto), então esta
    lista não é uma trava de correção — é economia de CPU. Um job que volta
    para a fila porque o lease venceu depois do upload não paga o re-encode de
    novo: ele é reconfirmado e pronto."""
    try:
        with open(DONE_FILE) as f:
            d = json.load(f)
        return {k: v for k, v in d.items()} if isinstance(d, dict) else {}
    except (OSError, ValueError):
        return {}


def salva_feitos(feitos):
    # Mantém os 500 mais recentes: a lista existe para cobrir um lease vencido
    # (120 s) e um restart, não para ser histórico.
    if len(feitos) > 500:
        recentes = sorted(feitos.items(), key=lambda kv: kv[1].get("at", 0))[-500:]
        feitos = dict(recentes)
    try:
        os.makedirs(os.path.dirname(DONE_FILE), exist_ok=True)
        tmp = DONE_FILE + ".tmp"
        with open(tmp, "w") as f:
            json.dump(feitos, f)
        os.replace(tmp, DONE_FILE)
    except OSError as e:
        log(f"worker: nao consegui gravar {DONE_FILE}: {e}")
    return feitos


FEITOS = {}


def publica_estado():
    """Publica o retrato da fila para o rec-server (que o repassa no /stats e,
    daí, no `POST /relay/health`). Arquivo pequeno, escrita atômica — mesmo
    padrão do `detect.json` do Sentinela."""
    with _lock:
        corte = time.time() - 3600
        _estado["falhas"] = [t for t in _estado["falhas"] if t > corte]
        corpo = {
            "at": time.time(),
            "inFlight": _estado["inFlight"],
            "slotsTotal": SLOTS,
            "failedLastHour": len(_estado["falhas"]),
            "p50CutMs": _mediana(_estado["cutMs"]),
            "p50EncodeMs": _mediana(_estado["encodeMs"]),
            "queued": _estado.get("queued", 0),
        }
    try:
        os.makedirs(os.path.dirname(STATUS_FILE), exist_ok=True)
        tmp = STATUS_FILE + ".tmp"
        with open(tmp, "w") as f:
            json.dump(corpo, f)
        os.replace(tmp, STATUS_FILE)
    except OSError:
        pass


def _mediana(xs):
    if not xs:
        return None
    s = sorted(xs)
    m = len(s) // 2
    return int(s[m] if len(s) % 2 else (s[m - 1] + s[m]) / 2)


def _amostra(chave, valor):
    with _lock:
        _estado[chave].append(valor)
        del _estado[chave][:-50]


# ---------------------------------------------------------- janela e corte


def janela_do_job(job):
    """(cutFrom, cutTo, deliverFrom, deliverTo) em epoch ms.

    Quem monta a janela é a API, e ela já desconta as DUAS latências que
    separam a cena do carimbo (`button.wakeLatencyMs` e `camera.originLagMs`,
    ver docs/api/README.md §4). O relay não redescobre nada disso: o
    `PROGRAM-DATE-TIME` que ele publica é hora de CHEGADA, não hora da cena, e
    qualquer conta feita aqui herdaria esse erro sem perceber.

    A única regra local é o `cut` ser mais largo que o `deliver` — e, se a API
    esquecer de alargar, este função alarga, porque bytes extras num arquivo
    temporário custam zero e um lance cortado ao meio custa o cliente."""
    d_from = parse_iso(job["deliverFrom"])
    d_to = parse_iso(job["deliverTo"])
    c_from = parse_iso(job.get("cutFrom")) or (d_from - 8000)
    c_to = parse_iso(job.get("cutTo")) or (d_to + 5000)
    c_from = min(c_from, d_from - 2000)
    c_to = max(c_to, d_to + 1000)
    return c_from, c_to, d_from, d_to


def offset_no_bruto(inicio_bruto_ms, deliver_from_ms):
    """Deslocamento, em segundos, do início entregue dentro do recorte bruto.

    O `/clip` começa no segmento que CONTÉM `cutFrom`, e os segmentos são
    `independent_segments` — ou seja, o arquivo bruto começa num KEYFRAME em
    `inicio_bruto_ms`, que é <= `cutFrom` <= `deliverFrom`. É aqui que mora o
    "ajustado a keyframe" da janela, e é este número que o `-ss` do passe B usa
    para transformar um corte de granularidade 2 s num corte ao quadro."""
    return max(0.0, (deliver_from_ms - inicio_bruto_ms) / 1000.0)


# --------------------------------------------------------- marca d'água


# A saída é PINADA em 1080p pelo `scale`+`pad` do grafo (ver `monta_filtro`), e
# é isso que permite calcular a largura da marca em pixels aqui, com aritmética,
# em vez de `scale2ref`.
#
# Vale dizer por que NÃO é `scale2ref`, que seria o caminho "certo" num grafo
# genérico: o `scale2ref` consome e reemite o fluxo de referência, o que
# reordena os rótulos do grafo a cada marca acrescentada, e a semântica de
# `iw`/`mdar` dentro dele muda entre versões do ffmpeg. Numa máquina onde não há
# como rodar ffmpeg para conferir (o desenvolvimento é Windows; o e2e é Linux),
# trocar uma conta exata e testável por um filtro de semântica ambígua seria
# trocar risco de produção por elegância. Se algum dia a saída deixar de ser
# 1080p fixo, é aqui que a conta muda — e o teste que prova a largura também.
LARGURA_BASE = 1920
ALTURA_BASE = 1080
# Margem do canto, em % da LARGURA (não da altura): mantém o afastamento visual
# igual nos dois eixos, porque o pixel é quadrado depois do `setsar=1`.
MARGEM_PCT = float(os.environ.get("WORKER_WM_MARGEM_PCT", "2.5"))
# A assinatura do Replay já quando a marca em destaque é a do parceiro
# (decisão 9 do PLANO): pequena e discreta, para creditar sem competir.
ASSINATURA_WIDTH_PCT = float(os.environ.get("WORKER_WM_ASSINATURA_PCT", "10"))
ASSINATURA_OPACIDADE = float(os.environ.get("WORKER_WM_ASSINATURA_OPACIDADE", "0.6"))
# A marca do Replay já quando o parceiro não tem logo. Maior que a assinatura:
# aqui ela é A marca do clipe, não um crédito.
PADRAO_WIDTH_PCT = float(os.environ.get("WORKER_WM_PADRAO_PCT", "14"))
PADRAO_OPACIDADE = 0.85

# O contrato do relay escreve a posição com hífen; o enum do Postgres, com `_`.
# Aceitar as duas não é indecisão — é que o valor atravessa duas linguagens e
# uma migração, e uma marca no canto errado é infinitamente melhor que um
# `overlay=None:None` derrubando o clipe.
POSICOES = {
    "bottom-right": "bottom-right",
    "bottom_right": "bottom-right",
    "bottom-left": "bottom-left",
    "bottom_left": "bottom-left",
    "top-right": "top-right",
    "top_right": "top-right",
    "top-left": "top-left",
    "top_left": "top-left",
}
# Para onde vai a assinatura quando o parceiro ocupa um canto: o inferior
# OPOSTO. Sempre inferior — o topo do quadro é onde a bola costuma estar.
OPOSTO_INFERIOR = {
    "bottom-right": "bottom-left",
    "top-right": "bottom-left",
    "bottom-left": "bottom-right",
    "top-left": "bottom-right",
}


def normaliza_posicao(bruta):
    return POSICOES.get(str(bruta or "").strip().lower(), "bottom-right")


def _pct(valor, padrao, minimo, maximo):
    """Número do contrato → pontos percentuais, com piso, teto e padrão.

    Aceita fração (0,85) e pontos (85) na mesma entrada: o banco guarda opacidade
    como fração desde a migração 0002 e o contrato fala em pontos. Um `NaN`
    escapando daqui viraria `scale=nan:-1`, que não é erro de sintaxe — é um
    clipe reprovado no ffprobe depois de pagar o re-encode inteiro."""
    try:
        n = float(valor)
    except (TypeError, ValueError):
        return padrao
    if n != n or n <= 0:      # NaN ou não-positivo
        return padrao
    if n <= 1 and maximo > 1:
        n *= 100
    return max(minimo, min(maximo, n))


def _chave_de_cache(url, versao, sha):
    """Identidade ESTÁVEL do PNG do parceiro.

    O `sha256` manda quando vem: ele identifica os bytes, e é o único jeito de
    perceber que a arena trocou o logo sem trocar a versão. Sem ele, o par
    (caminho no bucket, versão) — nunca a URL inteira, que é assinada e muda a
    cada `claim`."""
    if sha:
        return str(sha).lower()[:64]
    try:
        caminho = urllib.parse.urlsplit(url or "").path or str(url)
    except ValueError:
        caminho = str(url)
    return hashlib.sha256(f"{caminho}|{versao}".encode()).hexdigest()


def baixa_marca(wm):
    """PNG do parceiro em disco local, ou None. Nunca levanta.

    Baixa NO MÁXIMO uma vez por versão: o cache é o motivo de esta função
    existir separada. A 200 clipes/dia, rebaixar 45 KB por clipe seria barato em
    bytes e caro no que importa — mais uma chamada de rede no caminho crítico de
    cada lance, com mais um jeito de falhar."""
    url = (wm or {}).get("url")
    if not url:
        return None
    versao = (wm or {}).get("version", 0)
    sha = (wm or {}).get("sha256")
    destino = os.path.join(WM_CACHE, f"{_chave_de_cache(url, versao, sha)}.png")
    if os.path.exists(destino) and os.path.getsize(destino) > 0:
        return destino
    try:
        os.makedirs(WM_CACHE, exist_ok=True)
    except OSError as e:
        log(f"worker: sem cache de marca d'agua ({e})")
        return None
    parcial = f"{destino}.{os.getpid()}.parcial"
    st, _ = baixa(url, parcial)
    try:
        if st != 200 or not os.path.exists(parcial) or os.path.getsize(parcial) == 0:
            log(f"worker: nao baixei a marca do parceiro ({st})")
            return None
        if sha:
            # Conferir o hash quando o contrato o manda: um PNG truncado no meio
            # do download produz um overlay cortado, e isso não falha em lugar
            # nenhum — sai no clipe, no thumbnail e no card do WhatsApp.
            visto = sha256_de(parcial)
            if visto.lower() != str(sha).lower():
                log(f"worker: sha256 da marca nao confere ({visto[:12]}…)")
                return None
        os.replace(parcial, destino)
        return destino
    finally:
        try:
            if os.path.exists(parcial):
                os.remove(parcial)
        except OSError:
            pass


def resolve_marcas(wm):
    """(marcas, kind, versao) — o que efetivamente vai ser composto no clipe.

    ─── A REGRA (decisão 9 do PLANO / D-03 de `decisoes.md`) ────────────────

        parceiro com PNG → a marca DELE no canto configurado, em destaque,
                           MAIS a assinatura do Replay já no canto inferior
                           oposto (10% de largura, 60% de opacidade)
        sem PNG          → só a do Replay já, 14% de largura, `bottom-right`

    ─── E A REGRA QUE VALE MAIS QUE ELA ─────────────────────────────────────

    **Falhar em baixar a marca do parceiro NÃO derruba o clipe.** Cai para o PNG
    local, e o desfecho vira `default-fallback` no `confirm` — um rótulo que o
    painel consulta. O contrário seria perder o lance do atleta por causa de uma
    URL expirada: o atleta não tem nada a ver com a política do bucket, e um
    clipe com a marca errada continua sendo o lance dele.

    `versao` é a do PNG que REALMENTE entrou: 0 para a nossa. É ela que responde
    "quais clipes reprocessar quando a arena enviar o logo" (ADR §5)."""
    cfg = wm or {}
    pedido = str(cfg.get("kind") or ("partner" if cfg.get("url") else "default")).lower()
    kind = "partner" if pedido == "partner" else "default"

    if kind == "partner":
        caminho = baixa_marca(cfg)
        if caminho:
            pos = normaliza_posicao(cfg.get("position"))
            marcas = [
                {
                    "path": caminho,
                    "widthPct": _pct(cfg.get("widthPct", cfg.get("scale")), 18, 5, 30),
                    "opacity": _pct(cfg.get("opacityPct", cfg.get("opacity")), 85, 20, 100) / 100.0,
                    "position": pos,
                }
            ]
            if os.path.exists(WM_ASSINATURA):
                marcas.append(
                    {
                        "path": WM_ASSINATURA,
                        "widthPct": ASSINATURA_WIDTH_PCT,
                        "opacity": ASSINATURA_OPACIDADE,
                        "position": OPOSTO_INFERIOR[pos],
                    }
                )
            else:
                log(f"worker: {WM_ASSINATURA} ausente — clipe sai so com a marca do parceiro")
            return marcas, "partner", int(cfg.get("version") or 1)
        kind = "default-fallback"

    if not os.path.exists(WM_DEFAULT):
        # Só acontece em instalação velha, antes de o PNG entrar no repo. É o
        # bug que esta leva resolve; deixá-lo gritar no log é de propósito.
        log(f"worker: {WM_DEFAULT} AUSENTE — clipe vai sair SEM MARCA")
        return [], kind, 0
    return (
        [
            {
                "path": WM_DEFAULT,
                "widthPct": _pct(cfg.get("widthPct"), PADRAO_WIDTH_PCT, 5, 30)
                if kind == "default"
                else PADRAO_WIDTH_PCT,
                "opacity": _pct(cfg.get("opacityPct"), PADRAO_OPACIDADE * 100, 20, 100) / 100.0,
                "position": normaliza_posicao(cfg.get("position") if kind == "default" else None),
            }
        ],
        kind,
        0,
    )


def canto(posicao, margem_px):
    """Expressão `x:y` do `overlay` para um canto, com margem em pixels."""
    return {
        "bottom-right": f"W-w-{margem_px}:H-h-{margem_px}",
        "bottom-left": f"{margem_px}:H-h-{margem_px}",
        "top-right": f"W-w-{margem_px}:{margem_px}",
        "top-left": f"{margem_px}:{margem_px}",
    }[normaliza_posicao(posicao)]


def monta_filtro(marcas, thumb_at_s, com_og=True):
    """Grafo do passe B: marcas d'água, miniatura e Open Graph — TUDO no mesmo
    passe. O recorte em si é feito pelo `-ss`/`-t` da SAÍDA do MP4.

    `marcas` é a lista devolvida por `resolve_marcas`, NA ORDEM DE COMPOSIÇÃO, e
    cada uma corresponde a uma entrada do ffmpeg: a entrada 0 é o recorte bruto,
    a 1 é `marcas[0]`, e assim por diante. Compor as duas aqui, e não em dois
    passes, é o que mantém o custo do clipe em um re-encode só.

    `thumb_at_s` está na linha do tempo do RECORTE BRUTO (a que o grafo vê),
    não na do clipe entregue — quem soma o offset é quem chama. E a miniatura
    sai DEPOIS dos overlays: o card do WhatsApp leva a marca, que é metade do
    motivo de a arena querer que o clipe circule.

    Quatro detalhes que NÃO são preferência de estilo:
      - `format=rgba` ANTES do `colorchannelmixer=aa=`. Um PNG que o ffmpeg
        decodifique sem canal alpha faz o `aa=` não ter o que multiplicar, e a
        opacidade some sem erro nenhum — a marca sai 100% opaca.
      - `format=yuv420p` explícito no fim. Sem isso o vídeo **não toca no iOS**.
      - a saída é forçada a 1080p (`scale` + `pad`): mesmo com uma câmera mal
        configurada o clipe entregue tem a resolução que o produto promete — e é
        o que torna exata a conta de largura da marca.
      - a miniatura sai de um instante PERTO DO FIM do clipe (`thumb_at_s`), e
        não do primeiro quadro: o primeiro quadro é 24 s antes do lance, ou
        seja, exatamente o momento em que não há nada acontecendo.
    """
    partes = [
        f"[0:v]scale={LARGURA_BASE}:{ALTURA_BASE}:force_original_aspect_ratio=decrease,"
        f"pad={LARGURA_BASE}:{ALTURA_BASE}:(ow-iw)/2:(oh-ih)/2,setsar=1[base]"
    ]
    margem = max(0, int(round(LARGURA_BASE * MARGEM_PCT / 100.0)))
    atual = "base"
    for i, m in enumerate(marcas or []):
        largura = max(16, int(round(LARGURA_BASE * float(m["widthPct"]) / 100.0)))
        opac = max(0.0, min(1.0, float(m["opacity"])))
        proximo = f"ov{i}"
        partes.append(
            f"[{i + 1}:v]scale={largura}:-1,format=rgba,"
            f"colorchannelmixer=aa={opac:.3f}[wm{i}]"
        )
        partes.append(
            f"[{atual}][wm{i}]overlay={canto(m['position'], margem)}:format=auto[{proximo}]"
        )
        atual = proximo
    partes.append(
        f"[{atual}]format=yuv420p,split={3 if com_og else 2}"
        + ("[v][t1][t2]" if com_og else "[v][t1]")
    )
    # `select` com escape da vírgula: dentro de filter_complex a vírgula separa
    # filtros, então ela precisa sair escapada da expressão.
    partes.append(f"[t1]select=gte(t\\,{thumb_at_s:.3f}),scale={THUMB_W}:-2[th]")
    if com_og:
        # 1200×630 é a proporção que o WhatsApp e o Open Graph esperam; o
        # `crop` centralizado tira as faixas de cima e de baixo de um 16:9.
        partes.append(
            f"[t2]select=gte(t\\,{thumb_at_s:.3f}),scale=1200:-2,crop=1200:630[og]"
        )
    return ";".join(partes)


def ffprobe(caminho):
    try:
        p = subprocess.run(
            ["ffprobe", "-v", "error", "-print_format", "json",
             "-show_format", "-show_streams", caminho],
            capture_output=True, timeout=30,
        )
        if p.returncode != 0:
            return None
        return json.loads(p.stdout.decode("utf8", "replace"))
    except (OSError, subprocess.SubprocessError, ValueError):
        return None


def valida(info, duracao_esperada_s, cobertura):
    """O clipe está bom o bastante para virar produto?

    O `spec-captura.md` §4.4 pede duração em [24,8; 25,2] s, H.264, 1920 de
    largura, `yuv420p` e tamanho > 1 MB. A regra aqui é a mesma, com UMA
    correção que a spec não previu: **quando a cobertura é parcial, o clipe é
    legitimamente mais curto** — faltou vídeo na origem, não no nosso corte.
    Cobrar 25 s de um clipe com 0,8 de cobertura reprovaria exatamente o caso
    que o produto decidiu entregar rotulado (`partial`).

    Devolve (ok, motivo)."""
    if not info:
        return False, "ffprobe nao leu o arquivo"
    try:
        dur = float(info["format"]["duration"])
        tam = int(info["format"]["size"])
    except (KeyError, ValueError, TypeError):
        return False, "ffprobe sem duracao/tamanho"
    vs = [s for s in info.get("streams", []) if s.get("codec_type") == "video"]
    if not vs:
        return False, "sem stream de video"
    v = vs[0]
    if v.get("codec_name") != "h264":
        return False, f"codec inesperado: {v.get('codec_name')}"
    if v.get("pix_fmt") != "yuv420p":
        return False, f"pix_fmt {v.get('pix_fmt')} — nao toca no iOS"
    if int(v.get("width") or 0) < 1280:
        return False, f"largura {v.get('width')}"
    piso = max(1.0, duracao_esperada_s * cobertura - 0.5)
    if dur < piso:
        return False, f"duracao {dur:.2f}s abaixo do piso {piso:.2f}s"
    if dur > duracao_esperada_s + 0.5:
        return False, f"duracao {dur:.2f}s acima do pedido"
    if tam < 100 * 1024:
        return False, f"arquivo de {tam} bytes"
    return True, ""


def sha256_de(caminho):
    h = hashlib.sha256()
    with open(caminho, "rb") as f:
        for bloco in iter(lambda: f.read(1024 * 1024), b""):
            h.update(bloco)
    return h.hexdigest()


# ----------------------------------------------------------------- o job


def reporta(job_id, status, **extra):
    """`POST /relay/clip-jobs/{jobId}/status`. Além de registrar progresso,
    RENOVA O LEASE — é por isso que ele é chamado em cada etapa e não só no
    fim. Um job reivindicado e não confirmado em `leaseSeconds` volta para
    `pending`, que é justamente o que cobre o relay morrer no meio de um
    corte."""
    corpo = {"status": status, "renewLease": True}
    corpo.update({k: v for k, v in extra.items() if v is not None})
    st, _ = api("POST", f"/relay/clip-jobs/{job_id}/status", corpo)
    if st not in (200, 204):
        log(f"worker: status {status} do job {job_id} nao aceito ({st})")


def processa(job):
    job_id = job["jobId"]
    clip_id = job["clipId"]
    cam = job["cameraId"]
    if not CAM_VALIDA.match(cam or ""):
        reporta(job_id, "failed", error="cameraId fora do formato",
                errorCode="camera_unknown")
        return

    c_from, c_to, d_from, d_to = janela_do_job(job)
    dur_esperada = (d_to - d_from) / 1000.0
    os.makedirs(WORK_DIR, exist_ok=True)
    os.makedirs(RAW_DIR, exist_ok=True)
    bruto = os.path.join(RAW_DIR, f"{clip_id}.mp4")
    saida = os.path.join(WORK_DIR, f"{clip_id}.mp4")
    thumb = os.path.join(WORK_DIR, f"{clip_id}.jpg")
    og = os.path.join(WORK_DIR, f"{clip_id}-og.jpg")

    try:
        # ---- PASSO A: recorte bruto, `-c copy`, alinhado a keyframe --------
        reporta(job_id, "cutting")
        t0 = time.time()
        st, hdrs = baixa(
            f"{REC_SERVER}/clip/{cam}?from={c_from}&to={c_to}",
            bruto,
            timeout=ENCODE_TIMEOUT_S,
            headers={"x-relay-key": RELAY_KEY},
        )
        cut_ms = int((time.time() - t0) * 1000)
        if st == 404:
            # Sem NADA em disco na janela. É o buraco de uplink total: o lance
            # não existe, e dizer isso rápido é melhor que tentar de novo 5×.
            reporta(job_id, "failed", error="sem gravacao na janela",
                    errorCode="no_coverage", coverageRatio=0.0)
            _falhou()
            return
        if st == 503:
            # Fila de remux cheia: NÃO é falha do job. Sai sem reportar
            # `failed` para que o lease vença e ele volte à fila inteiro.
            log(f"worker: /clip cheio para {job_id}; deixo o lease vencer")
            return
        if st != 200 or not os.path.exists(bruto):
            reporta(job_id, "failed", error=f"/clip respondeu {st}",
                    errorCode="ffmpeg_failed")
            _falhou()
            return
        _amostra("cutMs", cut_ms)

        # A cobertura que importa é a da janela ENTREGUE, não a da bruta: o
        # atleta não sabe que pedimos 38 s, e um buraco fora dos 25 s não muda
        # nada para ele. Por isso a segunda consulta, em vez do cabeçalho.
        cobertura = cobertura_entregue(cam, d_from, d_to)
        min_cov = float(job.get("minCoverageRatio") or MIN_COVERAGE)
        if cobertura < min_cov:
            reporta(job_id, "failed",
                    error=f"cobertura {cobertura:.2f} abaixo de {min_cov:.2f}",
                    errorCode="no_coverage", coverageRatio=cobertura)
            _falhou()
            return

        inicio_bruto = int(hdrs.get("X-Window-Start-Ms") or c_from)
        offset = offset_no_bruto(inicio_bruto, d_from)

        # ---- PASSO B: recorte exato + marca d'água + thumb + OG ------------
        reporta(job_id, "processing", coverageRatio=cobertura)
        wm_cfg = job.get("watermark")
        marcas, wm_kind, wm_versao = resolve_marcas(wm_cfg)
        saidas = set(job.get("outputs") or ["watermarked", "thumbnail"])
        com_og = "og" in saidas
        # A miniatura sai 1,5 s antes do fim ENTREGUE — o instante do lance, e
        # não o do campo vazio 24 s antes.
        #
        # ⚠️ MAS o `select` do grafo roda na linha do tempo do RECORTE BRUTO,
        # não na do clipe. O `-ss` é opção de SAÍDA e vale só para o MP4 (o
        # primeiro output); os ramos da miniatura e do Open Graph saem do mesmo
        # grafo, sem `-ss`, e enxergam o arquivo inteiro desde 0. Somar o
        # `offset` é o que faz a miniatura cair no lance em vez de num quadro
        # aleatório 8 s antes dele — e o erro seria invisível: um JPEG válido,
        # da câmera certa, da hora errada.
        thumb_at = max(0.0, dur_esperada - 1.5)
        thumb_at_bruto = offset + thumb_at
        perfil = job.get("encodeProfile") or {}
        bitrate = int(perfil.get("bitrateKbps") or ENC_BITRATE_KBPS)
        maxrate = int(perfil.get("maxrateKbps") or ENC_MAXRATE_KBPS)
        preset = perfil.get("preset") or ENC_PRESET

        cmd = ["ffmpeg", "-nostdin", "-y", "-hide_banner", "-loglevel", "error"]
        # `-ss` DEPOIS do `-i` (seek de SAÍDA). É o oposto do que se faz com
        # `-c copy`, e de propósito: com re-encode o seek de saída decodifica
        # desde o começo do recorte bruto e para no quadro certo, sem errar o
        # alvo quando o keyframe está antes. Com `-c copy`, `-ss` depois do
        # `-i` é o erro clássico que produz vídeo começando em quadro P.
        cmd += ["-i", bruto]
        # Uma entrada por marca, na MESMA ordem em que `monta_filtro` as
        # rotula: a entrada `i+1` é `marcas[i]`. Trocar a ordem aqui sem trocar
        # lá aplicaria a assinatura no lugar da marca do parceiro — e o clipe
        # sairia válido, só errado.
        for m in marcas:
            cmd += ["-i", m["path"]]
        cmd += [
            "-ss", f"{offset:.3f}",
            "-t", f"{dur_esperada:.3f}",
            "-filter_complex", monta_filtro(marcas, thumb_at_bruto, com_og),
            "-map", "[v]",
            "-c:v", "libx264", "-preset", preset,
            "-b:v", f"{bitrate}k", "-maxrate", f"{maxrate}k",
            "-bufsize", f"{maxrate * 2}k",
            # `+faststart` põe o índice na frente. É literalmente o que faz o
            # vídeo abrir no WhatsApp.
            "-movflags", "+faststart",
            "-an",  # sem áudio: ver record.sh (decisão de LGPD, não de espaço)
            saida,
            "-map", "[th]", "-frames:v", "1", "-q:v", "3", thumb,
        ]
        if com_og:
            cmd += ["-map", "[og]", "-frames:v", "1", "-q:v", "4", og]

        t1 = time.time()
        try:
            p = subprocess.run(cmd, capture_output=True, timeout=ENCODE_TIMEOUT_S)
        except subprocess.TimeoutExpired:
            reporta(job_id, "failed", error="ffmpeg estourou o timeout",
                    errorCode="timeout")
            _falhou()
            return
        except OSError as e:
            reporta(job_id, "failed", error=f"ffmpeg indisponivel: {e}",
                    errorCode="ffmpeg_failed")
            _falhou()
            return
        encode_ms = int((time.time() - t1) * 1000)
        if p.returncode != 0 or not os.path.exists(saida):
            err = p.stderr.decode("utf8", "replace")[-300:]
            reporta(job_id, "failed", error=err, errorCode="ffmpeg_failed")
            log(f"worker: ffmpeg falhou no job {job_id}: {err}")
            _falhou()
            return
        _amostra("encodeMs", encode_ms)

        info = ffprobe(saida)
        ok, motivo = valida(info, dur_esperada, cobertura)
        if not ok:
            # NÃO publica e NÃO confirma ao atleta. Um clipe inválido entregue
            # é pior que um clipe ausente: o atleta abre, não toca, e conclui
            # que o produto não funciona.
            reporta(job_id, "failed", error=f"clipe invalido: {motivo}",
                    errorCode="ffmpeg_failed", coverageRatio=cobertura)
            log(f"worker: clipe invalido no job {job_id}: {motivo}")
            _falhou()
            return

        # ---- Upload e confirmação ------------------------------------------
        reporta(job_id, "uploading", coverageRatio=cobertura)
        arquivos = []
        if "watermarked" in saidas or not saidas:
            arquivos.append(("watermarked", saida, "video/mp4"))
        if "thumbnail" in saidas and os.path.exists(thumb):
            arquivos.append(("thumbnail", thumb, "image/jpeg"))
        if com_og and os.path.exists(og):
            arquivos.append(("og", og, "image/jpeg"))
        if "source" in saidas and os.path.exists(bruto):
            arquivos.append(("source", bruto, "video/mp4"))
        # `preview` ainda não é produzido — ver README §"Decisões e pendências".

        medidos = []
        for papel, caminho, ctype in arquivos:
            medidos.append(
                {
                    "role": papel,
                    "contentType": ctype,
                    "sizeBytes": os.path.getsize(caminho),
                    "sha256": sha256_de(caminho),
                    "_path": caminho,
                }
            )

        # Chamar de novo devolve URL só para o que ainda NÃO foi confirmado —
        # é assim que se retoma um upload interrompido: pergunta-se o que falta.
        st, resp = api(
            "POST",
            f"/relay/clips/{clip_id}/upload-url",
            {"files": [{k: v for k, v in m.items() if k != "_path"} for m in medidos]},
        )
        if st != 200 or not resp or "uploads" not in resp:
            log(f"worker: upload-url do clipe {clip_id} falhou ({st}): {resp}")
            reporta(job_id, "failed", error=f"upload-url {st}",
                    errorCode="ffmpeg_failed")
            _falhou()
            return

        por_papel = {m["role"]: m for m in medidos}
        confirmados = []
        for alvo in resp["uploads"]:
            m = por_papel.get(alvo["role"])
            if not m:
                continue
            st, err = put_presigned(
                alvo["url"], m["_path"], m["contentType"], alvo.get("headers")
            )
            if st not in (200, 201, 204):
                log(f"worker: PUT de {alvo['role']} falhou ({st}): {err}")
                reporta(job_id, "failed", error=f"PUT {alvo['role']} {st}",
                        errorCode="ffmpeg_failed")
                _falhou()
                return
            confirmados.append(
                {
                    "role": m["role"],
                    "objectKey": alvo["objectKey"],
                    "sizeBytes": m["sizeBytes"],
                    "sha256": m["sha256"],
                }
            )

        v = (info.get("streams") or [{}])[0]
        corpo = {
            "files": confirmados,
            "coverageRatio": round(cobertura, 6),
            "actualFrom": iso_de_ms(d_from),
            "actualTo": iso_de_ms(d_to),
            "durationSeconds": round(float(info["format"]["duration"]), 3),
            "width": int(v.get("width") or 1920),
            "height": int(v.get("height") or 1080),
            "fps": fps_de(v),
            "codec": "h264",
            "watermarkApplied": bool(marcas),
            # A versão do PNG que REALMENTE entrou — 0 quando foi a nossa. É ela
            # que responde "quais clipes reprocessar quando a arena trocar o
            # logo" (ADR §5), e copiar a versão PEDIDA num clipe que saiu com a
            # marca padrão faria essa consulta mentir.
            "watermarkVersion": wm_versao,
            "watermarkKind": wm_kind,
            "cutMs": cut_ms,
            "encodeMs": encode_ms,
        }
        # `Idempotency-Key` = o id do JOB, não do clipe: é o job que pode ser
        # reivindicado duas vezes (lease vencido), e é ele que precisa produzir
        # a mesma resposta sem reexecutar do outro lado.
        st, resp = api(
            "POST", f"/relay/clips/{clip_id}/confirm", corpo, idem=job_id
        )
        if st != 200:
            log(f"worker: confirm do clipe {clip_id} falhou ({st}): {resp}")
            reporta(job_id, "failed", error=f"confirm {st}",
                    errorCode="ffmpeg_failed")
            _falhou()
            return

        FEITOS[job_id] = {"at": time.time(), "clipId": clip_id}
        salva_feitos(FEITOS)
        reter_ate = (resp or {}).get("retainSourceUntil")
        log(
            f"worker: clipe {clip_id} pronto · cobertura {cobertura:.3f} ·"
            f" corte {cut_ms}ms · encode {encode_ms}ms ·"
            f" {corpo['durationSeconds']}s · marca {wm_kind} v{wm_versao} ·"
            f" bruto ate {reter_ate or '+48h'}"
        )
    finally:
        # O recorte bruto FICA (ver RAW_DIR); o resto é descartável.
        for f in (saida, thumb, og):
            try:
                os.remove(f)
            except OSError:
                pass


def iso_de_ms(ms):
    return (
        datetime.fromtimestamp(ms / 1000, tz=timezone.utc)
        .isoformat(timespec="milliseconds")
        .replace("+00:00", "Z")
    )


def fps_de(stream):
    try:
        num, _, den = (stream.get("avg_frame_rate") or "0/1").partition("/")
        return int(round(int(num) / int(den))) if int(den) else None
    except (ValueError, ZeroDivisionError):
        return None


def cobertura_entregue(cam, d_from, d_to):
    """Fração da janela ENTREGUE que existe de fato em disco.

    Vem do `/spans` do rec-server, que a calcula com a mesma função pura
    (`coverage_from_spans`) que serve o cabeçalho `X-Coverage-Ratio` do
    `/clip`. Uma conta só, num lugar só: é este número que decide se o clipe
    sai `ready` (1.0), `partial` (entre o mínimo e 1) ou `failed`
    (`no_coverage`)."""
    try:
        req = urllib.request.Request(
            f"{REC_SERVER}/spans/{cam}?from={d_from}&to={d_to}"
        )
        req.add_header("x-relay-key", RELAY_KEY)
        with urllib.request.urlopen(req, timeout=HTTP_TIMEOUT) as r:
            d = json.loads(r.read())
        return float(d.get("coverage") or 0.0)
    except Exception as e:
        # Falhar para o lado SEGURO: sem saber a cobertura, dizer 0 recusaria o
        # clipe; dizer 1 entregaria um buraco como íntegro. Devolvemos 0 e o
        # job volta pela fila — é o único desfecho que não mente ao atleta.
        log(f"worker: nao consegui ler cobertura de {cam}: {e}")
        return 0.0


def _falhou():
    with _lock:
        _estado["falhas"].append(time.time())


# ------------------------------------------------------------------ laço


def reivindica():
    """Um ciclo de claim. Devolve a lista de jobs (possivelmente vazia)."""
    if CLAIM_METHOD == "GET":
        st, resp = api("GET", f"{CLAIM_PATH}?max={CLAIM_MAX}")
    else:
        st, resp = api(CLAIM_METHOD, CLAIM_PATH, {"max": CLAIM_MAX, "relayId": RELAY_ID})
    if st != 200 or not isinstance(resp, dict):
        if st not in (0, 200):
            log(f"worker: claim respondeu {st}")
        return []
    return resp.get("jobs") or []


WAKE_FILE = os.path.join(os.environ.get("HB_DIR", "/run/replayja"), "wake")
_wake_visto = 0.0


def dorme(segundos):
    """Espera o próximo ciclo, mas acorda antes se a nuvem tocar a campainha.

    O `POST /jobs` que a API faz depois de gravar o job vira um `mtime` novo em
    `HB_DIR/wake` (o rec-server escreve, este processo lê). É o único caminho
    nuvem → relay do sistema, e ele não carrega informação nenhuma: o relay
    continua indo buscar a verdade em `GET /relay/clip-jobs`. Se a campainha
    não tocar, nada se perde — só os 2 s."""
    global _wake_visto
    fim = time.time() + segundos
    while time.time() < fim:
        try:
            m = os.path.getmtime(WAKE_FILE)
            if m > _wake_visto:
                _wake_visto = m
                return
        except OSError:
            pass
        time.sleep(min(0.25, max(0.0, fim - time.time())))


def limpa_brutos():
    """Poda o `_raw`: recorte bruto vive `RAW_RETAIN_H` (48 h) e some.

    Não entra na poda do rec-server de propósito — aquela apaga SESSÃO inteira
    por idade e por disco, e o bruto não é sessão. Aqui é um `mtime` e um
    `unlink`."""
    corte = time.time() - RAW_RETAIN_H * 3600
    n = 0
    try:
        for nome in os.listdir(RAW_DIR):
            caminho = os.path.join(RAW_DIR, nome)
            try:
                if os.path.getmtime(caminho) < corte:
                    os.remove(caminho)
                    n += 1
            except OSError:
                continue
    except OSError:
        return
    if n:
        log(f"worker: {n} recortes brutos removidos (>{RAW_RETAIN_H:g}h)")


def trabalha(job):
    try:
        with _lock:
            _estado["inFlight"] += 1
        publica_estado()
        if job["jobId"] in FEITOS:
            # Lease venceu DEPOIS do upload: reconfirmar é 200 sem efeito, e
            # custa uma chamada em vez de um re-encode.
            log(f"worker: job {job['jobId']} ja feito — nada a refazer")
            return
        processa(job)
    except Exception as e:
        log(f"worker: excecao no job {job.get('jobId')}: {e}")
        _falhou()
        try:
            reporta(job["jobId"], "failed", error=str(e)[:400],
                    errorCode="ffmpeg_failed")
        except Exception:
            pass
    finally:
        with _lock:
            _estado["inFlight"] -= 1
        _slots.release()
        publica_estado()


def main():
    if not API_URL or not RELAY_KEY:
        log("worker: API_URL e RELAY_KEY sao obrigatorios no rec.env")
        return 1
    global FEITOS
    FEITOS = carrega_feitos()
    os.makedirs(RAW_DIR, exist_ok=True)
    log(
        f"worker: subiu · {SLOTS} slots · claim {CLAIM_METHOD} {CLAIM_PATH}"
        f" · poll {POLL_S}s · api {API_URL}"
    )
    publica_estado()
    ultima_limpeza = 0.0
    while True:
        try:
            if time.time() - ultima_limpeza > 3600:
                ultima_limpeza = time.time()
                limpa_brutos()
            # Só pede o que cabe: reivindicar um job que vai ficar na fila
            # local é tirá-lo de outro relay e segurar um lease à toa.
            livres = 0
            with _lock:
                livres = SLOTS - _estado["inFlight"]
            if livres <= 0:
                dorme(POLL_S)
                continue
            jobs = reivindica()
            with _lock:
                _estado["queued"] = len(jobs)
            for job in jobs[:livres]:
                _slots.acquire()
                threading.Thread(target=trabalha, args=(job,), daemon=True).start()
            publica_estado()
        except Exception as e:
            log(f"worker: laco principal: {e}")
        dorme(POLL_S)


if __name__ == "__main__":
    sys.exit(main() or 0)
