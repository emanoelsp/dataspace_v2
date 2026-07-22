"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { Search } from "lucide-react"
import { DiscoveryPageShell } from "@/components/discovery-page-shell"
import {
  fetchAllAssets,
  PROCESS_DATA_KEYWORDS,
  textIncludes,
  type AssetRecord,
} from "@/lib/discovery-search"

function assetMatchesDataSignals(a: AssetRecord, selectedIds: Set<string>, freeText: string) {
  const blob = `${a.name} ${a.description} ${a.purpose ?? ""} ${a.semanticId ?? ""} ${a.aasId ?? ""} ${a.irdi ?? ""} ${a.semanticModel ?? ""} ${a.dataFormat ?? ""} ${a.assetKind ?? ""} ${a.exchangeMode ?? ""} ${(a.capabilities ?? []).join(" ")} ${(a.capabilitySemantics ?? []).join(" ")}`.toLowerCase()

  for (const id of selectedIds) {
    const def = PROCESS_DATA_KEYWORDS.find((k) => k.id === id)
    if (!def) continue
    const hit = def.synonyms.some((s) => blob.includes(s.toLowerCase()))
    if (!hit) return false
  }

  if (freeText.trim()) {
    if (!textIncludes(blob, freeText)) return false
  }

  return true
}

export default function SearchDataPage() {
  const [rows, setRows] = useState<AssetRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState("")
  const [selectedKeywordIds, setSelectedKeywordIds] = useState<Set<string>>(new Set())
  const [dataFormat, setDataFormat] = useState("")

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const data = await fetchAllAssets()
        if (!cancelled) setRows(data)
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const toggleKeyword = (id: string) => {
    setSelectedKeywordIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const filtered = useMemo(() => {
    return rows.filter((a) => {
      if (dataFormat.trim() && !textIncludes(a.dataFormat ?? "", dataFormat)) return false
      return assetMatchesDataSignals(a, selectedKeywordIds, q)
    })
  }, [rows, q, selectedKeywordIds, dataFormat])

  return (
    <DiscoveryPageShell
      title="Discovery by data content"
      subtitle="Find assets whose metadata suggests process variables and signals (temperature, pressure, speed, etc.). This supports brownfield intra-organizational discovery without centralizing payloads: you match on descriptions, semantic IDs, and formats, then open the asset endpoint through governance (RF11)."
    >
      <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm space-y-4 mb-6">
        <p className="text-sm text-gray-600">
          Select one or more signal families (AND). Add free text to narrow by name, semantic tag, or format. Typical ISA-95 / shop-floor variables are suggested below.
        </p>
        <div className="flex flex-wrap gap-2">
          {PROCESS_DATA_KEYWORDS.map((k) => {
            const on = selectedKeywordIds.has(k.id)
            return (
              <button
                key={k.id}
                type="button"
                onClick={() => toggleKeyword(k.id)}
                className={`rounded-full px-3 py-1 text-xs font-medium border transition-colors ${
                  on
                    ? "bg-blue-600 text-white border-blue-600"
                    : "bg-gray-50 text-gray-700 border-gray-200 hover:border-blue-300"
                }`}
              >
                {k.label}
              </button>
            )
          })}
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">Free text (name, description, semantic ID, purpose)</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                className="w-full border border-gray-300 rounded-md pl-10 pr-3 py-2 text-sm"
                placeholder="e.g. spindle, furnace, OPC, batch…"
              />
            </div>
          </div>
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">Data format contains</label>
            <input
              value={dataFormat}
              onChange={(e) => setDataFormat(e.target.value)}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
              placeholder="JSON, CSV, OPC-UA, MQTT…"
            />
          </div>
        </div>
      </div>

      {loading ? (
        <p className="text-gray-500 text-sm">Loading assets…</p>
      ) : (
        <ul className="space-y-3">
          {filtered.length === 0 ? (
            <li className="text-gray-500 text-sm">
              No assets match. Try fewer signal filters or broaden the text search.
            </li>
          ) : (
            filtered.map((a) => (
              <li
                key={a.id}
                className="rounded-lg border border-gray-100 bg-white p-4 shadow-sm hover:border-blue-200 transition-colors"
              >
                <div className="flex flex-wrap gap-2 justify-between items-start">
                  <div>
                    <h2 className="font-semibold text-gray-900">{a.name}</h2>
                    <p className="text-sm text-gray-600 mt-1 line-clamp-3">{a.description}</p>
                    <p className="text-xs text-gray-500 mt-2">
                      <span className="font-medium">Format:</span> {a.dataFormat ?? "—"}
                      {a.exchangeMode ? (
                        <>
                          {" "}
                          · <span className="font-medium">Exchange:</span> {a.exchangeMode}
                        </>
                      ) : null}
                      {a.semanticId ? (
                        <>
                          {" "}
                          · <span className="font-medium">Semantic:</span>{" "}
                          <span className="font-mono">{a.semanticId}</span>
                        </>
                      ) : null}
                    </p>
                  </div>
                  <Link
                    href={`/assets/${a.id}`}
                    className="text-sm font-medium text-blue-600 hover:text-blue-800 whitespace-nowrap"
                  >
                    Open asset →
                  </Link>
                </div>
              </li>
            ))
          )}
        </ul>
      )}
    </DiscoveryPageShell>
  )
}
