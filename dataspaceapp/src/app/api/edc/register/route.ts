/**
 * POST /api/edc/register — registra ativos intra no EDC (camada inter-org).
 *
 * Gera os artefatos do EDC Management API v3 (Asset + PolicyDefinition +
 * ContractDefinition) para os ativos escolhidos e, se um EDC estiver
 * configurado (EDC_MANAGEMENT_URL), os empurra. Sem EDC vivo, retorna os
 * payloads (modo export) — testável e demonstrável.
 *
 * Body:
 * {
 *   "assetId": "<id>"                 // um ativo,  OU
 *   "assetIds": ["<id>", ...],        // vários,    OU
 *   "federationId": "<id>",           // todos os ativos públicos da federação
 *   "push": true                      // opcional; força o push ao EDC (default: auto se EDC configurado)
 * }
 */

import { NextRequest, NextResponse } from "next/server"
import {
  getDb, buildEdcBundle, pushBundleToEdc, governanceForAsset, assetFromDoc,
  EDC_MANAGEMENT_URL,
} from "@/lib/edc"

export const runtime = "nodejs"

const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type" }

type Body = { assetId?: string; assetIds?: string[]; federationId?: string; push?: boolean }

export async function POST(request: NextRequest) {
  let body: Body
  try { body = await request.json() } catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400, headers: CORS }) }

  const db = getDb()
  if (!db) return NextResponse.json({ error: "Server credentials not configured (FIREBASE_SERVICE_ACCOUNT_JSON)" }, { status: 503, headers: CORS })

  // URL pública deste dataspace (para a ponte de dados no dataAddress)
  const bridgeBaseUrl = process.env.EDC_PUBLIC_BASE_URL || request.nextUrl.origin

  // ── resolve os ativos alvo ──
  const ids = new Set<string>()
  if (body.assetId) ids.add(body.assetId)
  for (const id of body.assetIds ?? []) ids.add(id)

  const docs: Array<{ id: string; data: Record<string, unknown> }> = []
  if (body.federationId) {
    const snap = await db.collection("assets")
      .where("federationId", "==", body.federationId)
      .where("publishedInCatalog", "==", true).get()
    snap.docs.forEach(d => docs.push({ id: d.id, data: d.data() }))
  }
  for (const id of ids) {
    const d = await db.collection("assets").doc(id).get()
    if (d.exists) docs.push({ id: d.id, data: d.data()! })
  }
  if (docs.length === 0) {
    return NextResponse.json({ error: "No assets resolved. Provide assetId, assetIds or federationId." }, { status: 404, headers: CORS })
  }

  // ── monta bundles + governança ──
  const bundles = []
  for (const { id, data } of docs) {
    const asset = assetFromDoc(id, data)
    const gov = await governanceForAsset(db, id)
    bundles.push({ assetId: id, name: asset.name, bundle: buildEdcBundle(asset, bridgeBaseUrl, gov) })
  }

  // ── push (auto se EDC configurado, salvo push:false explícito) ──
  const shouldPush = body.push ?? Boolean(EDC_MANAGEMENT_URL)
  let pushed: Array<{ assetId: string; results: Awaited<ReturnType<typeof pushBundleToEdc>> }> | null = null
  if (shouldPush) {
    if (!EDC_MANAGEMENT_URL) {
      return NextResponse.json({ error: "push requested but EDC_MANAGEMENT_URL is not configured" }, { status: 409, headers: CORS })
    }
    pushed = []
    for (const b of bundles) pushed.push({ assetId: b.assetId, results: await pushBundleToEdc(b.bundle) })
  }

  return NextResponse.json({
    ok: true,
    mode: shouldPush ? "pushed" : "export",
    edcManagementUrl: EDC_MANAGEMENT_URL || null,
    bridgeBaseUrl,
    count: bundles.length,
    bundles,      // Asset + Policy + ContractDefinition prontos p/ o Management API v3
    pushed,       // resultado do push (null no modo export)
    hint: EDC_MANAGEMENT_URL
      ? "Registrado no EDC. O EDC exporá estes ativos no catálogo DSP inter-org."
      : "Modo export. Configure EDC_MANAGEMENT_URL para empurrar, ou faça POST manual dos bundles em /v3/{assets,policydefinitions,contractdefinitions}.",
  }, { headers: CORS })
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS })
}
