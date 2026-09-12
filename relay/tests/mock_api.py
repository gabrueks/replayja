#!/usr/bin/env python3
"""API do Replay já, de mentira — o mínimo para exercitar o relay inteiro sem
Vercel, sem Postgres e sem bucket.

É a "simular o relay" de `docs/api/README.md` §7 invertida: em vez de um script
que finge ser o relay contra a API real, este é um script que finge ser a API
contra o relay real. Serve para o `make test-e2e` e para depurar o worker na
bancada.

Implementa, com o mesmo formato do `openapi.yaml`:
    GET  /api/relay/cameras?since=
    GET  /api/relay/clip-jobs?max=        (e POST /api/relay/clip-jobs/claim)
    POST /api/relay/clip-jobs/{id}/status
    POST /api/relay/clips/{id}/upload-url
    POST /api/relay/clips/{id}/confirm
    POST /api/relay/health
    PUT  /upload/{clipId}/{role}          ← faz as vezes da URL pré-assinada
    POST /_enqueue                        ← ajudante de teste, não é contrato
    GET  /_state                          ← ajudante de teste

O `confirm` CONFERE DE VERDADE o `sha256` e o `sizeBytes` contra os bytes que
chegaram no PUT, e responde 409 quando divergem — é a checagem que existe no
contrato justamente para que um upload truncado não vire clipe `ready`
corrompido, e testá-la de mentira não teria graça.

    python3 mock_api.py --port 8787 --cameras cams.json --out /tmp/bucket
"""
import argparse
import hashlib
import json
import os
import threading
import time
from datetime import datetime, timedelta, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

ESTADO = {
    "cameras": {"version": "v1", "cameras": []},
    "fila": [],        # jobs pendentes
    "leases": {},      # jobId -> quando vence
    "status": [],      # histórico de POST /status
    "confirmados": {},
    "saude": [],
    "objetos": {},     # objectKey -> (bytes, sha256)
    "branding": {},    # caminho -> bytes do PNG da marca do parceiro
}
TRAVA = threading.Lock()
RELAY_KEY = os.environ.get("RELAY_KEY", "chave-de-teste")
LEASE_S = 120
OUT_DIR = "/tmp/replayja-bucket"


