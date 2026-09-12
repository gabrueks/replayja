#!/usr/bin/env python3
"""Testes das partes PURAS do relay — as que dá para provar sem ffmpeg, sem
câmera e sem rede, e que por isso rodam em qualquer máquina (inclusive a do
Windows onde este fork foi escrito).

O que está aqui é exatamente o conjunto de contas cujo erro seria SILENCIOSO
em produção: um `coverageRatio` inflado entrega um buraco como clipe íntegro;
um offset de keyframe errado entrega o lance errado; uma playlist sem
`EXT-X-DISCONTINUITY` produz um MP4 que toca até a primeira sessão e para.
Nada disso dá erro em lugar nenhum — só produz vídeo errado.

    python3 -m unittest discover -s relay/tests -v

O que este arquivo NÃO cobre, e é honesto dizer: ffmpeg de verdade, RTMP de
verdade, poda com disco de verdade. Isso é o `make test-e2e`, que precisa de
Linux — ver relay/README.md §Testes.
"""
import importlib.util
import os
import sqlite3
import sys
import tempfile
import unittest

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# Ambiente ANTES do import: os dois módulos leem `os.environ` no nível de
# módulo (é o padrão do relay v2 — configuração por `EnvironmentFile` do
# systemd, sem biblioteca de config).
_TMP = tempfile.mkdtemp(prefix="relaytest-")
os.environ.setdefault("REC_ROOT", os.path.join(_TMP, "rec"))
os.environ.setdefault("REC_DB", os.path.join(_TMP, "rec.db"))
os.environ.setdefault("RELAY_TOKEN_SECRET", "segredo-de-teste")
os.makedirs(os.environ["REC_ROOT"], exist_ok=True)


def carrega(nome, arquivo):
    """Importa um arquivo com hífen no nome (que não é identificador Python)."""
    spec = importlib.util.spec_from_file_location(nome, os.path.join(RAIZ, arquivo))
    mod = importlib.util.module_from_spec(spec)
    sys.modules[nome] = mod
    spec.loader.exec_module(mod)
    return mod


rec = carrega("recserver", "rec-server.py")
worker = carrega("clipworker", "clip-worker.py")
auth = carrega("authsidecar", "auth-sidecar.py")


# ---------------------------------------------------------------------------
# Cobertura — a conta mais carregada de consequência do relay
# ---------------------------------------------------------------------------
class TestCobertura(unittest.TestCase):
    def test_janela_inteira_coberta(self):
        self.assertEqual(rec.coverage_from_spans([(1000, 2000)], 1000, 2000), 1.0)

    def test_nada_gravado(self):
        self.assertEqual(rec.coverage_from_spans([], 1000, 2000), 0.0)

    def test_buraco_no_meio(self):
        # 25 s pedidos, 5 s de buraco no meio → 0,8. É o caso `partial`: o app
        # mostra o lance com "faltam ~5 s — a internet da arena oscilou".
        spans = [(0, 10_000), (15_000, 25_000)]
        self.assertAlmostEqual(rec.coverage_from_spans(spans, 0, 25_000), 0.8)

    def test_span_maior_que_a_janela_nao_passa_de_1(self):
        # Um span de 1 h contendo a janela de 25 s não pode dar 144,0.
        self.assertEqual(rec.coverage_from_spans([(0, 3_600_000)], 1000, 26_000), 1.0)

    def test_spans_sobrepostos_contam_a_uniao_nao_a_soma(self):
        # Dois spans cobrindo o mesmo trecho dariam 2,0 se somados. Isso
        # esconderia um buraco: 0,5 de cobertura real viraria 1,0 e o clipe
        # sairia rotulado como íntegro.
        spans = [(0, 10_000), (0, 10_000)]
        self.assertAlmostEqual(rec.coverage_from_spans(spans, 0, 20_000), 0.5)

    def test_spans_fora_de_ordem(self):
        spans = [(15_000, 25_000), (0, 10_000)]
        self.assertAlmostEqual(rec.coverage_from_spans(spans, 0, 25_000), 0.8)

    def test_span_parcialmente_fora_da_janela(self):
        # O pedaço fora da janela não conta a favor.
        self.assertAlmostEqual(
            rec.coverage_from_spans([(0, 30_000)], 20_000, 40_000), 0.5
        )

    def test_janela_invertida_ou_vazia(self):
        self.assertEqual(rec.coverage_from_spans([(0, 10)], 500, 500), 0.0)
        self.assertEqual(rec.coverage_from_spans([(0, 10)], 500, 400), 0.0)

    def test_limiar_de_recusa(self):
        # 0,6 é o `minCoverageRatio` do contrato: abaixo disso o clipe é
        # recusado em vez de entregue capenga.
        spans = [(0, 14_000)]
        self.assertLess(rec.coverage_from_spans(spans, 0, 25_000), 0.6)
        spans = [(0, 16_000)]
        self.assertGreater(rec.coverage_from_spans(spans, 0, 25_000), 0.6)


