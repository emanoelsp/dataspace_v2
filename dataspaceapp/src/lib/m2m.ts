/**
 * M2M — camada máquina-a-máquina do Dataspace para arquiteturas de controle
 * autônomas (ex.: a arquitetura de controle plug-and-play do trabalho do Marcos).
 *
 * Endpoints ABERTOS (sem login Firebase): CPS/agentes se auto-registram,
 * descobrem serviços (UDDI) e negociam contratos por API. A confiança forte
 * (DAPS/SSI) é o roadmap declarado; nesta PoC os endpoints são abertos e a
 * identidade é o participantId determinístico atribuído no registro.
 *
 * Reutiliza as MESMAS coleções e o MESMO caminho de governança/token do fluxo
 * humano — entidades M2M aparecem no mesmo catálogo e passam pelo mesmo PEP.
 */

import { createCipheriv, createDecipheriv, randomBytes, timingSafeEqual } from "node:crypto"
import { getFirestore, type Firestore } from "firebase-admin/firestore"
import { getAdminApp } from "@/lib/firebase-admin"
import { mapLegacyFederationType } from "@/lib/intra-dataspace"

export const SIDECAR_ADMIN_SECRET = process.env.SIDECAR_ADMIN_SECRET ?? "admin"
export const M2M_OWNER_PREFIX = "urn:dataspace:participant:"

export const M2M_CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-M2M-Key, X-Sidecar-Secret, X-M2M-Admin-Key",
}

/**
 * Proteção opcional dos endpoints de escrita (register/negotiate) em deploy
 * público. Se M2M_API_KEY estiver definido, exige o header X-M2M-Key igual;
 * se não estiver, os endpoints permanecem abertos (modelo PoC).
 * Retorna a mensagem de erro (string) se bloquear, ou null se liberar.
 */
export function apiKeyError(request: Request): string | null {
  const required = process.env.M2M_API_KEY
  if (!required) return null
  const provided = request.headers.get("x-m2m-key") ?? ""
  return provided === required ? null : "Missing or invalid X-M2M-Key header."
}

export function getDb(): Firestore | null {
  const app = getAdminApp()
  return app ? getFirestore(app) : null
}

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48)
}

/** Identidade determinística do participante — torna o re-registro idempotente. */
export function participantIdFor(organization: string, slug: string): string {
  return `${M2M_OWNER_PREFIX}${slugify(organization || "plant")}:${slug}`
}

export function tokenValue(prefix = "m2m"): string {
  return `dsp_${prefix}_${randomBytes(18).toString("hex")}`
}

export type HarvestResult = {
  capabilities: string[]
  capabilitySemantics: string[]
  aasId: string
  irdi: string
  equipmentType: string
}

/** Colhe capacidades do CPS (metric keys + semânticas) para indexar no catálogo. */
export async function harvestCapabilities(baseUrl: string): Promise<HarvestResult> {
  const out: HarvestResult = { capabilities: [], capabilitySemantics: [], aasId: "", irdi: "", equipmentType: "" }
  const base = baseUrl.replace(/\/api\/(data|aas)\/?$/i, "").replace(/\/+$/, "")
  try {
    const h = { headers: { Authorization: "Bearer demo" }, signal: AbortSignal.timeout(4000) }
    const [dRes, aRes] = await Promise.all([
      fetch(`${base}/api/data`, h),
      fetch(`${base}/api/aas?submodel=OperationalData`, h),
    ])
    if (dRes.ok) {
      const d = await dRes.json()
      out.capabilities = Object.keys(d?.metrics ?? {}).slice(0, 64)
      if (typeof d?.eclassIrdi === "string") out.irdi = d.eclassIrdi
      if (typeof d?.equipmentType === "string") out.equipmentType = d.equipmentType
    }
    if (aRes.ok) {
      const env = await aRes.json()
      out.aasId = env?.assetAdministrationShells?.[0]?.id ?? ""
      const sems: string[] = []
      const walk = (els: Array<{ semanticId?: { keys?: Array<{ value?: string }> }; submodelElements?: unknown[] }>) => {
        for (const el of els ?? []) {
          const v = el?.semanticId?.keys?.[0]?.value
          if (v) sems.push(v)
          if (Array.isArray(el?.submodelElements)) walk(el.submodelElements as typeof els)
        }
      }
      for (const sm of env?.submodels ?? []) walk((sm as { submodelElements?: unknown[] })?.submodelElements as Parameters<typeof walk>[0])
      out.capabilitySemantics = Array.from(new Set(sems)).slice(0, 96)
    }
  } catch { /* CPS offline no registro — segue sem capacidades */ }
  return out
}