def agora_iso(delta=0):
    return (
        (datetime.now(timezone.utc) + timedelta(seconds=delta))
        .isoformat(timespec="milliseconds")
        .replace("+00:00", "Z")
    )


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, fmt, *a):
        print(f"mock: {self.command} {self.path} -> {a[1] if len(a) > 1 else ''}",
              flush=True)

    # ------------------------------------------------------------- utilidades

    def _json(self, code, corpo):
        dados = json.dumps(corpo).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(dados)))
        self.end_headers()
        self.wfile.write(dados)

    def _vazio(self, code):
        self.send_response(code)
        self.send_header("Content-Length", "0")
        self.end_headers()

    def _corpo(self):
        n = int(self.headers.get("Content-Length", "0") or 0)
        return self.rfile.read(n) if n else b""

    def _autorizado(self):
        return self.headers.get("x-relay-key", "") == RELAY_KEY

    # ------------------------------------------------------------------- GET

    def do_GET(self):  # noqa: N802
        caminho = self.path.split("?")[0]
        query = dict(
            p.split("=", 1) for p in self.path.partition("?")[2].split("&") if "=" in p
        )
        if caminho == "/_state":
            with TRAVA:
                return self._json(200, {
                    "fila": len(ESTADO["fila"]),
                    "status": ESTADO["status"],
                    "confirmados": ESTADO["confirmados"],
                    "saude": ESTADO["saude"][-1:] if ESTADO["saude"] else [],
                    "objetos": {k: v[0] for k, v in ESTADO["objetos"].items()},
                })
        # Faz as vezes da URL pré-assinada da MARCA D'ÁGUA do parceiro: em
        # produção é um `GET` assinado no S3, e o relay não sabe (nem precisa
        # saber) quem serve. Sem `x-relay-key` de propósito — uma URL assinada
        # carrega a própria autorização na query string.
        if caminho.startswith("/branding/"):
            png = ESTADO["branding"].get(caminho)
            if not png:
                return self._json(404, {"title": "sem marca"})
            self.send_response(200)
            self.send_header("content-type", "image/png")
            self.send_header("content-length", str(len(png)))
            self.end_headers()
            self.wfile.write(png)
            return None
        if not self._autorizado():
            return self._json(401, {"title": "sem x-relay-key"})
        if caminho == "/api/relay/cameras":
            with TRAVA:
                cams = ESTADO["cameras"]
            if query.get("since") and query["since"] == cams["version"]:
                return self._vazio(304)
            return self._json(200, {**cams, "serverTime": agora_iso()})
        if caminho == "/api/relay/clip-jobs":
            return self._claim(int(query.get("max", "5")))
        return self._json(404, {"title": "not found"})

    # ------------------------------------------------------------------ POST

    def do_POST(self):  # noqa: N802
        caminho = self.path.split("?")[0]
        bruto = self._corpo()
        if caminho == "/_enqueue":
            job = json.loads(bruto)
            with TRAVA:
                ESTADO["fila"].append(job)
            return self._json(202, {"ok": True, "fila": len(ESTADO["fila"])})
        if not self._autorizado():
            return self._json(401, {"title": "sem x-relay-key"})

        corpo = json.loads(bruto) if bruto else {}
        partes = caminho.strip("/").split("/")

        if caminho == "/api/relay/clip-jobs/claim":
            return self._claim(int(corpo.get("max", 5)))

        if len(partes) == 5 and partes[2] == "clip-jobs" and partes[4] == "status":
            job_id = partes[3]
            with TRAVA:
                ESTADO["status"].append({"jobId": job_id, **corpo})
                if corpo.get("renewLease", True):
                    ESTADO["leases"][job_id] = time.time() + LEASE_S
            print(f"mock: job {job_id} -> {corpo.get('status')}"
                  f" {corpo.get('error', '')}", flush=True)
            return self._vazio(204)

        if len(partes) == 5 and partes[2] == "clips" and partes[4] == "upload-url":
            clip_id = partes[3]
            uploads = []
            # Só emite URL para o que ainda NÃO foi confirmado — é assim que o
            # relay retoma um upload interrompido: pergunta o que falta.
            ja = {
                x.get("objectKey")
                for x in (ESTADO["confirmados"].get(clip_id) or {}).get("files", [])
            }
            for f in corpo.get("files", []):
                chave = f"clips/teste/{clip_id}/{f['role']}"
                if chave in ja:
                    continue
                uploads.append({
                    "role": f["role"],
                    "objectKey": chave,
                    "url": f"http://{self.headers.get('Host')}/upload/{clip_id}/{f['role']}",
                    "method": "PUT",
                    "headers": {},
                    "expiresAt": agora_iso(900),
                    "maxBytes": 209715200,
                })
            return self._json(200, {"uploads": uploads, "expiresAt": agora_iso(900)})

        if len(partes) == 5 and partes[2] == "clips" and partes[4] == "confirm":
            clip_id = partes[3]
            for f in corpo.get("files", []):
                gravado = ESTADO["objetos"].get(f["objectKey"])
                if not gravado:
                    return self._json(409, {"title": "objeto ausente",
                                            "type": "checksum-mismatch",
                                            "detail": f["objectKey"]})
                tam, sha = gravado
                if tam != f["sizeBytes"] or (f.get("sha256") and sha != f["sha256"]):
                    return self._json(409, {"title": "checksum divergente",
                                            "type": "checksum-mismatch",
                                            "detail": f["objectKey"]})
            cov = corpo.get("coverageRatio", 0)
            estado = "ready" if cov >= 0.999 else ("partial" if cov >= 0.6 else "failed")
            with TRAVA:
                ESTADO["confirmados"][clip_id] = corpo
                ESTADO["leases"].pop(clip_id, None)
            print(f"mock: clipe {clip_id} CONFIRMADO como {estado} ·"
                  f" cobertura {cov} · {corpo.get('durationSeconds')}s", flush=True)
            return self._json(200, {"clipId": clip_id, "status": estado,
                                    "retainSourceUntil": agora_iso(48 * 3600)})

        if caminho == "/api/relay/health":
            with TRAVA:
                ESTADO["saude"].append(corpo)
                versao = ESTADO["cameras"]["version"]
                pend = len(ESTADO["fila"])
            fora = [c["cameraId"] for c in corpo.get("cameras", []) if c.get("down")]
            print(f"mock: saude · {len(corpo.get('cameras', []))} cameras ·"
                  f" fora: {fora or '-'} ·"
                  f" disco {corpo.get('disk', {}).get('usedPercent')}%", flush=True)
            return self._json(200, {"serverTime": agora_iso(),
                                    "camerasVersion": versao,
                                    "pendingJobs": pend})

        return self._json(404, {"title": "not found"})

    # ------------------------------------------------------------------- PUT

    def do_PUT(self):  # noqa: N802
        """Faz as vezes da URL pré-assinada. Sem autenticação de propósito: uma
        URL pré-assinada JÁ É a credencial, e o relay não manda a chave dele
        para o bucket."""
        partes = self.path.strip("/").split("/")
        if len(partes) != 3 or partes[0] != "upload":
            return self._json(404, {"title": "not found"})
        clip_id, papel = partes[1], partes[2]
        dados = self._corpo()
        chave = f"clips/teste/{clip_id}/{papel}"
        os.makedirs(os.path.join(OUT_DIR, clip_id), exist_ok=True)
        ext = "mp4" if papel in ("watermarked", "source") else "jpg"
        destino = os.path.join(OUT_DIR, clip_id, f"{papel}.{ext}")
        with open(destino, "wb") as f:
            f.write(dados)
        with TRAVA:
            ESTADO["objetos"][chave] = (len(dados), hashlib.sha256(dados).hexdigest())
        print(f"mock: PUT {chave} · {len(dados)} bytes -> {destino}", flush=True)
        return self._vazio(200)


