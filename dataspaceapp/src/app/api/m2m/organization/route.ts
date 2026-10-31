/**
 * POST /api/m2m/organization — administrador define ou reseta o segredo do
 * Sidecar de uma organização M2M.
 * DELETE /api/m2m/organization — a própria organização apaga tudo o que
 * registrou via M2M (ver o DELETE abaixo).
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
import { FieldValue, type DocumentReference, type Firestore } from "firebase-admin/firestore"
import {
  getDb, slugify, M2M_CORS, M2M_ORGS, M2M_OWNER_PREFIX, adminKeyError, apiKeyError,
  generateSidecarSecret, isAcceptableSidecarSecret, encryptSidecarSecret,
  decryptSidecarSecret, secretsMatch, sidecarSecretForParticipant, sidecarRevokeToken,
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

// [coleção, campo com o participantId] — tudo o que register e negotiate gravam
const PURGE_TARGETS: Array<[string, string]> = [
  ["connectorProfiles", "participantId"],
  ["assets", "ownerId"],
  ["federations", "ownerId"],
  ["compliance", "ownerId"],
  ["governance", "ownerId"],
  ["contractOffers", "ownerId"],
  ["federationMemberships", "participantId"],
  ["connectorConnections", "providerParticipantId"],
  ["connectorConnections", "consumerParticipantId"],
  ["contractAgreements", "providerParticipantId"],
  ["contractAgreements", "consumerParticipantId"],
  ["credentialGrants", "ownerId"],
  ["credentialGrants", "participantId"],
  ["accessTokens", "providerId"],
  ["accessTokens", "requesterId"],
  ["accessRequests", "assetOwnerId"],
  ["accessRequests", "requesterId"],
]

// partes de cada registro bilateral: se a outra parte é de outra organização,
// o registro também é histórico dela — não é apagado (o token é revogado)
const PARTY_FIELDS: Record<string, [string, string]> = {
  connectorConnections: ["providerParticipantId", "consumerParticipantId"],
  contractAgreements: ["providerParticipantId", "consumerParticipantId"],
  credentialGrants: ["ownerId", "participantId"],
  accessTokens: ["providerId", "requesterId"],
  accessRequests: ["assetOwnerId", "requesterId"],
}

type Doc = { ref: DocumentReference; data: Record<string, unknown> }

/** Documentos M2M da organização (prefixo urn:dataspace:participant:{org}:), por coleção. */
async function collectOrgDocs(db: Firestore, orgSlug: string) {
  const prefix = `${M2M_OWNER_PREFIX}${orgSlug}:`
  const end = `${prefix.slice(0, -1)};`
  const found = new Map<string, Map<string, Doc>>()
  const shared = new Map<string, Map<string, Doc>>()
  const add = (col: string, ref: DocumentReference, data: Record<string, unknown>) => {
    // só o que veio do M2M: documentos do fluxo humano ficam intactos
    if (data.source !== "m2m") return
    const isShared = (PARTY_FIELDS[col] ?? []).some(f => !String(data[f] ?? "").startsWith(prefix))
    const target = isShared ? shared : found
    if (!target.has(col)) target.set(col, new Map())
    target.get(col)!.set(ref.id, { ref, data })
  }
  await Promise.all(PURGE_TARGETS.map(async ([col, field]) => {
    const snap = await db.collection(col).where(field, ">=", prefix).where(field, "<", end).get()
    for (const d of snap.docs) add(col, d.ref, d.data() ?? {})
  }))

  // federação da organização com ativo de outra organização: mantém (senão o ativo alheio fica órfão)
  const keptFederations: Array<{ id: string; name: string; foreignAssets: number }> = []
  for (const fed of [...(found.get("federations")?.values() ?? [])]) {
    const assets = await db.collection("assets").where("federationId", "==", fed.ref.id).get()
    const foreign = assets.docs.filter(a => !String(a.data()?.ownerId ?? "").startsWith(prefix)).length
    if (foreign > 0) {
      found.get("federations")!.delete(fed.ref.id)
      keptFederations.push({ id: fed.ref.id, name: String(fed.data.name ?? ""), foreignAssets: foreign })
      for (const [id, c] of found.get("compliance") ?? []) if (c.data.federationId === fed.ref.id) found.get("compliance")!.delete(id)
      continue
    }
    // adesões de outros participantes à federação que será apagada
    const members = await db.collection("federationMemberships").where("federationId", "==", fed.ref.id).get()
    for (const m of members.docs) add("federationMemberships", m.ref, m.data() ?? {})
  }
  return { found, shared, keptFederations }
}

/**
 * DELETE /api/m2m/organization?organization=IFSC-GASPAR[&dryRun=true]
 *
 * Recomeçar do zero sem depender do administrador: apaga conectores, ativos,
 * federações, compliance, governança, ofertas, adesões, conexões, acordos,
 * credenciais, tokens e solicitações dos participantes M2M da organização, e
 * por fim o próprio registro do segredo — o próximo register recria tudo.
 * Tokens ativos são revogados nos Sidecars antes de apagar.
 *
 * Exige X-M2M-Key e o segredo da organização em X-Sidecar-Secret — ou
 * X-M2M-Admin-Key, que também apaga organizações sem segredo (anteriores ao
 * segredo por organização). dryRun=true só conta o que seria apagado.
 */
