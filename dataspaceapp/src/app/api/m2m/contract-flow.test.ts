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
const CONSUMER = "urn:dataspace:participant:acsm-lab:acsm"
const OWN_SECRET = "scs_marcos_chosen_secret_0123456789abcdef"
const CONSUMER_SECRET = "scs_acsm_lab_consumer_secret_0123456789ab"
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

async function negotiate(body: Record<string, unknown>, headers: Record<string, string> = { "X-Sidecar-Secret": CONSUMER_SECRET }) {
  const { POST } = await import("./negotiate/route")
  const res = await POST(post({ consumerParticipantId: CONSUMER, consumerName: "acsm", ...body }, headers))
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
  delete process.env.M2M_ADMIN_KEY
})

async function getAgreement(contractRef: string, headers: Record<string, string>) {
  const { GET } = await import("./agreement/route")
  return GET(new NextRequest(`http://test/api/m2m/agreement?contractRef=${contractRef}`, { headers }))
}

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

  it("does not let anyone claim an organization that already had CPS before per-organization secrets", async () => {
    await store.collection("connectorProfiles").doc("legacy").set({
      source: "m2m", participantId: "urn:dataspace:participant:ifsc-gaspar:old-resource",
    })
    const { res } = await register({}, { "X-Sidecar-Secret": OWN_SECRET })
    expect(res.status).toBe(403)
    expect(store.docs("m2mOrganizations").size).toBe(0)
    expect(sidecarCalls).toHaveLength(0)
  })

  it("does not let anyone claim an organization whose ids are already used by the UI flow", async () => {
    // continuação acima de U+F8FF: o limite superior da consulta tem de cobri-la
    for (const participantId of ["urn:dataspace:participant:ifsc-gaspar:lab-user", "urn:dataspace:participant:ifsc-gaspar:\uffefx"]) {
      store.clear()
      await store.collection("connectorProfiles").doc("human").set({ source: "ui", participantId })
      expect((await register({}, { "X-Sidecar-Secret": OWN_SECRET })).res.status).toBe(403)
      expect(store.docs("m2mOrganizations").size).toBe(0)
    }
  })

  it("does not treat a longer organization name as the same namespace", async () => {
    await store.collection("connectorProfiles").doc("other").set({
      source: "m2m", participantId: "urn:dataspace:participant:ifsc-gaspar2:cps",
    })
    expect((await register({}, { "X-Sidecar-Secret": OWN_SECRET })).res.status).toBe(200)
  })

  it("lets only one of two concurrent first registers claim the organization", async () => {
    const other = "scs_concurrent_attacker_0123456789abcdef"
    const results = await Promise.all([
      register({}, { "X-Sidecar-Secret": OWN_SECRET }),
      register({ equipmentSlug: "cpslai9" }, { "X-Sidecar-Secret": other }),
    ])
    expect(results.map(r => r.res.status).sort()).toEqual([200, 409])
    const winner = results.find(r => r.res.status === 200)!
    const winnerSecret = winner === results[0] ? OWN_SECRET : other
    expect(sidecarCalls.every(c => c.auth === `Bearer ${winnerSecret}`)).toBe(true)
  })

  it("lets the admin set the secret of a legacy organization, which then registers with it", async () => {
    await store.collection("connectorProfiles").doc("legacy").set({
      source: "m2m", participantId: "urn:dataspace:participant:ifsc-gaspar:old-resource",
    })
    const { POST } = await import("./organization/route")
    const body = { organization: "IFSC-GASPAR", sidecarSecret: OWN_SECRET }

    expect((await POST(post(body))).status).toBe(503) // M2M_ADMIN_KEY ausente: bloqueado
    process.env.M2M_ADMIN_KEY = "admin"
    expect((await POST(post(body, { "X-M2M-Admin-Key": "admin" }))).status).toBe(503) // chave fraca: bloqueado
    process.env.M2M_ADMIN_KEY = "admin_key_for_tests_0123456789abcdefghij"
    expect((await POST(post(body, { "X-M2M-Admin-Key": "wrong" }))).status).toBe(401)
    const ok = await POST(post(body, { "X-M2M-Admin-Key": "admin_key_for_tests_0123456789abcdefghij" }))
    expect(ok.status).toBe(200)
    expect((await ok.json()).sidecarSecret).toBeUndefined()

    const { res } = await register({}, { "X-Sidecar-Secret": OWN_SECRET })
    expect(res.status).toBe(200)
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
    // consumidor de outra organização, com federação própria
    await register({
      name: "ACSM", organization: "acsm-lab", equipmentSlug: "acsm",
      federation: { create: { name: "acsm-fed", type: "Open" } }, resources: [],
    }, { "X-Sidecar-Secret": CONSUMER_SECRET })
    sidecarCalls = []
  })

  it("requires the consumer to prove its organization", async () => {
    expect((await negotiate({ targetAssetId: assetId }, {})).res.status).toBe(403)
    expect((await negotiate({ targetAssetId: assetId }, { "X-Sidecar-Secret": OWN_SECRET })).res.status).toBe(403)
    const spoofed = await negotiate({ targetAssetId: assetId, consumerParticipantId: "urn:dataspace:participant:ghost-org:x" })
    expect(spoofed.res.status).toBe(403)
    // prefixo da organização certo e segredo certo, mas participante nunca registrado via M2M
    const unregistered = await negotiate({ targetAssetId: assetId, consumerParticipantId: "urn:dataspace:participant:acsm-lab:not-registered" })
    expect(unregistered.res.status).toBe(403)
    expect(store.docs("contractAgreements").size).toBe(0)
    expect(sidecarCalls).toHaveLength(0)
  })

  it("refuses when any connection was revoked by the provider, even next to a closed one", async () => {
    const provider = String(store.docs("assets").get(assetId)?.ownerId)
    await store.collection("connectorConnections").doc("cc-closed").set({ providerParticipantId: provider, consumerParticipantId: CONSUMER, status: "closed", source: "m2m" })
    await store.collection("connectorConnections").doc("cc-revoked").set({ providerParticipantId: provider, consumerParticipantId: CONSUMER, status: "revoked", source: "m2m" })
    expect((await negotiate({ targetAssetId: assetId })).res.status).toBe(403)
  })

  it("does not reuse a connection closed when an organization was deleted", async () => {
    const provider = String(store.docs("assets").get(assetId)?.ownerId)
    await store.collection("connectorConnections").doc("cc-closed").set({
      providerParticipantId: provider, consumerParticipantId: CONSUMER, status: "closed", source: "m2m",
    })
    const { res, json } = await negotiate({ targetAssetId: assetId })
    expect(res.status).toBe(200)
    const step = json.steps.find((s: { step: string }) => s.step === "connector-connection")
    expect(step.status).toBe("created")
    expect(step.id).not.toBe("cc-closed")
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

  it("keeps a member whose join is pending approval out of the contract", async () => {
    const fedId = String(store.docs("assets").get(assetId)?.federationId)
    await store.collection("federations").doc(fedId).set({ admissionMode: "approval" }, { merge: true })
    const joined = await register({
      name: "ACSM", organization: "acsm-lab", equipmentSlug: "acsm", federation: { join: fedId }, resources: [],
    }, { "X-Sidecar-Secret": CONSUMER_SECRET })
    expect(joined.json.federation.membershipStatus).toBe("pending-approval")

    const { res, json } = await negotiate({ targetAssetId: assetId })
    expect(res.status).toBe(403)
    expect(json.error).toMatch(/pending-approval/)
  })

  it("never pushes the global secret for an M2M asset whose organization has no secret", async () => {
    store.docs("m2mOrganizations").delete("ifsc-gaspar")
    const { res } = await negotiate({ targetAssetId: assetId })
    expect(res.status).toBe(409)
    expect(sidecarCalls).toHaveLength(0)
  })

  it("validates the negotiated contract without exposing the token", async () => {
    const granted = (await negotiate({ targetAssetId: assetId, resources: ["cognitive"] })).json
    const res = await getAgreement(granted.contractRef, { "X-Sidecar-Secret": CONSUMER_SECRET })
    const json = await res.json()

    expect(json.effectiveStatus).toBe("active")
    expect(json.agreement).toMatchObject({ status: "finalized", consumer: CONSUMER, resources: ["cognitive"] })
    expect(json.agreement.validUntil).toBe(granted.agreementValidUntil)
    expect(json.credential.status).toBe("active")
    expect(json.tokens[0]).toMatchObject({ status: "active", deliveredToSidecar: true })
    expect(JSON.stringify(json)).not.toContain(granted.token)
  })

  it("lets only the contract parties read the agreement", async () => {
    const granted = (await negotiate({ targetAssetId: assetId })).json
    expect((await getAgreement(granted.contractRef, { "X-Sidecar-Secret": OWN_SECRET })).status).toBe(200)
    expect((await getAgreement(granted.contractRef, {})).status).toBe(403)

    await register({
      name: "Outsider", organization: "outsider", equipmentSlug: "outsider",
      federation: { create: { name: "outsider-fed", type: "Open" } }, resources: [],
    }, { "X-Sidecar-Secret": "scs_outsider_secret_0123456789abcdefgh" })
    expect((await getAgreement(granted.contractRef, { "X-Sidecar-Secret": "scs_outsider_secret_0123456789abcdefgh" })).status).toBe(403)
  })
})