# ---------------------------------------------------------------------------
# Janela e keyframe
# ---------------------------------------------------------------------------
class TestJanela(unittest.TestCase):
    def test_offset_alinhado_a_keyframe(self):
        # Segmentos de 2 s; o /clip começa no segmento que CONTÉM cutFrom.
        # cutFrom = 1_000_032_000 cai dentro do segmento que começou em
        # 1_000_031_000 → o bruto começa ali, e o entregue está 3 s à frente.
        self.assertEqual(rec.window_offset_ms(1_000_031_000, 1_000_034_000), 3000)

    def test_offset_nunca_negativo(self):
        # Se o bruto começasse DEPOIS do início entregue, um `-ss` negativo
        # faria o ffmpeg ignorar o seek e entregar o vídeo inteiro — 38 s em
        # vez de 25, sem erro nenhum.
        self.assertEqual(rec.window_offset_ms(1_000_040_000, 1_000_034_000), 0)

    def test_offset_zero_quando_bate_exato(self):
        self.assertEqual(rec.window_offset_ms(1_000_034_000, 1_000_034_000), 0)

    def test_worker_e_recserver_calculam_o_mesmo_offset(self):
        # Duas implementações da mesma conta (uma em ms, outra em s) que não
        # podem divergir: é ela que decide qual quadro abre o clipe.
        a = rec.window_offset_ms(1_000_031_000, 1_000_034_000) / 1000.0
        b = worker.offset_no_bruto(1_000_031_000, 1_000_034_000)
        self.assertAlmostEqual(a, b)

    def test_janela_do_job_usa_o_que_a_api_mandou(self):
        job = {
            "deliverFrom": "2026-09-14T23:12:07.000Z",
            "deliverTo": "2026-09-14T23:12:32.000Z",
            "cutFrom": "2026-09-14T23:11:59.000Z",
            "cutTo": "2026-09-14T23:12:37.000Z",
        }
        c_from, c_to, d_from, d_to = worker.janela_do_job(job)
        self.assertEqual((d_to - d_from) / 1000, 25.0)  # os 25 s entregues
        self.assertEqual((c_to - c_from) / 1000, 38.0)  # os ~38 s brutos
        self.assertLess(c_from, d_from)
        self.assertGreater(c_to, d_to)

    def test_janela_do_job_alarga_sozinha_se_a_api_esquecer(self):
        # Bytes extras num arquivo temporário custam zero; um lance cortado ao
        # meio custa o cliente. Se `cutFrom == deliverFrom`, alargamos.
        job = {
            "deliverFrom": "2026-09-14T23:12:07.000Z",
            "deliverTo": "2026-09-14T23:12:32.000Z",
            "cutFrom": "2026-09-14T23:12:07.000Z",
            "cutTo": "2026-09-14T23:12:32.000Z",
        }
        c_from, c_to, d_from, d_to = worker.janela_do_job(job)
        self.assertLessEqual(c_from, d_from - 2000)
        self.assertGreaterEqual(c_to, d_to + 1000)

    def test_janela_do_job_sem_cut_deriva_do_deliver(self):
        job = {
            "deliverFrom": "2026-09-14T23:12:07.000Z",
            "deliverTo": "2026-09-14T23:12:32.000Z",
        }
        c_from, c_to, d_from, d_to = worker.janela_do_job(job)
        self.assertEqual(d_from - c_from, 8000)
        self.assertEqual(c_to - d_to, 5000)

    def test_parse_iso_com_Z_e_com_offset(self):
        a = worker.parse_iso("2026-09-14T23:12:07.000Z")
        b = worker.parse_iso("2026-09-14T23:12:07.000+00:00")
        c = worker.parse_iso("2026-09-14T20:12:07.000-03:00")
        self.assertEqual(a, b)
        self.assertEqual(a, c)


# ---------------------------------------------------------------------------
# Índice: parse de playlist + segmentos + spans
# ---------------------------------------------------------------------------
PLAYLIST = """#EXTM3U
#EXT-X-VERSION:7
#EXT-X-TARGETDURATION:2
#EXT-X-MEDIA-SEQUENCE:0
#EXT-X-PLAYLIST-TYPE:EVENT
#EXT-X-MAP:URI="init.mp4"
#EXT-X-PROGRAM-DATE-TIME:2026-09-14T23:12:00.000+0000
#EXTINF:2.000000,
0.m4s
#EXT-X-PROGRAM-DATE-TIME:2026-09-14T23:12:02.000+0000
#EXTINF:2.000000,
1.m4s
#EXT-X-PROGRAM-DATE-TIME:2026-09-14T23:12:04.000+0000
#EXTINF:68.000000,
2.m4s
"""


