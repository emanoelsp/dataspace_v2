import { NextResponse } from "next/server"

export const runtime = "nodejs"

const SIDECAR_ADMIN_SECRET = process.env.SIDECAR_ADMIN_SECRET ?? "admin"
const FIREBASE_API_KEY = process.env.NEXT_PUBLIC_FIREBASE_API_KEY ?? ""

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

async function verifyFirebaseIdToken(idToken: string): Promise<boolean> {
  if (!FIREBASE_API_KEY) return false
  try {
    const res = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${FIREBASE_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken }),
        signal: AbortSignal.timeout(5000),
      },
    )
    return res.ok
  } catch {
    return false
  }
}

export async function POST(request: Request) {
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

  const valid = await verifyFirebaseIdToken(idToken)
  if (!valid) {
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
