/**
 * POST /api/m2m/register — auto-registro aberto de um CPS no Dataspace.
 *
 * Sem login: um CPS (ou a arquitetura de controle em nome dele) se registra.
 * Em uma chamada cria/atualiza: conector → federação (cria ou entra) →
 * compliance (se criou a federação) → asset no catálogo federado (com
 * capacidades colhidas do próprio CPS) → governança local → registro no
 * Sidecar PEP. Idempotente por participantId (organization + slug).
 *
 * Body:
 * {
 *   "name": "Heat Treatment Furnace",
 *   "baseUrl": "http://192.168.0.21:3004",       // expõe /api/data e /api/aas
 *   "sidecarEndpoint": "http://192.168.0.21:3100",
 *   "organization": "plant1",                     // default "plant1"
 *   "equipmentSlug": "oven",                      // default: slug do name
 *   "assetType": "Furnace",                        // default: harvested
 *   "eclassIrdi": "0173-1#01-...",                // default: harvested
 *   "capabilities": ["zone1Temp_C", ...],         // default: harvested
 *   "description": "...",
 *   "federation": { "create": { "name": "plant1 — Utilities", "type": "Open" } }
 *                | { "join": "<federationId>" }
 *                | { "joinByName": "plant1 — Utilities" },
 *   "governance": { "accessTokenTtlMinutes": 15, "requiresManualApproval": false,
 *                   "purposeBinding": false, "revocationMode": "ttl-expiry" },
 *   "resources": [                                 // opcional: recursos do CPS
 *     { "id": "operational", "name": "Operational Data", "path": "/api/v1/operational" }
 *   ]
 * }
 *
 * Segredo do Sidecar (header X-Sidecar-Secret): no PRIMEIRO register de uma
 * organização, o valor enviado vira o segredo do Sidecar dela (≥ 32 chars); sem
 * o header, o Dataspace gera um e devolve UMA vez em `sidecarSecret`. A partir
 * daí todo register dessa organização exige o mesmo header — ninguém mais
 * consegue redirecionar os CPS dela nem receber o segredo. Organização que já
 * tinha CPS antes do segredo por organização não pode ser assumida pelo
 * register: o administrador define o segredo em POST /api/m2m/organization.
 */

import { NextResponse } from "next/server"
import { FieldValue } from "firebase-admin/firestore"
import {
  getDb, slugify, participantIdFor, harvestCapabilities,
  sidecarRegisterEquipment, accessModelForType, type FederationType,
  M2M_CORS, M2M_ORGS, apiKeyError, parseResources, resourceUrls,
  generateSidecarSecret, isAcceptableSidecarSecret, encryptSidecarSecret,
  decryptSidecarSecret, secretsMatch, governanceSnapshotForAsset, upsertContractOffer,
  orgNamespaceInUse, upsertMembership,
} from "@/lib/m2m"

export const runtime = "nodejs"

type Body = {
  name?: string
  baseUrl?: string
  sidecarEndpoint?: string
  organization?: string
  equipmentSlug?: string
  assetType?: string
  eclassIrdi?: string
  capabilities?: string[]
  description?: string
  federation?: { create?: { name?: string; type?: FederationType }; join?: string; joinByName?: string }
  governance?: { accessTokenTtlMinutes?: number; requiresManualApproval?: boolean; purposeBinding?: boolean; revocationMode?: string }
  resources?: unknown
}

