import { NextResponse } from "next/server"
import { getAuth } from "firebase-admin/auth"
import { getAdminApp } from "@/lib/firebase-admin"

export const runtime = "nodejs"

const SIDECAR_ADMIN_SECRET = process.env.SIDECAR_ADMIN_SECRET ?? "admin"

type MonitorBody = {
  idToken?: string
  sidecarUrl?: string
  type?: "tokens" | "access-log"
  limit?: number
}

export async function POST(request: Request) {
  const app = getAdminApp()
  if (!app) {
    return NextResponse.json({ error: "Firebase Admin not configured" }, { status: 503 })
  }

  let body: MonitorBody
  try {
    body = (await request.json()) as MonitorBody
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const { idToken, sidecarUrl, type = "tokens", limit = 100 } = body

  if (!idToken) {
    return NextResponse.json({ error: "idToken required" }, { status: 400 })
  }

  try {
    await getAuth(app).verifyIdToken(idToken)
  } catch {
    return NextResponse.json({ error: "Invalid or expired id token" }, { status: 401 })
  }

  const target = sidecarUrl ?? process.env.SIDECAR_URL ?? "http://localhost:3100"

  try {
    const url =
      type === "access-log"
        ? `${target}/api/access-log?limit=${limit}`
        : `${target}/api/tokens`

    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${SIDECAR_ADMIN_SECRET}` },
      signal: AbortSignal.timeout(5000),
    })

    if (!res.ok) {
      return NextResponse.json(
        { error: `Sidecar responded with ${res.status}`, offline: false },
        { status: 502 },
      )
    }

    const data = await res.json()
    return NextResponse.json({ ok: true, data })
  } catch {
    return NextResponse.json({ error: "Sidecar unreachable", offline: true }, { status: 502 })
  }
}
