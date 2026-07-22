import { randomBytes } from "node:crypto"
import type { DecodedIdToken } from "firebase-admin/auth"
import { FieldValue, getFirestore } from "firebase-admin/firestore"

function generateIdentityToken(): string {
  return `idt_${randomBytes(32).toString("hex")}`
}

function ownerFields(decoded: DecodedIdToken) {
  return {
    ownerId: decoded.uid,
    ownerEmail: decoded.email ?? "",
  }
}

export async function issueIdentityToken(
  connectorProfileId: string,
  decoded: DecodedIdToken,
  opts: {
    targetParticipantId?: string
    connectorConnectionId?: string
    ttlMinutes?: number
    scope?: string
  } = {},
): Promise<{ tokenId: string; token: string; expiresAt: Date }> {
  const db = getFirestore()

  const profileSnap = await db.collection("connectorProfiles").doc(connectorProfileId).get()
  if (!profileSnap.exists) throw new Error("Connector profile not found.")
  const profileData = profileSnap.data()!
  if (profileData.ownerId !== decoded.uid) throw new Error("Only the connector owner can issue identity tokens.")

  const ttl = opts.ttlMinutes ?? 60
  const token = generateIdentityToken()
  const expiresAt = new Date(Date.now() + ttl * 60 * 1000)

  const tokenRef = db.collection("identityTokens").doc()
  await tokenRef.set({
    connectorProfileId,
    participantId: profileData.participantId ?? "",
    targetParticipantId: opts.targetParticipantId ?? null,
    connectorConnectionId: opts.connectorConnectionId ?? null,
    token,
    scope: opts.scope ?? "connector:identity",
    status: "active",
    issuedAt: FieldValue.serverTimestamp(),
    expiresAt,
    ...ownerFields(decoded),
  })

  await db.collection("identityTrustLogs").add({
    connectorProfileId,
    participantId: profileData.participantId ?? "",
    targetParticipantId: opts.targetParticipantId ?? null,
    identityTokenId: tokenRef.id,
    connectorConnectionId: opts.connectorConnectionId ?? null,
    event: "issued",
    detail: `Token issued. TTL: ${ttl}min. Scope: ${opts.scope ?? "connector:identity"}`,
    recordedAt: FieldValue.serverTimestamp(),
    ...ownerFields(decoded),
  })

  return { tokenId: tokenRef.id, token, expiresAt }
}

export async function revokeIdentityToken(
  tokenId: string,
  decoded: DecodedIdToken,
): Promise<void> {
  const db = getFirestore()

  const tokenSnap = await db.collection("identityTokens").doc(tokenId).get()
  if (!tokenSnap.exists) throw new Error("Identity token not found.")
  const tokenData = tokenSnap.data()!
  if (tokenData.ownerId !== decoded.uid) throw new Error("Only the token owner can revoke it.")
  if (tokenData.status === "revoked") throw new Error("Token is already revoked.")

  await tokenSnap.ref.update({
    status: "revoked",
    revokedAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  })

  await db.collection("identityTrustLogs").add({
    connectorProfileId: tokenData.connectorProfileId ?? null,
    participantId: tokenData.participantId ?? "",
    targetParticipantId: tokenData.targetParticipantId ?? null,
    identityTokenId: tokenId,
    connectorConnectionId: tokenData.connectorConnectionId ?? null,
    event: "revoked",
    detail: "Token manually revoked.",
    recordedAt: FieldValue.serverTimestamp(),
    ...ownerFields(decoded),
  })
}

export async function verifyIdentityToken(
  token: string,
  expectedParticipantId?: string,
): Promise<{ valid: boolean; tokenId?: string; participantId?: string; reason?: string }> {
  const db = getFirestore()

  const snap = await db
    .collection("identityTokens")
    .where("token", "==", token)
    .where("status", "==", "active")
    .limit(1)
    .get()

  if (snap.empty) {
    return { valid: false, reason: "Token not found or not active." }
  }

  const tokenDoc = snap.docs[0]!
  const data = tokenDoc.data()

  if (data.expiresAt && data.expiresAt.toDate() < new Date()) {
    await tokenDoc.ref.update({ status: "expired", updatedAt: FieldValue.serverTimestamp() })
    return { valid: false, reason: "Token expired." }
  }

  if (expectedParticipantId && data.participantId !== expectedParticipantId) {
    await db.collection("identityTrustLogs").add({
      connectorProfileId: data.connectorProfileId ?? null,
      participantId: data.participantId ?? "",
      targetParticipantId: data.targetParticipantId ?? null,
      identityTokenId: tokenDoc.id,
      event: "rejected",
      detail: `Participant mismatch. Expected: ${expectedParticipantId}, got: ${data.participantId}`,
      recordedAt: FieldValue.serverTimestamp(),
      ownerId: data.ownerId,
      ownerEmail: data.ownerEmail ?? "",
    })
    return { valid: false, reason: "Participant ID mismatch." }
  }

  return { valid: true, tokenId: tokenDoc.id, participantId: data.participantId as string }
}
