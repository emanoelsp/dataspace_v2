import { createHash, randomBytes } from "node:crypto"
import type { DecodedIdToken } from "firebase-admin/auth"
import { FieldValue, getFirestore } from "firebase-admin/firestore"

function generateClientId(): string {
  return `cid_${randomBytes(12).toString("hex")}`
}

function generateSecret(): string {
  return `cs_${randomBytes(32).toString("hex")}`
}

function hashSecret(secret: string): string {
  return createHash("sha256").update(secret).digest("hex")
}

function ownerFields(decoded: DecodedIdToken) {
  return {
    ownerId: decoded.uid,
    ownerEmail: decoded.email ?? "",
  }
}

export async function issueConnectorCredential(
  connectorProfileId: string,
  decoded: DecodedIdToken,
): Promise<{ credentialId: string; clientId: string; clientSecret: string }> {
  const db = getFirestore()

  const profileSnap = await db.collection("connectorProfiles").doc(connectorProfileId).get()
  if (!profileSnap.exists) throw new Error("Connector profile not found.")
  const profileData = profileSnap.data()!
  if (profileData.ownerId !== decoded.uid) throw new Error("Only the connector owner can issue credentials.")

  const clientId = generateClientId()
  const clientSecret = generateSecret()
  const clientSecretHash = hashSecret(clientSecret)
  const expiresAt = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)

  const credRef = db.collection("connectorCredentials").doc()
  await credRef.set({
    connectorProfileId,
    participantId: profileData.participantId ?? "",
    clientId,
    clientSecretHash,
    status: "active",
    issuedAt: FieldValue.serverTimestamp(),
    expiresAt,
    ...ownerFields(decoded),
  })

  await db.collection("connectorProfiles").doc(connectorProfileId).update({
    hasCredentials: true,
    updatedAt: FieldValue.serverTimestamp(),
  })

  return { credentialId: credRef.id, clientId, clientSecret }
}

export async function rotateConnectorCredential(
  credentialId: string,
  decoded: DecodedIdToken,
): Promise<{ newCredentialId: string; clientId: string; clientSecret: string }> {
  const db = getFirestore()

  const credSnap = await db.collection("connectorCredentials").doc(credentialId).get()
  if (!credSnap.exists) throw new Error("Credential not found.")
  const credData = credSnap.data()!
  if (credData.ownerId !== decoded.uid) throw new Error("Only the credential owner can rotate it.")
  if (credData.status !== "active") throw new Error("Only active credentials can be rotated.")

  const clientId = generateClientId()
  const clientSecret = generateSecret()
  const clientSecretHash = hashSecret(clientSecret)
  const expiresAt = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)

  const batch = db.batch()

  batch.update(db.collection("connectorCredentials").doc(credentialId), {
    status: "rotated",
    rotatedAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  })

  const newCredRef = db.collection("connectorCredentials").doc()
  batch.set(newCredRef, {
    connectorProfileId: credData.connectorProfileId,
    participantId: credData.participantId ?? "",
    clientId,
    clientSecretHash,
    status: "active",
    rotatedFromId: credentialId,
    issuedAt: FieldValue.serverTimestamp(),
    expiresAt,
    ...ownerFields(decoded),
  })

  await batch.commit()

  return { newCredentialId: newCredRef.id, clientId, clientSecret }
}

export async function revokeConnectorCredential(
  credentialId: string,
  decoded: DecodedIdToken,
  auditNote?: string,
): Promise<void> {
  const db = getFirestore()

  const credSnap = await db.collection("connectorCredentials").doc(credentialId).get()
  if (!credSnap.exists) throw new Error("Credential not found.")
  const credData = credSnap.data()!
  if (credData.ownerId !== decoded.uid) throw new Error("Only the credential owner can revoke it.")
  if (credData.status === "revoked") throw new Error("Credential is already revoked.")

  await db.collection("connectorCredentials").doc(credentialId).update({
    status: "revoked",
    revokedAt: FieldValue.serverTimestamp(),
    revokedById: decoded.uid,
    auditNote: auditNote ?? null,
    updatedAt: FieldValue.serverTimestamp(),
  })
}
