"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { DiscoveryPageShell } from "@/components/discovery-page-shell"
import {
  fetchAllAssets,
  fetchAllFederations,
  textIncludes,
  OPERATIONAL_FUNCTIONS,
  type AssetRecord,
  type FederationRecord,
} from "@/lib/discovery-search"

export default function SearchTypePage() {
  const [federations, setFederations] = useState<FederationRecord[]>([])
  const [assets, setAssets] = useState<AssetRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [catalogVisibility, setCatalogVisibility] = useState("")
  const [assetType, setAssetType] = useState("")
  const [functionTag, setFunctionTag] = useState("")

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const [f, a] = await Promise.all([fetchAllFederations(), fetchAllAssets()])
        if (!cancelled) {
          setFederations(f)
          setAssets(a)
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const fedIdsMatching = useMemo(() => {
    const set = new Set<string>()
    for (const f of federations) {
      if (catalogVisibility && (f.catalogVisibility ?? "") !== catalogVisibility) continue
      set.add(f.id)
    }
    return set
  }, [federations, catalogVisibility])

  const filteredAssets = useMemo(() => {
    return assets.filter((a) => {
      if (!fedIdsMatching.has(a.federationId)) return false
      if (assetType && (a.assetType ?? "") !== assetType) return false
      if (functionTag.trim()) {
        const blob = `${a.purpose ?? ""} ${a.description ?? ""}`
        if (!textIncludes(blob, functionTag)) return false
      }
      return true
    })
  }, [assets, fedIdsMatching, assetType, functionTag])

  const matchingFederations = useMemo(() => {
    const ids = new Set(filteredAssets.map((a) => a.federationId))
    return federations.filter((f) => ids.has(f.id) && fedIdsMatching.has(f.id))
  }, [federations, filteredAssets, fedIdsMatching])

  return (
    <DiscoveryPageShell
      title="Discovery by type & capability"
      subtitle="Combine federation catalog visibility with asset class (CPS, Digital Twin, API…) and operational function (monitoring, maintenance, quality, traceability). This supports capability discovery across the INTRA dataspace."
    >
      <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm space-y-4 mb-8">
        <div className="grid gap-4 md:grid-cols-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Catalog visibility</label>
            <select
              value={catalogVisibility}
              onChange={(e) => setCatalogVisibility(e.target.value)}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
            >
              <option value="">Any</option>
              <option value="public">Public catalog</option>
              <option value="members">Members only</option>
              <option value="hidden">Hidden</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Asset type</label>
            <select
              value={assetType}
              onChange={(e) => setAssetType(e.target.value)}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
            >
              <option value="">Any</option>
              <option value="CPS">CPS</option>
              <option value="DigitalTwin">Digital Twin</option>
              <option value="Dataset">Dataset</option>
              <option value="API">API</option>
              <option value="Document">Document</option>
              <option value="Other">Other</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Function / use case</label>
            <select
              value={functionTag}
              onChange={(e) => setFunctionTag(e.target.value)}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
            >
              <option value="">Any</option>
              {OPERATIONAL_FUNCTIONS.map((op) => (
                <option key={op} value={op}>
                  {op}
                </option>
              ))}
            </select>
          </div>
        </div>
        <p className="text-xs text-gray-500">
          Matching uses the asset <strong>purpose</strong> and description fields; align registrations with these functions for best results.
        </p>
      </div>

      {loading ? (
        <p className="text-gray-500 text-sm">Loading…</p>
      ) : (
        <div className="space-y-8">
          <section>
            <h2 className="text-lg font-semibold text-gray-800 mb-3">Federations in scope</h2>
            {matchingFederations.length === 0 ? (
              <p className="text-sm text-gray-500">No federations match the current asset filters.</p>
            ) : (
              <ul className="space-y-2">
                {matchingFederations.map((f) => (
                  <li key={f.id} className="flex justify-between items-center rounded-md border border-gray-100 bg-gray-50/80 px-3 py-2 text-sm">
                    <span className="font-medium text-gray-800">{f.name}</span>
                    <Link href={`/federations/${f.id}`} className="text-blue-600 hover:underline">
                      View
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section>
            <h2 className="text-lg font-semibold text-gray-800 mb-3">Assets</h2>
            {filteredAssets.length === 0 ? (
              <p className="text-sm text-gray-500">No assets match these capability filters.</p>
            ) : (
              <ul className="space-y-3">
                {filteredAssets.map((a) => (
                  <li key={a.id} className="rounded-lg border border-gray-100 bg-white p-4 shadow-sm">
                    <div className="flex flex-wrap justify-between gap-2">
                      <div>
                        <p className="font-semibold text-gray-900">{a.name}</p>
                        <p className="text-xs text-gray-500 mt-1">
                          {a.assetType ?? "—"} · {a.federationName ?? a.federationId}
                          {a.assetKind ? ` · ${a.assetKind}` : ""}
                        </p>
                        {a.purpose ? <p className="text-sm text-gray-600 mt-1">{a.purpose}</p> : null}
                      </div>
                      <Link href={`/assets/${a.id}`} className="text-sm font-medium text-blue-600">
                        Open →
                      </Link>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </DiscoveryPageShell>
  )
}
