import { NextResponse } from "next/server"
import { getAdminApp } from "@/lib/firebase-admin"
import { getAuth } from "firebase-admin/auth"
import { getFirestore } from "firebase-admin/firestore"
import { randomUUID } from "crypto"

export const runtime = "nodejs"

const SIDECAR_ADMIN_SECRET = process.env.SIDECAR_ADMIN_SECRET ?? "admin"
const OWNER_TOKEN_TTL_MINUTES = 15

/**
 * Autovisão do Data Owner: emite um token de curta duração para o PRÓPRIO dono
 * visualizar seu CPS (AAS + dados) pelo mesmo caminho auditado do Sidecar PEP.
 * O Dataspace não serve o dado — apenas emite o token; o fetch parte do
 * navegador, dentro do perímetro da fábrica, direto ao sidecar.
 */
export async function POST(request: Request) {
  let body: { idToken?: string; assetId?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  if (!body.idToken || !body.assetId) {
    return NextResponse.json({ error: "Required fields: idToken, assetId" }, { status: 400 })
  }

  const app = getAdminApp()
  if (!app) {
    return NextResponse.json({ error: "Server credentials not configured (FIREBASE_SERVICE_ACCOUNT_JSON)" }, { status: 503 })
  }

  let uid: string
  let ownerName: string
  try {
    const decoded = await getAuth(app).verifyIdToken(body.idToken)
    uid = decoded.uid
    ownerName = decoded.name ?? decoded.email ?? uid
  } catch {
    return NextResponse.json({ error: "Invalid or expired id token" }, { status: 401 })
  }

  const db = getFirestore(app)
  const assetSnap = await db.collection("assets").doc(body.assetId).get()
  if (!assetSnap.exists) {
    return NextResponse.json({ error: "Asset not found" }, { status: 404 })
  }
  const asset = assetSnap.data()!

  if (asset.ownerId !== uid) {
    return NextResponse.json({ error: "Only the data owner can request a self-view token" }, { status: 403 })
  }

  const sidecarEndpoint = ((asset.sidecarEndpoint as string | undefined) ?? "").replace(/\/+$/, "")
  if (!sidecarEndpoint) {
    return NextResponse.json({ error: "Asset has no sidecar endpoint configured" }, { status: 400 })
  }

  const equipmentType = (asset.equipmentSlug as string | undefined) ?? ""
  if (!equipmentType) {
    return NextResponse.json({ error: "Asset has no equipment slug. Re-save the asset to set its Equipment ID." }, { status: 400 })
  }

  const tokenValue = `dsp_owner_${randomUUID().replace(/-/g, "")}`
  const expiresAt = new Date(Date.now() + OWNER_TOKEN_TTL_MINUTES * 60 * 1000).toISOString()

  try {
    const res = await fetch(`${sidecarEndpoint}/api/tokens`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${SIDECAR_ADMIN_SECRET}`,
      },
      body: JSON.stringify({
        token: tokenValue,
        federationId: (asset.federationId as string) ?? "",
        federationName: (asset.federationName as string) ?? "",
        assetId: body.assetId,
        assetName: (asset.name as string) ?? "",
        equipmentType,
        dataOwnerId: uid,
        dataOwnerName: ownerName,
        dataClientId: uid,
        dataClientName: `${ownerName} (owner self-view)`,
        expiresAt,
        governanceAcceptedAt: new Date().toISOString(),
        contractRef: "owner-self-view",
        permissions: ["data", "aas"],
        governance: { policyId: "owner-self-view", revocationMode: "ttl-expiry" },
      }),
      signal: AbortSignal.timeout(5000),
    })

    if (!res.ok) {
      const text = await res.text()
      return NextResponse.json({ error: `Sidecar error: ${text}` }, { status: res.status })
    }
  } catch {
    return NextResponse.json({ error: "Sidecar unreachable", sidecarEndpoint }, { status: 502 })
  }

  return NextResponse.json({
    ok: true,
    token: tokenValue,
    expiresAt,
    sidecarEndpoint,
    equipmentType,
  })
}
