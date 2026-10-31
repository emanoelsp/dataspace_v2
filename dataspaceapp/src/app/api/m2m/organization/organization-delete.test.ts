import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { store } from "@/test-utils/firestore-shim"
import { encryptSidecarSecret } from "@/lib/m2m"

vi.mock("@/lib/firebase-admin", () => ({ getAdminApp: () => ({}) }))
vi.mock("firebase-admin/firestore", async () => {
  const { store, fieldValueShim } = await import("@/test-utils/firestore-shim")
  return { getFirestore: () => store, FieldValue: fieldValueShim }
})

const SIDECAR = "https://lab.trycloudflare.com"
const OTHER_SIDECAR = "https://plant1.trycloudflare.com"
const LAI1 = "urn:dataspace:participant:ifsc-gaspar:cpslai1"
const LAI2 = "urn:dataspace:participant:ifsc-gaspar:cpslai2"
const OTHER = "urn:dataspace:participant:plant1:press"
const ORG_SECRET = "scs_ifsc_gaspar_sidecar_secret_0123456789"
const OTHER_SECRET = "scs_plant1_sidecar_secret_0123456789abcdef"

process.env.SIDECAR_SECRETS_KEY = "b".repeat(64)

const COLS = [
  "m2mOrganizations", "connectorProfiles", "assets", "federations", "compliance", "governance",
  "contractOffers", "federationMemberships", "connectorConnections", "contractAgreements",
  "credentialGrants", "accessTokens", "accessRequests",
]

async function seed(col: string, id: string, data: Record<string, unknown>) {
  await store.collection(col).doc(id).set({ source: "m2m", ...data })
}
const has = (col: string, id: string) => store.docs(col).has(id)

function del(query: string, headers: Record<string, string> = { "X-Sidecar-Secret": ORG_SECRET }) {
  return new Request(`http://test/api/m2m/organization?${query}`, { method: "DELETE", headers })
}

let sidecarCalls: Array<{ url: string; auth: string }>

beforeEach(async () => {
  for (const col of COLS) store.docs(col).clear()

  await seed("m2mOrganizations", "ifsc-gaspar", { organization: "IFSC-GASPAR", sidecarSecretEnc: encryptSidecarSecret(ORG_SECRET) })
  await seed("m2mOrganizations", "plant1", { organization: "plant1", sidecarSecretEnc: encryptSidecarSecret(OTHER_SECRET) })

  // organização apagada: dois CPS, federação própria, adesões e um contrato interno
  await seed("connectorProfiles", "c1", { participantId: LAI1 })
  await seed("connectorProfiles", "c2", { participantId: LAI2 })
  await seed("assets", "a1", { ownerId: LAI1, federationId: "f1" })
  await seed("assets", "a2", { ownerId: LAI2, federationId: "f1" })
  await seed("federations", "f1", { ownerId: LAI1, name: "ifsc" })
  await seed("compliance", "co1", { ownerId: LAI1, federationId: "f1" })
  await seed("governance", "g1", { ownerId: LAI1 })
  await seed("contractOffers", "o1", { ownerId: LAI1, assetId: "a1" })
  await seed("federationMemberships", "m1", { participantId: LAI1, federationId: "f1", ownerId: LAI1 })
  await seed("federationMemberships", "m-other-in-f1", { participantId: OTHER, federationId: "f1", ownerId: LAI1 })
  await seed("contractAgreements", "ag-internal", { providerParticipantId: LAI1, consumerParticipantId: LAI2 })
  await seed("accessTokens", "t-internal", {
    providerId: LAI1, requesterId: LAI2, status: "active", sidecarTokenId: "sc-1", sidecarEndpoint: SIDECAR,
  })

  // contrato com outra organização: histórico dela, fica (token revogado)
  await seed("contractAgreements", "ag-shared", { providerParticipantId: OTHER, consumerParticipantId: LAI1 })
  await seed("accessTokens", "t-shared", {
    providerId: OTHER, requesterId: LAI1, status: "active", sidecarTokenId: "sc-2", sidecarEndpoint: OTHER_SIDECAR,
  })

  // de outras organizações / do fluxo humano: intocados
  await seed("connectorProfiles", "c-other", { participantId: OTHER })
  await seed("assets", "a-other", { ownerId: OTHER })
  await seed("connectorProfiles", "c-ui", { participantId: "urn:dataspace:participant:ifsc-gaspar:ui-made", source: "ui" })

  sidecarCalls = []
  vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit) => {
    sidecarCalls.push({ url, auth: (init.headers as Record<string, string>).Authorization })
    return new Response("{}", { status: 200 })
  }))
})

afterEach(() => {
  vi.unstubAllGlobals()
  delete process.env.M2M_API_KEY
})