class TestIndice(unittest.TestCase):
    def setUp(self):
        self.conn = sqlite3.connect(":memory:")
        # Mesmo esquema do init_db, sem tocar em arquivo.
        self.conn.executescript(
            """
            CREATE TABLE segments(cam TEXT, sess TEXT, seg TEXT, start_ms INTEGER,
              dur_ms INTEGER, seq INTEGER, disc INTEGER,
              size_bytes INTEGER DEFAULT 0, PRIMARY KEY (cam,sess,seg));
            CREATE TABLE cam_state(cam TEXT PRIMARY KEY, next_seq INTEGER DEFAULT 0,
              disc_count INTEGER DEFAULT 0, last_sess TEXT,
              last_end_ms INTEGER DEFAULT 0, last_span_id INTEGER,
              seg_count INTEGER DEFAULT 0, dur_total INTEGER DEFAULT 0,
              bytes_total INTEGER DEFAULT 0, oldest_ms INTEGER);
            CREATE TABLE spans(id INTEGER PRIMARY KEY AUTOINCREMENT, cam TEXT,
              start_ms INTEGER, end_ms INTEGER);
            """
        )

    def test_pdt_do_ffmpeg_sem_dois_pontos_no_fuso(self):
        # O ffmpeg escreve `+0000`; o `fromisoformat` quer `+00:00`. Sem a
        # normalização, TODO segmento entra com pdt None e some do índice.
        t = rec._parse_pdt("2026-09-14T23:12:00.000+0000")
        self.assertIsNotNone(t)
        self.assertAlmostEqual(t, 1789420320.0, delta=86400 * 400)

    def test_parse_playlist_completa(self):
        d = tempfile.mkdtemp()
        p = os.path.join(d, "index.m3u8")
        with open(p, "w") as f:
            f.write(PLAYLIST)
        segs, linhas = rec.parse_playlist(p, 0)
        self.assertEqual([s[0] for s in segs], ["0.m4s", "1.m4s", "2.m4s"])
        self.assertEqual(segs[0][2], 2000)
        # O segmento de 68 s é a assinatura de um buraco de uplink. O EXTINF
        # está CERTO e precisa entrar no índice como está: a câmera de fato não
        # mandou nada naquele minuto, e a gravação registra isso honestamente.
        self.assertEqual(segs[2][2], 68_000)
        self.assertGreater(linhas, 0)

    def test_parse_playlist_incremental_nao_repete(self):
        # É o que faz o indexador custar O(novidade) e não O(acervo): 3 M de
        # linhas reprocessadas por ciclo fritavam CPU e disco no Sentinela.
        d = tempfile.mkdtemp()
        p = os.path.join(d, "index.m3u8")
        with open(p, "w") as f:
            f.write(PLAYLIST)
        _segs, linhas = rec.parse_playlist(p, 0)
        with open(p, "a") as f:
            f.write("#EXT-X-PROGRAM-DATE-TIME:2026-09-14T23:13:12.000+0000\n")
            f.write("#EXTINF:2.000000,\n3.m4s\n")
        novos, _ = rec.parse_playlist(p, linhas)
        self.assertEqual([s[0] for s in novos], ["3.m4s"])

    def test_seq_e_disc_monotonicos_e_span_unico(self):
        for i in range(3):
            rec.index_segment(self.conn, "quadra1", "s1", f"{i}.m4s", 1000 + i * 2000, 2000)
        seqs = [r[0] for r in self.conn.execute(
            "SELECT seq FROM segments WHERE cam='quadra1' ORDER BY start_ms")]
        self.assertEqual(seqs, [0, 1, 2])
        discs = {r[0] for r in self.conn.execute("SELECT disc FROM segments")}
        self.assertEqual(discs, {0})
        spans = self.conn.execute("SELECT start_ms, end_ms FROM spans").fetchall()
        self.assertEqual(spans, [(1000, 7000)])

    def test_sessao_nova_incrementa_disc(self):
        # Uma sessão da origem = um ffmpeg = um diretório (regra de ouro). A
        # troca de sessão precisa virar descontinuidade, senão o player trava
        # tentando emendar timestamps que não emendam.
        rec.index_segment(self.conn, "quadra1", "s1", "0.m4s", 1000, 2000)
        rec.index_segment(self.conn, "quadra1", "s2", "0.m4s", 3000, 2000)
        d = self.conn.execute(
            "SELECT disc FROM segments WHERE sess='s2'").fetchone()[0]
        self.assertEqual(d, 1)

    def test_buraco_grande_parte_o_span_em_dois(self):
        rec.index_segment(self.conn, "quadra1", "s1", "0.m4s", 0, 2000)
        # 60 s de buraco: acima do SPAN_GAP_MS de 15 s.
        rec.index_segment(self.conn, "quadra1", "s1", "1.m4s", 62_000, 2000)
        spans = self.conn.execute(
            "SELECT start_ms, end_ms FROM spans ORDER BY start_ms").fetchall()
        self.assertEqual(len(spans), 2)
        # E é isso que faz a cobertura contar a verdade.
        self.assertAlmostEqual(
            rec.coverage_from_spans(spans, 0, 64_000), 4000 / 64_000
        )

    def test_buraco_pequeno_nao_parte_o_span(self):
        # Troca de sessão custa alguns segundos; virar dois blocos por isso
        # poluiria a timeline e inflaria a contagem de buracos no painel.
        rec.index_segment(self.conn, "quadra1", "s1", "0.m4s", 0, 2000)
        rec.index_segment(self.conn, "quadra1", "s1", "1.m4s", 10_000, 2000)
        spans = self.conn.execute("SELECT start_ms, end_ms FROM spans").fetchall()
        self.assertEqual(spans, [(0, 12_000)])

    def test_reindexar_o_mesmo_segmento_nao_consome_seq(self):
        # Acontece em todo restart no meio de uma playlist. Se consumisse seq,
        # o MEDIA-SEQUENCE da playlist pularia e o player reiniciaria a sessão.
        rec.index_segment(self.conn, "quadra1", "s1", "0.m4s", 0, 2000)
        rec.index_segment(self.conn, "quadra1", "s1", "0.m4s", 0, 2000)
        n = self.conn.execute("SELECT COUNT(*) FROM segments").fetchone()[0]
        seq = self.conn.execute(
            "SELECT next_seq FROM cam_state WHERE cam='quadra1'").fetchone()[0]
        self.assertEqual((n, seq), (1, 1))

    def test_contadores_incrementais(self):
        for i in range(5):
            rec.index_segment(self.conn, "quadra1", "s1", f"{i}.m4s", i * 2000, 2000)
        n, dur, velho = self.conn.execute(
            "SELECT seg_count, dur_total, oldest_ms FROM cam_state WHERE cam='quadra1'"
        ).fetchone()
        self.assertEqual((n, dur, velho), (5, 10_000, 0))


# ---------------------------------------------------------------------------
# Playlists
# ---------------------------------------------------------------------------
def linhas_de(cam, rows, live):
    return rec.build_playlist(cam, rows, live=live).splitlines()


