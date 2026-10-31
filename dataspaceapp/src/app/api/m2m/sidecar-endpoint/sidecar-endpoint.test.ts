import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { store } from "@/test-utils/firestore-shim"
import { encryptSidecarSecret } from "@/lib/m2m"

vi.mock("@/lib/firebase-admin", () => ({ getAdminApp: () => ({}) }))
vi.mock("firebase-admin/firestore", async () => {
  const { store, fieldValueShim } = await import("@/test-utils/firestore-shim")
  return { getFirestore: () => store, FieldValue: fieldValueShim }
})

const OLD = "https://old-tunnel.trycloudflare.com"
const NEW = "https://new-tunnel.trycloudflare.com"
const LAI1 = "urn:dataspace:participant:ifsc-gaspar:cpslai1"
const LAI2 = "urn:dataspace:participant:ifsc-gaspar:cpslai2"
const OTHER = "urn:dataspace:participant:plant1:press"
const ORG_SECRET = "scs_ifsc_gaspar_sidecar_secret_0123456789"

process.env.SIDECAR_SECRETS_KEY = "a".repeat(64)

async function seed(col: string, id: string, data: Record<string, unknown>) {
  await store.collection(col).doc(id).set(data)
}
function get(col: string, id: string) {
  return store.docs(col).get(id)
}
function req(body: unknown, headers: Record<string, string> = { "X-Sidecar-Secret": ORG_SECRET }) {
  return new Request("http://test/api/m2m/sidecar-endpoint", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json", ...headers },
  })
}

let sidecarCalls: Array<{ url: string; auth: string; body: Record<string, unknown> }>
let sidecarStatus: number

beforeEach(async () => {
  for (const col of ["m2mOrganizations", "connectorProfiles", "federations", "assets", "accessTokens"]) store.docs(col).clear()

  await seed("m2mOrganizations", "ifsc-gaspar", { organization: "IFSC-GASPAR", sidecarSecretEnc: encryptSidecarSecret(ORG_SECRET) })
  await seed("connectorProfiles", "c1", { participantId: LAI1, source: "m2m", sidecarEndpoint: OLD })
  await seed("connectorProfiles", "c2", { participantId: LAI2, source: "m2m", sidecarEndpoint: OLD })
  await seed("connectorProfiles", "c3", { participantId: OTHER, source: "m2m", sidecarEndpoint: OLD })
  await seed("federations", "f1", { ownerId: LAI1, name: "ifsc", sidecarEndpoint: OLD })
  await seed("assets", "a1", {
    ownerId: LAI1, ownerName: "IFSC-GASPAR", name: "CPS-LAI-01", equipmentSlug: "cpslai1",
    apiEndpoint: "http://127.0.0.1:3101/api/data", irdi: "0173-1#01-X#001", sidecarEndpoint: OLD,
    resources: [{ id: "operational", name: "Operational Data", path: "/api/v1/operational" }],
  })
  await seed("assets", "a2", {
    ownerId: LAI2, ownerName: "IFSC-GASPAR", name: "CPS-LAI-02", equipmentSlug: "cpslai2",
    apiEndpoint: "http://127.0.0.1:3102/api/data", sidecarEndpoint: OLD,
  })
  await seed("assets", "a3", {
    ownerId: OTHER, name: "Press", equipmentSlug: "press",
    apiEndpoint: "http://10.0.0.8:3002/api/data", sidecarEndpoint: OLD,
  })
  await seed("accessTokens", "t1", { providerId: LAI1, status: "active", sidecarEndpoint: OLD })
  await seed("accessTokens", "t2", { providerId: LAI1, status: "revoked", sidecarEndpoint: OLD })

  sidecarCalls = []
  sidecarStatus = 200
  vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit) => {
    const headers = init.headers as Record<string, string>
    sidecarCalls.push({ url, auth: headers.Authorization, body: JSON.parse(String(init.body)) })
    return new Response(JSON.stringify({ ok: sidecarStatus === 200 }), { status: sidecarStatus })
  }))
})

afterEach(() => {
  vi.unstubAllGlobals()
  delete process.env.M2M_API_KEY
})