describe("DELETE /api/m2m/organization", () => {
  it("requires the M2M key when configured", async () => {
    process.env.M2M_API_KEY = "m2m-key"
    const { DELETE } = await import("./route")
    expect((await DELETE(del("organization=IFSC-GASPAR"))).status).toBe(401)
    expect(has("assets", "a1")).toBe(true)
  })

  it("rejects a wrong sidecar secret and deletes nothing", async () => {
    const { DELETE } = await import("./route")
    expect((await DELETE(del("organization=IFSC-GASPAR", { "X-Sidecar-Secret": OTHER_SECRET }))).status).toBe(403)
    expect((await DELETE(del("organization=IFSC-GASPAR", {}))).status).toBe(403)
    expect(has("assets", "a1")).toBe(true)
    expect(has("m2mOrganizations", "ifsc-gaspar")).toBe(true)
  })

  it("returns 404 for an organization without a sidecar secret", async () => {
    const { DELETE } = await import("./route")
    expect((await DELETE(del("organization=ghost-org"))).status).toBe(404)
  })

  it("dryRun counts what would be deleted without deleting", async () => {
    const { DELETE } = await import("./route")
    const res = await DELETE(del("organization=IFSC-GASPAR&dryRun=true"))
    const j = await res.json()
    expect(res.status).toBe(200)
    expect(j.dryRun).toBe(true)
    expect(j.wouldDelete).toMatchObject({ connectorProfiles: 2, assets: 2, federations: 1, federationMemberships: 2, accessTokens: 1 })
    expect(j.keptShared).toMatchObject({ contractAgreements: 1, accessTokens: 1 })
    expect(has("assets", "a1")).toBe(true)
    expect(sidecarCalls).toHaveLength(0)
  })

  it("deletes everything the organization registered and leaves other organizations alone", async () => {
    const { DELETE } = await import("./route")
    const res = await DELETE(del("organization=ifsc-gaspar"))
    const j = await res.json()
    expect(res.status).toBe(200)

    for (const [col, id] of [
      ["connectorProfiles", "c1"], ["connectorProfiles", "c2"], ["assets", "a1"], ["assets", "a2"],
      ["federations", "f1"], ["compliance", "co1"], ["governance", "g1"], ["contractOffers", "o1"],
      ["federationMemberships", "m1"], ["federationMemberships", "m-other-in-f1"],
      ["contractAgreements", "ag-internal"], ["accessTokens", "t-internal"], ["m2mOrganizations", "ifsc-gaspar"],
    ]) expect(has(col, id), `${col}/${id}`).toBe(false)

    for (const [col, id] of [
      ["connectorProfiles", "c-other"], ["assets", "a-other"], ["connectorProfiles", "c-ui"],
      ["m2mOrganizations", "plant1"], ["contractAgreements", "ag-shared"], ["accessTokens", "t-shared"],
    ]) expect(has(col, id), `${col}/${id}`).toBe(true)

    expect(store.docs("accessTokens").get("t-shared")?.status).toBe("revoked")
    expect(j.revokedTokens).toBe(2)
    // cada token revogado no Sidecar do provedor, com o segredo do provedor
    expect(sidecarCalls).toEqual(expect.arrayContaining([
      { url: `${SIDECAR}/api/tokens/sc-1`, auth: `Bearer ${ORG_SECRET}` },
      { url: `${OTHER_SIDECAR}/api/tokens/sc-2`, auth: `Bearer ${OTHER_SECRET}` },
    ]))
  })

  it("keeps an own federation that holds another organization's asset", async () => {
    await seed("assets", "a-foreign-in-f1", { ownerId: OTHER, federationId: "f1" })
    const { DELETE } = await import("./route")
    const j = await (await DELETE(del("organization=IFSC-GASPAR"))).json()
    expect(has("federations", "f1")).toBe(true)
    expect(has("compliance", "co1")).toBe(true)
    expect(has("federationMemberships", "m-other-in-f1")).toBe(true)
    expect(j.keptFederations).toEqual([{ id: "f1", name: "ifsc", foreignAssets: 1 }])
    expect(has("assets", "a1")).toBe(false)
  })

  it("frees the organization name: the next register claims it with a new secret", async () => {
    const { DELETE } = await import("./route")
    await DELETE(del("organization=IFSC-GASPAR"))
    store.docs("connectorProfiles").delete("c-ui") // conector do fluxo humano no mesmo prefixo bloquearia o register
    const { POST } = await import("../register/route")
    const res = await POST(new Request("http://test/api/m2m/register", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Sidecar-Secret": "scs_brand_new_secret_0123456789abcdef" },
      body: JSON.stringify({
        name: "CPS-LAI-01", baseUrl: "http://127.0.0.1:3101", sidecarEndpoint: SIDECAR,
        organization: "IFSC-GASPAR", equipmentSlug: "cpslai1", federation: { create: { name: "ifsc", type: "Open" } },
      }),
    }))
    expect(res.status).toBe(200)
    expect(has("m2mOrganizations", "ifsc-gaspar")).toBe(true)
  })
})