class TestPlaylist(unittest.TestCase):
    # (sess, seg, start_ms, dur_ms, seq, disc)
    UMA_SESSAO = [
        ("s1", "0.m4s", 1_000_000, 2000, 10, 0),
        ("s1", "1.m4s", 1_002_000, 2000, 11, 0),
        ("s1", "2.m4s", 1_004_000, 2000, 12, 0),
    ]
    DUAS_SESSOES = [
        ("s1", "0.m4s", 1_000_000, 2000, 10, 0),
        ("s2", "0.m4s", 1_002_000, 2000, 11, 1),
    ]

    def test_vod_tem_endlist_e_nao_tem_start(self):
        l = linhas_de("quadra1", self.UMA_SESSAO, live=False)
        self.assertIn("#EXT-X-ENDLIST", l)
        self.assertIn("#EXT-X-PLAYLIST-TYPE:VOD", l)
        # No VOD quem escolhe a posição é a pessoa. Um EXT-X-START ali
        # roubaria essa escolha.
        self.assertFalse([x for x in l if x.startswith("#EXT-X-START")])

    def test_live_tem_start_e_nao_tem_endlist(self):
        l = linhas_de("quadra1", self.UMA_SESSAO, live=True)
        self.assertNotIn("#EXT-X-ENDLIST", l)
        self.assertTrue([x for x in l if x.startswith("#EXT-X-START:TIME-OFFSET=-")])

    def test_troca_de_sessao_vira_discontinuity_e_map_novo(self):
        # Sem isto o MP4 remuxado toca até a primeira sessão e para — sem erro.
        l = linhas_de("quadra1", self.DUAS_SESSOES, live=False)
        self.assertIn("#EXT-X-DISCONTINUITY", l)
        self.assertEqual(len([x for x in l if x.startswith("#EXT-X-MAP")]), 2)

    def test_media_sequence_vem_do_primeiro_segmento(self):
        l = linhas_de("quadra1", self.UMA_SESSAO, live=False)
        self.assertIn("#EXT-X-MEDIA-SEQUENCE:10", l)

    def test_targetduration_arredonda_para_cima(self):
        rows = [("s1", "0.m4s", 0, 2002, 0, 0)]
        self.assertIn(
            "#EXT-X-TARGETDURATION:3", linhas_de("quadra1", rows, live=False)
        )

    def test_start_offset_usa_a_mediana_nao_o_maximo(self):
        # UM segmento de 68 s enterrado na janela levava o TARGETDURATION a 68,
        # e o hls.js entrava em 3×68 = 204 s atrás do vivo. A mediana descreve
        # a PONTA, que é onde o player vai ficar.
        rows = [("s1", f"{i}.m4s", i * 2000, 2000, i, 0) for i in range(20)]
        rows.insert(5, ("s1", "buraco.m4s", 5 * 2000, 68_000, 99, 0))
        n = rec.live_start_offset(rows)
        self.assertLessEqual(n, rec.LIVE_START_MAX_S)
        self.assertGreaterEqual(n, rec.LIVE_START_MIN_S)

    def test_start_offset_respeita_piso_e_teto(self):
        curtos = [("s1", f"{i}.m4s", i * 2000, 2000, i, 0) for i in range(20)]
        self.assertEqual(rec.live_start_offset(curtos), 8.0)  # 3×2 s < piso
        longos = [("s1", f"{i}.m4s", i * 30_000, 30_000, i, 0) for i in range(20)]
        n = rec.live_start_offset(longos)
        # Teto de 20 s, MAS nunca dentro do último segmento: com segmentos de
        # 30 s a entrada precisa ficar em 32 s, senão cai num segmento que
        # ainda nem começou.
        self.assertEqual(n, 32.0)

    def test_clip_playlist_usa_caminho_absoluto_de_disco(self):
        txt = rec.build_clip_playlist("quadra1", self.DUAS_SESSOES, rec_root="/srv/rec")
        self.assertIn("/srv/rec/quadra1/s1/0.m4s", txt)
        self.assertIn('#EXT-X-MAP:URI="/srv/rec/quadra1/s2/init.mp4"', txt)
        self.assertIn("#EXT-X-DISCONTINUITY", txt)
        self.assertIn("#EXT-X-ENDLIST", txt)
        # Sempre barra normal, nunca separador do Windows: o alvo é o disco do
        # relay Linux mesmo quando o teste roda em outro lugar.
        self.assertNotIn("\\", txt)

    def test_clip_playlist_nao_vaza_token(self):
        # A playlist do /clip é consumida pelo ffmpeg local; a do navegador usa
        # caminho relativo para herdar o /t/<token>. Trocar as duas seria
        # servir caminho de disco ao navegador.
        txt = rec.build_clip_playlist("quadra1", self.UMA_SESSAO, rec_root="/srv/rec")
        self.assertNotIn("../../", txt)
        l = linhas_de("quadra1", self.UMA_SESSAO, live=False)
        self.assertIn("../../rec/quadra1/s1/0.m4s", l)