def requeue_loop():
    """Lease vencido volta o job para a fila. É o que cobre o relay morrer no
    meio de um corte — e é a única coisa deste mock que existe para testar um
    comportamento do RELAY, não da API."""
    while True:
        time.sleep(5)
        with TRAVA:
            vencidos = [j for j, t in ESTADO["leases"].items() if t < time.time()]
            for j in vencidos:
                ESTADO["leases"].pop(j, None)
                print(f"mock: lease do job {j} venceu — de volta para a fila",
                      flush=True)


def _claim_impl(maximo):
    with TRAVA:
        jobs = ESTADO["fila"][:maximo]
        del ESTADO["fila"][:maximo]
        for j in jobs:
            ESTADO["leases"][j["jobId"]] = time.time() + LEASE_S
    return jobs


Handler._claim = lambda self, maximo: self._json(
    200, {"jobs": _claim_impl(maximo), "serverTime": agora_iso(),
          "leaseSeconds": LEASE_S}
)


def main():
    global OUT_DIR
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int, default=8787)
    ap.add_argument("--cameras", help="JSON com {version, cameras:[...]}")
    ap.add_argument("--out", default=OUT_DIR, help="onde gravar os objetos")
    ap.add_argument("--marca-parceiro",
                    help="PNG a servir em /branding/p-teste/watermark.png")
    a = ap.parse_args()
    OUT_DIR = a.out
    os.makedirs(OUT_DIR, exist_ok=True)
    if a.marca_parceiro:
        with open(a.marca_parceiro, "rb") as f:
            ESTADO["branding"]["/branding/p-teste/watermark.png"] = f.read()
    if a.cameras:
        with open(a.cameras) as f:
            ESTADO["cameras"] = json.load(f)
    threading.Thread(target=requeue_loop, daemon=True).start()
    srv = ThreadingHTTPServer(("127.0.0.1", a.port), Handler)
    srv.daemon_threads = True
    print(f"mock: API de mentira em http://127.0.0.1:{a.port}/api"
          f" · {len(ESTADO['cameras']['cameras'])} cameras"
          f" · objetos em {OUT_DIR}", flush=True)
    srv.serve_forever()


if __name__ == "__main__":
    main()