/** Registra o CPS no Sidecar PEP (equipment-store). */
export async function sidecarRegisterEquipment(
  sidecarEndpoint: string,
  eq: {
    id: string; name: string; baseUrl: string; eclassIrdi?: string; dataOwnerId?: string; dataOwnerName?: string
    resources?: Array<{ id: string; name: string; path: string }>
  },
  secret = SIDECAR_ADMIN_SECRET,
): Promise<boolean> {
  try {
    const res = await fetch(`${sidecarEndpoint.replace(/\/+$/, "")}/api/equipment`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${secret}` },
      body: JSON.stringify(eq),
      signal: AbortSignal.timeout(4000),
    })
    return res.ok
  } catch { return false }
}

export type SidecarTokenPayload = {
  token: string
  federationId: string
  federationName: string
  assetId: string
  assetName: string
  equipmentType: string
  dataOwnerId: string
  dataOwnerName: string
  dataClientId: string
  dataClientName: string
  expiresAt: string
  governanceAcceptedAt: string
  contractRef: string
  permissions: string[]
  governance?: Record<string, unknown>
}

/** Empurra o token ao Sidecar do provedor; retorna o id do token no sidecar (para revogação). */
export async function sidecarPushToken(
  sidecarEndpoint: string,
  payload: SidecarTokenPayload,
  secret = SIDECAR_ADMIN_SECRET,
): Promise<string | null> {
  try {
    const res = await fetch(`${sidecarEndpoint.replace(/\/+$/, "")}/api/tokens`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${secret}` },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(4000),
    })
    if (!res.ok) return null
    const data = await res.json()
    return data?.token?.id ?? null
  } catch { return null }
}

/** Revoga o token no Sidecar (unplug / failover). */
export async function sidecarRevokeToken(
  sidecarEndpoint: string,
  sidecarTokenId: string,
  secret = SIDECAR_ADMIN_SECRET,
): Promise<boolean> {
  try {
    const res = await fetch(`${sidecarEndpoint.replace(/\/+$/, "")}/api/tokens/${sidecarTokenId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${secret}` },
      body: JSON.stringify({ action: "revoke" }),
      signal: AbortSignal.timeout(4000),
    })
    return res.ok
  } catch { return false }
}

/** Snapshot de governança do ativo (mesma forma do fluxo humano). Sem orderBy → sem índice composto. */
export async function governanceSnapshotForAsset(db: Firestore, assetId: string) {
  const snap = await db.collection("governance").where("assets", "array-contains", assetId).get().catch(() => null)
  if (!snap || snap.empty) return undefined
  const docs = snap.docs
    .map(d => ({ id: d.id, data: d.data() }))
    .sort((a, b) => Number(b.data.createdAt?.toMillis?.() ?? 0) - Number(a.data.createdAt?.toMillis?.() ?? 0))
  const g = docs[0]
  return {
    policyId: g.id,
    accessTokenTtlMinutes: (g.data.accessTokenTtlMinutes as number | undefined) ?? 60,
    agreementTtlHours: (g.data.agreementTtlHours as number | undefined) ?? 24,
    usagePeriods: (g.data.usagePeriods as string | undefined) ?? "",
    purposeBinding: Boolean(g.data.purposeBinding),
    requiresManualApproval: Boolean(g.data.requiresManualApproval),
    revocationMode: (g.data.revocationMode as string | undefined) ?? "owner-manual",
    conditions: (g.data.policies as string | undefined) ?? "",
  }
}

