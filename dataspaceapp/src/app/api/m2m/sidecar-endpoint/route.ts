/**
 * POST /api/m2m/sidecar-endpoint — troca o endereço público do Sidecar PEP.
 *
 * Túneis efêmeros (cloudflared sem conta) mudam de URL a cada reinício. Em vez
 * de repetir o register de cada CPS/recurso, uma chamada aponta todos os
 * participantes M2M da organização (ou só um slug) para o novo Sidecar e
 * re-registra cada CPS nele. Tokens já emitidos continuam no `.data/` do
 * Sidecar; aqui só atualizamos o endereço guardado nos `accessTokens` ativos.
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
  getDb, slugify, participantIdFor, sidecarRegisterEquipment,
  M2M_CORS, M2M_OWNER_PREFIX, apiKeyError,
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
  const sidecarEndpoint = body.sidecarEndpoint.replace(/\/+$/, "")
  const orgPrefix = `${M2M_OWNER_PREFIX}${slugify(organization)}:`
  const onlyParticipant = body.equipmentSlug ? participantIdFor(organization, slugify(body.equipmentSlug)) : ""

  // participantId é derivado de organization+slug no register; filtrar pelo
  // prefixo torna a busca insensível a maiúsculas ("IFSC-GASPAR" = "ifsc-gaspar").
  const connSnap = await db.collection("connectorProfiles").where("source", "==", "m2m").get()
  const connectors = connSnap.docs.filter(d => {
    const pid = String(d.data()?.participantId ?? "")
    return onlyParticipant ? pid === onlyParticipant : pid.startsWith(orgPrefix)
  })
  if (connectors.length === 0) {
    return NextResponse.json({
      error: onlyParticipant
        ? `No M2M participant found: ${onlyParticipant}`
        : `No M2M participants found for organization: ${organization}`,
    }, { status: 404, headers: M2M_CORS })
  }

  const patch = { sidecarEndpoint, updatedAt: FieldValue.serverTimestamp() }
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
          })
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
