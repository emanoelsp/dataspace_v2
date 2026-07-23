/**
 * GET /api/edc/data/{assetId} — ponte de dados do inter (o dataAddress.baseUrl
 * que o data plane do EDC puxa durante um transfer).
 *
 * Mantém a SOBERANIA mesmo no inter-org: em vez de servir o dado direto, a ponte
 * busca através do Sidecar PEP intra (mintando um token curto), preservando a
 * validação de política e o log de acesso na borda. Assim, até um consumo
 * inter-org fica auditável no PEP. Se o sidecar não estiver acessível, faz
 * fallback para o endpoint direto do CPS (simplificação declarada da PoC).
 *
 * Autenticação: se EDC_DATA_SECRET estiver definido, exige o header
 * X-EDC-Data-Secret (que o EDC repassa a partir do dataAddress).
 */

import { NextRequest, NextResponse } from "next/server"
import { getDb, EDC_DATA_SECRET } from "@/lib/edc"
import { tokenValue, sidecarPushToken } from "@/lib/m2m"

export const runtime = "nodejs"

export async function GET(request: NextRequest, { params }: { params: Promise<{ assetId: string }> }) {
  if (EDC_DATA_SECRET) {
    const provided = request.headers.get("x-edc-data-secret") ?? request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? ""
    if (provided !== EDC_DATA_SECRET) {
      return NextResponse.json({ error: "Invalid or missing X-EDC-Data-Secret" }, { status: 401 })
    }
  }

  const db = getDb()
  if (!db) return NextResponse.json({ error: "Server credentials not configured" }, { status: 503 })

  const { assetId } = await params
  const snap = await db.collection("assets").doc(assetId).get()
  if (!snap.exists) return NextResponse.json({ error: "Asset not found" }, { status: 404 })
  const asset = snap.data()!

  const slug = String(asset.equipmentSlug ?? "")
  const sidecarEndpoint = String(asset.sidecarEndpoint ?? "").replace(/\/+$/, "")
  const apiEndpoint = String(asset.apiEndpoint ?? "")

  // 1) caminho soberano: através do Sidecar PEP (token curto "inter-gateway")
  if (slug && sidecarEndpoint) {
    const token = tokenValue("edc")
    const pushed = await sidecarPushToken(sidecarEndpoint, {
      token,
      federationId: String(asset.federationId ?? ""),
      federationName: String(asset.federationName ?? ""),
      assetId, assetName: String(asset.name ?? ""),
      equipmentType: slug,
      dataOwnerId: String(asset.ownerId ?? ""), dataOwnerName: String(asset.ownerName ?? ""),
      dataClientId: "inter:edc-gateway", dataClientName: "EDC inter-org gateway",
      expiresAt: new Date(Date.now() + 2 * 60 * 1000).toISOString(),
      governanceAcceptedAt: new Date().toISOString(),
      contractRef: `edc-transfer-${assetId}`,
      permissions: ["data"],
      governance: { policyId: "edc-inter", revocationMode: "ttl-expiry" },
    })
    if (pushed !== null) {
      try {
        const res = await fetch(`${sidecarEndpoint}/api/proxy/${slug}/data`, {
          headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(6000),
        })
        const body = await res.text()
        return new NextResponse(body, {
          status: res.status,
          headers: {
            "Content-Type": res.headers.get("content-type") ?? "application/json",
            "X-Data-Path": "intra-sidecar-PEP",
            "Cache-Control": "no-store",
          },
        })
      } catch { /* cai no fallback */ }
    }
  }

  // 2) fallback declarado: endpoint direto do CPS (sem passar pelo PEP)
  if (apiEndpoint) {
    try {
      const res = await fetch(apiEndpoint, { headers: { Authorization: "Bearer demo" }, signal: AbortSignal.timeout(6000) })
      const body = await res.text()
      return new NextResponse(body, {
        status: res.status,
        headers: { "Content-Type": res.headers.get("content-type") ?? "application/json", "X-Data-Path": "direct-fallback", "Cache-Control": "no-store" },
      })
    } catch (e) {
      return NextResponse.json({ error: "Upstream unreachable", detail: e instanceof Error ? e.message : String(e) }, { status: 502 })
    }
  }

  return NextResponse.json({ error: "Asset has no sidecar/apiEndpoint to serve" }, { status: 409 })
}
