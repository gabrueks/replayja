#!/usr/bin/env python3
"""Relatório de saúde do relay → `POST /relay/health`, a cada 60 s.

É um CANO, não um tradutor: o `GET /stats` do rec-server já devolve exatamente
o `RelayHealthRequest` do `docs/api/openapi.yaml`, então aqui não há
mapeamento de campo nenhum para envelhecer em silêncio quando alguém
acrescentar uma métrica. Toda a inteligência mora no `compute_stats()`.

Este relatório **substitui integralmente o heartbeat de dispositivo** do
desenho antigo: não há mais equipamento nosso dentro da arena para reportar
saúde, e a saúde da câmera passa a ser derivada do próprio stream — que é um
sinal melhor, porque mede o que importa (existe vídeo gravado?) em vez do que
um agente diz sobre si mesmo.

Duas coisas que ele faz além de postar:

1. **Declara câmera offline.** `secondsSinceLastSegment > 90` marca a câmera
   como fora no corpo, e a transição vira linha no diário do rec-server (o
   watchdog já registra `camera_offline`/`camera_online`). Julgar saúde de
   longo prazo, porém, é sempre pela cobertura de **24 h** — a de 1 h engana
   logo depois de qualquer reinício, quando há 30–90 s de lacuna artificial
   por câmera.

2. **Reage ao `camerasVersion` da resposta.** Se a versão que a API conhece
   diverge da que aplicamos, dispara o `sync-cameras` na hora em vez de
   esperar até 2 minutos pelo próximo tique. Continua sendo o relay quem
   pergunta: a resposta é um número, não um comando.
"""
import json
import os
import subprocess
import sys
import urllib.error
import urllib.request

API_URL = os.environ.get("API_URL", "").rstrip("/")
RELAY_KEY = os.environ.get("RELAY_KEY", "")
REC_SERVER = os.environ.get("REC_SERVER", "http://127.0.0.1:9900")
TIMEOUT = float(os.environ.get("HEALTH_TIMEOUT_S", "20"))
CAMERAS_VERSION_FILE = os.environ.get(
    "CAMERAS_VERSION_FILE", "/var/lib/replayja/cameras.version"
)


def main():
    if not API_URL or not RELAY_KEY:
        print("health: API_URL e RELAY_KEY sao obrigatorios no rec.env")
        return 1

    try:
        req = urllib.request.Request(f"{REC_SERVER}/stats")
        req.add_header("x-relay-key", RELAY_KEY)
        with urllib.request.urlopen(req, timeout=TIMEOUT) as r:
            corpo = json.loads(r.read())
    except Exception as e:
        # rec-server fora é exatamente a hora em que não há o que reportar: o
        # relatório seria um retrato vazio, e vazio é pior que ausente (a API
        # o leria como "todas as câmeras sem vídeo"). Falhar alto deixa a
        # unidade vermelha no `systemctl list-timers`, que é o sinal certo.
        print(f"health: /stats indisponivel: {e}")
        return 1

    fora = [
        c["cameraId"]
        for c in corpo.get("cameras", [])
        if c.get("down") or c.get("secondsSinceLastSegment") is None
    ]
    if fora:
        print(f"health: cameras sem segmento ha >90s: {' '.join(fora)}")

    dados = json.dumps(corpo).encode()
    req = urllib.request.Request(f"{API_URL}/relay/health", data=dados, method="POST")
    req.add_header("x-relay-key", RELAY_KEY)
    req.add_header("content-type", "application/json")
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT) as r:
            resp = json.loads(r.read() or b"{}")
    except urllib.error.HTTPError as e:
        print(f"health: API respondeu {e.code}")
        return 1
    except Exception as e:
        print(f"health: API inalcancavel: {e}")
        return 1

    pend = resp.get("pendingJobs")
    print(
        f"health: ok · {len(corpo.get('cameras', []))} cameras ·"
        f" disco {corpo.get('disk', {}).get('usedPercent')}% ·"
        f" WAL {corpo.get('index', {}).get('walBytes')} ·"
        f" fila {pend if pend is not None else '-'}"
    )

    # A lista do servidor mudou e ainda não aplicamos: acorda o sync agora.
    # `--no-block` porque este processo é um oneshot de timer e não tem nada a
    # esperar; se o start falhar, o tique de 2 min resolve.
    local = ""
    try:
        with open(CAMERAS_VERSION_FILE) as f:
            local = f.read().strip()
    except OSError:
        pass
    remota = resp.get("camerasVersion")
    if remota and remota != local:
        print(f"health: camerasVersion divergente ({local or '-'} != {remota}) — sync")
        try:
            subprocess.run(
                ["systemctl", "start", "--no-block", "replayja-sync-cameras.service"],
                timeout=10,
            )
        except (OSError, subprocess.SubprocessError) as e:
            print(f"health: nao consegui acordar o sync: {e}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
