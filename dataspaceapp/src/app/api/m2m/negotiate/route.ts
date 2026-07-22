/**
 * POST /api/m2m/negotiate — negocia contrato e obtém token de acesso.
 *
 * O consumidor (CPS/agente) pede acesso a um ativo alvo. Se a governança do
 * ativo permite concessão automática, o Dataspace: cria o contrato, emite o
 * token com a GOVERNANÇA HERDADA, empurra ao Sidecar do provedor e devolve ao
 * consumidor {token, dataUrl, expiresAt} para trocar dados via PEP.
 * Se a governança exige aprovação manual, devolve {status:"pending", requestId}.
 *
 * Body:
 * {
 *   "consumerParticipantId": "urn:dataspace:participant:plant1:cnc",
 *   "consumerName": "cnc",
 *   "targetAssetId": "<id>"  |  "targetSlug": "oven",
 *   "purpose": "compensação térmica"
 * }
 */

import { NextResponse } from "next/server"
import { FieldValue } from "firebase-admin/firestore"
import {
  getDb, tokenValue, governanceSnapshotForAsset, sidecarPushToken, apiKeyError,
} from "@/lib/m2m"

export const runtime = "nodejs"

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-M2M-Key",
}

type Body = {
  consumerParticipantId?: string
  consumerName?: string
  targetAssetId?: string
  targetSlug?: string
  purpose?: string
}

export async function POST(request: Request) {
  const keyErr = apiKeyError(request)
  if (keyErr) return NextResponse.json({ error: keyErr }, { status: 401, headers: CORS })

  let body: Body
  try { body = await request.json() } catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400, headers: CORS }) }

  if (!body.consumerParticipantId || (!body.targetAssetId && !body.targetSlug)) {
    return NextResponse.json({ error: "Required: consumerParticipantId and (targetAssetId or targetSlug)" }, { status: 400, headers: CORS })
  }

  const db = getDb()
  if (!db) return NextResponse.json({ error: "Server credentials not configured" }, { status: 503, headers: CORS })

  // ── carrega o ativo alvo ──
  let assetDoc
  if (body.targetAssetId) {
    const d = await db.collection("assets").doc(body.targetAssetId).get()
    assetDoc = d.exists ? d : null
  } else {
    const q = await db.collection("assets").where("equipmentSlug", "==", body.targetSlug).limit(1).get()
    assetDoc = q.empty ? null : q.docs[0]
  }
  if (!assetDoc) return NextResponse.json({ error: "Target asset not found" }, { status: 404, headers: CORS })

  const asset = assetDoc.data()!
  const assetId = assetDoc.id
  const slug = String(asset.equipmentSlug ?? "")
  const sidecarEndpoint = String(asset.sidecarEndpoint ?? "")
  if (!slug || !sidecarEndpoint) {
    return NextResponse.json({ error: "Target asset has no equipmentSlug/sidecarEndpoint" }, { status: 409, headers: CORS })
  }

  // ── governança herdada ──
  const gov = await governanceSnapshotForAsset(db, assetId)
  const purpose = (body.purpose ?? "").trim()

  // vínculo de finalidade: se exigido pela política, purpose é obrigatório
  if (gov?.purposeBinding && !purpose) {
    return NextResponse.json({ error: "This asset requires 'purpose' (purpose binding)." }, { status: 422, headers: CORS })
  }

  // ── admissão: aprovação manual vira solicitação pendente ──
  if (gov?.requiresManualApproval) {
    const reqRef = await db.collection("accessRequests").add({
      assetId, assetName: asset.name ?? "", assetOwnerId: asset.ownerId ?? "",
      requesterId: body.consumerParticipantId, requesterName: body.consumerName ?? body.consumerParticipantId,
      purpose, status: "pending", source: "m2m",
      federationId: asset.federationId ?? "", federationName: asset.federationName ?? "",
      createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
    })
    return NextResponse.json({
      status: "pending",
      requestId: reqRef.id,
      reason: "Asset governance requires manual approval by the data owner.",
    }, { status: 202, headers: CORS })
  }

  // ── concessão automática ──
  const ttlMinutes = gov?.accessTokenTtlMinutes ?? 30
  const expiresAt = new Date(Date.now() + ttlMinutes * 60 * 1000)
  const token = tokenValue("m2m")

  const agreementRef = await db.collection("contractAgreements").add({
    assetId, assetName: asset.name ?? "",
    providerId: asset.ownerId ?? "", providerName: asset.ownerName ?? "",
    consumerId: body.consumerParticipantId, consumerName: body.consumerName ?? body.consumerParticipantId,
    federationId: asset.federationId ?? "", federationName: asset.federationName ?? "",
    purpose, scope: "asset", status: "finalized", source: "m2m",
    createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
  })

  const governance = gov
    ? { policyId: gov.policyId, accessTokenTtlMinutes: gov.accessTokenTtlMinutes,
        purposeBinding: gov.purposeBinding, requiresManualApproval: gov.requiresManualApproval,
        revocationMode: gov.revocationMode, conditions: purpose || gov.conditions }
    : undefined

  const sidecarTokenId = await sidecarPushToken(sidecarEndpoint, {
    token,
    federationId: String(asset.federationId ?? ""),
    federationName: String(asset.federationName ?? ""),
    assetId, assetName: String(asset.name ?? ""),
    equipmentType: slug,
    dataOwnerId: String(asset.ownerId ?? ""), dataOwnerName: String(asset.ownerName ?? ""),
    dataClientId: body.consumerParticipantId, dataClientName: body.consumerName ?? body.consumerParticipantId,
    expiresAt: expiresAt.toISOString(),
    governanceAcceptedAt: new Date().toISOString(),
    contractRef: agreementRef.id,
    permissions: ["data", "aas"],
    governance,
  })

  await db.collection("accessTokens").add({
    token, assetId, assetName: asset.name ?? "",
    contractAgreementId: agreementRef.id,
    requesterId: body.consumerParticipantId, requesterName: body.consumerName ?? body.consumerParticipantId,
    providerId: asset.ownerId ?? "",
    federationId: asset.federationId ?? "",
    sidecarEndpoint, equipmentSlug: slug, sidecarTokenId: sidecarTokenId ?? "",
    status: "active", scope: "data:read", purpose, source: "m2m",
    issuedAt: FieldValue.serverTimestamp(), expiresAt,
  })

  return NextResponse.json({
    status: "granted",
    token,
    tokenType: "Bearer",
    dataUrl: `${sidecarEndpoint.replace(/\/+$/, "")}/api/proxy/${slug}/data`,
    aasUrl: `${sidecarEndpoint.replace(/\/+$/, "")}/api/proxy/${slug}/aas`,
    sidecarEndpoint, equipmentSlug: slug,
    expiresAt: expiresAt.toISOString(),
    contractRef: agreementRef.id,
    sidecarTokenId: sidecarTokenId ?? null,
    governance: governance ?? null,
    usage: `GET {dataUrl}  Authorization: Bearer {token}`,
  }, { headers: CORS })
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS })
}
