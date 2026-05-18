import {
  addDoc,
  collection,
  doc,
  getDoc,
  serverTimestamp,
  updateDoc,
  type Firestore,
} from "firebase/firestore"
import type { User } from "firebase/auth"
import { buildOwnershipFields } from "@/lib/dataspace"

export type AccessRequestDecision = "approved" | "rejected"

export function buildAccessRequestDecisionFields(
  user: User,
  decision: AccessRequestDecision,
) {
  return {
    status: decision,
    decisionAt: serverTimestamp(),
    decisionById: user.uid,
    decisionByEmail: user.email ?? null,
    updatedAt: serverTimestamp(),
  }
}

function randomToken(length = 32): string {
  const bytes = new Uint8Array(length)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")
}

/**
 * Updates access request status and, on approval, creates credential grant + access token
 * aligned with asset detail patterns (credentialGrants / accessTokens).
 */
export async function finalizeAccessRequestDecision(
  db: Firestore,
  accessRequestId: string,
  assetOwnerUser: User,
  decision: AccessRequestDecision,
): Promise<void> {
  const reqRef = doc(db, "accessRequests", accessRequestId)
  const reqSnap = await getDoc(reqRef)
  if (!reqSnap.exists()) {
    throw new Error("Access request not found.")
  }
  const data = reqSnap.data()
  const assetOwnerId = data.assetOwnerId as string | undefined
  if (!assetOwnerId || assetOwnerId !== assetOwnerUser.uid) {
    throw new Error("Only the asset owner can decide this request.")
  }
  const currentStatus = data.status as string | undefined
  if (currentStatus && currentStatus !== "pending") {
    throw new Error("This request was already decided.")
  }

  await updateDoc(reqRef, {
    ...buildAccessRequestDecisionFields(assetOwnerUser, decision),
  })

  if (decision !== "approved") {
    return
  }

  const assetId = data.assetId as string | undefined
  const requesterId = data.requesterId as string | undefined
  const contractAgreementId = data.contractAgreementId as string | undefined
  const connectorConnectionId = data.connectorConnectionId as string | undefined

  if (!assetId || !requesterId) {
    return
  }

  const assetSnap = await getDoc(doc(db, "assets", assetId))
  const assetName = assetSnap.exists()
    ? ((assetSnap.data().name as string) ?? "Asset")
    : "Asset"

  await addDoc(collection(db, "credentialGrants"), {
    accessRequestId,
    assetId,
    assetName,
    requesterId,
    contractAgreementId: contractAgreementId ?? null,
    connectorConnectionId: connectorConnectionId ?? null,
    issuedAt: serverTimestamp(),
    ...buildOwnershipFields(assetOwnerUser),
  })

  const governanceSnap = await getDoc(doc(db, "governance", assetId)).catch(() => null)
  const ttlMinutes: number =
    (governanceSnap?.exists()
      ? (governanceSnap.data().accessTokenTtlMinutes as number | undefined)
      : undefined) ?? 60

  const expiresAt = new Date(Date.now() + ttlMinutes * 60 * 1000)

  const tokenValue = `acc_${randomToken(24)}`
  await addDoc(collection(db, "accessTokens"), {
    accessRequestId,
    assetId,
    assetName,
    token: tokenValue,
    scope: "data:read",
    requesterId,
    contractAgreementId: contractAgreementId ?? null,
    connectorConnectionId: connectorConnectionId ?? null,
    status: "active" as const,
    issuedAt: serverTimestamp(),
    expiresAt,
    ...buildOwnershipFields(assetOwnerUser),
  })
}
