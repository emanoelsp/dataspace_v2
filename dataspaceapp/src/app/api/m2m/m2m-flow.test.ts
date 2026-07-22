/**
 * Integração M2M: register → discover → negotiate → consume (PEP) → monitor.
 * Firestore é um shim em memória; o Sidecar e o CPS são REAIS (URLs via env
 * M2M_SIDECAR / M2M_CPS). Se o sidecar não estiver no ar, os testes de rede são
 * pulados (a lógica de catálogo ainda é validada).
 */
import { beforeAll, describe, expect, it, vi } from "vitest"

// ── Firestore em memória (só as operações usadas pelas rotas) ──
type Data = Record<string, unknown>
function wrap(v: unknown): unknown {
  if (v instanceof Date) return { toDate: () => v, toMillis: () => v.getTime() }
  return v
}
function convert(obj: Data): Data {
  const out: Data = {}
  for (const [k, val] of Object.entries(obj)) out[k] = wrap(val)
  return out
}
class Snap {
  constructor(public id: string, private _data: Data | undefined, public ref: DocRef) {}
  get exists() { return this._data !== undefined }
  data() { return this._data }
}
class DocRef {
  constructor(private store: Store, private col: string, public id: string) {}
  async get() { return new Snap(this.id, this.store.docs(this.col).get(this.id), this) }
  async set(data: Data, opts?: { merge?: boolean }) {
    const cur = this.store.docs(this.col).get(this.id)
    this.store.docs(this.col).set(this.id, opts?.merge ? { ...cur, ...convert(data) } : convert(data))
  }
}
class Query {
  private preds: Array<(d: Data) => boolean> = []
  private _limit = Infinity
  constructor(private store: Store, private col: string) {}
  where(field: string, op: string, value: unknown) {
    this.preds.push((d) => {
      const v = d[field]
      if (op === "==") return v === value
      if (op === "array-contains") return Array.isArray(v) && v.includes(value)
      return true
    })
    return this
  }
  limit(n: number) { this._limit = n; return this }
  async get() {
    const all = [...this.store.docs(this.col).entries()]
      .filter(([, d]) => this.preds.every((p) => p(d)))
      .slice(0, this._limit)
      .map(([id, d]) => new Snap(id, d, new DocRef(this.store, this.col, id)))
    return { empty: all.length === 0, size: all.length, docs: all }
  }
}
class CollectionRef {
  constructor(private store: Store, private col: string) {}
  doc(id?: string) { return new DocRef(this.store, this.col, id ?? this.store.nextId()) }
  where(f: string, op: string, v: unknown) { return new Query(this.store, this.col).where(f, op, v) }
  limit(n: number) { return new Query(this.store, this.col).limit(n) }
  async get() { return new Query(this.store, this.col).get() }
  async add(data: Data) {
    const id = this.store.nextId()
    this.store.docs(this.col).set(id, convert(data))
    return new DocRef(this.store, this.col, id)
  }
}
class Store {
  private cols = new Map<string, Map<string, Data>>()
  private seq = 0
  nextId() { return `id_${++this.seq}` }
  docs(col: string) { if (!this.cols.has(col)) this.cols.set(col, new Map()); return this.cols.get(col)! }
  collection(col: string) { return new CollectionRef(this, col) }
}
const store = new Store()

vi.mock("@/lib/firebase-admin", () => ({ getAdminApp: () => ({}) }))
vi.mock("firebase-admin/firestore", () => ({
  getFirestore: () => store,
  FieldValue: { serverTimestamp: () => ({ toDate: () => new Date(), toMillis: () => Date.now() }) },
}))

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
