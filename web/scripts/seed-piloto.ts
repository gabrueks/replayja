// Seed do PILOTO — a Arena Vasco, do jeito que o fundador vai encontrar.
//
// Uso:
//   pnpm seed:piloto --env=.env.piloto
//   pnpm seed:piloto --emails=a@x.com,b@x.com --relay-key-hash=<sha256 em hex>
//   pnpm seed:piloto --rotacionar-chaves   (gera NOVA chave RTMP por câmera)
//   pnpm seed:piloto --rotacionar-tokens   (gera NOVO token por botão)
//
// ─── POR QUE HÁ ARGUMENTOS QUE DUPLICAM VARIÁVEIS DE AMBIENTE ──────────────
//
// `vercel env pull` NÃO devolve o valor das variáveis marcadas como "Sensitive"
// na Vercel: ele grava a string literal `[SENSITIVE]`. Rodar o seed contra
// produção com esse arquivo gravaria `[SENSITIVE]` como hash de chave de relay,
// e o sintoma seria o relay tomando 401 sem ninguém entender por quê. Por isso
// os valores críticos podem vir por argumento, e todo valor suspeito é validado
// antes de virar linha no banco.
//
// ─── É IDEMPOTENTE, E ISSO NÃO É DETALHE ───────────────────────────────────
//
// Este script roda contra PRODUÇÃO, e vai rodar mais de uma vez: no dia da
// instalação, quando alguém renomear uma quadra, quando o segundo e-mail de
// operação entrar. Rodar de novo não pode apagar o que já existe nem — pior —
// trocar a chave RTMP de uma câmera JÁ CONFIGURADA no equipamento da quadra.
// Mudar aquela chave significa uma visita à arena com escada.
//
// Por isso:
//
//   • tudo entra por `INSERT ... ON CONFLICT DO UPDATE`, na chave natural
//     (slug da arena, `partner_id + slug` da quadra, `id` da câmera);
//   • a CHAVE RTMP é preservada quando já existe. Ela fica em claro no banco
//     (é um segredo fraco por natureza — RTMP é texto claro), então o resumo
//     consegue reimprimi-la sempre;
//   • o TOKEN DO BOTÃO só existe como SHA-256 no banco e é impossível
//     reimprimir. A regra: um botão que NUNCA deu sinal (`last_signal_at` e
//     `last_pressed_at` nulos) tem o token rotacionado — não há nada no mundo
//     configurado com ele —, e um botão que já deu sinal é preservado, a menos
//     que `--rotacionar-tokens` diga o contrário.
//
// ─── O QUE ESTE SCRIPT NÃO FAZ ─────────────────────────────────────────────
//
// Não cria bucket, não configura CloudFront e não instala relay. Ele escreve as
// LINHAS que fazem o app e o relay se encontrarem: o `relay_node` com o hash da
// `RELAY_KEY`, as câmeras com porta e chave RTMP, os botões com token, e os dois
// e-mails de operação como admins da arena.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { sslDe } from "../lib/db";

const RAIZ = path.dirname(fileURLToPath(new URL("../package.json", import.meta.url)));

// ─────────────────────────────────────────────── o que é semeado

const ARENA = {
  slug: "arena-vasco",
  displayName: "Arena Vasco",
  // Placeholders: o contrato ainda não foi assinado e inventar CNPJ ou endereço
  // seria pior que deixar explícito que falta preencher.
  legalName: "Arena Vasco (razão social a confirmar)",
  cidade: "São Paulo",
  uf: "SP",
  timezone: "America/Sao_Paulo",
  tagline: "Piloto do Replay já · 2 quadras com câmera",
  contatoEmail: "contato@replayja.com.br",
} as const;

const QUADRAS = [
  { slug: "quadra-1", nome: "Quadra 1", porta: 19350, cameraId: "arenavascoq1" },
  { slug: "quadra-2", nome: "Quadra 2", porta: 19351, cameraId: "arenavascoq2" },
] as const;

/** Horário de operação da quadra — define a janela de gravação do relay. */
const ABRE = "06:00";
const FECHA = "23:59";

// ─────────────────────────────────────────────────────────── util

type Args = {
  envFile: string | null;
  emails: string | null;
  relayNode: string | null;
  relayKeyHash: string | null;
  rotacionarChaves: boolean;
  rotacionarTokens: boolean;
};

function lerArgs(argv: string[]): Args {
  const arg = (nome: string) =>
    argv.find((a) => a.startsWith(`--${nome}=`))?.split("=").slice(1).join("=") ?? null;
  return {
    envFile: arg("env"),
    emails: arg("emails"),
    relayNode: arg("relay-node"),
    relayKeyHash: arg("relay-key-hash"),
    rotacionarChaves: argv.includes("--rotacionar-chaves"),
    rotacionarTokens: argv.includes("--rotacionar-tokens"),
  };
}

