import { NextResponse } from "next/server"
import { getAuth } from "firebase-admin/auth"
import { getAdminApp } from "@/lib/firebase-admin"
import { revokeConnectorCredential } from "@/lib/connector-credentials-admin"

export const runtime = "nodejs"

type Body = {
  idToken?: string
  credentialId?: string
  auditNote?: string
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

  const { idToken, credentialId, auditNote } = body
  if (!idToken || !credentialId) {
    return NextResponse.json({ error: "Expected idToken and credentialId" }, { status: 400 })
  }

  let decoded
  try {
    decoded = await getAuth(app).verifyIdToken(idToken)
  } catch {
    return NextResponse.json({ error: "Invalid or expired id token" }, { status: 401 })
  }

  try {
    await revokeConnectorCredential(credentialId, decoded, auditNote)
    return NextResponse.json({ ok: true })
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to revoke credential"
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
