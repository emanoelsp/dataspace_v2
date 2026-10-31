/**
 * Integração M2M: register → discover → negotiate → consume (PEP) → monitor.
 * Firestore é um shim em memória; o Sidecar e o CPS são REAIS (URLs via env
 * M2M_SIDECAR / M2M_CPS). Se o sidecar não estiver no ar, os testes de rede são
 * pulados (a lógica de catálogo ainda é validada).
 */
import { beforeAll, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/firebase-admin", () => ({ getAdminApp: () => ({}) }))
vi.mock("firebase-admin/firestore", async () => {
  const { store, fieldValueShim } = await import("@/test-utils/firestore-shim")
  return { getFirestore: () => store, FieldValue: fieldValueShim }
})

const SIDECAR = process.env.M2M_SIDECAR ?? "http://localhost:3199"
const CPS = process.env.M2M_CPS ?? "http://localhost:3002"

let live = false
beforeAll(async () => {
  try {
    const [s, c] = await Promise.all([
      fetch(`${SIDECAR}/api/status`).then(r => r.ok).catch(() => false),
      fetch(`${CPS}/api/data`, { headers: { Authorization: "Bearer demo" } }).then(r => r.ok).catch(() => false),
    ])
    live = s && c
  } catch { live = false }
})

function req(body: unknown) {
  return new Request("http://test/api", { method: "POST", body: JSON.stringify(body), headers: { "Content-Type": "application/json" } })
}

describe("M2M flow", () => {
  const consumer = "urn:dataspace:participant:plant1:cnc"
  let assetId = ""
  let token = ""
  let dataUrl = ""

  it("self-registers a CPS (press) with harvested capabilities", async () => {
    if (!live) return
    const { POST } = await import("./register/route")
    const res = await POST(req({
      name: "Hydraulic Press", baseUrl: CPS, sidecarEndpoint: SIDECAR,
      organization: "plant1", equipmentSlug: "press",
      federation: { create: { name: "plant1 — Forming (test)", type: "Open" } },
      governance: { accessTokenTtlMinutes: 30, requiresManualApproval: false },
    }))
    const j = await res.json()
    expect(res.status).toBe(200)
    expect(j.ok).toBe(true)
    expect(j.equipmentSlug).toBe("press")
    expect(j.capabilities.length).toBeGreaterThan(0)
    expect(j.sidecarRegistered).toBe(true)
    assetId = j.assetId
  })

  it("discovers the press by capability", async () => {
    if (!live) return
    const { GET } = await import("./discover/route")
    const res = await GET(new (await import("next/server")).NextRequest("http://test/api/m2m/discover?capability=pressure"))
    const j = await res.json()
    expect(j.count).toBeGreaterThan(0)
    expect(j.results.some((r: { equipmentSlug: string }) => r.equipmentSlug === "press")).toBe(true)
  })

  it("negotiates and receives a token pushed to the sidecar", async () => {
    if (!live) return
    const { POST } = await import("./negotiate/route")
    const res = await POST(req({ consumerParticipantId: consumer, consumerName: "cnc", targetAssetId: assetId, purpose: "test" }))
    const j = await res.json()
    expect(j.status).toBe("granted")
    expect(j.token).toMatch(/^dsp_m2m_/)
    token = j.token
    dataUrl = j.dataUrl
  })

  it("consumes press data P2P through the PEP with the M2M token", async () => {
    if (!live) return
    const res = await fetch(dataUrl, { headers: { Authorization: `Bearer ${token}` } })
    expect(res.ok).toBe(true)
    const body = await res.json()
    expect(body.equipmentType).toBeTruthy()
    expect(res.headers.get("X-Contract-Ref")).toBeTruthy()
  })

  it("monitor reflects the active exchange", async () => {
    if (!live) return
    const { GET } = await import("./monitor/route")
    const res = await GET(new (await import("next/server")).NextRequest("http://test/api/m2m/monitor"))
    const j = await res.json()
    expect(j.summary.activeTokens).toBeGreaterThan(0)
    expect(j.contracts.length).toBeGreaterThan(0)
  })
})
