#!/usr/bin/env python3
"""Testes do PROTOCOLO relay ↔ API: claim, lease, upload pré-assinado e
confirmação com sha256.

Isto não é o e2e (que precisa de ffmpeg e Linux): aqui sobe a API de mentira
dentro do próprio processo de teste e exercita as funções HTTP do worker
contra ela. O que se prova é a conversa — a camada em que um erro não aparece
como exceção, e sim como um clipe que nunca fica pronto ou, pior, um clipe
truncado marcado como `ready`.

    python3 -m unittest discover -s relay/tests -v
"""
import hashlib
import importlib.util
import json
import os
import sys
import tempfile
import threading
import unittest
import urllib.request
from http.server import ThreadingHTTPServer

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
AQUI = os.path.dirname(os.path.abspath(__file__))

os.environ.setdefault("RELAY_TOKEN_SECRET", "segredo-de-teste")
os.environ.setdefault("RELAY_KEY", "chave-de-teste")
_TMP = tempfile.mkdtemp(prefix="protocolo-")
os.environ.setdefault("REC_ROOT", os.path.join(_TMP, "rec"))
os.environ.setdefault("REC_DB", os.path.join(_TMP, "rec.db"))
os.makedirs(os.environ["REC_ROOT"], exist_ok=True)


def carrega(nome, caminho):
    spec = importlib.util.spec_from_file_location(nome, caminho)
    mod = importlib.util.module_from_spec(spec)
    sys.modules[nome] = mod
    spec.loader.exec_module(mod)
    return mod


mock = carrega("mockapi", os.path.join(AQUI, "mock_api.py"))
worker = carrega("clipworker2", os.path.join(RAIZ, "clip-worker.py"))


