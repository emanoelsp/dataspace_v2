#!/usr/bin/env node
/**
 * Agente CPS de exemplo — demonstra o fluxo M2M ponta a ponta para a
 * arquitetura de controle do Marcos: register → discover → negotiate → consume.
 *
 * Uso:
 *   node m2m-agent.mjs \
 *     --dataspace http://localhost:3000 \
 *     --name "CNC Machining Center" --slug cnc \
 *     --base http://192.168.0.70:3001 --sidecar http://192.168.0.70:3100 \
 *     --org plant1 --federation "plant1 — Forming" \
 *     --want-capability temperature \
 *     --key <M2M_API_KEY>   # se o deploy estiver protegido (ou env M2M_API_KEY)
 *
 * Sem --want-capability, apenas se registra (plug). Com, também descobre,
 * negocia e faz 3 leituras do alvo (play).
 */

const args = process.argv.slice(2)
const arg = (f, d) => { const i = args.indexOf(f); return i >= 0 && args[i + 1] ? args[i + 1] : d }

const DATASPACE = arg("--dataspace", "http://localhost:3000").replace(/\/+$/, "")
const NAME = arg("--name", "CPS Agent")
const SLUG = arg("--slug", "")
const BASE = arg("--base", "")
const SIDECAR = arg("--sidecar", "")
const ORG = arg("--org", "plant1")
const FEDERATION = arg("--federation", "")
const WANT = arg("--want-capability", "")
const KEY = arg("--key", process.env.M2M_API_KEY || "") // header X-M2M-Key p/ deploy protegido

if (!BASE || !SIDECAR) { console.error("Obrigatório: --base <url do CPS> --sidecar <url do PEP>"); process.exit(1) }

const post = async (path, body) => {
  const headers = { "Content-Type": "application/json", ...(KEY ? { "X-M2M-Key": KEY } : {}) }
  const r = await fetch(`${DATASPACE}${path}`, { method: "POST", headers, body: JSON.stringify(body) })
  return { ok: r.ok, status: r.status, json: await r.json().catch(() => ({})) }
}
const get = async (url, headers = {}) => {
  const r = await fetch(url, { headers })
  return { ok: r.ok, status: r.status, json: await r.json().catch(() => ({})), headers: r.headers }
}

console.log(`\n[agent] ${NAME} → Dataspace ${DATASPACE}`)

// 1. PLUG — auto-registro
const federation = FEDERATION ? { joinByName: FEDERATION } : { create: { name: `${ORG} — ${SLUG || "cps"}`, type: "Open" } }
let reg = await post("/api/m2m/register", {
  name: NAME, baseUrl: BASE, sidecarEndpoint: SIDECAR, organization: ORG,
  ...(SLUG ? { equipmentSlug: SLUG } : {}), federation,
  governance: { accessTokenTtlMinutes: 30, requiresManualApproval: false },
})
// se a federação por nome não existe, cria
if (!reg.ok && FEDERATION) {
  console.log(`[plug] federação "${FEDERATION}" não existe — criando`)
  reg = await post("/api/m2m/register", {
    name: NAME, baseUrl: BASE, sidecarEndpoint: SIDECAR, organization: ORG,
    ...(SLUG ? { equipmentSlug: SLUG } : {}), federation: { create: { name: FEDERATION, type: "Open" } },
    governance: { accessTokenTtlMinutes: 30, requiresManualApproval: false },
  })
}
if (!reg.ok) { console.error("[plug] falhou:", reg.status, reg.json); process.exit(1) }
console.log(`[plug] registrado: participant=${reg.json.participantId}`)
console.log(`       asset=${reg.json.assetId} federação=${reg.json.federation?.name} caps=${reg.json.capabilities?.length ?? 0}`)

if (!WANT) { console.log("\n[agent] sem --want-capability; só plug. Fim."); process.exit(0) }

// 2. PLAY — descobre alvo por capacidade
const disc = await get(`${DATASPACE}/api/m2m/discover?capability=${encodeURIComponent(WANT)}&exclude=${encodeURIComponent(SLUG || "")}`)
const target = disc.json.results?.[0]
if (!target) { console.error(`[play] nenhum CPS com capacidade "${WANT}"`); process.exit(1) }
console.log(`\n[play] alvo: ${target.name} (${target.equipmentSlug}) federação=${target.federation?.admissionMode}`)

// 3. negocia
const neg = await post("/api/m2m/negotiate", {
  consumerParticipantId: reg.json.participantId, consumerName: NAME,
  targetAssetId: target.assetId, purpose: `coordenação de produção (${WANT})`,
})
if (neg.json.status === "pending") { console.log(`[play] pendente de aprovação (requestId=${neg.json.requestId})`); process.exit(0) }
if (neg.json.status !== "granted") { console.error("[play] negociação falhou:", neg.status, neg.json); process.exit(1) }
console.log(`[play] token concedido (expira ${neg.json.expiresAt})`)

// 4. consome via PEP
for (let i = 1; i <= 3; i++) {
  const d = await get(neg.json.dataUrl, { Authorization: `Bearer ${neg.json.token}` })
  const wantVal = Object.entries(d.json.metrics ?? {}).find(([k]) => k.toLowerCase().includes(WANT.toLowerCase()))
  console.log(`[play] leitura ${i}: state=${d.json.state} ${wantVal ? `${wantVal[0]}=${wantVal[1]}` : ""} (${d.headers.get("X-Response-Time-Ms")}ms via PEP, contrato ${d.headers.get("X-Contract-Ref")})`)
  await new Promise(r => setTimeout(r, 1000))
}
console.log("\n[agent] concluído. (unplug fica a cargo da arquitetura de controle.)")
