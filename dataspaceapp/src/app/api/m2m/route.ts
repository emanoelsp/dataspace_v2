/**
 * GET /api/m2m — saúde e índice auto-documentado da API M2M.
 *
 * Ponto de entrada para a arquitetura de controle (Marcos): mostra se o
 * Dataspace está saudável (Firestore + Sidecar), estatísticas do catálogo e a
 * descrição de todos os endpoints M2M (método, params, exemplo).
 *
 * Query: ?sidecar=<url>  verifica também a saúde de um Sidecar PEP específico.
 */

import { NextRequest, NextResponse } from "next/server"
import { getDb } from "@/lib/m2m"

export const runtime = "nodejs"

const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, OPTIONS", "Access-Control-Allow-Headers": "Content-Type" }

const INTERFACES = [
  {
    name: "health & index",
    method: "GET", path: "/api/m2m",
    description: "Saúde do Dataspace + este índice de interfaces.",
    query: { sidecar: "(opcional) URL de um Sidecar PEP para checar" },
  },
  {
    name: "self-register",
    method: "POST", path: "/api/m2m/register",
    description: "CPS se auto-registra: conector + federação (cria/entra) + compliance + asset (com capacidades colhidas e recursos) + governança + oferta de contrato + registro no Sidecar. Idempotente por organization+slug. Header X-Sidecar-Secret: no primeiro register de uma organização nova define o segredo do Sidecar (ou o Dataspace gera e devolve uma vez em sidecarSecret); depois é obrigatório. Organização com CPS anteriores ao segredo: o admin define em /api/m2m/organization.",
    headers: { "X-M2M-Key": "<M2M_API_KEY>", "X-Sidecar-Secret": "<segredo do Sidecar da organização>" },
    body: {
      name: "Heat Treatment Furnace", baseUrl: "http://IP:3004", sidecarEndpoint: "http://IP:3100",
      organization: "plant1", equipmentSlug: "oven",
      federation: { create: { name: "plant1 — Utilities", type: "Open|Consortium|Private" } },
      "federation (alt)": { join: "<federationId>" },
      governance: { accessTokenTtlMinutes: 15, requiresManualApproval: false, purposeBinding: false, revocationMode: "ttl-expiry" },
      resources: [{ id: "operational", name: "Operational Data", path: "/api/v1/operational" }],
    },
    returns: { participantId: "urn:...", assetId: "...", contractOfferId: "...", resourceUrls: { operational: "{sidecar}/api/proxy/oven/operational" }, sidecarSecret: "(só no primeiro register, se gerado)", dataUrl: "..." },
  },
  {
    name: "update sidecar endpoint",
    method: "POST", path: "/api/m2m/sidecar-endpoint",
    description: "Troca a URL pública do Sidecar (ex.: túnel cloudflared reiniciado) para todos os CPS M2M da organização, ou só um slug, e re-registra cada CPS no novo Sidecar. Exige X-Sidecar-Secret.",
    headers: { "X-M2M-Key": "<M2M_API_KEY>", "X-Sidecar-Secret": "<segredo do Sidecar da organização>" },
    body: { organization: "plant1", sidecarEndpoint: "https://nova-url.trycloudflare.com", equipmentSlug: "(opcional) oven" },
    returns: { ok: true, updated: { connectors: 1, federations: 1, assets: 1, accessTokens: 0 }, equipment: [{ equipmentSlug: "oven", sidecarRegistered: true }], sidecarRegistered: true },
  },
  {
    name: "discover (UDDI)",
    method: "GET", path: "/api/m2m/discover",
    description: "Descoberta de ativos por serviço/capacidade. Só metadados; não retorna dados crus.",
    query: {
      capability: "temperature", equipmentType: "Furnace", slug: "oven",
      federationId: "<id>", q: "texto livre", status: "available|any",
      exclude: "<participantId|slug próprio>", limit: "50",
    },
    returns: { count: 0, results: [{ assetId: "...", equipmentSlug: "...", capabilities: [], resources: [{ id: "operational", url: "..." }], federation: { admissionMode: "..." } }] },
  },
  {
    name: "contract offer",
    method: "GET", path: "/api/m2m/offer",
    description: "Oferta de contrato e diretrizes do ativo (finalidade, aprovação, TTLs, revogação, recursos) antes de negociar.",
    query: { assetId: "<id>", slug: "(alt) oven" },
    returns: { offer: { id: "...", version: 1 }, directives: { accessTokenTtlMinutes: 30, purposeBinding: false }, resources: [], negotiation: "automatic|manual-approval", howToSign: {} },
  },
  {
    name: "negotiate",
    method: "POST", path: "/api/m2m/negotiate",
    description: "Negocia contrato e obtém token, gravando as mesmas etapas do fluxo humano: adesão à federação, oferta, conexão, acordo assinado pelas duas partes, credencial e token (empurrado ao Sidecar do provedor). Se a governança exigir aprovação manual, retorna pending.",
    headers: { "X-M2M-Key": "<M2M_API_KEY>", "X-Sidecar-Secret": "<segredo do Sidecar da organização do CONSUMIDOR>" },
    body: { consumerParticipantId: "urn:...", consumerName: "cnc", targetAssetId: "<id> | targetSlug: oven", purpose: "compensação térmica", resources: ["operational"] },
    returns: { status: "granted|pending", token: "dsp_m2m_...", dataUrl: "http://IP:3100/api/proxy/oven/data", resourceUrls: {}, expiresAt: "ISO", contractRef: "...", steps: [] },
  },
  {
    name: "validate agreement",
    method: "GET", path: "/api/m2m/agreement",
    description: "Validação de um contrato negociado: assinaturas, validade, recursos liberados, credencial e tokens (sem o valor). Só as partes: X-Sidecar-Secret da organização do consumidor ou do provedor.",
    headers: { "X-M2M-Key": "<M2M_API_KEY>", "X-Sidecar-Secret": "<segredo de uma das partes>" },
    query: { contractRef: "<contractRef do negotiate>" },
    returns: { effectiveStatus: "active|expired|agreement-valid-no-active-token", agreement: {}, credential: {}, tokens: [] },
  },
  {
    name: "consume (Sidecar PEP)",
    method: "GET", path: "{sidecarEndpoint}/api/proxy/{slug}/{data|aas|resourceId}",
    description: "Consumo P2P dentro da fábrica. Fora da API do Dataspace — direto no Sidecar, com o Bearer obtido em negotiate.",
    headers: { Authorization: "Bearer {token}" },
  },
  {
    name: "organization secret (admin)",
    method: "POST", path: "/api/m2m/organization",
    description: "Administrador define ou reseta o segredo do Sidecar de uma organização (organizações com CPS anteriores ao segredo, ou segredo perdido). Exige X-M2M-Admin-Key.",
    headers: { "X-M2M-Admin-Key": "<M2M_ADMIN_KEY>" },
    body: { organization: "plant1", sidecarSecret: "(opcional, ≥ 32 chars) — sem ele, gera e devolve uma vez" },
  },
  {
    name: "delete organization",
    method: "DELETE", path: "/api/m2m/organization",
    description: "A organização apaga tudo o que registrou via M2M (conectores, ativos, federações, governança, ofertas, adesões, contratos, credenciais, tokens) e o próprio segredo, para recomeçar com um register novo. Contratos com outras organizações ficam como histórico delas, com o token revogado. dryRun=true só conta. Exige X-Sidecar-Secret.",
    headers: { "X-M2M-Key": "<M2M_API_KEY>", "X-Sidecar-Secret": "<segredo do Sidecar da organização>" },
    query: { organization: "plant1", dryRun: "(opcional) true" },
    returns: { ok: true, deleted: { connectorProfiles: 3, assets: 3, federations: 1 }, keptShared: {}, keptFederations: [], revokedTokens: 0 },
  },
  {
    name: "monitor",
    method: "GET", path: "/api/m2m/monitor",
    description: "Observabilidade: quem troca com quem (grafo), tokens/contratos ativos e acessos recentes do PEP. Somente leitura.",
    query: { participant: "<participantId>", asset: "<assetId>", limit: "50" },
  },
]