export type FederationType = "Open" | "Consortium" | "Private"

export function accessModelForType(type: FederationType) {
  return mapLegacyFederationType(type)
}

// ── Segredo por Sidecar (um por organização M2M) ──────────────────────────
// Cada organização tem o seu Sidecar; a nuvem fala com ele usando um segredo
// exclusivo, nunca o SIDECAR_ADMIN_SECRET global. O segredo fica cifrado
// (AES-256-GCM, chave SIDECAR_SECRETS_KEY só na Vercel) porque precisa ser
// reenviado em claro no header Authorization.

export const M2M_ORGS = "m2mOrganizations"
const MIN_SIDECAR_SECRET_LENGTH = 32

export function orgSlugFromParticipant(participantId: string): string {
  if (!participantId.startsWith(M2M_OWNER_PREFIX)) return ""
  return participantId.slice(M2M_OWNER_PREFIX.length).split(":")[0] ?? ""
}

export function generateSidecarSecret(): string {
  return `scs_${randomBytes(24).toString("hex")}`
}

export function isAcceptableSidecarSecret(secret: string): boolean {
  return secret.length >= MIN_SIDECAR_SECRET_LENGTH
}

function secretsKey(): Buffer | null {
  const hex = process.env.SIDECAR_SECRETS_KEY ?? ""
  return /^[0-9a-f]{64}$/i.test(hex) ? Buffer.from(hex, "hex") : null
}

export function encryptSidecarSecret(plain: string): string | null {
  const key = secretsKey()
  if (!key) return null
  const iv = randomBytes(12)
  const cipher = createCipheriv("aes-256-gcm", key, iv)
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()])
  return [iv, cipher.getAuthTag(), enc].map(b => b.toString("base64")).join(".")
}

export function decryptSidecarSecret(payload: string): string | null {
  const key = secretsKey()
  const [iv, tag, enc] = payload.split(".").map(p => Buffer.from(p, "base64"))
  if (!key || !iv || !tag || !enc) return null
  try {
    const decipher = createDecipheriv("aes-256-gcm", key, iv)
    decipher.setAuthTag(tag)
    return Buffer.concat([decipher.update(enc), decipher.final()]).toString("utf8")
  } catch { return null }
}

export function secretsMatch(a: string, b: string): boolean {
  const ba = Buffer.from(a)
  const bb = Buffer.from(b)
  return ba.length === bb.length && timingSafeEqual(ba, bb)
}

export class SidecarSecretUnavailableError extends Error {}

/**
 * Segredo do Sidecar da organização dona do participante; null = organização
 * sem segredo próprio. Lança SidecarSecretUnavailableError se o segredo existe
 * mas não pode ser decifrado — nunca cair no segredo global nesse caso.
 */
export async function sidecarSecretForParticipant(db: Firestore, participantId: string): Promise<string | null> {
  const orgSlug = orgSlugFromParticipant(participantId)
  if (!orgSlug) return null
  const doc = await db.collection(M2M_ORGS).doc(orgSlug).get()
  const enc = doc.exists ? (doc.data()?.sidecarSecretEnc as string | undefined) : undefined
  if (!enc) return null
  const secret = decryptSidecarSecret(enc)
  if (!secret) throw new SidecarSecretUnavailableError("Sidecar secret store unavailable (SIDECAR_SECRETS_KEY)")
  return secret
}

// ── Recursos de dados de um CPS (ex.: 5 catálogos na mesma API) ───────────

export type M2MResource = { id: string; name: string; path: string; description?: string; semanticId?: string }

const RESOURCE_ID_RE = /^[a-z0-9][a-z0-9-]{0,47}$/
const RESERVED_RESOURCE_IDS = new Set(["data", "aas"])
const MAX_RESOURCES = 32

