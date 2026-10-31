/**
 * Firestore em memória para testes das rotas Admin SDK — só as operações
 * usadas pelas rotas (collection/doc/where ==/array-contains/limit/add/set).
 */
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
  async create(data: Data) {
    if (this.store.docs(this.col).has(this.id)) throw new Error("ALREADY_EXISTS")
    this.store.docs(this.col).set(this.id, convert(data))
  }
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
      if (op === ">=") return typeof v === "string" && v >= String(value)
      if (op === "<=") return typeof v === "string" && v <= String(value)
      if (op === "<") return typeof v === "string" && v < String(value)
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
export class Store {
  private cols = new Map<string, Map<string, Data>>()
  private seq = 0
  nextId() { return `id_${++this.seq}` }
  docs(col: string) { if (!this.cols.has(col)) this.cols.set(col, new Map()); return this.cols.get(col)! }
  collection(col: string) { return new CollectionRef(this, col) }
  clear() { this.cols.clear() }
}

export const store = new Store()

export const fieldValueShim = {
  serverTimestamp: () => ({ toDate: () => new Date(), toMillis: () => Date.now() }),
}
