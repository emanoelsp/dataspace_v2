/**
 * POST /api/m2m/negotiate — negocia contrato e obtém token de acesso.
 *
 * Segue as MESMAS etapas do fluxo humano, gravando cada uma:
 *   1. adesão à federação (federationMemberships)
 *   2. oferta de contrato publicada (contractOffers) com as diretrizes
 *   3. conexão entre conectores (connectorConnections)
 *   4. acordo assinado pelo consumidor e pelo provedor (contractAgreements)
 *   5. credencial de uso (credentialGrants)
 *   6. token com a GOVERNANÇA HERDADA, empurrado ao Sidecar do provedor
 * e devolve {token, dataUrl, resourceUrls, expiresAt, steps}.
 * Se a governança exige aprovação manual, devolve {status:"pending", requestId}.
 *
 * O consumidor prova a identidade com o segredo do Sidecar da organização dele
 * (header X-Sidecar-Secret): só quem é da organização negocia em nome de um
 * participantId dela.
 *
 * Body:
 * {
 *   "consumerParticipantId": "urn:dataspace:participant:plant1:cnc",
 *   "consumerName": "cnc",
 *   "targetAssetId": "<id>"  |  "targetSlug": "oven",
 *   "purpose": "compensação térmica",
 *   "resources": ["operational", "hcm-episodes"]   // opcional; padrão: todos
 * }
 */

import { NextResponse } from "next/server"
import { FieldValue, type Firestore } from "firebase-admin/firestore"
import {
  getDb, tokenValue, governanceSnapshotForAsset, sidecarPushToken, apiKeyError,
  upsertContractOffer, resourceUrls, sidecarSecretForParticipant, SidecarSecretUnavailableError,
  participantSecretMatches, upsertMembership, SIDECAR_ADMIN_SECRET, type M2MResource,
} from "@/lib/m2m"

export const runtime = "nodejs"

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-M2M-Key, X-Sidecar-Secret",
}

type Body = {
  consumerParticipantId?: string
  consumerName?: string
  targetAssetId?: string
  targetSlug?: string
  purpose?: string
  resources?: unknown
}

type Step = { step: string; id: string; status: "created" | "reused" | "skipped" }

/** Admissão do consumidor na federação do ativo: só por adesão ativa ou federação self-service. */
async function ensureMembership(
  db: Firestore, federationId: string, consumer: string, consumerName: string, steps: Step[],
): Promise<{ error: string; admissionMode: string } | { membershipId: string }> {
  if (!federationId) {
    steps.push({ step: "federation-membership", id: "", status: "skipped" })
    return { membershipId: "" }
  }
  const fed = (await db.collection("federations").doc(federationId).get()).data() ?? {}
  const admissionMode = String(fed.admissionMode ?? "self-service")
  const existing = await db.collection("federationMemberships")
    .where("federationId", "==", federationId).where("participantId", "==", consumer).limit(1).get()
  const current = existing.empty ? null : existing.docs[0]

  if (current?.data()?.status === "active") {
    steps.push({ step: "federation-membership", id: current.id, status: "reused" })
    return { membershipId: current.id }
  }
  if (current || admissionMode !== "self-service") {
    return {
      error: current
        ? `Federation membership is ${current.data()?.status}; it must be approved by the federation owner.`
        : "The asset federation does not admit new members automatically.",
      admissionMode,
    }
  }

  const m = await upsertMembership(db, {
    federationId, federationName: String(fed.name ?? ""),
    participantId: consumer, participantName: consumerName,
    admissionMode, ownerId: String(fed.ownerId ?? ""), status: "active",
  }, FieldValue.serverTimestamp())
  steps.push({ step: "federation-membership", id: m.id, status: "created" })
  return { membershipId: m.id }
}

