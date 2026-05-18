import { randomBytes } from "node:crypto"
import type { DecodedIdToken } from "firebase-admin/auth"
import { FieldValue, getFirestore } from "firebase-admin/firestore"
import type { AccessRequestDecision } from "@/lib/access-request-decisions"

function randomToken(length = 24): string {
  return `acc_${randomBytes(length).toString("hex")}`
}

function normalizeEquipmentType(assetType?: string, irdi?: string): string | null {
  const t = (assetType ?? "").toLowerCase()
  if (t.includes("cnc")) return "cnc"
  if (t.includes("press") || t.includes("prensa")) return "press"
  if (t.includes("robot")) return "robot"
  const i = irdi ?? ""
  if (i.includes("ACJ843")) return "cnc"
  if (i.includes("ADN573")) return "press"
  if (i.includes("AKJ975")) return "robot"
  return null
}

async function pushTokenToSidecar(payload: Record<string, unknown>, sidecarUrl: string): Promise<void> {
  const secret = process.env.SIDECAR_ADMIN_SECRET ?? "admin"
  try {
    await fetch(`${sidecarUrl}/api/tokens`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${secret}` },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(4000),
    })
  } catch { /* sidecar unreachable — non-critical */ }
}

function ownerFieldsFromToken(decoded: DecodedIdToken) {
  const ownerName = decoded.name ?? decoded.email ?? decoded.uid
  return {
    ownerId: decoded.uid,
    ownerEmail: decoded.email ?? "",
    ownerName,
    updatedById: decoded.uid,
    updatedByEmail: decoded.email ?? "",
    updatedByName: ownerName,
  }
}

/**
 * Same semantics as `finalizeAccessRequestDecision` but runs with Admin SDK (bypasses client rules).
 */
export async function finalizeAccessRequestDecisionAdmin(
  accessRequestId: string,
  decoded: DecodedIdToken,
  decision: AccessRequestDecision,
): Promise<void> {
  const db = getFirestore()
  const reqRef = db.collection("accessRequests").doc(accessRequestId)
  const reqSnap = await reqRef.get()
  if (!reqSnap.exists) {
    throw new Error("Access request not found.")
  }
  const data = reqSnap.data()!
  const assetOwnerId = data.assetOwnerId as string | undefined
  if (!assetOwnerId || assetOwnerId !== decoded.uid) {
    throw new Error("Only the asset owner can decide this request.")
  }
  const currentStatus = data.status as string | undefined
  if (currentStatus && currentStatus !== "pending") {
    throw new Error("This request was already decided.")
  }

  const batch = db.batch()
  batch.update(reqRef, {
    status: decision,
    decisionAt: FieldValue.serverTimestamp(),
    decisionById: decoded.uid,
    decisionByEmail: decoded.email ?? null,
    updatedAt: FieldValue.serverTimestamp(),
  })

  if (decision !== "approved") {
    await batch.commit()
    return
  }

  const assetId = data.assetId as string | undefined
  const requesterId = data.requesterId as string | undefined
  if (!assetId || !requesterId) {
    await batch.commit()
    return
  }

  const assetSnap = await db.collection("assets").doc(assetId).get()
  const assetName = assetSnap.exists
    ? ((assetSnap.data()!.name as string) ?? "Asset")
    : "Asset"

  const grantRef = db.collection("credentialGrants").doc()
  const tokenRef = db.collection("accessTokens").doc()

  batch.set(grantRef, {
    accessRequestId,
    assetId,
    assetName,
    requesterId,
    contractAgreementId: data.contractAgreementId ?? null,
    connectorConnectionId: data.connectorConnectionId ?? null,
    issuedAt: FieldValue.serverTimestamp(),
    ...ownerFieldsFromToken(decoded),
  })

  const govSnap = await db.collection("governance").doc(assetId).get().catch(() => null)
  const ttlMinutes: number =
    (govSnap?.exists ? (govSnap.data()?.accessTokenTtlMinutes as number | undefined) : undefined) ??
    60

  const expiresAt = new Date(Date.now() + ttlMinutes * 60 * 1000)
  const tokenValue = randomToken(24)

  batch.set(tokenRef, {
    accessRequestId,
    assetId,
    assetName,
    token: tokenValue,
    scope: "data:read",
    requesterId,
    contractAgreementId: data.contractAgreementId ?? null,
    connectorConnectionId: data.connectorConnectionId ?? null,
    status: "active",
    issuedAt: FieldValue.serverTimestamp(),
    expiresAt,
    ...ownerFieldsFromToken(decoded),
  })

  await batch.commit()

  // Push token to sidecar proxy (non-blocking)
  const assetDoc = assetSnap.exists ? assetSnap.data()! : {}
  const sidecarEndpoint = (assetDoc.sidecarEndpoint as string | undefined) ?? ""
  const equipmentType = normalizeEquipmentType(assetDoc.assetType as string | undefined, assetDoc.irdi as string | undefined)

  if (sidecarEndpoint && equipmentType) {
    const requesterSnap = await db.collection("users").doc(requesterId).get().catch(() => null)
    const requesterData = requesterSnap?.exists ? requesterSnap.data()! : {}

    pushTokenToSidecar({
      token: tokenValue,
      federationId: (assetDoc.federationId as string) ?? "",
      federationName: (assetDoc.federationName as string) ?? "",
      assetId,
      assetName,
      equipmentType,
      dataOwnerId: decoded.uid,
      dataOwnerName: decoded.name ?? decoded.email ?? decoded.uid,
      dataClientId: (requesterData.participantId as string) ?? requesterId,
      dataClientName: (requesterData.connectorName as string) ?? (requesterData.name as string) ?? requesterId,
      expiresAt: expiresAt.toISOString(),
      governanceAcceptedAt: new Date().toISOString(),
      contractRef: (data.contractAgreementId as string) ?? accessRequestId,
      permissions: ["data", "aas"],
    }, sidecarEndpoint)
  }
}
