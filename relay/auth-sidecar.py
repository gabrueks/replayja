#!/usr/bin/env python3
"""Autenticador local do relay do Replay já (porta 9998, só loopback, via
`forward_auth` do Caddy). Valida CADA requisição em microssegundos, sem
chamada externa.

Por que não validar na API: em produção no Sentinela isso virava centenas de
invocações por minuto na Vercel — um player HLS pede playlist a cada 2 s e
segmento a cada 2 s, por espectador, por câmera. O segredo é compartilhado e a
verificação é um HMAC; pagar uma ida à nuvem por ela é comprar latência e
conta de função para não ganhar nada.

Dois modos de entrada:

  - **Token de leitura** (o app monta a URL):
    `/t/<token>/(live|vod|rec|clip|thumb)/<cameraId>/...`
    HMAC-SHA256 sobre `relay-read:<cameraId>.<exp>` com `RELAY_TOKEN_SECRET`.
    O token vai no **caminho**, nunca na query: as URLs relativas das
    playlists (`../../rec/<cam>/<sess>/<seg>`) herdam o prefixo de graça no
    navegador, e o rec-server nunca precisa conhecer o token.

  - **Servidor**, em dois sabores que o contrato separa de propósito
    (`docs/api/README.md` §1):
      `relayKey`   — `x-relay-key: <RELAY_KEY>`, o segredo que o RELAY usa
                     para falar com a API, e que os processos locais
                     reapresentam aqui;
      `relayToken` — `Authorization: Bearer <RELAY_TOKEN>`, o segredo que a
                     NUVEM usa para falar com o relay (`POST /jobs`,
                     `GET /stats`).
    São dois valores diferentes no `rec.env` porque as direções são
    diferentes: comprometer um não dá o outro. Se `RELAY_TOKEN` não estiver
    definido, o modo Bearer simplesmente não existe — e o `POST /jobs` volta a
    ser apenas latência a mais, porque o worker pega o job no ciclo de 2 s de
    qualquer jeito.

O escopo do token é UMA CÂMERA: quem decide se a pessoa pode ver aquela quadra
é a API (`docs/api/README.md` §3), e o token é só o portador dessa decisão até
aqui. Este processo não conhece usuário, sessão nem arena.

Se `RELAY_TOKEN_SECRET` divergir entre a API e o relay, **todo o vídeo cai**
com 401. É o primeiro item do backup por isso.
"""
import base64
import hashlib
import hmac
import os
import sys
import time
from http.server import BaseHTTPRequestHandler, HTTPServer

SECRET = os.environ["RELAY_TOKEN_SECRET"].encode()
RELAY_KEY = os.environ.get("RELAY_KEY", "")
RELAY_TOKEN = os.environ.get("RELAY_TOKEN", "")

# Prefixos que um token de leitura alcança. O 4º segmento do caminho é sempre
# o cameraId, então um token de UMA câmera continua valendo para UMA câmera,
# sem regra nova por rota.
#
# ATENÇÃO AO ACRESCENTAR ROTA: no Sentinela o `/clip` e depois o `/thumb`
# foram ao ar com o rec-server servindo os dois perfeitamente e o Caddy
# devolvendo 401, porque o prefixo não estava nesta lista. O sintoma do lado do
# app é "a sessão de vídeo expirou", que manda investigar exatamente o lugar
# errado.
READ_PREFIXES = {"live", "vod", "rec", "clip", "thumb"}


def sign(payload: str) -> str:
    digest = hmac.new(SECRET, f"relay-read:{payload}".encode(), hashlib.sha256).digest()
    return base64.urlsafe_b64encode(digest).rstrip(b"=").decode()


def token_ok(camera_id: str, token: str) -> bool:
    exp, dot, sig = token.partition(".")
    if not dot or not exp.isdigit() or int(exp) < time.time():
        return False
    return hmac.compare_digest(sign(f"{camera_id}.{exp}"), sig)


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):  # noqa: N802
        key = self.headers.get("x-relay-key", "")
        if RELAY_KEY and key and hmac.compare_digest(key, RELAY_KEY):
            return self._allow()
        auth = self.headers.get("Authorization", "")
        if RELAY_TOKEN and auth.startswith("Bearer "):
            if hmac.compare_digest(auth[7:].strip(), RELAY_TOKEN):
                return self._allow()
        uri = self.headers.get("X-Forwarded-Uri", "")
        path = uri.partition("?")[0]
        parts = path.strip("/").split("/")
        if (
            len(parts) >= 4
            and parts[0] == "t"
            and parts[2] in READ_PREFIXES
            and parts[3]
            and token_ok(parts[3], parts[1])
        ):
            return self._allow()
        return self._deny()

    def _allow(self):
        self.send_response(200)
        self.end_headers()

    def _deny(self):
        self.send_response(401)
        self.end_headers()

    def log_message(self, *args):  # silencioso: volume alto por design
        pass


class QuietServer(HTTPServer):
    """Desconexão de cliente aqui é rotina (o Caddy fecha conexões o tempo
    todo) e não pode virar traceback: este processo valida CADA requisição de
    mídia, então o volume soterraria o journal."""

    def handle_error(self, request, client_address):
        exc = sys.exc_info()[1]
        if isinstance(exc, (BrokenPipeError, ConnectionResetError, TimeoutError)):
            return
        super().handle_error(request, client_address)


if __name__ == "__main__":
    QuietServer(("127.0.0.1", 9998), Handler).serve_forever()
