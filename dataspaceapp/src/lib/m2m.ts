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

import { randomBytes } from "node:crypto"
import { getFirestore, type Firestore } from "firebase-admin/firestore"
import { getAdminApp } from "@/lib/firebase-admin"
import { mapLegacyFederationType } from "@/lib/intra-dataspace"

export const SIDECAR_ADMIN_SECRET = process.env.SIDECAR_ADMIN_SECRET ?? "admin"
export const M2M_OWNER_PREFIX = "urn:dataspace:participant:"

export const M2M_CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-M2M-Key",
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
  eq: { id: string; name: string; baseUrl: string; eclassIrdi?: string; dataOwnerId?: string; dataOwnerName?: string },
): Promise<boolean> {
  try {
    const res = await fetch(`${sidecarEndpoint.replace(/\/+$/, "")}/api/equipment`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${SIDECAR_ADMIN_SECRET}` },
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
export async function sidecarPushToken(sidecarEndpoint: string, payload: SidecarTokenPayload): Promise<string | null> {
  try {
    const res = await fetch(`${sidecarEndpoint.replace(/\/+$/, "")}/api/tokens`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${SIDECAR_ADMIN_SECRET}` },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(4000),
    })
    if (!res.ok) return null
    const data = await res.json()
    return data?.token?.id ?? null
  } catch { return null }
}

/** Revoga o token no Sidecar (unplug / failover). */
export async function sidecarRevokeToken(sidecarEndpoint: string, sidecarTokenId: string): Promise<boolean> {
  try {
    const res = await fetch(`${sidecarEndpoint.replace(/\/+$/, "")}/api/tokens/${sidecarTokenId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${SIDECAR_ADMIN_SECRET}` },
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