# ---------------------------------------------------------------------------
# Worker: claim, lease, idempotência, validação e filtro
# ---------------------------------------------------------------------------
class TestWorkerValidacao(unittest.TestCase):
    def info(self, dur=25.0, tam=12_000_000, codec="h264", pix="yuv420p", w=1920):
        return {
            "format": {"duration": str(dur), "size": str(tam)},
            "streams": [
                {"codec_type": "video", "codec_name": codec, "pix_fmt": pix,
                 "width": w, "height": 1080, "avg_frame_rate": "30/1"}
            ],
        }

    def test_clipe_bom_passa(self):
        ok, _ = worker.valida(self.info(), 25.0, 1.0)
        self.assertTrue(ok)

    def test_pix_fmt_errado_reprova(self):
        # Sem yuv420p o vídeo NÃO TOCA NO iOS — e metade dos atletas está lá.
        ok, motivo = worker.valida(self.info(pix="yuv444p"), 25.0, 1.0)
        self.assertFalse(ok)
        self.assertIn("iOS", motivo)

    def test_duracao_curta_reprova_com_cobertura_cheia(self):
        ok, _ = worker.valida(self.info(dur=12.0), 25.0, 1.0)
        self.assertFalse(ok)

    def test_duracao_curta_PASSA_quando_a_cobertura_e_parcial(self):
        # A correção que a spec não previu: com 0,5 de cobertura o clipe é
        # legitimamente mais curto — faltou vídeo na ORIGEM, não no nosso
        # corte. Cobrar 25 s aqui reprovaria exatamente o caso que o produto
        # decidiu entregar rotulado como `partial`.
        ok, motivo = worker.valida(self.info(dur=12.0), 25.0, 0.5)
        self.assertTrue(ok, motivo)

    def test_duracao_longa_demais_reprova(self):
        # Se o `-t` não pegou, o clipe sai com os 38 s brutos.
        ok, _ = worker.valida(self.info(dur=38.0), 25.0, 1.0)
        self.assertFalse(ok)

    def test_arquivo_minusculo_reprova(self):
        ok, _ = worker.valida(self.info(tam=4096), 25.0, 1.0)
        self.assertFalse(ok)

    def test_sem_stream_de_video_reprova(self):
        ok, _ = worker.valida({"format": {"duration": "25", "size": "9999999"},
                               "streams": []}, 25.0, 1.0)
        self.assertFalse(ok)

    def test_ffprobe_vazio_reprova(self):
        ok, _ = worker.valida(None, 25.0, 1.0)
        self.assertFalse(ok)


def marca(**over):
    m = {"path": "/tmp/wm.png", "widthPct": 18, "opacity": 0.85,
         "position": "bottom-right"}
    m.update(over)
    return m


class TestWorkerFiltro(unittest.TestCase):
    """O grafo do passe B. Um erro aqui não dá erro em lugar nenhum: produz um
    MP4 válido, da câmera certa, com a marca errada (ou sem marca) — e a marca
    é literalmente o que a arena paga para ver."""

    def test_sem_marca_nenhuma_ainda_forca_yuv420p(self):
        f = worker.monta_filtro([], 23.5, com_og=False)
        self.assertIn("format=yuv420p", f)
        self.assertIn("[v][t1]", f)
        self.assertNotIn("overlay", f)

    def test_marca_do_parceiro_no_canto_inferior_direito(self):
        f = worker.monta_filtro([marca(widthPct=10, opacity=0.8)], 23.5)
        self.assertIn("scale=192:-1", f)                 # 1920 × 10%
        self.assertIn("overlay=W-w-48:H-h-48", f)        # 1920 × 2,5%
        self.assertIn("colorchannelmixer=aa=0.800", f)
        self.assertIn("format=yuv420p", f)

    def test_formato_rgba_antes_do_alpha(self):
        # Sem `format=rgba`, um PNG decodificado sem canal alpha faz o `aa=`
        # não ter o que multiplicar: a opacidade some SEM ERRO e a marca sai
        # 100% opaca em cima do lance.
        f = worker.monta_filtro([marca(opacity=0.6)], 1.0)
        self.assertIn("format=rgba,colorchannelmixer=aa=0.600", f)

    def test_posicoes(self):
        for pos, esperado in (
            ("top-left", "overlay=48:48"),
            ("top_right", "overlay=W-w-48:48"),
            ("bottom-left", "overlay=48:H-h-48"),
            ("bottom_right", "overlay=W-w-48:H-h-48"),
        ):
            f = worker.monta_filtro([marca(position=pos)], 1.0)
            self.assertIn(esperado, f)

    def test_posicao_invalida_nao_derruba_o_clipe(self):
        f = worker.monta_filtro([marca(position="meio-do-campo")], 1.0)
        self.assertIn("overlay=W-w-48:H-h-48", f)

    def test_duas_marcas_encadeiam_na_ordem_das_entradas(self):
        # A entrada `i+1` do ffmpeg é `marcas[i]`. Se o encadeamento trocar de
        # ordem, a assinatura de 10% vai parar no canto do parceiro e a marca da
        # arena no oposto — um clipe válido e comercialmente errado.
        f = worker.monta_filtro(
            [marca(widthPct=18), marca(path="/tmp/ass.png", widthPct=10,
                                       opacity=0.6, position="bottom-left")],
            23.5,
        )
        self.assertIn("[1:v]scale=346:-1", f)            # 1920 × 18%
        self.assertIn("[2:v]scale=192:-1", f)            # 1920 × 10%
        self.assertIn("[base][wm0]overlay=W-w-48:H-h-48:format=auto[ov0]", f)
        self.assertIn("[ov0][wm1]overlay=48:H-h-48:format=auto[ov1]", f)
        self.assertIn("[ov1]format=yuv420p", f)

    def test_miniatura_sai_depois_dos_overlays(self):
        # A miniatura e o card do WhatsApp precisam levar a marca: é metade do
        # motivo de a arena querer que o clipe circule.
        f = worker.monta_filtro([marca()], 23.5, com_og=True)
        self.assertIn("[ov0]format=yuv420p,split=3[v][t1][t2]", f)

    def test_saida_forcada_a_1080p(self):
        f = worker.monta_filtro([], 1.0)
        self.assertIn("scale=1920:1080:force_original_aspect_ratio=decrease", f)

    def test_miniatura_sai_perto_do_fim_e_a_virgula_vai_escapada(self):
        # `select=gte(t,X)` sem escapar a vírgula quebraria o filter_complex em
        # dois filtros e o ffmpeg falharia com uma mensagem que não ajuda.
        f = worker.monta_filtro([], 23.5)
        self.assertIn("select=gte(t\\,23.500)", f)

    def test_instante_da_miniatura_e_na_linha_do_bruto(self):
        # O `-ss` é opção de SAÍDA e vale só para o MP4; os ramos da miniatura
        # e do OG saem do mesmo grafo e enxergam o recorte BRUTO desde 0. Quem
        # chama soma o offset — sem isso a miniatura cai num quadro aleatório
        # ~8 s antes do lance, e o erro é invisível: um JPEG válido, da câmera
        # certa, da hora errada.
        offset, no_clipe = 8.0, 23.5
        f = worker.monta_filtro([], offset + no_clipe, com_og=True)
        self.assertIn("[t1]select=gte(t\\,31.500)", f)
        self.assertIn("[t2]select=gte(t\\,31.500)", f)

    def test_og_1200x630(self):
        f = worker.monta_filtro([], 23.5, com_og=True)
        self.assertIn("crop=1200:630", f)
        self.assertIn("[v][t1][t2]", f)


