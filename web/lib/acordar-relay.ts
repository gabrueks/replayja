// `POST /jobs` no relay — a ÚNICA chamada nuvem → relay que existe.
//
// ─── O QUE ELA É, E O QUE ELA NÃO É ────────────────────────────────────────
//
// Ela apenas ACORDA. O relay não confia no corpo: usa só como aviso e vai buscar
// a verdade em `GET /api/relay/clip-jobs/claim`. Se esta chamada falhar (relay
// reiniciando, rede, deploy), NADA SE PERDE — o ciclo de 2 s do relay pega o job.
// Ela existe só para tirar até 2 s da latência percebida.
//
// Por isso é fire-and-forget com timeout curto e erro engolido: fazer o
// `POST /api/triggers` esperar (ou falhar) por causa dela inverteria a relação —
// o app passaria a depender do relay para responder ao atleta, que é exatamente o
// acoplamento que este desenho evita.

const TIMEOUT_MS = 1500;

export async function acordarRelay(
  baseUrl: string,
  corpo: { jobId?: string; cameraId?: string },
): Promise<void> {
  const token = process.env.RELAY_TOKEN;
  if (!token) {
    // Sem token não dá para chamar — e isso é aceitável: o ciclo de 2 s cobre.
    console.warn("[relay] RELAY_TOKEN ausente — relay não foi acordado.");
    return;
  }
  try {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), TIMEOUT_MS);
    await fetch(`${baseUrl.replace(/\/$/, "")}/jobs`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(corpo),
      signal: ac.signal,
    }).finally(() => clearTimeout(t));
  } catch (err) {
    console.warn("[relay] falha ao acordar (inofensivo, o ciclo de 2 s pega):", err);
  }
}
