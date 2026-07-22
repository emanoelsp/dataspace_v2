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
    description: "CPS se auto-registra: conector + federação (cria/entra) + compliance + asset (com capacidades colhidas) + governança + registro no Sidecar. Idempotente por organization+slug.",
    body: {
      name: "Heat Treatment Furnace", baseUrl: "http://IP:3004", sidecarEndpoint: "http://IP:3100",
      organization: "plant1", equipmentSlug: "oven",
      federation: { create: { name: "plant1 — Utilities", type: "Open|Consortium|Private" } },
      "federation (alt)": { join: "<federationId>" },
      governance: { accessTokenTtlMinutes: 15, requiresManualApproval: false, purposeBinding: false, revocationMode: "ttl-expiry" },
    },
    returns: { participantId: "urn:...", assetId: "...", federation: { id: "...", admissionMode: "..." }, dataUrl: "..." },
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
    returns: { count: 0, results: [{ assetId: "...", equipmentSlug: "...", capabilities: [], federation: { admissionMode: "..." } }] },
  },
  {
    name: "negotiate",
    method: "POST", path: "/api/m2m/negotiate",
    description: "Negocia contrato e obtém token. Auto-concede se a governança permitir; se exigir aprovação manual, retorna pending. Token é empurrado ao Sidecar do provedor com a governança herdada.",
    body: { consumerParticipantId: "urn:...", consumerName: "cnc", targetAssetId: "<id> | targetSlug: oven", purpose: "compensação térmica" },
    returns: { status: "granted|pending", token: "dsp_m2m_...", dataUrl: "http://IP:3100/api/proxy/oven/data", expiresAt: "ISO" },
  },
  {
    name: "consume (Sidecar PEP)",
    method: "GET", path: "{sidecarEndpoint}/api/proxy/{slug}/data",
    description: "Consumo P2P dentro da fábrica. Fora da API do Dataspace — direto no Sidecar, com o Bearer obtido em negotiate.",
    headers: { Authorization: "Bearer {token}" },
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
