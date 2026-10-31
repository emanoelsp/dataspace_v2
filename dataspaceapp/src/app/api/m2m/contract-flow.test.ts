/**
 * M2M com segredo por organização, recursos e negociação completa:
 * register → offer → negotiate → agreement. Firestore em memória; o Sidecar
 * e o CPS são simulados por um fetch falso que registra as chamadas.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"
import { store } from "@/test-utils/firestore-shim"

vi.mock("@/lib/firebase-admin", () => ({ getAdminApp: () => ({}) }))
vi.mock("firebase-admin/firestore", async () => {
  const { store, fieldValueShim } = await import("@/test-utils/firestore-shim")
  return { getFirestore: () => store, FieldValue: fieldValueShim }
})

const SIDECAR = "https://lab-sidecar.trycloudflare.com"
const CONSUMER = "urn:dataspace:participant:ifsc-gaspar:acsm"
const OWN_SECRET = "scs_marcos_chosen_secret_0123456789abcdef"
const RESOURCES = [
  { id: "operational", name: "Operational Data", path: "/api/v1/operational" },
  { id: "cognitive", name: "Cognitive Knowledge", path: "/api/v1/cognitive" },
  { id: "hcm-episodes", name: "HCM Episodes", path: "/api/v1/hcm/episodes" },
]

let sidecarCalls: Array<{ url: string; auth: string; body: Record<string, unknown> }>

function post(body: unknown, headers: Record<string, string> = {}) {
  return new Request("http://test/api", {
    method: "POST", body: JSON.stringify(body),
    headers: { "Content-Type": "application/json", ...headers },
  })
}

function registerBody(overrides: Record<string, unknown> = {}) {
  return {
    name: "CPS-LAI-01", baseUrl: "http://127.0.0.1:3101", sidecarEndpoint: SIDECAR,
    organization: "IFSC-GASPAR", equipmentSlug: "cpslai1", assetType: "Conveyor",
    federation: { create: { name: "ifsc", type: "Open" } },
    governance: { accessTokenTtlMinutes: 30, requiresManualApproval: false },
    resources: RESOURCES,
    ...overrides,
  }
}

async function register(overrides: Record<string, unknown> = {}, headers: Record<string, string> = {}) {
  const { POST } = await import("./register/route")
  const res = await POST(post(registerBody(overrides), headers))
  return { res, json: await res.json() }
}

async function negotiate(body: Record<string, unknown>) {
  const { POST } = await import("./negotiate/route")
  const res = await POST(post({ consumerParticipantId: CONSUMER, consumerName: "acsm", ...body }))
  return { res, json: await res.json() }
}

beforeEach(() => {
  store.clear()
  process.env.SIDECAR_SECRETS_KEY = "b".repeat(64)
  sidecarCalls = []
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    if (!url.startsWith(SIDECAR)) return new Response("not found", { status: 404 }) // colheita no CPS
    const headers = (init?.headers ?? {}) as Record<string, string>
    sidecarCalls.push({ url, auth: headers.Authorization, body: JSON.parse(String(init?.body ?? "{}")) })
    if (url.endsWith("/api/tokens")) return Response.json({ token: { id: `sc_tok_${sidecarCalls.length}` } }, { status: 201 })
    return Response.json({ ok: true })
  }))
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("register — sidecar secret per organization", () => {
  it("issues a secret once on the first register and uses it with the sidecar", async () => {
    const { res, json } = await register()
    expect(res.status).toBe(200)
    expect(json.sidecarSecret).toMatch(/^scs_[0-9a-f]{48}$/)
    expect(json.sidecarRegistered).toBe(true)
    expect(sidecarCalls[0].auth).toBe(`Bearer ${json.sidecarSecret}`)
    expect(store.docs("m2mOrganizations").get("ifsc-gaspar")?.sidecarSecretEnc).not.toContain(json.sidecarSecret)
  })

  it("adopts the secret sent on the first register and never echoes it", async () => {
    const { json } = await register({}, { "X-Sidecar-Secret": OWN_SECRET })
    expect(json.sidecarSecret).toBeUndefined()
    expect(sidecarCalls[0].auth).toBe(`Bearer ${OWN_SECRET}`)
  })

  it("rejects a short secret on the first register", async () => {
    const { res } = await register({}, { "X-Sidecar-Secret": "short" })
    expect(res.status).toBe(400)
  })

  it("requires the organization secret on later registers and does not let others redirect its CPS", async () => {
    await register({}, { "X-Sidecar-Secret": OWN_SECRET })
    const before = store.docs("assets").size

    const hijack = await register({ sidecarEndpoint: "https://attacker.example" })
    expect(hijack.res.status).toBe(403)
    const wrong = await register({ sidecarEndpoint: "https://attacker.example" }, { "X-Sidecar-Secret": "x".repeat(40) })
    expect(wrong.res.status).toBe(403)
    expect(sidecarCalls.some(c => c.url.startsWith("https://attacker.example"))).toBe(false)
    expect([...store.docs("assets").values()][0].sidecarEndpoint).toBe(SIDECAR)

    const again = await register({}, { "X-Sidecar-Secret": OWN_SECRET })
    expect(again.res.status).toBe(200)
    expect(again.json.sidecarSecret).toBeUndefined()
    expect(store.docs("assets").size).toBe(before)
  })

  it("fails closed when SIDECAR_SECRETS_KEY is not configured", async () => {
    delete process.env.SIDECAR_SECRETS_KEY
    const { res } = await register()
    expect(res.status).toBe(503)
    expect(sidecarCalls).toHaveLength(0)
  })
})

describe("register — resources and contract offer", () => {
  it("stores resources, sends their paths to the sidecar and publishes the offer", async () => {
    const { json } = await register({}, { "X-Sidecar-Secret": OWN_SECRET })
    expect(json.resources.map((r: { id: string }) => r.id)).toEqual(["operational", "cognitive", "hcm-episodes"])
    expect(json.resourceUrls.operational).toBe(`${SIDECAR}/api/proxy/cpslai1/operational`)
    expect(sidecarCalls[0].body.resources).toEqual(RESOURCES)

    const offer = store.docs("contractOffers").get(json.contractOfferId)
    expect(offer?.status).toBe("published")
    expect(offer?.policyPayload).toMatchObject({ accessTokenTtlMinutes: 30, requiresManualApproval: false, validForHours: 24 })
  })

  it("rejects invalid resources before writing anything", async () => {
    for (const resources of [
      [{ id: "Bad Id", path: "/x" }],
      [{ id: "data", path: "/x" }],
      [{ id: "ok", path: "relative/path" }],
      [{ id: "ok", path: "/../etc" }],
      [{ id: "dup", path: "/a" }, { id: "dup", path: "/b" }],
    ]) {
      const { res } = await register({ resources })
      expect(res.status).toBe(400)
    }
    expect(store.docs("assets").size).toBe(0)
    expect(store.docs("m2mOrganizations").size).toBe(0)
  })
})

describe("offer → negotiate → agreement", () => {
  let assetId = ""

  beforeEach(async () => {
    assetId = (await register({}, { "X-Sidecar-Secret": OWN_SECRET })).json.assetId
    sidecarCalls = []
  })

  it("shows the directives and resources before signing", async () => {
    const { GET } = await import("./offer/route")
    const json = await (await GET(new NextRequest(`http://test/api/m2m/offer?assetId=${assetId}`))).json()
    expect(json.offer.status).toBe("published")
    expect(json.directives).toMatchObject({ accessTokenTtlMinutes: 30, purposeBinding: false })
    expect(json.resources.map((r: { id: string }) => r.id)).toEqual(["operational", "cognitive", "hcm-episodes"])
    expect(json.negotiation).toBe("automatic")
    expect(json.howToSign.body.targetAssetId).toBe(assetId)
  })

  it("lists the resources with their sidecar URLs in discovery", async () => {
    const { GET } = await import("./discover/route")
    const json = await (await GET(new NextRequest("http://test/api/m2m/discover?q=hcm"))).json()
    expect(json.count).toBe(1)
    expect(json.results[0].resources).toContainEqual(expect.objectContaining({
      id: "hcm-episodes", url: `${SIDECAR}/api/proxy/cpslai1/hcm-episodes`,
    }))
  })

  it("records every contract step and grants only the requested resources", async () => {
    const { res, json } = await negotiate({ targetAssetId: assetId, resources: ["operational", "hcm-episodes"] })
    expect(res.status).toBe(200)
    expect(json.status).toBe("granted")
    expect(json.steps.map((s: { step: string; status: string }) => `${s.step}:${s.status}`)).toEqual([
      "federation-membership:created",
      "contract-offer:reused",
      "connector-connection:created",
      "contract-agreement:created",
      "credential-grant:created",
      "access-token:created",
    ])
    expect(json.permissions).toEqual(["data", "aas", "operational", "hcm-episodes"])
    expect(Object.keys(json.resourceUrls)).toEqual(["operational", "hcm-episodes"])

    const agreement = store.docs("contractAgreements").get(json.contractRef)
    expect(agreement).toMatchObject({ status: "finalized", offerId: json.offerId, resources: ["operational", "hcm-episodes"] })
    expect(agreement?.signedByConsumerAt).toBeTruthy()
    expect(agreement?.signedByProviderAt).toBeTruthy()

    const push = sidecarCalls.find(c => c.url.endsWith("/api/tokens"))!
    expect(push.auth).toBe(`Bearer ${OWN_SECRET}`)
    expect(push.body).toMatchObject({ token: json.token, contractRef: json.contractRef, permissions: json.permissions })
  })

  it("reuses membership and connection on the next negotiation", async () => {
    await negotiate({ targetAssetId: assetId })
    const { json } = await negotiate({ targetAssetId: assetId })
    const status = Object.fromEntries(json.steps.map((s: { step: string; status: string }) => [s.step, s.status]))
    expect(status["federation-membership"]).toBe("reused")
    expect(status["connector-connection"]).toBe("reused")
    expect(json.permissions).toEqual(["data", "aas", "operational", "cognitive", "hcm-episodes"])
  })

  it("rejects resources the asset does not offer", async () => {
    const { res, json } = await negotiate({ targetAssetId: assetId, resources: ["operational", "secret-db"] })
    expect(res.status).toBe(422)
    expect(json.availableResources).toEqual(["operational", "cognitive", "hcm-episodes"])
    expect(store.docs("contractAgreements").size).toBe(0)
  })

  it("does not admit consumers to a federation that requires approval", async () => {
    const fedId = String(store.docs("assets").get(assetId)?.federationId)
    await store.collection("federations").doc(fedId).set({ admissionMode: "approval" }, { merge: true })
    const { res } = await negotiate({ targetAssetId: assetId })
    expect(res.status).toBe(403)
    expect(sidecarCalls).toHaveLength(0)
  })

  it("never pushes the global secret for an M2M asset whose organization has no secret", async () => {
    store.docs("m2mOrganizations").clear()
    const { res } = await negotiate({ targetAssetId: assetId })
    expect(res.status).toBe(409)
    expect(sidecarCalls).toHaveLength(0)
  })

  it("validates the negotiated contract without exposing the token", async () => {
    const granted = (await negotiate({ targetAssetId: assetId, resources: ["cognitive"] })).json
    const { GET } = await import("./agreement/route")
    const res = await GET(new NextRequest(`http://test/api/m2m/agreement?contractRef=${granted.contractRef}`))
    const json = await res.json()

    expect(json.effectiveStatus).toBe("active")
    expect(json.agreement).toMatchObject({ status: "finalized", consumer: CONSUMER, resources: ["cognitive"] })
    expect(json.agreement.validUntil).toBe(granted.agreementValidUntil)
    expect(json.credential.status).toBe("active")
    expect(json.tokens[0]).toMatchObject({ status: "active", deliveredToSidecar: true })
    expect(JSON.stringify(json)).not.toContain(granted.token)
  })
})
