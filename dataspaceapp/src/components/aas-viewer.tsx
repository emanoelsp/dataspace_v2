"use client"

/**
 * Visão AAS via Sidecar PEP — browser→sidecar, dentro do perímetro da fábrica.
 *
 * O Dataspace (nuvem) apenas renderiza esta visão para confirmação, controle e
 * rastreabilidade: o payload NUNCA passa pela nuvem. Cada requisição é validada
 * pelo token no PEP e registrada no log de acesso do sidecar.
 */

import { useCallback, useEffect, useState } from "react"
import { ShieldCheck, RefreshCw, Boxes, Activity, AlertTriangle } from "lucide-react"

type Props = {
  sidecarEndpoint: string
  equipment: string
  token: string
  mode: "owner" | "client"
}

type Reference = { type?: string; keys?: Array<{ type?: string; value?: string }> }
type SubmodelElement = {
  idShort?: string
  modelType?: string
  valueType?: string
  value?: unknown
  semanticId?: Reference
  submodelElements?: SubmodelElement[]
}
type Submodel = {
  idShort?: string
  semanticId?: Reference
  submodelElements?: SubmodelElement[]
}
type AASEnvironment = {
  assetAdministrationShells?: Array<{
    idShort?: string
    assetInformation?: { globalAssetId?: string }
  }>
  submodels?: Submodel[]
}

function semanticOf(ref?: Reference): string {
  return ref?.keys?.[0]?.value ?? ""
}

function isIrdi(value: string): boolean {
  return /^\d{4}-\d/.test(value)
}

function renderValue(value: unknown): string {
  if (value === null || value === undefined) return "—"
  if (typeof value === "object") {
    if (Array.isArray(value) && value.every(v => typeof v === "object" && v && "language" in v)) {
      const pt = (value as Array<{ language: string; text: string }>).find(v => v.language === "pt")
      return pt?.text ?? (value as Array<{ text: string }>)[0]?.text ?? JSON.stringify(value)
    }
    return JSON.stringify(value)
  }
  return String(value)
}

function ElementRows({ elements, depth = 0 }: { elements: SubmodelElement[]; depth?: number }) {
  return (
    <>
      {elements.map((el, i) => {
        const semantic = semanticOf(el.semanticId)
        const isCollection = Array.isArray(el.submodelElements) && el.submodelElements.length > 0
        return (
          <FragmentRow key={`${el.idShort}-${i}`}>
            <tr className={depth > 0 ? "bg-gray-50" : ""}>
              <td className="px-3 py-2 font-mono text-sm" style={{ paddingLeft: `${12 + depth * 20}px` }}>
                {el.idShort ?? "—"}
              </td>
              <td className="px-3 py-2 text-sm text-gray-700">
                {isCollection ? <span className="italic text-gray-400">coleção</span> : renderValue(el.value)}
              </td>
              <td className="px-3 py-2">
                {semantic ? (
                  <span
                    className={`inline-block px-2 py-0.5 rounded text-xs font-mono ${
                      isIrdi(semantic) ? "bg-emerald-100 text-emerald-800" : "bg-blue-50 text-blue-700"
                    }`}
                    title={isIrdi(semantic) ? "IRDI ECLASS / IEC 61360" : "Referência semântica"}
                  >
                    {semantic}
                  </span>
                ) : (
                  <span className="text-gray-300 text-xs">sem semanticId</span>
                )}
              </td>
            </tr>
            {isCollection ? <ElementRows elements={el.submodelElements!} depth={depth + 1} /> : null}
          </FragmentRow>
        )
      })}
    </>
  )
}

