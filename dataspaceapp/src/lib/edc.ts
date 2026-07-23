/**
 * EDC — adaptador para a camada INTERorganizacional via Eclipse Dataspace
 * Connector (EDC / Dataspace Protocol).
 *
 * O dataspace intra permanece LEVE e SOBERANO: não reimplementa o DSP nem a
 * identidade inter-org (isso é do EDC). Ele apenas se REGISTRA no EDC da
 * organização como fonte de dados, gerando os artefatos do Management API v3:
 *   - Asset (dataAddress HttpData → ponte /api/edc/data/{assetId})
 *   - PolicyDefinition (ODRL mínima e interoperável)
 *   - ContractDefinition (liga asset ↔ política)
 *
 * A governança intra (TTL, finalidade, revogação) viaja como METADADOS do asset;
 * o enforcement real continua no Sidecar PEP intra. Ou seja: o contrato inter é
 * negociado no EDC, mas a soberania de uso fica na borda.
 */

import { getFirestore, type Firestore } from "firebase-admin/firestore"
import { getAdminApp } from "@/lib/firebase-admin"

export const EDC_VOCAB = "https://w3id.org/edc/v0.0.1/ns/"
export const ODRL_NS = "http://www.w3.org/ns/odrl/2/"

export const EDC_MANAGEMENT_URL = process.env.EDC_MANAGEMENT_URL ?? ""       // ex.: http://localhost:19193/management
export const EDC_MANAGEMENT_API_KEY = process.env.EDC_MANAGEMENT_API_KEY ?? "" // X-Api-Key
export const EDC_DATA_SECRET = process.env.EDC_DATA_SECRET ?? ""              // segredo que o data plane do EDC apresenta à ponte

export function getDb(): Firestore | null {
  const app = getAdminApp()
  return app ? getFirestore(app) : null
}

export type IntraAsset = {
  id: string
  name?: string
  description?: string
  assetType?: string
  irdi?: string
  aasId?: string
  equipmentSlug?: string
  sidecarEndpoint?: string
  federationId?: string
  federationName?: string
  capabilities?: string[]
  ownerName?: string
}

export type IntraGovernance = {
  policyId?: string
  accessTokenTtlMinutes?: number
  purposeBinding?: boolean
  requiresManualApproval?: boolean
  revocationMode?: string
  conditions?: string
}

const policyIdFor = (assetId: string) => `policy-${assetId}`
const contractDefIdFor = (assetId: string) => `cdef-${assetId}`

/** Asset EDC (Management API v3) com dataAddress apontando para a ponte de dados. */
export function buildEdcAsset(asset: IntraAsset, bridgeBaseUrl: string, gov?: IntraGovernance) {
  const dataAddress: Record<string, unknown> = {
    "@type": "DataAddress",
    type: "HttpData",
    name: `intra:${asset.equipmentSlug ?? asset.id}`,
    baseUrl: `${bridgeBaseUrl.replace(/\/+$/, "")}/api/edc/data/${asset.id}`,
    proxyPath: "false",
    proxyQueryParams: "true",
  }
  // segredo que o EDC repassa à ponte (autenticação do data plane → dataspace)
  if (EDC_DATA_SECRET) dataAddress["header:X-EDC-Data-Secret"] = EDC_DATA_SECRET

  return {
    "@context": { "@vocab": EDC_VOCAB },
    "@id": asset.id,
    properties: {
      name: asset.name ?? asset.id,
      description: asset.description ?? "",
      contenttype: "application/json",
      // metadados intra (semântica AAS/ECLASS + governança informacional)
      "intra:equipmentType": asset.assetType ?? "",
      "intra:eclassIrdi": asset.irdi ?? "",
      "intra:aasId": asset.aasId ?? "",
      "intra:capabilities": (asset.capabilities ?? []).join(","),
      "intra:federation": asset.federationName ?? "",
      "intra:owner": asset.ownerName ?? "",
      "intra:governance": gov
        ? `ttlMin=${gov.accessTokenTtlMinutes ?? ""};purposeBinding=${Boolean(gov.purposeBinding)};revocation=${gov.revocationMode ?? ""}`
        : "enforced-at-intra-PEP",
      "intra:enforcement": "usage control enforced at intra Sidecar PEP (edge)",
    },
    dataAddress,
  }
}