/** Um valor que o `vercel env pull` não conseguiu ler não pode virar linha. */
function utilizavel(v: string | null | undefined): string | null {
  const t = v?.trim();
  if (!t || t.startsWith("[SENSITIVE")) return null;
  return t;
}

const EH_SHA256 = (v: string) => /^[0-9a-f]{64}$/i.test(v);

/**
 * Carrega o `.env` escolhido. Não sobrescreve o que já está no ambiente: quem
 * exporta `DATABASE_URL` na mão está dizendo contra qual banco quer rodar, e um
 * arquivo esquecido no disco não pode vencer essa decisão.
 */
function carregarEnv(preferido: string | null): string | null {
  const candidatos = preferido
    ? [preferido]
    : [".env.local", ".env.production.local", ".env"];
  for (const nome of candidatos) {
    const caminho = path.isAbsolute(nome) ? nome : path.join(RAIZ, nome);
    if (!fs.existsSync(caminho)) continue;
    for (const linha of fs.readFileSync(caminho, "utf8").split("\n")) {
      const t = linha.trim();
      if (!t || t.startsWith("#")) continue;
      const eq = t.indexOf("=");
      if (eq === -1) continue;
      const chave = t.slice(0, eq).trim();
      if (process.env[chave] !== undefined) continue;
      process.env[chave] = t
        .slice(eq + 1)
        .trim()
        .replace(/^(["'])(.*)\1$/, "$2");
    }
    if (process.env.DATABASE_URL) return caminho;
  }
  return null;
}

const sha256 = (v: string) => crypto.createHash("sha256").update(v).digest("hex");

/** Chave RTMP: minúsculas e dígitos. É digitada à mão no app da câmera. */
const novaChaveRtmp = () => crypto.randomBytes(12).toString("hex");

/** Token do botão: vai na URL do webhook, então `base64url` sem padding. */
const novoTokenDeBotao = () => crypto.randomBytes(18).toString("base64url");

// ────────────────────────────────────────────────────────── seed

type Resumo = {
  relay: { id: string; rtmpHost: string; baseUrl: string; status: string };
  quadras: Array<{
    nome: string;
    slug: string;
    cameraId: string;
    porta: number;
    chaveRtmp: string;
    botaoToken: string | null;
    botaoLast4: string;
  }>;
  admins: string[];
};

async function semear(c: pg.Client, args: Args): Promise<Resumo> {
  const relayId = args.relayNode ?? utilizavel(process.env.RELAY_NODE_ID) ?? "relay-1";
  const rtmpHost = utilizavel(process.env.RELAY_RTMP_HOST) ?? "15.229.94.105";
  const baseUrl = utilizavel(process.env.RELAY_BASE_URL) ?? "https://relay-1.replayja.com.br";

  // O hash da chave do relay, nesta ordem: argumento, `RELAY_KEY_HASH`, sha256
  // de `RELAY_KEY`. Nada disso é obrigatório — o porquê está no INSERT abaixo.
  const brutoDoHash = args.relayKeyHash ?? utilizavel(process.env.RELAY_KEY_HASH);
  const chaveCrua = utilizavel(process.env.RELAY_KEY);
  const relayKeyHash =
    brutoDoHash && EH_SHA256(brutoDoHash)
      ? brutoDoHash.toLowerCase()
      : chaveCrua
        ? sha256(chaveCrua)
        : null;

  const emails = (args.emails ?? utilizavel(process.env.OTP_BYPASS_EMAILS) ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter((e) => e.includes("@"));
  if (emails.length === 0) {
    throw new Error(
      "Sem e-mails de operação. Passe --emails=a@x.com,b@x.com ou defina OTP_BYPASS_EMAILS. " +
        "São as contas que entram no app durante o piloto e que viram admins da arena — " +
        "sem elas o painel nasce sem dono.",
    );
  }

  await c.query("BEGIN");

  // ── relay ────────────────────────────────────────────────────
  //
  // `status = 'active'` e não `provisioning`: o gatilho recusa o lance quando o
  // relay não está ativo (`db/queries/gatilho.ts`, recusa 4), então deixá-lo em
  // `provisioning` faria TODO aperto de botão voltar "problema técnico" — com o
  // relay gravando perfeitamente do outro lado.
  //
  // ─── O HASH DA CHAVE É OPCIONAL, E ISSO É SEGURO ─────────────────────────
  //
  // `lib/relay-auth.ts` tem DOIS caminhos: a linha de `relay_node` cujo
  // `key_hash` bate e, quando nenhuma bate, o bootstrap por `RELAY_KEY` /
  // `RELAY_KEY_HASH` na env — que devolve `RELAY_NODE_ID` como id do relay.
  // Como este seed usa exatamente esse id, um hash desconhecido NÃO quebra a
  // autenticação: o relay entra pelo bootstrap e cai nesta mesma linha.
  //
  // O que não pode acontecer é gravar um hash INVENTADO por cima de um correto.
  // Daí o `COALESCE`: sem hash utilizável, o que já existe é preservado.
  const hashProvisorio = `seed-sem-hash-${relayId}`;
  await c.query(
    `INSERT INTO relay_node (id, base_url, rtmp_host, region, key_hash, status,
                             port_range_start, port_range_end, port_range_next, max_cameras, notes)
     VALUES ($1, $2, $3, 'sa-east-1', COALESCE($4, $6), 'active', 19350, 19449, 19352, 24, $5)
     ON CONFLICT (id) DO UPDATE SET
       base_url  = EXCLUDED.base_url,
       rtmp_host = EXCLUDED.rtmp_host,
       key_hash  = COALESCE($4, relay_node.key_hash),
       -- port_range_next e MONOTONICO: nunca volta, mesmo que o seed rode de
       -- novo. Reaproveitar porta de câmera removida faz vídeo aparecer na
       -- quadra errada (ver a migracao 0004).
       port_range_next = GREATEST(relay_node.port_range_next, EXCLUDED.port_range_next),
       status    = CASE WHEN relay_node.status = 'retired' THEN relay_node.status
                        ELSE 'active'::relay_status END`,
    [
      relayId,
      baseUrl,
      rtmpHost,
      relayKeyHash,
      "Piloto Arena Vasco — semeado por seed-piloto.ts",
      hashProvisorio,
    ],
  );

  if (!relayKeyHash) {
    console.warn(
      `[seed] AVISO: nenhum hash de chave de relay utilizavel. A linha de '${relayId}' ficou ` +
        "sem hash proprio, e o relay vai autenticar pelo BOOTSTRAP por env " +
        "(lib/relay-auth.ts). Funciona, mas o caminho normal e a linha: rode de novo com " +
        "--relay-key-hash=<sha256 da RELAY_KEY em hex> quando tiver o valor.",
    );
  }

  // ── arena ────────────────────────────────────────────────────
  const arena = (
    await c.query<{ id: string }>(
      `INSERT INTO partner (slug, legal_name, display_name, timezone, city, state,
                            status, public_page_enabled, watermark_enabled, activated_at)
       VALUES ($1,$2,$3,$4,$5,$6,'active',true,true,now())
       ON CONFLICT (slug) DO UPDATE SET
         display_name = EXCLUDED.display_name,
         timezone     = EXCLUDED.timezone,
         city         = COALESCE(partner.city, EXCLUDED.city),
         state        = COALESCE(partner.state, EXCLUDED.state),
         status       = 'active',
         deleted_at   = NULL
       RETURNING id`,
      [
        ARENA.slug,
        ARENA.legalName,
        ARENA.displayName,
        ARENA.timezone,
        ARENA.cidade,
        ARENA.uf,
      ],
    )
  ).rows[0]!;

  await c.query(
    `INSERT INTO partner_branding (partner_id, tagline)
     VALUES ($1, $2)
     ON CONFLICT (partner_id) DO UPDATE SET tagline = COALESCE(partner_branding.tagline, EXCLUDED.tagline)`,
    [arena.id, ARENA.tagline],
  );

  // Contato placeholder: `partner_contact` tem CHECK de E.164 para telefone, e
  // inventar um número de WhatsApp que não atende seria pior que não ter — um
  // e-mail nosso, sim, é atendido.
  await c.query(
    `INSERT INTO partner_contact (partner_id, kind, label, value, is_primary, display_order)
     VALUES ($1, 'email', 'Contato do piloto', $2, true, 0)
     ON CONFLICT (partner_id, kind) WHERE is_primary DO UPDATE SET value = EXCLUDED.value`,
    [arena.id, ARENA.contatoEmail],
  );

  const quadras: Resumo["quadras"] = [];

  for (const [i, q] of QUADRAS.entries()) {
    const court = (
      await c.query<{ id: string }>(
        `INSERT INTO court (partner_id, slug, name, sport, display_order, active,
                            opens_time, closes_time)
         VALUES ($1,$2,$3,'society',$4,true,$5::time,$6::time)
         ON CONFLICT (partner_id, slug) DO UPDATE SET
           name        = EXCLUDED.name,
           active      = true,
           opens_time  = EXCLUDED.opens_time,
           closes_time = EXCLUDED.closes_time,
           deleted_at  = NULL
         RETURNING id`,
        [arena.id, q.slug, q.nome, i, ABRE, FECHA],
      )
    ).rows[0]!;

    // ── câmera ─────────────────────────────────────────────────
    //
    // A chave RTMP fica DIGITADA DENTRO DA CÂMERA na quadra. Preservá-la é o que
    // permite rodar este seed de novo sem mandar alguém de volta à arena.
    const camera = (
      await c.query<{ rtmp_key: string; rtmp_port: number }>(
        `INSERT INTO camera (id, partner_id, court_id, relay_node_id, name,
                             ingest_kind, rtmp_port, rtmp_key,
                             width, height, fps, target_bitrate_kbps,
                             origin_lag_ms, retention_days, prune_after_hours,
                             min_coverage_ratio, status, enabled)
         VALUES ($1,$2,$3,$4,$5,'rtmp_push',$6,$7,1920,1080,30,3000,3000,7,6,0.60,'provisioned',true)
         ON CONFLICT (id) DO UPDATE SET
           partner_id    = EXCLUDED.partner_id,
           court_id      = EXCLUDED.court_id,
           relay_node_id = EXCLUDED.relay_node_id,
           name          = EXCLUDED.name,
           ingest_kind   = 'rtmp_push',
           rtmp_port     = EXCLUDED.rtmp_port,
           rtmp_key      = CASE WHEN $8::boolean THEN EXCLUDED.rtmp_key ELSE camera.rtmp_key END,
           enabled       = true,
           deleted_at    = NULL
         RETURNING rtmp_key, rtmp_port`,
        [
          q.cameraId,
          arena.id,
          court.id,
          relayId,
          `Câmera ${q.nome}`,
          q.porta,
          novaChaveRtmp(),
          args.rotacionarChaves,
        ],
      )
    ).rows[0]!;

    // ── botão físico ───────────────────────────────────────────
    const existente = (
      await c.query<{ id: string; token_last4: string; virgem: boolean }>(
        `SELECT id, token_last4,
                (last_signal_at IS NULL AND last_pressed_at IS NULL) AS virgem
           FROM button WHERE court_id = $1 ORDER BY created_at LIMIT 1`,
        [court.id],
      )
    ).rows[0];

    const rotacionar = !existente || existente.virgem || args.rotacionarTokens;
    let token: string | null = null;
    let last4 = existente?.token_last4 ?? "----";

    if (rotacionar) {
      token = novoTokenDeBotao();
      last4 = token.slice(-4);
      if (existente) {
        await c.query(
          `UPDATE button SET token_hash = $2, token_last4 = $3, active = true, label = $4
            WHERE id = $1`,
          [existente.id, sha256(token), last4, `Botão ${q.nome}`],
        );
      } else {
        await c.query(
          `INSERT INTO button (partner_id, court_id, token_hash, token_last4, label, kind,
                               model, active, wake_latency_ms)
           VALUES ($1,$2,$3,$4,$5,'wifi_webhook',$6,true,1500)`,
          [
            arena.id,
            court.id,
            sha256(token),
            last4,
            `Botão ${q.nome}`,
            "a definir (piloto)",
          ],
        );
      }
    }

    quadras.push({
      nome: q.nome,
      slug: q.slug,
      cameraId: q.cameraId,
      porta: camera.rtmp_port ?? q.porta,
      chaveRtmp: camera.rtmp_key ?? "(sem chave)",
      botaoToken: token,
      botaoLast4: last4,
    });
  }

  // ── usuários de operação, como OWNERS da arena ───────────────
  //
  // `owner` e não `viewer`: o piloto é operado por estas duas contas, e um
  // `viewer` não consegue nem convidar o dono da arena depois. O gatilho
  // `partner_admin_exige_owner` também exige pelo menos um owner ativo.
  for (const email of emails) {
    const usuario = (
      await c.query<{ id: string }>(
        `INSERT INTO app_user (email, email_verified_at, display_name, primary_provider,
                               first_partner_id)
         VALUES ($1, now(), $2, 'email_otp', $3)
         ON CONFLICT (email) DO UPDATE SET
           email_verified_at = COALESCE(app_user.email_verified_at, now()),
           first_partner_id  = COALESCE(app_user.first_partner_id, EXCLUDED.first_partner_id),
           deleted_at        = NULL
         RETURNING id`,
        [email, `Operação ${ARENA.displayName}`, arena.id],
      )
    ).rows[0]!;

    await c.query(
      `INSERT INTO partner_admin (partner_id, user_id, invited_email, role, status, accepted_at)
       VALUES ($1,$2,$3,'owner','active',now())
       ON CONFLICT (partner_id, invited_email) DO UPDATE SET
         user_id     = EXCLUDED.user_id,
         role        = 'owner',
         status      = 'active',
         accepted_at = COALESCE(partner_admin.accepted_at, now())`,
      [arena.id, usuario.id, email],
    );
  }

  await c.query("COMMIT");

  return {
    relay: { id: relayId, rtmpHost, baseUrl, status: "active" },
    quadras,
    admins: emails,
  };
}

// ────────────────────────────────────────────────────── resumo

function imprimir(r: Resumo): void {
  const site = process.env.NEXT_PUBLIC_SITE_URL?.trim() || "https://replayja.vercel.app";
  const linha = "─".repeat(72);

  const p: string[] = [];
  p.push("");
  p.push(linha);
  p.push(`  SEED DO PILOTO — ${ARENA.displayName} (${ARENA.slug})`);
  p.push(linha);
  p.push("");
  p.push("  RELAY");
  p.push(`    id .............. ${r.relay.id}  (status: ${r.relay.status})`);
  p.push(`    base_url ........ ${r.relay.baseUrl}`);
  p.push(`    host RTMP ....... ${r.relay.rtmpHost}`);
  p.push("");
  p.push("  CÂMERAS — é ISTO que se digita no app da câmera IP:");
  for (const q of r.quadras) {
    p.push("");
    p.push(`    ${q.nome}  (${q.slug} · camera ${q.cameraId})`);
    p.push(`      Servidor (URL) .. rtmp://${r.relay.rtmpHost}:${q.porta}/live`);
    p.push(`      Chave (stream) .. ${q.chaveRtmp}`);
  }
  p.push("");
  p.push("  BOTÕES FÍSICOS — a URL de webhook a configurar no dispositivo:");
  for (const q of r.quadras) {
    p.push("");
    p.push(`    ${q.nome}`);
    if (q.botaoToken) {
      p.push(`      ${site}/api/triggers/b/${q.botaoToken}`);
      p.push(`      (token termina em ${q.botaoLast4} — ANOTE AGORA, só aparece uma vez)`);
    } else {
      p.push(`      token preservado, termina em ${q.botaoLast4}`);
      p.push(`      (o botão já deu sinal; use --rotacionar-tokens para gerar outro)`);
    }
  }
  p.push("");
  p.push("  CONTAS DE OPERAÇÃO (login com o código de OTP_TEST_CODE):");
  for (const e of r.admins) p.push(`    ${e}  · owner da arena`);
  p.push("");
  p.push("  URLs DO E2E");
  p.push(`    entrar .......... ${site}/entrar`);
  p.push(`    página da arena . ${site}/${ARENA.slug}`);
  p.push(`    buscar .......... ${site}/app/buscar?arena=${ARENA.slug}`);
  for (const q of r.quadras) {
    p.push(`    botão virtual ... ${site}/app/botao?arena=${ARENA.slug}&quadra=${q.slug}`);
  }
  p.push(`    painel .......... ${site}/painel?arena=${ARENA.slug}`);
  p.push(`    câmeras ......... ${site}/painel/cameras?arena=${ARENA.slug}`);
  p.push(`    diagnóstico ..... ${site}/api/health`);
  p.push("");
  p.push(linha);
  p.push("");
  console.log(p.join("\n"));
}

// ──────────────────────────────────────────────────────── main

async function main(): Promise<void> {
  const args = lerArgs(process.argv.slice(2));
  const arquivo = carregarEnv(args.envFile);

  if (!process.env.DATABASE_URL) {
    console.error(
      "DATABASE_URL não configurada. Puxe as variáveis de produção antes:\n" +
        "  vercel env pull .env.production.local --environment=production\n" +
        "  pnpm seed:piloto --env=.env.production.local",
    );
    process.exit(1);
  }

  const alvo = new URL(process.env.DATABASE_URL).host;
  console.log(`[seed] env: ${arquivo ?? "(ambiente)"}`);
  console.log(`[seed] banco: ${alvo}`);

  const c = new pg.Client({
    connectionString: process.env.DATABASE_URL,
    ...sslDe(process.env.DATABASE_URL),
  });
  await c.connect();
  try {
    const resumo = await semear(c, args);
    imprimir(resumo);
  } catch (err) {
    await c.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    await c.end();
  }
}

main().catch((err) => {
  console.error("[seed] falhou:", err);
  process.exit(1);
});
