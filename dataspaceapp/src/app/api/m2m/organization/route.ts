/**
 * POST /api/m2m/organization — administrador define ou reseta o segredo do
 * Sidecar de uma organização M2M.
 *
 * Usado para organizações que já tinham CPS antes do segredo por organização
 * (o register não deixa ninguém "assumir" essas organizações) e para quando o
 * dono perdeu o segredo. Exige X-M2M-Admin-Key = M2M_ADMIN_KEY.
 *
 * Body:
 * {
 *   "organization": "IFSC-GASPAR",
 *   "sidecarSecret": "<≥ 32 chars>"     // opcional: sem ele, gera e devolve uma vez
 * }
 */

import { NextResponse } from "next/server"
import { FieldValue } from "firebase-admin/firestore"
import {
  getDb, slugify, M2M_CORS, M2M_ORGS, adminKeyError,
  generateSidecarSecret, isAcceptableSidecarSecret, encryptSidecarSecret,
} from "@/lib/m2m"

export const runtime = "nodejs"

type Body = { organization?: string; sidecarSecret?: string }

export async function POST(request: Request) {
  const adminErr = adminKeyError(request)
  if (adminErr) return NextResponse.json({ error: adminErr[0] }, { status: adminErr[1], headers: M2M_CORS })

  let body: Body
  try { body = await request.json() } catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400, headers: M2M_CORS }) }

  const organization = body.organization?.trim() ?? ""
  if (!organization) return NextResponse.json({ error: "Required: organization" }, { status: 400, headers: M2M_CORS })
  const provided = body.sidecarSecret?.trim() ?? ""
  if (provided && !isAcceptableSidecarSecret(provided)) {
    return NextResponse.json({ error: "sidecarSecret must have at least 32 characters." }, { status: 400, headers: M2M_CORS })
  }

  const db = getDb()
  if (!db) return NextResponse.json({ error: "Server credentials not configured" }, { status: 503, headers: M2M_CORS })

  const sidecarSecret = provided || generateSidecarSecret()
  const sidecarSecretEnc = encryptSidecarSecret(sidecarSecret)
  if (!sidecarSecretEnc) return NextResponse.json({ error: "Sidecar secret store unavailable (SIDECAR_SECRETS_KEY)" }, { status: 503, headers: M2M_CORS })

  const ref = db.collection(M2M_ORGS).doc(slugify(organization))
  const existed = (await ref.get()).exists
  await ref.set({
    organization, sidecarSecretEnc, source: "m2m",
    secretSetBy: "admin", updatedAt: FieldValue.serverTimestamp(),
    ...(existed ? {} : { createdAt: FieldValue.serverTimestamp() }),
  }, { merge: true })

  return NextResponse.json({
    ok: true,
    organization,
    reset: existed,
    ...(provided ? {} : { sidecarSecret, sidecarSecretNotice: "Shown only once." }),
  }, { headers: M2M_CORS })
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: M2M_CORS })
}
