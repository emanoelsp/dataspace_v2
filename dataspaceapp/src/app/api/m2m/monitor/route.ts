/**
 * GET /api/m2m/monitor — observabilidade das trocas M2M (somente leitura).
 *
 * NÃO controla ciclo de vida (isso é da arquitetura de controle). Apenas
 * acompanha: quem está trocando dados com quem, contratos e tokens ativos, e
 * os acessos recentes registrados pelo Sidecar PEP (rastreabilidade).
 *
 * Query:
 *   ?participant=<participantId>   filtra por consumidor OU provedor
 *   ?asset=<assetId>               filtra por ativo
 *   ?limit=50                      nº de logs recentes (default 50)
 */

import { NextRequest, NextResponse } from "next/server"
import { getDb } from "@/lib/m2m"

export const runtime = "nodejs"

const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, OPTIONS", "Access-Control-Allow-Headers": "Content-Type" }

function toIso(v: unknown): string | null {
  const t = v as { toDate?: () => Date } | undefined
  return t?.toDate?.().toISOString() ?? null
}

export async function GET(request: NextRequest) {
  const db = getDb()
  if (!db) return NextResponse.json({ error: "Server credentials not configured" }, { status: 503, headers: CORS })

  const p = request.nextUrl.searchParams
  const participant = (p.get("participant") ?? "").trim()
  const assetFilter = (p.get("asset") ?? "").trim()
  const limit = Math.min(Number(p.get("limit") ?? "50") || 50, 200)
  const now = Date.now()

  // ── tokens ativos (pares consumidor ↔ provedor em vigência) ──
  const tokSnap = await db.collection("accessTokens").where("status", "==", "active").get()
  type Doc = { id: string } & Record<string, unknown>
  const activeTokens = tokSnap.docs
    .map((d): Doc => ({ id: d.id, ...(d.data() as Record<string, unknown>) }))
    .filter(t => {
      const exp = (t.expiresAt as { toDate?: () => Date } | undefined)?.toDate?.().getTime() ?? 0
      if (exp && exp < now) return false
      if (participant && t.requesterId !== participant && t.providerId !== participant) return false
      if (assetFilter && t.assetId !== assetFilter) return false
      return true
    })
    .map(t => ({
      consumer: t.requesterName ?? t.requesterId ?? "",
      provider: t.providerId ?? "",
      asset: t.assetName ?? "",
      equipmentSlug: t.equipmentSlug ?? "",
      contractRef: t.contractAgreementId ?? "",
      purpose: t.purpose ?? "",
      issuedAt: toIso(t.issuedAt),
      expiresAt: toIso(t.expiresAt),
      sidecar: t.sidecarEndpoint ?? "",
    }))

  // ── contratos (pares) ──
  const agrSnap = await db.collection("contractAgreements").get()
  const agreements = agrSnap.docs
    .map((d): Doc => ({ id: d.id, ...(d.data() as Record<string, unknown>) }))
    .filter(a => {
      if (participant && a.consumerId !== participant && a.providerId !== participant) return false
      if (assetFilter && a.assetId !== assetFilter) return false
      return true
    })
    .map(a => ({
      contractId: a.id, consumer: a.consumerName ?? a.consumerId ?? "", provider: a.providerName ?? a.providerId ?? "",
      asset: a.assetName ?? "", federation: a.federationName ?? "", purpose: a.purpose ?? "",
      status: a.status ?? "", createdAt: toIso(a.createdAt),
    }))

  // ── acessos recentes (logs do PEP reportados ao Dataspace) ──
  const logSnap = await db.collection("accessLogs").get()
  const logs = logSnap.docs
    .map((d): Doc => ({ id: d.id, ...(d.data() as Record<string, unknown>) }))
    .filter(l => {
      if (participant && l.dataClientId !== participant && l.dataOwnerId !== participant) return false
      if (assetFilter && l.assetId !== assetFilter) return false
      return true
    })
    .sort((a, b) => String(b.proxyTimestamp ?? "").localeCompare(String(a.proxyTimestamp ?? "")))
    .slice(0, limit)
    .map(l => ({
      when: l.proxyTimestamp ?? toIso(l.createdAt),
      consumer: l.dataClientName ?? l.dataClientId ?? "",
      provider: l.dataOwnerName ?? l.dataOwnerId ?? "",
      asset: l.assetName ?? "", endpoint: l.endpoint ?? "",
      statusCode: l.statusCode ?? 0, ms: l.responseTimeMs ?? 0, success: l.success ?? false,
      contractRef: l.contractRef ?? "", governancePolicy: (l.governance as { policyId?: string } | null)?.policyId ?? "",
    }))

  // ── quem-com-quem (grafo de trocas) ──
  const edges = new Map<string, { consumer: string; provider: string; accesses: number; lastMs: number }>()
  for (const l of logs) {
    const key = `${l.consumer}→${l.provider}`
    const e = edges.get(key) ?? { consumer: String(l.consumer), provider: String(l.provider), accesses: 0, lastMs: 0 }
    e.accesses += 1
    e.lastMs = Number(l.ms) || e.lastMs
    edges.set(key, e)
  }

  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    summary: {
      activeTokens: activeTokens.length,
      contracts: agreements.length,
      recentAccesses: logs.length,
      exchangePairs: edges.size,
    },
    exchanges: Array.from(edges.values()).sort((a, b) => b.accesses - a.accesses),
    activeTokens,
    contracts: agreements,
    recentAccessLogs: logs,
  }, { headers: CORS })
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS })
}
