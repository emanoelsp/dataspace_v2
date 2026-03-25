"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { Search } from "lucide-react"
import { DiscoveryPageShell } from "@/components/discovery-page-shell"
import { fetchAllAssets, textIncludes, type AssetRecord } from "@/lib/discovery-search"

export default function SearchAssetsPage() {
  const [rows, setRows] = useState<AssetRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState("")
  const [assetType, setAssetType] = useState("")
  const [assetKind, setAssetKind] = useState("")
  const [dataFormat, setDataFormat] = useState("")
  const [exchangeMode, setExchangeMode] = useState("")
  const [accessType, setAccessType] = useState("")

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

  const filtered = useMemo(() => {
    return rows.filter((a) => {
      const blob = [
        a.name,
        a.description,
        a.federationName,
        a.semanticId,
        a.aasId,
        a.irdi,
        a.semanticModel,
        a.purpose,
        a.apiEndpoint,
        a.assetKind,
        a.dataFormat,
        a.exchangeMode,
        a.accessType,
      ]
        .filter(Boolean)
        .join(" ")
      if (!textIncludes(blob, q)) return false
      if (assetType && (a.assetType ?? "") !== assetType) return false
      if (assetKind && (a.assetKind ?? "") !== assetKind) return false
      if (dataFormat.trim() && !textIncludes(a.dataFormat ?? "", dataFormat)) return false
      if (exchangeMode && (a.exchangeMode ?? "") !== exchangeMode) return false
      if (accessType.trim() && !textIncludes(a.accessType ?? "", accessType)) return false
      return true
    })
  }, [rows, q, assetType, assetKind, dataFormat, exchangeMode, accessType])

  return (
    <DiscoveryPageShell
      title="Discovery by asset"
      subtitle="Filter registered assets by product metadata: type, asset kind, purpose, semantic ID, technical format, exchange mode and access mode (control-plane discovery for the INTRA dataspace model)."
    >
      <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm space-y-4 mb-8">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">Text (name, description, federation, semantic ID, AAS, IRDI)</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                className="w-full border border-gray-300 rounded-md pl-10 pr-3 py-2 text-sm"
                placeholder="Search across asset metadata…"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Asset type</label>
            <select
              value={assetType}
              onChange={(e) => setAssetType(e.target.value)}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
            >
              <option value="">Any</option>
              <option value="CPS">Cyber-Physical System (CPS)</option>
              <option value="DigitalTwin">Digital Twin</option>
              <option value="Dataset">Dataset</option>
              <option value="API">API</option>
              <option value="Document">Document</option>
              <option value="Other">Other</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Asset kind</label>
            <select
              value={assetKind}
              onChange={(e) => setAssetKind(e.target.value)}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
            >
              <option value="">Any</option>
              <option value="data">Data product</option>
              <option value="model">ML model</option>
              <option value="service">Service</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Data format contains</label>
            <input
              value={dataFormat}
              onChange={(e) => setDataFormat(e.target.value)}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
              placeholder="e.g. JSON, OPC-UA, CSV"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Exchange mode</label>
            <select
              value={exchangeMode}
              onChange={(e) => setExchangeMode(e.target.value)}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
            >
              <option value="">Any</option>
              <option value="batch">Batch</option>
              <option value="stream">Stream</option>
              <option value="hybrid">Hybrid</option>
            </select>
          </div>
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">Access type contains</label>
            <input
              value={accessType}
              onChange={(e) => setAccessType(e.target.value)}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
              placeholder="e.g. REST, OAuth"
            />
          </div>
        </div>
      </div>

      {loading ? (
        <p className="text-gray-500 text-sm">Loading assets…</p>
      ) : (
        <ul className="space-y-3">
          {filtered.length === 0 ? (
            <li className="text-gray-500 text-sm">No assets match these filters.</li>
          ) : (
            filtered.map((a) => (
              <li
                key={a.id}
                className="rounded-lg border border-gray-100 bg-white p-4 shadow-sm hover:border-blue-200 transition-colors"
              >
                <div className="flex flex-wrap gap-2 justify-between items-start">
                  <div>
                    <h2 className="font-semibold text-gray-900">{a.name}</h2>
                    <p className="text-sm text-gray-600 mt-1 line-clamp-2">{a.description}</p>
                    <p className="text-xs text-gray-500 mt-2">
                      {a.federationName ? (
                        <>
                          <span className="font-medium">Federation:</span> {a.federationName}
                        </>
                      ) : (
                        <span className="font-medium">Federation ID:</span>
                      )}{" "}
                      {!a.federationName && a.federationId}
                      {a.assetType ? (
                        <>
                          {" "}
                          · <span className="font-medium">Type:</span> {a.assetType}
                        </>
                      ) : null}
                      {a.assetKind ? (
                        <>
                          {" "}
                          · <span className="font-medium">Kind:</span> {a.assetKind}
                        </>
                      ) : null}
                    </p>
                    {a.semanticId ? (
                      <p className="text-xs text-gray-500 mt-1 font-mono">
                        <span className="font-sans font-medium">Semantic ID:</span> {a.semanticId}
                      </p>
                    ) : null}
                    {a.aasId ? (
                      <p className="text-xs text-gray-500 mt-1 font-mono">
                        <span className="font-sans font-medium">AAS ID:</span> {a.aasId}
                      </p>
                    ) : null}
                    {a.irdi ? (
                      <p className="text-xs text-gray-500 mt-1 font-mono">
                        <span className="font-sans font-medium">IRDI:</span> {a.irdi}
                      </p>
                    ) : null}
                    {a.purpose ? (
                      <p className="text-xs text-gray-500 mt-1">
                        <span className="font-medium">Purpose:</span> {a.purpose}
                      </p>
                    ) : null}
                    {a.exchangeMode ? (
                      <p className="text-xs text-gray-500 mt-1">
                        <span className="font-medium">Exchange:</span> {a.exchangeMode}
                      </p>
                    ) : null}
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