class TestProtocolo(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        mock.RELAY_KEY = "chave-de-teste"
        mock.OUT_DIR = tempfile.mkdtemp(prefix="bucket-")
        mock.ESTADO["cameras"] = {
            "version": "v7",
            "cameras": [
                {
                    "id": "quadra1teste",
                    "enabled": True,
                    "ingestKind": "rtmp_push",
                    "rtmp": {"port": 19350, "streamKey": "chavelonga123",
                             "appPath": "live"},
                }
            ],
        }
        cls.srv = ThreadingHTTPServer(("127.0.0.1", 0), mock.Handler)
        cls.srv.daemon_threads = True
        cls.porta = cls.srv.server_address[1]
        cls.t = threading.Thread(target=cls.srv.serve_forever, daemon=True)
        cls.t.start()
        worker.API_URL = f"http://127.0.0.1:{cls.porta}/api"
        worker.RELAY_KEY = "chave-de-teste"

    @classmethod
    def tearDownClass(cls):
        cls.srv.shutdown()

    def base(self):
        return f"http://127.0.0.1:{self.porta}"

    # ------------------------------------------------------------ auth

    def test_sem_chave_a_api_recusa(self):
        # Se isto passar, qualquer um na internet lê a lista de câmeras COM AS
        # CHAVES DE INGEST.
        antes = worker.RELAY_KEY
        worker.RELAY_KEY = "chave-errada"
        try:
            st, _ = worker.api("GET", "/relay/cameras")
            self.assertEqual(st, 401)
        finally:
            worker.RELAY_KEY = antes

    def test_com_chave_lista_cameras(self):
        st, corpo = worker.api("GET", "/relay/cameras")
        self.assertEqual(st, 200)
        self.assertEqual(corpo["version"], "v7")
        self.assertEqual(corpo["cameras"][0]["id"], "quadra1teste")

    def test_since_igual_devolve_304(self):
        st, _ = worker.api("GET", "/relay/cameras?since=v7")
        self.assertEqual(st, 304)

    # ----------------------------------------------------------- claim

    def test_fila_vazia_devolve_lista_vazia_nao_erro(self):
        with mock.TRAVA:
            mock.ESTADO["fila"].clear()
        self.assertEqual(worker.reivindica(), [])

    def test_claim_retira_da_fila_e_abre_lease(self):
        job = {"jobId": "j1", "clipId": "c1", "cameraId": "quadra1teste",
               "deliverFrom": "2026-09-14T23:12:07.000Z",
               "deliverTo": "2026-09-14T23:12:32.000Z"}
        with mock.TRAVA:
            mock.ESTADO["fila"][:] = [job]
        jobs = worker.reivindica()
        self.assertEqual([j["jobId"] for j in jobs], ["j1"])
        # Dois relays nunca pegam o mesmo job: reivindicar retira da fila.
        self.assertEqual(worker.reivindica(), [])
        self.assertIn("j1", mock.ESTADO["leases"])

    def test_claim_respeita_o_max(self):
        with mock.TRAVA:
            mock.ESTADO["fila"][:] = [
                {"jobId": f"j{i}", "clipId": f"c{i}"} for i in range(10)
            ]
        antes = worker.CLAIM_MAX
        worker.CLAIM_MAX = 3
        try:
            self.assertEqual(len(worker.reivindica()), 3)
            self.assertEqual(len(mock.ESTADO["fila"]), 7)
        finally:
            worker.CLAIM_MAX = antes
            with mock.TRAVA:
                mock.ESTADO["fila"].clear()

    def test_claim_por_post_funciona_igual(self):
        # O caminho que o briefing da task A1 pediu. As duas formas precisam
        # coexistir porque a divergência com o openapi.yaml ainda está aberta.
        with mock.TRAVA:
            mock.ESTADO["fila"][:] = [{"jobId": "jp", "clipId": "cp"}]
        m, p = worker.CLAIM_METHOD, worker.CLAIM_PATH
        worker.CLAIM_METHOD, worker.CLAIM_PATH = "POST", "/relay/clip-jobs/claim"
        try:
            self.assertEqual([j["jobId"] for j in worker.reivindica()], ["jp"])
        finally:
            worker.CLAIM_METHOD, worker.CLAIM_PATH = m, p

    def test_status_renova_o_lease(self):
        with mock.TRAVA:
            mock.ESTADO["status"].clear()
        worker.reporta("j-status", "cutting", coverageRatio=1.0)
        registros = [s for s in mock.ESTADO["status"] if s["jobId"] == "j-status"]
        self.assertEqual(registros[0]["status"], "cutting")
        self.assertTrue(registros[0]["renewLease"])
        self.assertIn("j-status", mock.ESTADO["leases"])

    # -------------------------------------------------- upload + confirm

    def _arquivo(self, conteudo=b"conteudo de video de mentira" * 100):
        caminho = os.path.join(tempfile.mkdtemp(), "clip.mp4")
        with open(caminho, "wb") as f:
            f.write(conteudo)
        return caminho, len(conteudo), hashlib.sha256(conteudo).hexdigest()

    def test_ciclo_completo_de_upload_e_confirmacao(self):
        caminho, tam, sha = self._arquivo()
        st, resp = worker.api(
            "POST", "/relay/clips/c-ok/upload-url",
            {"files": [{"role": "watermarked", "contentType": "video/mp4",
                        "sizeBytes": tam, "sha256": sha}]},
        )
        self.assertEqual(st, 200)
        alvo = resp["uploads"][0]
        self.assertEqual(alvo["method"], "PUT")

        st, err = worker.put_presigned(alvo["url"], caminho, "video/mp4")
        self.assertIn(st, (200, 201, 204), err)

        st, resp = worker.api(
            "POST", "/relay/clips/c-ok/confirm",
            {"files": [{"role": "watermarked", "objectKey": alvo["objectKey"],
                        "sizeBytes": tam, "sha256": sha}],
             "coverageRatio": 1.0, "durationSeconds": 25.0},
            idem="j-ok",
        )
        self.assertEqual(st, 200)
        self.assertEqual(resp["status"], "ready")
        self.assertIn("retainSourceUntil", resp)

    def test_cobertura_parcial_vira_partial(self):
        # Um lance com 3 s faltando ainda é o lance do atleta: ele APARECE na
        # busca, rotulado. Escondê-lo seria pior que entregá-lo.
        caminho, tam, sha = self._arquivo(b"x" * 5000)
        _, resp = worker.api("POST", "/relay/clips/c-parcial/upload-url",
                             {"files": [{"role": "watermarked",
                                         "contentType": "video/mp4",
                                         "sizeBytes": tam, "sha256": sha}]})
        alvo = resp["uploads"][0]
        worker.put_presigned(alvo["url"], caminho, "video/mp4")
        st, resp = worker.api("POST", "/relay/clips/c-parcial/confirm",
                              {"files": [{"role": "watermarked",
                                          "objectKey": alvo["objectKey"],
                                          "sizeBytes": tam, "sha256": sha}],
                               "coverageRatio": 0.85})
        self.assertEqual((st, resp["status"]), (200, "partial"))

    def test_checksum_divergente_devolve_409(self):
        # A checagem que impede um upload TRUNCADO de virar clipe `ready`
        # corrompido. Sem ela, o atleta abre um vídeo que não toca.
        caminho, tam, _sha = self._arquivo(b"y" * 4000)
        _, resp = worker.api("POST", "/relay/clips/c-ruim/upload-url",
                             {"files": [{"role": "watermarked",
                                         "contentType": "video/mp4",
                                         "sizeBytes": tam}]})
        alvo = resp["uploads"][0]
        worker.put_presigned(alvo["url"], caminho, "video/mp4")
        st, corpo = worker.api("POST", "/relay/clips/c-ruim/confirm",
                               {"files": [{"role": "watermarked",
                                           "objectKey": alvo["objectKey"],
                                           "sizeBytes": tam,
                                           "sha256": "0" * 64}],
                                "coverageRatio": 1.0})
        self.assertEqual(st, 409)
        self.assertEqual(corpo and json.loads(json.dumps(corpo)).get("type"),
                         "checksum-mismatch")

    def test_objeto_ausente_devolve_409(self):
        st, _ = worker.api("POST", "/relay/clips/c-vazio/confirm",
                           {"files": [{"role": "watermarked",
                                       "objectKey": "clips/teste/c-vazio/watermarked",
                                       "sizeBytes": 10, "sha256": "a" * 64}],
                            "coverageRatio": 1.0})
        self.assertEqual(st, 409)

    def test_upload_url_so_emite_o_que_falta(self):
        # É assim que o relay retoma um upload interrompido: pergunta o que
        # falta, em vez de reenviar tudo.
        caminho, tam, sha = self._arquivo(b"z" * 3000)
        _, resp = worker.api("POST", "/relay/clips/c-retoma/upload-url",
                             {"files": [{"role": "watermarked",
                                         "contentType": "video/mp4",
                                         "sizeBytes": tam, "sha256": sha}]})
        alvo = resp["uploads"][0]
        worker.put_presigned(alvo["url"], caminho, "video/mp4")
        worker.api("POST", "/relay/clips/c-retoma/confirm",
                   {"files": [{"role": "watermarked",
                               "objectKey": alvo["objectKey"],
                               "sizeBytes": tam, "sha256": sha}],
                    "coverageRatio": 1.0})
        _, resp2 = worker.api("POST", "/relay/clips/c-retoma/upload-url",
                              {"files": [{"role": "watermarked",
                                          "contentType": "video/mp4",
                                          "sizeBytes": tam, "sha256": sha}]})
        self.assertEqual(resp2["uploads"], [])

    def test_put_e_idempotente(self):
        # `objectKey` determinística + object storage não é append log:
        # repetir um PUT sobrescreve com bytes idênticos e é inofensivo.
        caminho, tam, sha = self._arquivo(b"w" * 2000)
        _, resp = worker.api("POST", "/relay/clips/c-repete/upload-url",
                             {"files": [{"role": "watermarked",
                                         "contentType": "video/mp4",
                                         "sizeBytes": tam, "sha256": sha}]})
        alvo = resp["uploads"][0]
        for _ in range(3):
            st, _err = worker.put_presigned(alvo["url"], caminho, "video/mp4")
            self.assertIn(st, (200, 201, 204))
        self.assertEqual(mock.ESTADO["objetos"][alvo["objectKey"]], (tam, sha))

    # ---------------------------------------------------------- saúde

    def test_health_aceito_e_devolve_camerasVersion(self):
        corpo = {
            "relayId": "relay-e2e",
            "reportedAt": worker.agora_iso(),
            "disk": {"totalBytes": 100, "freeBytes": 50, "usedPercent": 50.0},
            "cameras": [
                {"cameraId": "quadra1teste", "coverage24h": 0.96,
                 "lastSegmentAt": worker.agora_iso(), "down": False}
            ],
        }
        st, resp = worker.api("POST", "/relay/health", corpo)
        self.assertEqual(st, 200)
        # É este campo que faz o relay buscar a lista de novo sem esperar o
        # tique de 2 min.
        self.assertEqual(resp["camerasVersion"], "v7")
        self.assertIn("pendingJobs", resp)


class TestRedeCaindo(unittest.TestCase):
    """A API some no meio. Nada disto pode virar exceção: o worker não pode
    morrer porque a Vercel piscou."""

    def setUp(self):
        self.antes = worker.API_URL
        # Porta fechada: conexão recusada na hora.
        worker.API_URL = "http://127.0.0.1:1/api"

    def tearDown(self):
        worker.API_URL = self.antes

    def test_api_inalcancavel_devolve_status_zero(self):
        st, corpo = worker.api("GET", "/relay/clip-jobs")
        self.assertEqual(st, 0)
        self.assertIn("_erro", corpo)

    def test_reivindica_devolve_vazio(self):
        self.assertEqual(worker.reivindica(), [])

    def test_reporta_nao_levanta(self):
        worker.reporta("j-qualquer", "cutting")  # não pode explodir

    def test_put_em_url_morta_devolve_status_zero(self):
        caminho = os.path.join(tempfile.mkdtemp(), "x.bin")
        with open(caminho, "wb") as f:
            f.write(b"abc")
        st, _ = worker.put_presigned("http://127.0.0.1:1/upload/x/y", caminho,
                                     "video/mp4", timeout=2)
        self.assertEqual(st, 0)


if __name__ == "__main__":
    unittest.main(verbosity=2)
