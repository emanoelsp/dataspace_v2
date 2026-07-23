/**
 * EDC adapter: register (gera bundles EDC v3) + data bridge (serve via PEP intra).
 * Firestore em memória; Sidecar e CPS REAIS (M2M_SIDECAR / M2M_CPS). Sem sidecar
 * no ar, a validação de formato dos bundles ainda roda.
 */
import { beforeAll, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

type Data = Record<string, unknown>
function wrap(v: unknown): unknown {
  if (v instanceof Date) return { toDate: () => v, toMillis: () => v.getTime() }
  return v
}
function convert(o: Data): Data { const r: Data = {}; for (const [k, v] of Object.entries(o)) r[k] = wrap(v); return r }
class Snap { constructor(public id: string, private _d: Data | undefined, public ref: DocRef) {} get exists() { return this._d !== undefined } data() { return this._d } }
class DocRef {
  constructor(private s: Store, private c: string, public id: string) {}
  async get() { return new Snap(this.id, this.s.docs(this.c).get(this.id), this) }
  async set(d: Data, o?: { merge?: boolean }) { const cur = this.s.docs(this.c).get(this.id); this.s.docs(this.c).set(this.id, o?.merge ? { ...cur, ...convert(d) } : convert(d)) }
}
class Query {
  private preds: Array<(d: Data) => boolean> = []; private _l = Infinity
  constructor(private s: Store, private c: string) {}
  where(f: string, op: string, v: unknown) { this.preds.push(d => op === "==" ? d[f] === v : op === "array-contains" ? Array.isArray(d[f]) && (d[f] as unknown[]).includes(v) : true); return this }
  limit(n: number) { this._l = n; return this }
  async get() { const all = [...this.s.docs(this.c).entries()].filter(([, d]) => this.preds.every(p => p(d))).slice(0, this._l).map(([id, d]) => new Snap(id, d, new DocRef(this.s, this.c, id))); return { empty: all.length === 0, size: all.length, docs: all } }
}
class Col {
  constructor(private s: Store, private c: string) {}
  doc(id?: string) { return new DocRef(this.s, this.c, id ?? this.s.nextId()) }
  where(f: string, op: string, v: unknown) { return new Query(this.s, this.c).where(f, op, v) }
  async add(d: Data) { const id = this.s.nextId(); this.s.docs(this.c).set(id, convert(d)); return new DocRef(this.s, this.c, id) }
}
class Store {
  private cols = new Map<string, Map<string, Data>>(); private seq = 0
  nextId() { return `id_${++this.seq}` }
  docs(c: string) { if (!this.cols.has(c)) this.cols.set(c, new Map()); return this.cols.get(c)! }
  collection(c: string) { return new Col(this, c) }
}
const store = new Store()
vi.mock("@/lib/firebase-admin", () => ({ getAdminApp: () => ({}) }))
vi.mock("firebase-admin/firestore", () => ({ getFirestore: () => store, FieldValue: { serverTimestamp: () => ({ toDate: () => new Date(), toMillis: () => Date.now() }) } }))

const SIDECAR = process.env.M2M_SIDECAR ?? "http://localhost:3199"
const CPS = process.env.M2M_CPS ?? "http://localhost:3002"
let live = false
let assetId = ""

beforeAll(async () => {
  try {
    live = (await fetch(`${SIDECAR}/api/status`).then(r => r.ok).catch(() => false))
        && (await fetch(`${CPS}/api/data`, { headers: { Authorization: "Bearer demo" } }).then(r => r.ok).catch(() => false))
  } catch { live = false }
  // registra um CPS via M2M (popula o catálogo intra que o EDC vai expor)
  if (live) {
    const { POST } = await import("../m2m/register/route")
    const res = await POST(new Request("http://t", { method: "POST", body: JSON.stringify({
      name: "Hydraulic Press", equipmentSlug: "press", organization: "plant1",
      baseUrl: CPS, sidecarEndpoint: SIDECAR,
      federation: { create: { name: "plant1 — Inter (test)", type: "Open" } },
    }), headers: { "Content-Type": "application/json" } }))
    assetId = (await res.json()).assetId
  }
})

function post(body: unknown) { return new NextRequest("http://test/api/edc/register", { method: "POST", body: JSON.stringify(body), headers: { "Content-Type": "application/json" } }) }

describe("EDC adapter", () => {
  it("gera bundle EDC v3 no formato do Management API", async () => {
    if (!live) return
    const { POST } = await import("./register/route")
    const res = await POST(post({ assetId }))
    const j = await res.json()
    expect(j.ok).toBe(true)
    expect(j.mode).toBe("export")
    const b = j.bundles[0].bundle
    // Asset
    expect(b.asset["@context"]["@vocab"]).toBe("https://w3id.org/edc/v0.0.1/ns/")
    expect(b.asset.dataAddress.type).toBe("HttpData")
    expect(b.asset.dataAddress.baseUrl).toContain(`/api/edc/data/${assetId}`)
    // Policy ODRL
    expect(b.policy.policy["@type"]).toBe("Set")
    expect(Array.isArray(b.policy.policy.permission)).toBe(true)
    // ContractDefinition liga asset ↔ policy
    expect(b.contractDefinition.accessPolicyId).toBe(b.policy["@id"])
    expect(b.contractDefinition.assetsSelector[0].operandRight).toBe(assetId)
  })

  it("ponte serve o dado do CPS através do PEP intra", async () => {
    if (!live) return
    const { GET } = await import("./data/[assetId]/route")
    const res = await GET(new NextRequest("http://test/api/edc/data/x"), { params: Promise.resolve({ assetId }) })
    expect(res.ok).toBe(true)
    expect(res.headers.get("X-Data-Path")).toBe("intra-sidecar-PEP")
    const body = await res.json()
    expect(body.equipmentType).toBeTruthy()
  })
})