function FragmentRow({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}

export default function AASViewer({ sidecarEndpoint, equipment, token, mode }: Props) {
  const base = sidecarEndpoint.replace(/\/+$/, "")
  const [aas, setAas] = useState<AASEnvironment | null>(null)
  const [data, setData] = useState<Record<string, unknown> | null>(null)
  const [dataTimeMs, setDataTimeMs] = useState<string | null>(null)
  const [tokenId, setTokenId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const fetchFromSidecar = useCallback(async (endpoint: "aas" | "data") => {
    const res = await fetch(`${base}/api/proxy/${equipment}/${endpoint}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    const body = await res.json()
    if (!res.ok) {
      throw new Error(typeof body?.error === "string" ? `${res.status}: ${body.error}` : `HTTP ${res.status}`)
    }
    return { body, headers: res.headers }
  }, [base, equipment, token])

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [aasRes, dataRes] = await Promise.all([fetchFromSidecar("aas"), fetchFromSidecar("data")])
      setAas(aasRes.body as AASEnvironment)
      setData(dataRes.body as Record<string, unknown>)
      setDataTimeMs(dataRes.headers.get("X-Response-Time-Ms"))
      setTokenId(dataRes.headers.get("X-Token-Id"))
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao consultar o Sidecar PEP")
    } finally {
      setLoading(false)
    }
  }, [fetchFromSidecar])

  useEffect(() => { load() }, [load])

  const shell = aas?.assetAdministrationShells?.[0]

  return (
    <div className="bg-white rounded-lg shadow-sm border p-6 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-xl font-semibold flex items-center gap-2">
          <Boxes className="text-emerald-600" size={22} />
          {mode === "owner" ? "Como me exponho — AAS via Sidecar" : "Ativo contratado — AAS via Sidecar"}
        </h2>
        <button
          onClick={load}
          disabled={loading}
          className="flex items-center gap-1 text-sm bg-gray-100 hover:bg-gray-200 px-3 py-1.5 rounded-md disabled:opacity-50"
        >
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} /> Atualizar
        </button>
      </div>

      <div className="flex items-start gap-2 text-xs text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-md px-3 py-2">
        <ShieldCheck size={14} className="mt-0.5 shrink-0" />
        <span>
          Fluxo intra: navegador → Sidecar PEP ({base}) → CPS, sem passar pela nuvem.
          Visualização apenas para confirmação, controle e rastreabilidade — cada requisição é
          validada pelo token e registrada no log de acesso
          {tokenId ? <> (token <span className="font-mono">{tokenId.slice(0, 8)}…</span>)</> : null}.
        </span>
      </div>

      {error ? (
        <div className="flex items-center gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2">
          <AlertTriangle size={16} /> {error}
        </div>
      ) : null}

      {shell ? (
        <div className="text-sm text-gray-700">
          <p><b>AAS:</b> <span className="font-mono">{shell.idShort ?? "—"}</span></p>
          <p><b>globalAssetId:</b> <span className="font-mono break-all">{shell.assetInformation?.globalAssetId ?? "—"}</span></p>
        </div>
      ) : null}

      {aas?.submodels?.length ? (
        <div className="space-y-4">
          {aas.submodels.map((sm, i) => (
            <div key={`${sm.idShort}-${i}`} className="border rounded-md overflow-hidden">
              <div className="bg-gray-50 px-3 py-2 flex items-center justify-between flex-wrap gap-1">
                <span className="font-semibold text-sm">{sm.idShort ?? `Submodel ${i + 1}`}</span>
                {semanticOf(sm.semanticId) ? (
                  <span className="text-xs font-mono text-gray-500">{semanticOf(sm.semanticId)}</span>
                ) : null}
              </div>
              <table className="w-full text-left">
                <thead>
                  <tr className="text-xs text-gray-500 border-b">
                    <th className="px-3 py-1.5">idShort</th>
                    <th className="px-3 py-1.5">valor</th>
                    <th className="px-3 py-1.5">semanticId (ECLASS/IRDI)</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  <ElementRows elements={sm.submodelElements ?? []} />
                </tbody>
              </table>
            </div>
          ))}
        </div>
      ) : null}

      <div className="border rounded-md overflow-hidden">
        <div className="bg-gray-50 px-3 py-2 flex items-center justify-between">
          <span className="font-semibold text-sm flex items-center gap-1">
            <Activity size={14} className="text-blue-600" /> Dados em tempo real (raw)
          </span>
          {dataTimeMs ? <span className="text-xs text-gray-500">{dataTimeMs} ms via PEP</span> : null}
        </div>
        <pre className="p-3 text-xs overflow-x-auto bg-gray-900 text-emerald-200 max-h-72">
          {data ? JSON.stringify(data, null, 2) : loading ? "Consultando o sidecar..." : "—"}
        </pre>
      </div>
    </div>
  )
}