/** PolicyDefinition ODRL mínima e interoperável (enforcement fica no PEP intra). */
export function buildEdcPolicy(asset: IntraAsset, gov?: IntraGovernance) {
  const permission: Record<string, unknown> = { action: "use" }
  // finalidade declarada como constraint informativa (o EDC negocia; o PEP impõe)
  if (gov?.purposeBinding) {
    permission.constraint = [{
      leftOperand: "purpose",
      operator: "eq",
      rightOperand: gov.conditions || "declared-at-negotiation",
    }]
  }
  return {
    "@context": { "@vocab": EDC_VOCAB, odrl: ODRL_NS },
    "@id": policyIdFor(asset.id),
    policy: {
      "@context": "http://www.w3.org/ns/odrl.jsonld",
      "@type": "Set",
      permission: [permission],
      prohibition: [],
      obligation: [],
    },
  }
}

/** ContractDefinition ligando o asset à sua política (access + contract). */
export function buildEdcContractDefinition(asset: IntraAsset) {
  return {
    "@context": { "@vocab": EDC_VOCAB },
    "@id": contractDefIdFor(asset.id),
    accessPolicyId: policyIdFor(asset.id),
    contractPolicyId: policyIdFor(asset.id),
    assetsSelector: [{
      "@type": "Criterion",
      operandLeft: `${EDC_VOCAB}id`,
      operator: "=",
      operandRight: asset.id,
    }],
  }
}

export function buildEdcBundle(asset: IntraAsset, bridgeBaseUrl: string, gov?: IntraGovernance) {
  return {
    asset: buildEdcAsset(asset, bridgeBaseUrl, gov),
    policy: buildEdcPolicy(asset, gov),
    contractDefinition: buildEdcContractDefinition(asset),
  }
}

/** Empurra um bundle ao EDC Management API v3. Retorna status por recurso. */
export async function pushBundleToEdc(bundle: ReturnType<typeof buildEdcBundle>) {
  const base = EDC_MANAGEMENT_URL.replace(/\/+$/, "")
  const headers = { "Content-Type": "application/json", ...(EDC_MANAGEMENT_API_KEY ? { "X-Api-Key": EDC_MANAGEMENT_API_KEY } : {}) }
  const steps: Array<[string, string, unknown]> = [
    ["asset", `${base}/v3/assets`, bundle.asset],
    ["policy", `${base}/v3/policydefinitions`, bundle.policy],
    ["contractDefinition", `${base}/v3/contractdefinitions`, bundle.contractDefinition],
  ]
  const results: Record<string, { ok: boolean; status: number; body?: unknown }> = {}
  for (const [key, url, payload] of steps) {
    try {
      const res = await fetch(url, { method: "POST", headers, body: JSON.stringify(payload), signal: AbortSignal.timeout(6000) })
      const body = await res.json().catch(() => ({}))
      results[key] = { ok: res.ok, status: res.status, body }
    } catch (e) {
      results[key] = { ok: false, status: 0, body: { error: e instanceof Error ? e.message : String(e) } }
    }
  }
  return results
}

/** Snapshot de governança do ativo (sem orderBy → sem índice composto). */
export async function governanceForAsset(db: Firestore, assetId: string): Promise<IntraGovernance | undefined> {
  const snap = await db.collection("governance").where("assets", "array-contains", assetId).get().catch(() => null)
  if (!snap || snap.empty) return undefined
  const docs = snap.docs.map(d => ({ id: d.id, data: d.data() }))
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

export function assetFromDoc(id: string, d: Record<string, unknown>): IntraAsset {
  return {
    id,
    name: d.name as string | undefined,
    description: d.description as string | undefined,
    assetType: d.assetType as string | undefined,
    irdi: d.irdi as string | undefined,
    aasId: d.aasId as string | undefined,
    equipmentSlug: d.equipmentSlug as string | undefined,
    sidecarEndpoint: d.sidecarEndpoint as string | undefined,
    federationId: d.federationId as string | undefined,
    federationName: d.federationName as string | undefined,
    capabilities: Array.isArray(d.capabilities) ? (d.capabilities as string[]) : undefined,
    ownerName: d.ownerName as string | undefined,
  }
}