class TestWorkerResolveMarcas(unittest.TestCase):
    """A REGRA da decisão 9, e a garantia que a motivou: nenhum desfecho
    produz clipe sem marca enquanto o PNG local existir."""

    def setUp(self):
        self.dir = tempfile.mkdtemp(prefix="wm-")
        self.padrao = os.path.join(self.dir, "watermark-replayja.png")
        self.assinatura = os.path.join(self.dir, "assinatura.png")
        for p in (self.padrao, self.assinatura):
            with open(p, "wb") as f:
                f.write(b"\x89PNG\r\n\x1a\n")
        self._antes = (worker.WM_DEFAULT, worker.WM_ASSINATURA, worker.WM_CACHE)
        worker.WM_DEFAULT = self.padrao
        worker.WM_ASSINATURA = self.assinatura
        worker.WM_CACHE = os.path.join(self.dir, "cache")

    def tearDown(self):
        worker.WM_DEFAULT, worker.WM_ASSINATURA, worker.WM_CACHE = self._antes

    def test_sem_parceiro_sai_a_do_replay_ja_a_14_por_cento(self):
        marcas, kind, versao = worker.resolve_marcas(
            {"kind": "default", "url": None, "version": 0,
             "position": "bottom-right", "opacityPct": 85, "widthPct": 14}
        )
        self.assertEqual(kind, "default")
        self.assertEqual(versao, 0)
        self.assertEqual(len(marcas), 1)
        self.assertEqual(marcas[0]["path"], self.padrao)
        self.assertAlmostEqual(marcas[0]["widthPct"], 14)
        self.assertAlmostEqual(marcas[0]["opacity"], 0.85)

    def test_job_sem_campo_watermark_ainda_leva_marca(self):
        # É o caso do relay velho contra a API nova, e vice-versa. Nenhum dos
        # dois pode produzir clipe cru.
        marcas, kind, versao = worker.resolve_marcas(None)
        self.assertEqual(kind, "default")
        self.assertEqual(len(marcas), 1)

    def test_com_parceiro_sai_a_dele_mais_a_assinatura_no_canto_oposto(self):
        wm = {"kind": "partner", "url": "https://s3/branding/p1/watermark.png",
              "version": 4, "position": "bottom-right", "opacityPct": 85,
              "widthPct": 18}
        with self.baixando(b"PNGdoparceiro"):
            marcas, kind, versao = worker.resolve_marcas(wm)
        self.assertEqual((kind, versao), ("partner", 4))
        self.assertEqual(len(marcas), 2)
        self.assertEqual(marcas[0]["position"], "bottom-right")
        self.assertAlmostEqual(marcas[0]["widthPct"], 18)
        # A assinatura é NOSSA: tamanho e opacidade não são configuráveis.
        self.assertEqual(marcas[1]["path"], self.assinatura)
        self.assertEqual(marcas[1]["position"], "bottom-left")
        self.assertAlmostEqual(marcas[1]["widthPct"], 10)
        self.assertAlmostEqual(marcas[1]["opacity"], 0.6)

    def test_assinatura_vai_para_o_canto_inferior_oposto_tambem_no_topo(self):
        wm = {"kind": "partner", "url": "https://s3/branding/p2/watermark.png",
              "version": 1, "position": "top-left"}
        with self.baixando(b"PNG"):
            marcas, _, _ = worker.resolve_marcas(wm)
        self.assertEqual(marcas[0]["position"], "top-left")
        self.assertEqual(marcas[1]["position"], "bottom-right")

    def test_falha_no_download_cai_no_padrao_e_avisa_no_kind(self):
        # A regra que vale mais que a decisão 9: uma URL expirada não pode
        # custar o lance do atleta.
        wm = {"kind": "partner", "url": "https://s3/branding/p3/watermark.png",
              "version": 7}
        with self.baixando(None, status=403):
            marcas, kind, versao = worker.resolve_marcas(wm)
        self.assertEqual(kind, "default-fallback")
        # Versão 0, não 7: o clipe saiu com a NOSSA marca, e dizer 7 faria o
        # "quais clipes reprocessar" mentir.
        self.assertEqual(versao, 0)
        self.assertEqual(marcas[0]["path"], self.padrao)
        self.assertAlmostEqual(marcas[0]["widthPct"], 14)

    def test_sha256_divergente_e_tratado_como_falha(self):
        wm = {"kind": "partner", "url": "https://s3/branding/p4/watermark.png",
              "version": 1, "sha256": "0" * 64}
        with self.baixando(b"bytes que nao batem"):
            marcas, kind, _ = worker.resolve_marcas(wm)
        self.assertEqual(kind, "default-fallback")
        self.assertEqual(marcas[0]["path"], self.padrao)

    def test_sem_png_local_o_worker_grita_em_vez_de_fingir(self):
        worker.WM_DEFAULT = os.path.join(self.dir, "nao-existe.png")
        marcas, kind, versao = worker.resolve_marcas({"kind": "default"})
        self.assertEqual(marcas, [])
        self.assertEqual(kind, "default")

    def test_aceita_o_dialeto_antigo_do_contrato(self):
        # `scale` (fração) e `opacity` (fração) são o que o `openapi.yaml` v1
        # declarava. Um relay novo contra uma API velha ainda tem de compor.
        wm = {"url": "https://s3/branding/p5/watermark.png", "version": 2,
              "scale": 0.2, "opacity": 0.7, "position": "bottom_left"}
        with self.baixando(b"PNG"):
            marcas, kind, _ = worker.resolve_marcas(wm)
        self.assertEqual(kind, "partner")
        self.assertAlmostEqual(marcas[0]["widthPct"], 20)
        self.assertAlmostEqual(marcas[0]["opacity"], 0.7)
        self.assertEqual(marcas[0]["position"], "bottom-left")

    def test_numero_ilegivel_vira_o_padrao_e_nunca_nan(self):
        wm = {"url": "https://s3/branding/p6/watermark.png", "version": 1,
              "widthPct": "abacaxi", "opacityPct": None}
        with self.baixando(b"PNG"):
            marcas, _, _ = worker.resolve_marcas(wm)
        self.assertAlmostEqual(marcas[0]["widthPct"], 18)
        self.assertAlmostEqual(marcas[0]["opacity"], 0.85)

    # ------------------------------------------------------------------ util
    class _Baixa:
        def __init__(self, conteudo, status):
            self.conteudo, self.status, self.chamadas = conteudo, status, 0

        def __call__(self, url, destino, timeout=None, headers=None):
            self.chamadas += 1
            if self.conteudo is None:
                return self.status, {}
            with open(destino, "wb") as f:
                f.write(self.conteudo)
            return self.status, {}

    def baixando(self, conteudo, status=200):
        """Troca o `baixa` do worker por um dublê, e devolve um contexto."""
        import contextlib

        falso = self._Baixa(conteudo, status)

        @contextlib.contextmanager
        def ctx():
            antes = worker.baixa
            worker.baixa = falso
            self.ultimo_download = falso
            try:
                yield falso
            finally:
                worker.baixa = antes

        return ctx()