export async function POST(request: Request) {
  const keyErr = apiKeyError(request)
  if (keyErr) return NextResponse.json({ error: keyErr }, { status: 401, headers: M2M_CORS })

  let body: Body
  try { body = await request.json() } catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400, headers: M2M_CORS }) }

  if (!body.name || !body.baseUrl || !body.sidecarEndpoint) {
    return NextResponse.json({ error: "Required: name, baseUrl, sidecarEndpoint" }, { status: 400, headers: M2M_CORS })
  }
  try { new URL(body.baseUrl); new URL(body.sidecarEndpoint) } catch {
    return NextResponse.json({ error: "baseUrl and sidecarEndpoint must be valid URLs" }, { status: 400, headers: M2M_CORS })
  }

  const resources = parseResources(body.resources)
  if (typeof resources === "string") return NextResponse.json({ error: resources }, { status: 400, headers: M2M_CORS })

  const db = getDb()
  if (!db) return NextResponse.json({ error: "Server credentials not configured (FIREBASE_SERVICE_ACCOUNT_JSON)" }, { status: 503, headers: M2M_CORS })

  const organization = (body.organization || "plant1").trim()
  const slug = slugify(body.equipmentSlug || body.name)
  const participantId = participantIdFor(organization, slug)
  const sidecarEndpoint = body.sidecarEndpoint.replace(/\/+$/, "")
  const baseUrl = body.baseUrl.replace(/\/api\/(data|aas)\/?$/i, "").replace(/\/+$/, "")

  // ── segredo do Sidecar da organização (antes de qualquer escrita) ──
  const orgSlug = slugify(organization)
  if (!orgSlug || !slug) return NextResponse.json({ error: "organization and equipmentSlug/name must contain letters or digits" }, { status: 400, headers: M2M_CORS })
  const providedSecret = (request.headers.get("x-sidecar-secret") ?? "").trim()
  const orgRef = db.collection(M2M_ORGS).doc(orgSlug)
  const orgDoc = await orgRef.get()
  let sidecarSecret: string
  let issuedSecret: string | null = null
  if (orgDoc.exists) {
    const stored = decryptSidecarSecret(String(orgDoc.data()?.sidecarSecretEnc ?? ""))
    if (!stored) return NextResponse.json({ error: "Sidecar secret store unavailable (SIDECAR_SECRETS_KEY)" }, { status: 503, headers: M2M_CORS })
    if (!providedSecret || !secretsMatch(providedSecret, stored)) {
      return NextResponse.json({
        error: `Organization "${organization}" is already registered. Send its sidecar secret in the X-Sidecar-Secret header.`,
      }, { status: 403, headers: M2M_CORS })
    }
    sidecarSecret = stored
  } else {
    if (await orgNamespaceInUse(db, organization)) {
      return NextResponse.json({
        error: `Organization "${organization}" already has CPS registered without a sidecar secret. Ask the Dataspace admin to set it (POST /api/m2m/organization), then send it in X-Sidecar-Secret.`,
      }, { status: 403, headers: M2M_CORS })
    }
    if (providedSecret && !isAcceptableSidecarSecret(providedSecret)) {
      return NextResponse.json({ error: "X-Sidecar-Secret must have at least 32 characters." }, { status: 400, headers: M2M_CORS })
    }
    sidecarSecret = providedSecret || generateSidecarSecret()
    const sidecarSecretEnc = encryptSidecarSecret(sidecarSecret)
    if (!sidecarSecretEnc) return NextResponse.json({ error: "Sidecar secret store unavailable (SIDECAR_SECRETS_KEY)" }, { status: 503, headers: M2M_CORS })
    // create() falha se o documento já existe: dois primeiros registers simultâneos não disputam a organização
    try {
      await orgRef.create({
        organization, sidecarSecretEnc, source: "m2m",
        createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
      })
    } catch {
      return NextResponse.json({ error: `Organization "${organization}" was just registered by another call. Retry with its X-Sidecar-Secret.` }, { status: 409, headers: M2M_CORS })
    }
    if (!providedSecret) issuedSecret = sidecarSecret
  }
  await orgRef.set({ sidecarEndpoint, updatedAt: FieldValue.serverTimestamp() }, { merge: true })

  // ── colheita de capacidades (UDDI) ──
  const h = await harvestCapabilities(baseUrl)
  const capabilities = body.capabilities?.length ? body.capabilities : h.capabilities
  const assetType = body.assetType || h.equipmentType || "CPS"
  const irdi = body.eclassIrdi || h.irdi

  // ── 1) conector (upsert por participantId) ──
  const connSnap = await db.collection("connectorProfiles").where("participantId", "==", participantId).limit(1).get()
  const connectorFields = {
    connectorName: `${body.name} Connector`,
    organizationLegalName: organization,
    participantId,
    connectorRole: "provider",
    scopeType: "plant", scopeLabel: organization,
    environment: "shop-floor", networkZone: "",
    sidecarProtocol: "http", sidecarEndpoint,
    certificateRef: "", connectorDspBaseUrl: "", connectorManagementBaseUrl: "", federatedCatalogUrl: "",
    isDefault: true, status: "active",
    source: "m2m", ownerId: participantId, ownerName: organization,
    updatedAt: FieldValue.serverTimestamp(),
  }
  let connectorId: string
  if (!connSnap.empty) {
    connectorId = connSnap.docs[0].id
    await connSnap.docs[0].ref.set(connectorFields, { merge: true })
  } else {
    const ref = await db.collection("connectorProfiles").add({ ...connectorFields, createdAt: FieldValue.serverTimestamp() })
    connectorId = ref.id
  }

  // ── 2) federação (cria ou entra) ──
  let federationId = ""
  let federationName = ""
  let federationCreated = false
  let admissionMode = "self-service"
  let federationOwnerId = ""
  const fedReq = body.federation ?? {}

  if (fedReq.join) {
    const fedDoc = await db.collection("federations").doc(fedReq.join).get()
    if (!fedDoc.exists) return NextResponse.json({ error: `Federation not found: ${fedReq.join}` }, { status: 404, headers: M2M_CORS })
    federationId = fedDoc.id
    federationName = (fedDoc.data()!.name as string) ?? ""
    admissionMode = (fedDoc.data()!.admissionMode as string) ?? "self-service"
    federationOwnerId = (fedDoc.data()!.ownerId as string) ?? ""
  } else if (fedReq.joinByName) {
    const q = await db.collection("federations").where("name", "==", fedReq.joinByName).limit(1).get()
    if (q.empty) return NextResponse.json({ error: `Federation not found by name: ${fedReq.joinByName}` }, { status: 404, headers: M2M_CORS })
    federationId = q.docs[0].id
    federationName = (q.docs[0].data().name as string) ?? ""
    admissionMode = (q.docs[0].data().admissionMode as string) ?? "self-service"
    federationOwnerId = (q.docs[0].data().ownerId as string) ?? ""
  } else {
    const fedType: FederationType = fedReq.create?.type ?? "Open"
    federationName = fedReq.create?.name || `${organization} — ${slug} federation`
    // reutiliza federação de mesmo nome se já existir (idempotência)
    const existing = await db.collection("federations").where("name", "==", federationName).limit(1).get()
    const model = accessModelForType(fedType)
    admissionMode = model.admissionMode
    if (!existing.empty) {
      federationId = existing.docs[0].id
      admissionMode = (existing.docs[0].data().admissionMode as string) ?? admissionMode
      federationOwnerId = (existing.docs[0].data().ownerId as string) ?? ""
    } else {
      const ref = await db.collection("federations").add({
        name: federationName,
        description: `Federação M2M de ${organization}`,
        organization,
        connectorProfileId: connectorId, connectorName: connectorFields.connectorName, participantId,
        sidecarEndpoint, sidecarProtocol: "http",
        connectorDspBaseUrl: "", connectorManagementBaseUrl: "", federatedCatalogUrl: "",
        connectorScopeType: "plant", connectorScopeLabel: organization,
        federationType: fedType, catalogVisibility: model.catalogVisibility, admissionMode: model.admissionMode,
        dataDomains: "", mainDomain: "", contactEmail: "", website: "",
        publishedInCatalog: true, status: "active", source: "m2m",
        createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
        ownerId: participantId, ownerName: organization,
      })
      federationId = ref.id
      federationCreated = true
      federationOwnerId = participantId
    }
  }

  // ── adesão à federação: ativa se self-service ou dono; senão aguarda aprovação ──
  const membership = await upsertMembership(db, {
    federationId, federationName, participantId, participantName: body.name,
    admissionMode, ownerId: federationOwnerId,
    status: federationOwnerId === participantId || admissionMode === "self-service" ? "active" : "pending-approval",
  }, FieldValue.serverTimestamp())

  // ── 3) compliance (só se criou a federação) ──
  let complianceId = ""
  if (federationCreated) {
    const ref = await db.collection("compliance").add({
      federationId, federationName,
      legalBasis: ["LGPD"], termsAccepted: true,
      termsText: "Termos padrão M2M: uso restrito ao contrato negociado; soberania preservada na origem.",
      consentLogs: "auto: contractAgreements + sidecar accessLogs",
      signature: participantId, signatureHash: Buffer.from(participantId).toString("base64"),
      source: "m2m", createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
      ownerId: participantId, ownerName: organization,
    })
    complianceId = ref.id
  }

  // ── 4) asset (upsert por equipmentSlug + owner M2M) ──
  const assetFields = {
    name: body.name,
    equipmentSlug: slug,
    description: body.description || `${body.name} — ${organization} (${assetType})`,
    federationId, federationName,
    connectorProfileId: connectorId, connectorName: connectorFields.connectorName, connectorParticipantId: participantId,
    connectorDspBaseUrl: "", connectorManagementBaseUrl: "", federatedCatalogUrl: "",
    connectorScopeType: "plant", connectorScopeLabel: organization,
    sidecarProtocol: "http", sidecarEndpoint,
    assetType, assetKind: "data", purpose: "",
    semanticId: "", aasId: h.aasId, irdi, semanticModel: "AAS / IEC 63278",
    apiEndpoint: `${baseUrl}/api/data`, aasEndpoint: `${baseUrl}/api/aas`,
    dataFormat: "JSON", exchangeMode: "stream", accessType: "Federation",
    capabilities, capabilitySemantics: h.capabilitySemantics, resources,
    publishedInCatalog: true, status: "available", source: "m2m",
    updatedAt: FieldValue.serverTimestamp(),
    ownerId: participantId, ownerName: organization,
  }
  const assetSnap = await db.collection("assets")
    .where("equipmentSlug", "==", slug).where("ownerId", "==", participantId).limit(1).get()
  let assetId: string
  if (!assetSnap.empty) {
    assetId = assetSnap.docs[0].id
    await assetSnap.docs[0].ref.set(assetFields, { merge: true })
  } else {
    const ref = await db.collection("assets").add({ ...assetFields, createdAt: FieldValue.serverTimestamp() })
    assetId = ref.id
  }

  // ── 5) governança local (upsert por asset) ──
  const govFields = {
    federation: federationId, assets: [assetId],
    roles: "", policies: body.description || "",
    purposeBinding: Boolean(body.governance?.purposeBinding),
    requiresManualApproval: Boolean(body.governance?.requiresManualApproval),
    audit: "auto: sidecar accessLogs + accessTokens", usagePeriods: "",
    agreementTtlHours: 24, accessTokenTtlMinutes: body.governance?.accessTokenTtlMinutes ?? 30,
    revocation: "", revocationMode: body.governance?.revocationMode ?? "ttl-expiry",
    source: "m2m", updatedAt: FieldValue.serverTimestamp(), ownerId: participantId,
  }
  const govSnap = await db.collection("governance").where("assets", "array-contains", assetId).limit(1).get()
  let governanceId: string
  if (!govSnap.empty) {
    governanceId = govSnap.docs[0].id
    await govSnap.docs[0].ref.set(govFields, { merge: true })
  } else {
    const ref = await db.collection("governance").add({ ...govFields, createdAt: FieldValue.serverTimestamp() })
    governanceId = ref.id
  }

  // ── 6) oferta de contrato com as diretrizes da governança ──
  const contractOfferId = await upsertContractOffer(
    db, assetId, assetFields, await governanceSnapshotForAsset(db, assetId), FieldValue.serverTimestamp(),
  )

  // ── 7) registra o CPS no Sidecar PEP (com o segredo da organização) ──
  const sidecarRegistered = await sidecarRegisterEquipment(sidecarEndpoint, {
    id: slug, name: body.name, baseUrl, eclassIrdi: irdi || undefined,
    dataOwnerId: participantId, dataOwnerName: organization,
    resources: resources.map(({ id, name, path }) => ({ id, name, path })),
  }, sidecarSecret)

  return NextResponse.json({
    ok: true,
    participantId,
    connectorId,
    federation: { id: federationId, name: federationName, created: federationCreated, admissionMode, membershipStatus: membership.status },
    complianceId: complianceId || null,
    assetId,
    equipmentSlug: slug,
    governanceId,
    contractOfferId,
    capabilities,
    resources: resources.map(({ id, name }) => ({ id, name })),
    resourceUrls: resourceUrls(sidecarEndpoint, slug, resources),
    sidecarRegistered,
    ...(issuedSecret ? {
      sidecarSecret: issuedSecret,
      sidecarSecretNotice: "Shown only once. Set it as SIDECAR_ADMIN_SECRET in the Sidecar .env.local, restart the Sidecar and send it in X-Sidecar-Secret on every register/sidecar-endpoint call.",
    } : {}),
    dataUrl: `${sidecarEndpoint}/api/proxy/${slug}/data`,
    hint: "Use /api/m2m/discover para achar outros CPS e /api/m2m/negotiate para obter um token.",
  }, { headers: M2M_CORS })
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: M2M_CORS })
}
