/**
 * POST /api/m2m/sidecar-endpoint — troca o endereço público do Sidecar PEP.
 *
 * Túneis efêmeros (cloudflared sem conta) mudam de URL a cada reinício. Em vez
 * de repetir o register de cada CPS/recurso, uma chamada aponta todos os
 * participantes M2M da organização (ou só um slug) para o novo Sidecar e
 * re-registra cada CPS nele. Tokens já emitidos continuam no `.data/` do
 * Sidecar; aqui só atualizamos o endereço guardado nos `accessTokens` ativos.
 *
 * Exige o segredo do Sidecar da organização em X-Sidecar-Secret (o mesmo do
 * register): sem ele ninguém redireciona os CPS de outra organização, e o
 * segredo só é enviado à nova URL por quem já o conhece.
 *
 * Body:
 * {
 *   "organization": "IFSC-GASPAR",
 *   "sidecarEndpoint": "https://nova-url.trycloudflare.com",
 *   "equipmentSlug": "cpslai1"          // opcional: só este CPS
 * }
 */

import { NextResponse } from "next/server"
import { FieldValue } from "firebase-admin/firestore"
import {
  getDb, slugify, sidecarRegisterEquipment, m2mConnectorsOfOrg,
  M2M_CORS, M2M_ORGS, apiKeyError, decryptSidecarSecret, secretsMatch,
  type M2MResource,
} from "@/lib/m2m"

export const runtime = "nodejs"

type Body = {
  organization?: string
  sidecarEndpoint?: string
  equipmentSlug?: string
}

export async function POST(request: Request) {
  const keyErr = apiKeyError(request)
  if (keyErr) return NextResponse.json({ error: keyErr }, { status: 401, headers: M2M_CORS })

  let body: Body
  try { body = await request.json() } catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400, headers: M2M_CORS }) }

  if (!body.organization?.trim() || !body.sidecarEndpoint) {
    return NextResponse.json({ error: "Required: organization, sidecarEndpoint" }, { status: 400, headers: M2M_CORS })
  }
  try { new URL(body.sidecarEndpoint) } catch {
    return NextResponse.json({ error: "sidecarEndpoint must be a valid URL" }, { status: 400, headers: M2M_CORS })
  }

  const db = getDb()
  if (!db) return NextResponse.json({ error: "Server credentials not configured (FIREBASE_SERVICE_ACCOUNT_JSON)" }, { status: 503, headers: M2M_CORS })

  const organization = body.organization.trim()
  if (!slugify(organization)) return NextResponse.json({ error: "Required: organization, sidecarEndpoint" }, { status: 400, headers: M2M_CORS })
  const sidecarEndpoint = body.sidecarEndpoint.replace(/\/+$/, "")

  const orgRef = db.collection(M2M_ORGS).doc(slugify(organization))
  const orgDoc = await orgRef.get()
  if (!orgDoc.exists) {
    return NextResponse.json({
      error: `Organization "${organization}" has no sidecar secret yet. Call /api/m2m/register once to create it.`,
    }, { status: 404, headers: M2M_CORS })
  }
  const sidecarSecret = decryptSidecarSecret(String(orgDoc.data()?.sidecarSecretEnc ?? ""))
  if (!sidecarSecret) return NextResponse.json({ error: "Sidecar secret store unavailable (SIDECAR_SECRETS_KEY)" }, { status: 503, headers: M2M_CORS })
  const providedSecret = (request.headers.get("x-sidecar-secret") ?? "").trim()
  if (!providedSecret || !secretsMatch(providedSecret, sidecarSecret)) {
    return NextResponse.json({ error: "Missing or invalid X-Sidecar-Secret header." }, { status: 403, headers: M2M_CORS })
  }

  // participantId é derivado de organization+slug no register: a busca por
  // prefixo é insensível a maiúsculas ("IFSC-GASPAR" = "ifsc-gaspar").
  const connectors = await m2mConnectorsOfOrg(db, organization, body.equipmentSlug ?? "")
  if (connectors.length === 0) {
    return NextResponse.json({
      error: body.equipmentSlug
        ? `No M2M participant found for ${organization}/${body.equipmentSlug}`
        : `No M2M participants found for organization: ${organization}`,
    }, { status: 404, headers: M2M_CORS })
  }

  const patch = { sidecarEndpoint, updatedAt: FieldValue.serverTimestamp() }
  await orgRef.set(patch, { merge: true })
  const updated = { connectors: 0, federations: 0, assets: 0, accessTokens: 0 }
  const equipment: Array<{ equipmentSlug: string; assetId: string; sidecarRegistered: boolean }> = []

  for (const conn of connectors) {
    const participantId = String(conn.data()!.participantId)
    await conn.ref.set(patch, { merge: true })
    updated.connectors++

    const [fedSnap, assetSnap, tokenSnap] = await Promise.all([
      db.collection("federations").where("ownerId", "==", participantId).get(),
      db.collection("assets").where("ownerId", "==", participantId).get(),
      db.collection("accessTokens").where("providerId", "==", participantId).where("status", "==", "active").get(),
    ])

    for (const fed of fedSnap.docs) {
      await fed.ref.set(patch, { merge: true })
      updated.federations++
    }
    for (const tok of tokenSnap.docs) {
      await tok.ref.set({ sidecarEndpoint }, { merge: true })
      updated.accessTokens++
    }
    for (const asset of assetSnap.docs) {
      const a = asset.data()!
      await asset.ref.set(patch, { merge: true })
      updated.assets++

      const slug = String(a.equipmentSlug ?? "")
      const baseUrl = String(a.apiEndpoint ?? "").replace(/\/api\/data\/?$/i, "")
      const sidecarRegistered = slug && baseUrl
        ? await sidecarRegisterEquipment(sidecarEndpoint, {
            id: slug, name: String(a.name ?? slug), baseUrl,
            eclassIrdi: a.irdi ? String(a.irdi) : undefined,
            dataOwnerId: participantId, dataOwnerName: String(a.ownerName ?? organization),
            resources: ((a.resources as M2MResource[] | undefined) ?? []).map(({ id, name, path }) => ({ id, name, path })),
          }, sidecarSecret)
        : false
      equipment.push({ equipmentSlug: slug, assetId: asset.id, sidecarRegistered })
    }
  }

  return NextResponse.json({
    ok: true,
    organization,
    sidecarEndpoint,
    updated,
    equipment,
    sidecarRegistered: equipment.length > 0 && equipment.every(e => e.sidecarRegistered),
  }, { headers: M2M_CORS })
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: M2M_CORS })
}