/** Valida e normaliza `resources` do register. Retorna a mensagem de erro (string) ou a lista. */
export function parseResources(input: unknown): M2MResource[] | string {
  if (input === undefined) return []
  if (!Array.isArray(input)) return "resources must be an array"
  if (input.length > MAX_RESOURCES) return `resources: at most ${MAX_RESOURCES} items`
  const seen = new Set<string>()
  const out: M2MResource[] = []
  for (const raw of input) {
    const r = (raw ?? {}) as Record<string, unknown>
    const id = String(r.id ?? "").trim()
    const path = String(r.path ?? "").trim()
    if (!RESOURCE_ID_RE.test(id)) return `resources: invalid id "${id}" (lowercase slug: a-z, 0-9, hyphen)`
    if (RESERVED_RESOURCE_IDS.has(id)) return `resources: id "${id}" is reserved`
    if (seen.has(id)) return `resources: duplicated id "${id}"`
    if (!path.startsWith("/") || path.includes("..") || path.includes("://")) {
      return `resources: path of "${id}" must be an absolute path on the CPS (e.g. /api/v1/operational)`
    }
    seen.add(id)
    out.push({
      id, path,
      name: String(r.name ?? id).trim() || id,
      ...(r.description ? { description: String(r.description) } : {}),
      ...(r.semanticId ? { semanticId: String(r.semanticId) } : {}),
    })
  }
  return out
}

export function resourceUrls(sidecarEndpoint: string, slug: string, resources: M2MResource[]): Record<string, string> {
  const base = `${sidecarEndpoint.replace(/\/+$/, "")}/api/proxy/${slug}`
  return Object.fromEntries(resources.map(r => [r.id, `${base}/${r.id}`]))
}

// ── Oferta de contrato (mesma forma do fluxo humano) ──────────────────────

type GovernanceSnapshot = NonNullable<Awaited<ReturnType<typeof governanceSnapshotForAsset>>>

export function contractOfferPayload(asset: Record<string, unknown>, gov: GovernanceSnapshot | undefined) {
  return {
    purpose: String(asset.purpose ?? ""),
    accessType: String(asset.accessType ?? ""),
    dataFormat: String(asset.dataFormat ?? ""),
    exchangeMode: String(asset.exchangeMode ?? ""),
    semanticId: String(asset.semanticId ?? ""),
    aasId: String(asset.aasId ?? ""),
    irdi: String(asset.irdi ?? ""),
    governancePolicyId: gov?.policyId ?? "",
    governancePolicies: gov?.conditions ?? "",
    usagePeriods: gov?.usagePeriods ?? "",
    revocation: gov?.revocationMode ?? "ttl-expiry",
    purposeBinding: Boolean(gov?.purposeBinding),
    requiresManualApproval: Boolean(gov?.requiresManualApproval),
    validForHours: gov?.agreementTtlHours ?? 24,
    accessTokenTtlMinutes: gov?.accessTokenTtlMinutes ?? 30,
    revocable: (gov?.revocationMode ?? "ttl-expiry") !== "time-expiry",
    resources: ((asset.resources as M2MResource[] | undefined) ?? []).map(r => ({ id: r.id, name: r.name })),
  }
}

/** Publica (ou atualiza) a oferta de contrato padrão do ativo. Retorna o id da oferta. */
export async function upsertContractOffer(
  db: Firestore,
  assetId: string,
  asset: Record<string, unknown>,
  gov: GovernanceSnapshot | undefined,
  timestamp: unknown,
): Promise<string> {
  const fields = {
    scope: "asset", scopeId: assetId, assetId,
    federationId: String(asset.federationId ?? ""),
    ownerId: String(asset.ownerId ?? ""), ownerName: String(asset.ownerName ?? ""),
    governancePolicyId: gov?.policyId ?? "",
    policyType: "contract",
    policyPayload: contractOfferPayload(asset, gov),
    visibility: "members", status: "published", version: 1, source: "m2m",
    updatedAt: timestamp,
  }
  const snap = await db.collection("contractOffers").where("assetId", "==", assetId).where("status", "==", "published").limit(1).get()
  if (!snap.empty) {
    const current = snap.docs[0]
    await current.ref.set({ ...fields, version: Number(current.data()?.version ?? 1) }, { merge: true })
    return current.id
  }
  const ref = await db.collection("contractOffers").add({ ...fields, createdAt: timestamp })
  return ref.id
}