export async function DELETE(request: Request) {
  const asAdmin = request.headers.has("x-m2m-admin-key")
  const authErr: [string, number] | null = asAdmin
    ? adminKeyError(request)
    : (k => (k ? [k, 401] : null))(apiKeyError(request))
  if (authErr) return NextResponse.json({ error: authErr[0] }, { status: authErr[1], headers: M2M_CORS })

  const params = new URL(request.url).searchParams
  const organization = params.get("organization")?.trim() ?? ""
  if (!organization) return NextResponse.json({ error: "Required query param: organization" }, { status: 400, headers: M2M_CORS })
  const dryRun = params.get("dryRun") === "true"

  const db = getDb()
  if (!db) return NextResponse.json({ error: "Server credentials not configured" }, { status: 503, headers: M2M_CORS })

  const orgSlug = slugify(organization)
  const orgRef = db.collection(M2M_ORGS).doc(orgSlug)
  if (!asAdmin) {
    const orgDoc = await orgRef.get()
    if (!orgDoc.exists) {
      return NextResponse.json({
        error: `Organization "${organization}" has no sidecar secret. Ask the Dataspace admin to delete it (X-M2M-Admin-Key) or to set the secret (POST /api/m2m/organization).`,
      }, { status: 404, headers: M2M_CORS })
    }
    const stored = decryptSidecarSecret(String(orgDoc.data()?.sidecarSecretEnc ?? ""))
    if (!stored) return NextResponse.json({ error: "Sidecar secret store unavailable (SIDECAR_SECRETS_KEY)" }, { status: 503, headers: M2M_CORS })
    const provided = (request.headers.get("x-sidecar-secret") ?? "").trim()
    if (!provided || !secretsMatch(provided, stored)) {
      return NextResponse.json({ error: "Missing or invalid X-Sidecar-Secret header." }, { status: 403, headers: M2M_CORS })
    }
  }

  const { found, shared, keptFederations } = await collectOrgDocs(db, orgSlug)
  const tally = (m: Map<string, Map<string, Doc>>) => Object.fromEntries([...m].map(([col, docs]) => [col, docs.size]))
  const counts = tally(found)
  const keptShared = tally(shared)

  if (dryRun) {
    return NextResponse.json({ ok: true, organization, dryRun: true, wouldDelete: counts, keptShared, keptFederations }, { headers: M2M_CORS })
  }

  // só some do Dataspace o token que o Sidecar confirmou revogado; sem sidecarTokenId
  // o token nunca chegou ao Sidecar. Falhou: fica "active" e volta em unrevokedTokens.
  const activeTokens = [...(found.get("accessTokens")?.values() ?? []), ...(shared.get("accessTokens")?.values() ?? [])]
    .filter(t => t.data.status === "active")
  const unrevoked = new Set<string>()
  await Promise.all(activeTokens.map(async t => {
    if (!t.data.sidecarTokenId) return
    const secret = await sidecarSecretForParticipant(db, String(t.data.providerId ?? "")).catch(() => null)
    const ok = secret && t.data.sidecarEndpoint
      ? await sidecarRevokeToken(String(t.data.sidecarEndpoint), String(t.data.sidecarTokenId), secret)
      : false
    if (!ok) unrevoked.add(t.ref.id)
  }))
  found.get("accessTokens")?.forEach((_, id) => { if (unrevoked.has(id)) found.get("accessTokens")!.delete(id) })
  // registros compartilhados ficam como histórico da outra parte, com o token revogado
  await Promise.all([...(shared.get("accessTokens")?.values() ?? [])]
    .filter(t => t.data.status === "active" && !unrevoked.has(t.ref.id))
    .map(t => t.ref.set({ status: "revoked", revokedAt: FieldValue.serverTimestamp(), revokedReason: "organization-deleted" }, { merge: true })))

  for (const docs of found.values()) await Promise.all([...docs.values()].map(d => d.ref.delete()))
  await orgRef.delete()

  return NextResponse.json({
    ok: true,
    organization,
    deleted: { ...tally(found), m2mOrganizations: 1 },
    keptShared,
    keptFederations,
    revokedTokens: activeTokens.length - unrevoked.size,
    // Sidecar fora do ar: o token segue válido nele até expiresAt
    unrevokedTokens: activeTokens.filter(t => unrevoked.has(t.ref.id)).map(t => ({
      id: t.ref.id, sidecarEndpoint: String(t.data.sidecarEndpoint ?? ""), equipmentSlug: String(t.data.equipmentSlug ?? ""),
    })),
    next: "Clear the Sidecar .data/ folder, then POST /api/m2m/register again: the first register sets a new sidecar secret.",
  }, { headers: M2M_CORS })
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: M2M_CORS })
}
