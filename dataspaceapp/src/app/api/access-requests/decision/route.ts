import { NextResponse } from "next/server"
import { getAuth } from "firebase-admin/auth"
import { finalizeAccessRequestDecisionAdmin } from "@/lib/access-request-decisions-admin"
import { getAdminApp } from "@/lib/firebase-admin"

export const runtime = "nodejs"

type Body = {
  idToken?: string
  accessRequestId?: string
  decision?: string
}

/**
 * Server-side access request decision (verify ID token + Admin writes).
 * Optional: UI uses client Firestore when Admin is not configured.
 */
export async function POST(request: Request) {
  const app = getAdminApp()
  if (!app) {
    return NextResponse.json(
      {
        error:
          "Firebase Admin is not configured. Set FIREBASE_SERVICE_ACCOUNT_JSON or Application Default Credentials.",
      },
      { status: 503 },
    )
  }

  let body: Body
  try {
    body = (await request.json()) as Body
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const { idToken, accessRequestId, decision } = body
  if (!idToken || !accessRequestId || (decision !== "approved" && decision !== "rejected")) {
    return NextResponse.json(
      { error: "Expected idToken, accessRequestId, and decision (approved | rejected)" },
      { status: 400 },
    )
  }

  let decoded
  try {
    decoded = await getAuth(app).verifyIdToken(idToken)
  } catch {
    return NextResponse.json({ error: "Invalid or expired id token" }, { status: 401 })
  }

  try {
    await finalizeAccessRequestDecisionAdmin(accessRequestId, decoded, decision)
    return NextResponse.json({ ok: true })
  } catch (e) {
    const message = e instanceof Error ? e.message : "Decision failed"
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