// ── Autenticação de participante e administração ─────────────────────────

/**
 * O segredo enviado prova que o chamador é da organização do participante — e o
 * participante precisa ter sido registrado via M2M (não basta o prefixo do id).
 */
export async function participantSecretMatches(db: Firestore, participantId: string, provided: string): Promise<boolean> {
  if (!provided || !participantId) return false
  const registered = await db.collection("connectorProfiles")
    .where("participantId", "==", participantId).where("source", "==", "m2m").limit(1).get()
  if (registered.empty) return false
  const secret = await sidecarSecretForParticipant(db, participantId)
  return Boolean(secret && secretsMatch(provided, secret))
}

/**
 * Algum conector, ativo ou federação (de qualquer origem, inclusive o fluxo
 * humano) já usa ids urn:dataspace:participant:{org}:* — então a organização
 * não pode ser assumida pelo primeiro register.
 */
export async function orgNamespaceInUse(db: Firestore, organization: string): Promise<boolean> {
  const prefix = `${M2M_OWNER_PREFIX}${slugify(organization)}:`
  const [connectors, assets, federations] = await Promise.all([
    db.collection("connectorProfiles").get(),
    db.collection("assets").get(),
    db.collection("federations").get(),
  ])
  return connectors.docs.some(d => String(d.data()?.participantId ?? "").startsWith(prefix))
    || [...assets.docs, ...federations.docs].some(d => String(d.data()?.ownerId ?? "").startsWith(prefix))
}

/** Conectores M2M de uma organização (participantId urn:dataspace:participant:{org}:*). */
export async function m2mConnectorsOfOrg(db: Firestore, organization: string, onlySlug = "") {
  const prefix = `${M2M_OWNER_PREFIX}${slugify(organization)}:`
  const only = onlySlug ? participantIdFor(organization, slugify(onlySlug)) : ""
  const snap = await db.collection("connectorProfiles").where("source", "==", "m2m").get()
  return snap.docs.filter(d => {
    const pid = String(d.data()?.participantId ?? "")
    return only ? pid === only : pid.startsWith(prefix)
  })
}

/**
 * Operações de administrador (definir/resetar o segredo de uma organização).
 * Exige M2M_ADMIN_KEY no ambiente e o header X-M2M-Admin-Key igual; sem a
 * variável, a operação fica bloqueada. Retorna [mensagem, status] ou null.
 */
export function adminKeyError(request: Request): [string, number] | null {
  const required = process.env.M2M_ADMIN_KEY
  if (!required) return ["Admin operations are disabled (M2M_ADMIN_KEY not configured).", 503]
  const provided = request.headers.get("x-m2m-admin-key") ?? ""
  return provided && secretsMatch(provided, required) ? null : ["Missing or invalid X-M2M-Admin-Key header.", 401]
}

/** Grava a adesão do participante à federação (ativa ou pendente). */
export async function upsertMembership(
  db: Firestore,
  m: { federationId: string; federationName: string; participantId: string; participantName: string; admissionMode: string; ownerId: string; status: "active" | "pending-approval" },
  timestamp: unknown,
): Promise<{ id: string; status: string; created: boolean }> {
  const existing = await db.collection("federationMemberships")
    .where("federationId", "==", m.federationId).where("participantId", "==", m.participantId).limit(1).get()
  if (!existing.empty) {
    return { id: existing.docs[0].id, status: String(existing.docs[0].data()?.status ?? ""), created: false }
  }
  const ref = await db.collection("federationMemberships").add({
    federationId: m.federationId, federationName: m.federationName,
    participantId: m.participantId, requesterId: m.participantId, requesterName: m.participantName,
    membershipType: m.admissionMode, status: m.status,
    requestedAt: timestamp, ...(m.status === "active" ? { approvedAt: timestamp } : {}),
    ownerId: m.ownerId, source: "m2m", createdAt: timestamp, updatedAt: timestamp,
  })
  return { id: ref.id, status: m.status, created: true }
}