describe("POST /api/m2m/sidecar-endpoint", () => {
  it("points every M2M participant of the organization to the new sidecar and re-registers its CPS", async () => {
    const { POST } = await import("./route")
    const res = await POST(req({ organization: "ifsc-gaspar", sidecarEndpoint: `${NEW}/` }))
    const j = await res.json()

    expect(res.status).toBe(200)
    expect(j.sidecarEndpoint).toBe(NEW)
    expect(j.updated).toEqual({ connectors: 2, federations: 1, assets: 2, accessTokens: 1 })
    expect(j.sidecarRegistered).toBe(true)

    expect(get("connectorProfiles", "c1")?.sidecarEndpoint).toBe(NEW)
    expect(get("federations", "f1")?.sidecarEndpoint).toBe(NEW)
    expect(get("assets", "a2")?.sidecarEndpoint).toBe(NEW)
    expect(get("accessTokens", "t1")?.sidecarEndpoint).toBe(NEW)
    expect(get("accessTokens", "t2")?.sidecarEndpoint).toBe(OLD)

    // outra organização não é tocada
    expect(get("connectorProfiles", "c3")?.sidecarEndpoint).toBe(OLD)
    expect(get("assets", "a3")?.sidecarEndpoint).toBe(OLD)

    expect(sidecarCalls.map(c => c.url)).toEqual([`${NEW}/api/equipment`, `${NEW}/api/equipment`])
    expect(sidecarCalls[0].body).toMatchObject({
      id: "cpslai1", name: "CPS-LAI-01", baseUrl: "http://127.0.0.1:3101",
      eclassIrdi: "0173-1#01-X#001", dataOwnerId: LAI1, dataOwnerName: "IFSC-GASPAR",
      resources: [{ id: "operational", name: "Operational Data", path: "/api/v1/operational" }],
    })
    expect(get("m2mOrganizations", "ifsc-gaspar")?.sidecarEndpoint).toBe(NEW)
  })

  it("talks to the new sidecar with the organization secret, never the global one", async () => {
    const { POST } = await import("./route")
    await POST(req({ organization: "IFSC-GASPAR", sidecarEndpoint: NEW }))
    expect(sidecarCalls.length).toBeGreaterThan(0)
    expect(sidecarCalls.every(c => c.auth === `Bearer ${ORG_SECRET}`)).toBe(true)
  })

  it("refuses without the organization sidecar secret and changes nothing", async () => {
    const { POST } = await import("./route")
    expect((await POST(req({ organization: "IFSC-GASPAR", sidecarEndpoint: NEW }, {}))).status).toBe(403)
    expect((await POST(req({ organization: "IFSC-GASPAR", sidecarEndpoint: NEW }, { "X-Sidecar-Secret": "wrong" }))).status).toBe(403)
    expect(get("assets", "a1")?.sidecarEndpoint).toBe(OLD)
    expect(sidecarCalls).toHaveLength(0)
  })

  it("returns 404 when the organization never got a sidecar secret", async () => {
    const { POST } = await import("./route")
    const res = await POST(req({ organization: "plant1", sidecarEndpoint: NEW }))
    expect(res.status).toBe(404)
    expect(get("assets", "a3")?.sidecarEndpoint).toBe(OLD)
  })

  it("matches the organization case-insensitively, as the register does", async () => {
    const { POST } = await import("./route")
    const res = await POST(req({ organization: "IFSC-GASPAR", sidecarEndpoint: NEW }))
    expect((await res.json()).updated.connectors).toBe(2)
  })

  it("limits the update to one CPS when equipmentSlug is given", async () => {
    const { POST } = await import("./route")
    const res = await POST(req({ organization: "IFSC-GASPAR", sidecarEndpoint: NEW, equipmentSlug: "cpslai2" }))
    const j = await res.json()

    expect(j.updated).toEqual({ connectors: 1, federations: 0, assets: 1, accessTokens: 0 })
    expect(get("assets", "a2")?.sidecarEndpoint).toBe(NEW)
    expect(get("assets", "a1")?.sidecarEndpoint).toBe(OLD)
  })

  it("reports sidecarRegistered=false when the new sidecar rejects the admin secret", async () => {
    sidecarStatus = 401
    const { POST } = await import("./route")
    const j = await (await POST(req({ organization: "IFSC-GASPAR", sidecarEndpoint: NEW }))).json()

    expect(j.sidecarRegistered).toBe(false)
    expect(j.equipment.every((e: { sidecarRegistered: boolean }) => !e.sidecarRegistered)).toBe(true)
  })

  it("returns 404 for an organization without M2M participants", async () => {
    const { POST } = await import("./route")
    const res = await POST(req({ organization: "unknown-org", sidecarEndpoint: NEW }))
    expect(res.status).toBe(404)
    expect(sidecarCalls).toHaveLength(0)
  })

  it("rejects missing fields and invalid URLs", async () => {
    const { POST } = await import("./route")
    expect((await POST(req({ sidecarEndpoint: NEW }))).status).toBe(400)
    expect((await POST(req({ organization: "IFSC-GASPAR" }))).status).toBe(400)
    expect((await POST(req({ organization: "IFSC-GASPAR", sidecarEndpoint: "not-a-url" }))).status).toBe(400)
  })

  it("requires X-M2M-Key when M2M_API_KEY is configured", async () => {
    process.env.M2M_API_KEY = "k1"
    const { POST } = await import("./route")
    expect((await POST(req({ organization: "IFSC-GASPAR", sidecarEndpoint: NEW }))).status).toBe(401)
    expect((await POST(req({ organization: "IFSC-GASPAR", sidecarEndpoint: NEW }, { "X-M2M-Key": "k1", "X-Sidecar-Secret": ORG_SECRET }))).status).toBe(200)
  })
})
