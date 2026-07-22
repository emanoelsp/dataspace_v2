import { NextResponse } from "next/server"
import { getAuth } from "firebase-admin/auth"
import { getAdminApp } from "@/lib/firebase-admin"
import { issueConnectorCredential } from "@/lib/connector-credentials-admin"

export const runtime = "nodejs"

type Body = {
  idToken?: string
  connectorProfileId?: string
}

export async function POST(request: Request) {
  const app = getAdminApp()
  if (!app) {
    return NextResponse.json({ error: "Firebase Admin not configured" }, { status: 503 })
  }

  let body: Body
  try {
    body = (await request.json()) as Body
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const { idToken, connectorProfileId } = body
  if (!idToken || !connectorProfileId) {
    return NextResponse.json({ error: "Expected idToken and connectorProfileId" }, { status: 400 })
  }

  let decoded
  try {
    decoded = await getAuth(app).verifyIdToken(idToken)
  } catch {
    return NextResponse.json({ error: "Invalid or expired id token" }, { status: 401 })
  }

  try {
    const result = await issueConnectorCredential(connectorProfileId, decoded)
    return NextResponse.json({ ok: true, ...result })
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to issue credential"
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