class TestWorkerCacheDaMarca(unittest.TestCase):
    """O cache existe por UM motivo: a URL do `claim` é ASSINADA e muda a cada
    chamada. Cachear por URL rebaixaria o PNG a cada clipe — 200 idas à rede por
    dia no caminho crítico de cada lance, com 200 jeitos novos de falhar."""

    def setUp(self):
        self.dir = tempfile.mkdtemp(prefix="wmcache-")
        self._antes = worker.WM_CACHE
        worker.WM_CACHE = os.path.join(self.dir, "cache")

    def tearDown(self):
        worker.WM_CACHE = self._antes

    def test_a_assinatura_da_url_nao_entra_na_chave(self):
        a = worker._chave_de_cache(
            "https://s3.sa-east-1.amazonaws.com/branding/p1/watermark.png?X-Amz-Signature=aaa",
            3, None)
        b = worker._chave_de_cache(
            "https://s3.sa-east-1.amazonaws.com/branding/p1/watermark.png?X-Amz-Signature=bbb",
            3, None)
        self.assertEqual(a, b)

    def test_versao_nova_e_arquivo_novo(self):
        u = "https://s3/branding/p1/watermark.png?sig=x"
        self.assertNotEqual(worker._chave_de_cache(u, 3, None),
                            worker._chave_de_cache(u, 4, None))

    def test_parceiros_diferentes_nao_colidem_na_mesma_versao(self):
        # Sem o caminho do bucket na chave, o parceiro B v1 herdaria o PNG do
        # parceiro A v1 — e o clipe sairia com a marca da arena errada.
        self.assertNotEqual(
            worker._chave_de_cache("https://s3/branding/pA/watermark.png?s=1", 1, None),
            worker._chave_de_cache("https://s3/branding/pB/watermark.png?s=2", 1, None),
        )

    def test_sha256_manda_quando_vem(self):
        sha = "ab" * 32
        self.assertEqual(
            worker._chave_de_cache("https://s3/a.png?s=1", 1, sha),
            worker._chave_de_cache("https://s3/b.png?s=9", 7, sha),
        )

    def test_baixa_uma_vez_so_por_versao(self):
        chamadas = {"n": 0}

        def falso(url, destino, timeout=None, headers=None):
            chamadas["n"] += 1
            with open(destino, "wb") as f:
                f.write(b"PNG")
            return 200, {}

        antes, worker.baixa = worker.baixa, falso
        try:
            wm = {"url": "https://s3/branding/p1/watermark.png?sig=1", "version": 5}
            p1 = worker.baixa_marca(wm)
            # Segundo clipe do mesmo parceiro: URL reassinada, versão igual.
            wm2 = {"url": "https://s3/branding/p1/watermark.png?sig=2", "version": 5}
            p2 = worker.baixa_marca(wm2)
        finally:
            worker.baixa = antes
        self.assertEqual(p1, p2)
        self.assertEqual(chamadas["n"], 1)

    def test_download_vazio_nao_vira_arquivo_de_cache(self):
        # Um PNG de 0 byte cacheado envenenaria TODOS os clipes daquela versão.
        def falso(url, destino, timeout=None, headers=None):
            open(destino, "wb").close()
            return 200, {}

        antes, worker.baixa = worker.baixa, falso
        try:
            self.assertIsNone(
                worker.baixa_marca({"url": "https://s3/branding/px/watermark.png", "version": 1})
            )
        finally:
            worker.baixa = antes


