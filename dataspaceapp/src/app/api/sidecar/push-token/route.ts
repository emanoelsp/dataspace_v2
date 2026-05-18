import { NextResponse } from "next/server"
import { getAuth } from "firebase-admin/auth"
import { getAdminApp } from "@/lib/firebase-admin"

export const runtime = "nodejs"

const SIDECAR_ADMIN_SECRET = process.env.SIDECAR_ADMIN_SECRET ?? "admin"

type PushTokenBody = {
  idToken?: string
  sidecarUrl?: string
  token?: string
  federationId?: string
  federationName?: string
  assetId?: string
  assetName?: string
  equipmentType?: string
  dataOwnerId?: string
  dataOwnerName?: string
  dataClientId?: string
  dataClientName?: string
  expiresAt?: string
  governanceAcceptedAt?: string
  contractRef?: string
  permissions?: string[]
}

export async function POST(request: Request) {
  const app = getAdminApp()
  if (!app) {
    return NextResponse.json({ error: "Firebase Admin not configured" }, { status: 503 })
  }

  let body: PushTokenBody
  try {
    body = (await request.json()) as PushTokenBody
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const { idToken, sidecarUrl, ...tokenData } = body

  if (!idToken) {
    return NextResponse.json({ error: "idToken is required" }, { status: 400 })
  }

  try {
    await getAuth(app).verifyIdToken(idToken)
  } catch {
    return NextResponse.json({ error: "Invalid or expired id token" }, { status: 401 })
  }

  const target = sidecarUrl ?? process.env.SIDECAR_URL ?? "http://localhost:3100"

  const required = ["token", "federationId", "assetId", "assetName", "equipmentType", "dataOwnerId", "dataClientId", "expiresAt"]
  for (const key of required) {
    if (!tokenData[key as keyof typeof tokenData]) {
      return NextResponse.json({ error: `Missing required field: ${key}` }, { status: 400 })
    }
  }

  try {
    const res = await fetch(`${target}/api/tokens`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${SIDECAR_ADMIN_SECRET}`,
      },
      body: JSON.stringify(tokenData),
      signal: AbortSignal.timeout(5000),
    })

    if (!res.ok) {
      const text = await res.text()
      return NextResponse.json({ error: `Sidecar error: ${text}` }, { status: res.status })
    }

    const data = await res.json()
    return NextResponse.json({ ok: true, sidecarToken: data })
  } catch {
    return NextResponse.json({ error: "Sidecar unreachable", sidecarUrl: target }, { status: 502 })
  }
}