export async function POST(request: Request) {
  const keyErr = apiKeyError(request)
  if (keyErr) return NextResponse.json({ error: keyErr }, { status: 401, headers: CORS })

  let body: Body
  try { body = await request.json() } catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400, headers: CORS }) }

  if (!body.consumerParticipantId || (!body.targetAssetId && !body.targetSlug)) {
    return NextResponse.json({ error: "Required: consumerParticipantId and (targetAssetId or targetSlug)" }, { status: 400, headers: CORS })
  }
  if (body.resources !== undefined && (!Array.isArray(body.resources) || body.resources.some(r => typeof r !== "string"))) {
    return NextResponse.json({ error: "resources must be an array of resource ids" }, { status: 400, headers: CORS })
  }

  const db = getDb()
  if (!db) return NextResponse.json({ error: "Server credentials not configured" }, { status: 503, headers: CORS })

  // ── identidade do consumidor ──
  try {
    const provided = (request.headers.get("x-sidecar-secret") ?? "").trim()
    if (!(await participantSecretMatches(db, body.consumerParticipantId, provided))) {
      return NextResponse.json({
        error: "Consumer not authenticated: send the sidecar secret of the consumer organization in X-Sidecar-Secret (the consumer must be registered via /api/m2m/register).",
      }, { status: 403, headers: CORS })
    }
  } catch (err) {
    if (err instanceof SidecarSecretUnavailableError) return NextResponse.json({ error: err.message }, { status: 503, headers: CORS })
    throw err
  }

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

  const consumer = body.consumerParticipantId
  const consumerName = body.consumerName ?? consumer
  const providerId = String(asset.ownerId ?? "")
  const federationId = String(asset.federationId ?? "")

  // ── recursos pedidos (padrão: todos os do ativo) ──
  const assetResources = (asset.resources as M2MResource[] | undefined) ?? []
  const requested = (body.resources as string[] | undefined) ?? []
  const unknown = requested.filter(id => !assetResources.some(r => r.id === id))
  if (unknown.length) {
    return NextResponse.json({
      error: `Unknown resources: ${unknown.join(", ")}`,
      availableResources: assetResources.map(r => r.id),
    }, { status: 422, headers: CORS })
  }
  const granted = requested.length ? assetResources.filter(r => requested.includes(r.id)) : assetResources

  // ── segredo do Sidecar do provedor ──
  // Ativo M2M sem segredo próprio (registrado antes dessa versão) não recebe o
  // segredo global: o provedor precisa refazer o register.
  let sidecarSecret: string
  try {
    const own = await sidecarSecretForParticipant(db, providerId)
    if (!own && asset.source === "m2m") {
      return NextResponse.json({
        error: "The provider organization has no sidecar secret yet. The provider must call /api/m2m/register again.",
      }, { status: 409, headers: CORS })
    }
    sidecarSecret = own ?? SIDECAR_ADMIN_SECRET
  } catch (err) {
    if (err instanceof SidecarSecretUnavailableError) return NextResponse.json({ error: err.message }, { status: 503, headers: CORS })
    throw err
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
      assetId, assetName: asset.name ?? "", assetOwnerId: providerId,
      requesterId: consumer, requesterName: consumerName,
      purpose, resources: granted.map(r => r.id), status: "pending", source: "m2m",
      federationId, federationName: asset.federationName ?? "",
      createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
    })
    return NextResponse.json({
      status: "pending",
      requestId: reqRef.id,
      reason: "Asset governance requires manual approval by the data owner.",
    }, { status: 202, headers: CORS })
  }

  const steps: Step[] = []

  // ── 1) adesão à federação ──
  const membership = await ensureMembership(db, federationId, consumer, consumerName, steps)
  if ("error" in membership) {
    return NextResponse.json({ error: membership.error, admissionMode: membership.admissionMode }, { status: 403, headers: CORS })
  }

  // ── 2) oferta de contrato ──
  const offerSnap = await db.collection("contractOffers").where("assetId", "==", assetId).where("status", "==", "published").limit(1).get()
  let offerId: string
  if (!offerSnap.empty) {
    offerId = offerSnap.docs[0].id
    steps.push({ step: "contract-offer", id: offerId, status: "reused" })
  } else {
    offerId = await upsertContractOffer(db, assetId, asset, gov, FieldValue.serverTimestamp())
    steps.push({ step: "contract-offer", id: offerId, status: "created" })
  }

  // ── 3) conexão entre conectores ──
  const connSnap = await db.collection("connectorConnections")
    .where("providerParticipantId", "==", providerId).where("consumerParticipantId", "==", consumer).limit(1).get()
  let connectionId: string
  if (!connSnap.empty) {
    const status = String(connSnap.docs[0].data()?.status ?? "")
    if (status === "revoked" || status === "rejected") {
      return NextResponse.json({ error: `Connector connection ${status} by the provider.` }, { status: 403, headers: CORS })
    }
    connectionId = connSnap.docs[0].id
    steps.push({ step: "connector-connection", id: connectionId, status: "reused" })
  } else {
    const ref = await db.collection("connectorConnections").add({
      ownerId: providerId, ownerName: asset.ownerName ?? "",
      providerParticipantId: providerId, providerConnectorDspBaseUrl: "",
      requesterId: consumer, requesterName: consumerName,
      consumerParticipantId: consumer, consumerConnectorDspBaseUrl: "",
      status: "active", approvedAt: FieldValue.serverTimestamp(), source: "m2m",
      createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
    })
    connectionId = ref.id
    steps.push({ step: "connector-connection", id: connectionId, status: "created" })
  }

  // ── 4) acordo assinado pelas duas partes ──
  const now = Date.now()
  const validUntil = new Date(now + (gov?.agreementTtlHours ?? 24) * 60 * 60 * 1000)
  const agreementRef = await db.collection("contractAgreements").add({
    offerId, connectorConnectionId: connectionId,
    assetId, assetName: asset.name ?? "",
    providerId, providerName: asset.ownerName ?? "", providerParticipantId: providerId,
    consumerId: consumer, consumerName, consumerParticipantId: consumer,
    requesterId: consumer, requesterName: consumerName,
    federationId, federationName: asset.federationName ?? "",
    governancePolicyId: gov?.policyId ?? "",
    purpose, purposeBindingAccepted: Boolean(gov?.purposeBinding),
    resources: granted.map(r => r.id),
    agreementType: "asset", scope: "asset", status: "finalized", source: "m2m",
    signedByConsumerAt: FieldValue.serverTimestamp(),
    signedByProviderAt: FieldValue.serverTimestamp(),
    providerSignature: "auto: governance requiresManualApproval=false",
    validFrom: FieldValue.serverTimestamp(), validUntil,
    ownerId: providerId,
    createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
  })
  steps.push({ step: "contract-agreement", id: agreementRef.id, status: "created" })

  // ── 5) credencial de uso ──
  const credentialRef = await db.collection("credentialGrants").add({
    participantId: consumer, requesterId: consumer, requesterName: consumerName,
    agreementId: agreementRef.id, assetId, federationId,
    credentialType: "usage", status: "active",
    issuedAt: FieldValue.serverTimestamp(), expiresAt: validUntil,
    ownerId: providerId, ownerName: asset.ownerName ?? "", source: "m2m",
    createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
  })
  steps.push({ step: "credential-grant", id: credentialRef.id, status: "created" })

  // ── 6) token (nunca além da validade do acordo) ──
  const ttlMinutes = gov?.accessTokenTtlMinutes ?? 30
  const expiresAt = new Date(Math.min(now + ttlMinutes * 60 * 1000, validUntil.getTime()))
  const token = tokenValue("m2m")
  const permissions = ["data", "aas", ...granted.map(r => r.id)]

  const governance = gov
    ? { policyId: gov.policyId, accessTokenTtlMinutes: gov.accessTokenTtlMinutes,
        purposeBinding: gov.purposeBinding, requiresManualApproval: gov.requiresManualApproval,
        revocationMode: gov.revocationMode, conditions: purpose || gov.conditions }
    : undefined

  const sidecarTokenId = await sidecarPushToken(sidecarEndpoint, {
    token,
    federationId,
    federationName: String(asset.federationName ?? ""),
    assetId, assetName: String(asset.name ?? ""),
    equipmentType: slug,
    dataOwnerId: providerId, dataOwnerName: String(asset.ownerName ?? ""),
    dataClientId: consumer, dataClientName: consumerName,
    expiresAt: expiresAt.toISOString(),
    governanceAcceptedAt: new Date().toISOString(),
    contractRef: agreementRef.id,
    permissions,
    governance,
  }, sidecarSecret)

  const tokenRef = await db.collection("accessTokens").add({
    token, assetId, assetName: asset.name ?? "",
    contractAgreementId: agreementRef.id, agreementId: agreementRef.id,
    credentialGrantId: credentialRef.id, connectorConnectionId: connectionId,
    governancePolicyId: gov?.policyId ?? "",
    requesterId: consumer, requesterName: consumerName,
    providerId, ownerId: providerId,
    federationId,
    sidecarEndpoint, equipmentSlug: slug, sidecarTokenId: sidecarTokenId ?? "",
    permissions,
    status: "active", scope: "data:read", purpose, source: "m2m",
    issuedAt: FieldValue.serverTimestamp(), expiresAt,
  })
  steps.push({ step: "access-token", id: tokenRef.id, status: "created" })

  const base = sidecarEndpoint.replace(/\/+$/, "")
  return NextResponse.json({
    status: "granted",
    token,
    tokenType: "Bearer",
    dataUrl: `${base}/api/proxy/${slug}/data`,
    aasUrl: `${base}/api/proxy/${slug}/aas`,
    resourceUrls: resourceUrls(sidecarEndpoint, slug, granted),
    sidecarEndpoint, equipmentSlug: slug,
    expiresAt: expiresAt.toISOString(),
    contractRef: agreementRef.id,
    agreementValidUntil: validUntil.toISOString(),
    offerId,
    credentialGrantId: credentialRef.id,
    sidecarTokenId: sidecarTokenId ?? null,
    permissions,
    governance: governance ?? null,
    steps,
    usage: "GET {dataUrl} or any resourceUrls entry with Authorization: Bearer {token}",
    validate: `GET /api/m2m/agreement?contractRef=${agreementRef.id}`,
  }, { headers: CORS })
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS })
}