export async function GET(request: NextRequest) {
  const db = getDb()
  const health: Record<string, unknown> = { dataspace: "online", firestore: Boolean(db) }

  if (db) {
    try {
      const [feds, assets] = await Promise.all([
        db.collection("federations").where("publishedInCatalog", "==", true).get(),
        db.collection("assets").where("publishedInCatalog", "==", true).get(),
      ])
      const available = assets.docs.filter(d => String(d.data().status ?? "available") === "available").length
      health.catalog = { federations: feds.size, assets: assets.size, available }
    } catch (e) {
      health.firestore = false
      health.error = e instanceof Error ? e.message : String(e)
    }
  }

  const sidecarUrl = request.nextUrl.searchParams.get("sidecar")
  if (sidecarUrl) {
    try {
      const res = await fetch(`${sidecarUrl.replace(/\/+$/, "")}/api/status`, { signal: AbortSignal.timeout(3000) })
      const body = await res.json().catch(() => ({}))
      health.sidecar = { url: sidecarUrl, reachable: res.ok, registry: body?.registry ?? null, tokens: body?.tokens ?? null }
    } catch {
      health.sidecar = { url: sidecarUrl, reachable: false }
    }
  }

  return NextResponse.json({
    service: "Dataspace M2M API",
    version: "1.0.0",
    role: "plano de controle intraorganizacional para arquiteturas de controle autônomas (agentes/CPS)",
    trust: "aberto (PoC) — DAPS/SSI no roadmap",
    generatedAt: new Date().toISOString(),
    health,
    flow: ["register → discover → negotiate → consume (Sidecar) → monitor"],
    interfaces: INTERFACES,
  }, { headers: CORS })
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS })
}