class TestWorkerIdempotencia(unittest.TestCase):
    def setUp(self):
        self.arq = os.path.join(tempfile.mkdtemp(), "done.json")
        worker.DONE_FILE = self.arq

    def test_grava_e_recarrega(self):
        worker.salva_feitos({"job-1": {"at": 1.0, "clipId": "c1"}})
        feitos = worker.carrega_feitos()
        self.assertIn("job-1", feitos)

    def test_arquivo_ausente_nao_derruba(self):
        worker.DONE_FILE = "/caminho/que/nao/existe/x.json"
        self.assertEqual(worker.carrega_feitos(), {})

    def test_arquivo_corrompido_nao_derruba(self):
        with open(self.arq, "w") as f:
            f.write("{ isto nao e json")
        self.assertEqual(worker.carrega_feitos(), {})

    def test_lista_nao_cresce_sem_limite(self):
        # A lista existe para cobrir um lease vencido (120 s) e um restart,
        # não para virar histórico.
        muitos = {f"job-{i}": {"at": float(i)} for i in range(900)}
        podados = worker.salva_feitos(muitos)
        self.assertEqual(len(podados), 500)
        # E o que sobra são os MAIS RECENTES.
        self.assertIn("job-899", podados)
        self.assertNotIn("job-0", podados)


class TestWorkerClaim(unittest.TestCase):
    """O claim é uma chamada HTTP; o que dá para provar sem rede é a FORMA dela
    — método, caminho e o `max` —, que é justamente o que a divergência entre
    o briefing e o `openapi.yaml` coloca em risco."""

    def setUp(self):
        self.chamadas = []
        self._api = worker.api
        worker.api = lambda m, c, corpo=None, **kw: (
            self.chamadas.append((m, c, corpo)) or (200, {"jobs": [], "leaseSeconds": 120})
        )

    def tearDown(self):
        worker.api = self._api

    def test_padrao_segue_o_openapi(self):
        worker.CLAIM_METHOD, worker.CLAIM_PATH = "GET", "/relay/clip-jobs"
        worker.reivindica()
        m, c, corpo = self.chamadas[-1]
        self.assertEqual(m, "GET")
        self.assertTrue(c.startswith("/relay/clip-jobs?max="))
        self.assertIsNone(corpo)

    def test_modo_post_claim_do_briefing(self):
        worker.CLAIM_METHOD, worker.CLAIM_PATH = "POST", "/relay/clip-jobs/claim"
        worker.reivindica()
        m, c, corpo = self.chamadas[-1]
        self.assertEqual((m, c), ("POST", "/relay/clip-jobs/claim"))
        self.assertEqual(corpo["max"], worker.CLAIM_MAX)
        self.assertEqual(corpo["relayId"], worker.RELAY_ID)

    def test_resposta_ruim_vira_lista_vazia_nao_excecao(self):
        worker.api = lambda *a, **k: (500, None)
        self.assertEqual(worker.reivindica(), [])
        worker.api = lambda *a, **k: (0, {"_erro": "rede"})
        self.assertEqual(worker.reivindica(), [])
        worker.api = lambda *a, **k: (200, {"jobs": None})
        self.assertEqual(worker.reivindica(), [])


class TestWorkerCoberturaFalhaFechada(unittest.TestCase):
    def test_sem_saber_a_cobertura_devolve_zero(self):
        # Sem saber, dizer 1 entregaria um buraco como íntegro. Dizer 0 recusa
        # o clipe e o job volta pela fila — é o único desfecho que não mente ao
        # atleta.
        self.assertEqual(worker.cobertura_entregue("naoexiste", 0, 1000), 0.0)


# ---------------------------------------------------------------------------
# Sidecar de autenticação
# ---------------------------------------------------------------------------
class TestAuth(unittest.TestCase):
    def token(self, cam, exp):
        return f"{exp}.{auth.sign(f'{cam}.{exp}')}"

    def test_token_valido(self):
        import time
        exp = int(time.time()) + 3600
        self.assertTrue(auth.token_ok("quadra1", self.token("quadra1", exp)))

    def test_token_expirado(self):
        self.assertFalse(auth.token_ok("quadra1", self.token("quadra1", 1)))

    def test_token_de_outra_camera_nao_serve(self):
        # O escopo do token é UMA câmera. Se isto vazar, um token de uma quadra
        # abre todas as outras — e a autorização de verdade mora na API.
        import time
        exp = int(time.time()) + 3600
        self.assertFalse(auth.token_ok("quadra2", self.token("quadra1", exp)))

    def test_token_malformado(self):
        for t in ("", "semponto", "abc.def", ".", "9999999999."):
            self.assertFalse(auth.token_ok("quadra1", t))

    def test_prefixos_de_leitura(self):
        # `clip` e `thumb` precisam estar aqui: no Sentinela os dois foram ao
        # ar com o rec-server servindo perfeitamente e o Caddy devolvendo 401.
        for p in ("live", "vod", "rec", "clip", "thumb"):
            self.assertIn(p, auth.READ_PREFIXES)


# ---------------------------------------------------------------------------
# Formato do id de câmera — vira caminho de disco e de URL
# ---------------------------------------------------------------------------
class TestIdDeCamera(unittest.TestCase):
    def test_aceita_o_formato_do_contrato(self):
        self.assertTrue(rec.CAM_VALIDA.match("rjq1a7f3c92b"))
        self.assertTrue(worker.CAM_VALIDA.match("rjq1a7f3c92b"))

    def test_recusa_travessia_de_caminho_e_maiuscula(self):
        for mau in ("../etc", "a/b", "..", "QUADRA1", "ab", "x" * 40, ""):
            self.assertFalse(rec.CAM_VALIDA.match(mau), mau)
            self.assertFalse(worker.CAM_VALIDA.match(mau), mau)


if __name__ == "__main__":
    unittest.main(verbosity=2)
