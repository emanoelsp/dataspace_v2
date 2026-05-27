"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { collection, doc, getDoc, getDocs, query, where } from "firebase/firestore"
import { db } from "@/lib/firebase"
import { useUserProfile } from "@/lib/use-user-profile"
import Link from "next/link"
import {
  Activity,
  ChevronDown,
  ChevronRight,
  Loader2,
  Play,
  Square,
  Wifi,
  WifiOff,
  RefreshCw,
  ShieldCheck,
  Globe,
} from "lucide-react"

type AssetEntry = {
  assetId: string
  assetName: string
  federationId?: string
  federationName?: string
  apiEndpoint?: string
  dataFormat?: string
  exchangeMode?: string
  accessType?: string
  assetType?: string
  description?: string
  /** true = owned by this user, false = accessed via approved request */
  isOwner: boolean
}

type LiveRow = Record<string, unknown>

function formatTimestamp(d: Date) {
  const p = (n: number) => String(n).padStart(2, "0")
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}

function flattenObject(obj: unknown, prefix = ""): Record<string, string> {
  if (typeof obj !== "object" || obj === null) return { [prefix || "value"]: String(obj) }
  const result: Record<string, string> = {}
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    const key = prefix ? `${prefix}.${k}` : k
    if (typeof v === "object" && v !== null && !Array.isArray(v)) {
      Object.assign(result, flattenObject(v, key))
    } else if (Array.isArray(v)) {
      result[key] = JSON.stringify(v)
    } else {
      result[key] = v === null || v === undefined ? "—" : String(v)
    }
  }
  return result
}

function extractRows(data: unknown): LiveRow[] {
  if (Array.isArray(data)) return data.slice(0, 1).map((item) => flattenObject(item))
  if (typeof data === "object" && data !== null) {
    const d = data as Record<string, unknown>
    if (Array.isArray(d.data) && d.data.length > 0) return [flattenObject(d.data[0])]
    return [flattenObject(data)]
  }
  return [{ value: String(data) }]
}

function AssetLiveFeed({ asset }: { asset: AssetEntry }) {
  const [expanded, setExpanded] = useState(false)
  const [live, setLive] = useState(false)
  const [rows, setRows] = useState<LiveRow[]>([])
  const [columns, setColumns] = useState<string[]>([])
  const [lastFetch, setLastFetch] = useState<Date | null>(null)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [online, setOnline] = useState<boolean | null>(null)
  const [rawJson, setRawJson] = useState<string | null>(null)
  const [showRaw, setShowRaw] = useState(false)
  const intervalRef = useRef<NodeJS.Timeout | null>(null)

  const fetchData = useCallback(async () => {
    if (!asset.apiEndpoint) return
    try {
      const res = await fetch(asset.apiEndpoint, { headers: { Accept: "application/json" } })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json = await res.json()
      setRawJson(JSON.stringify(json, null, 2))
      const extracted = extractRows(json)
      if (extracted.length === 0) return
      const row = { _time: formatTimestamp(new Date()), ...extracted[0] }
      setColumns((prev) => (prev.length > 0 ? prev : Object.keys(row)))
      setRows((prev) => [row, ...prev].slice(0, 60))
      setOnline(true)
      setFetchError(null)
    } catch (e) {
      setOnline(false)
      setFetchError(e instanceof Error ? e.message : "Fetch failed")
    } finally {
      setLastFetch(new Date())
    }
  }, [asset.apiEndpoint])

  useEffect(() => {
    if (live) {
      fetchData()
      intervalRef.current = setInterval(fetchData, 2000)
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [live, fetchData])

  const toggleLive = () => {
    if (live) {
      setLive(false)
    } else {
      setRows([])
      setColumns([])
      setLive(true)
    }
  }

  const hasEndpoint = Boolean(asset.apiEndpoint)

  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center gap-3 px-5 py-4 text-left hover:bg-gray-50 transition-colors"
      >
        {expanded ? (
          <ChevronDown className="h-5 w-5 text-gray-400 shrink-0" />
        ) : (
          <ChevronRight className="h-5 w-5 text-gray-400 shrink-0" />
        )}
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-gray-900 truncate">{asset.assetName}</span>
            {asset.isOwner ? (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-indigo-50 text-indigo-700 border border-indigo-200">
                <ShieldCheck className="h-3 w-3" /> Owner
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-sky-50 text-sky-700 border border-sky-200">
                <Globe className="h-3 w-3" /> Approved access
              </span>
            )}
            {live && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-50 text-green-700 border border-green-200">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                Live
              </span>
            )}
            {!hasEndpoint && (
              <span className="text-xs text-amber-600 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
                No API endpoint
              </span>
            )}
          </div>
          <p className="text-xs text-gray-500 mt-0.5 truncate">
            {asset.federationName && `Federation: ${asset.federationName}`}
            {asset.apiEndpoint && ` · ${asset.apiEndpoint}`}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {online !== null && (
            <span className={`flex items-center gap-1 text-xs ${online ? "text-green-600" : "text-red-500"}`}>
              {online ? <Wifi className="h-3.5 w-3.5" /> : <WifiOff className="h-3.5 w-3.5" />}
              {online ? "online" : "offline"}
            </span>
          )}
          {lastFetch && <span className="text-xs text-gray-400">{formatTimestamp(lastFetch)}</span>}
        </div>
      </button>

      {expanded && (
        <div className="border-t border-gray-100 bg-gray-50/60 px-5 py-4 space-y-4">
          {/* Meta info */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs text-gray-600">
            {asset.assetType && (
              <div><span className="font-medium text-gray-700 block">Type</span>{asset.assetType}</div>
            )}
            {asset.dataFormat && (
              <div><span className="font-medium text-gray-700 block">Format</span>{asset.dataFormat}</div>
            )}
            {asset.exchangeMode && (
              <div><span className="font-medium text-gray-700 block">Exchange</span>{asset.exchangeMode}</div>
            )}
            {asset.accessType && (
              <div><span className="font-medium text-gray-700 block">Access</span>{asset.accessType}</div>
            )}
          </div>

          {asset.apiEndpoint && (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-medium text-gray-600">Endpoint:</span>
              <code className="text-xs bg-white border border-gray-200 rounded px-2 py-1 text-blue-700 break-all">
                {asset.apiEndpoint}
              </code>
              <Link href={`/assets/${asset.assetId}`} className="text-xs text-blue-600 hover:underline">
                Asset details →
              </Link>
            </div>
          )}

          {/* Controls */}
          <div className="flex items-center gap-3 flex-wrap">
            <button
              type="button"
              onClick={toggleLive}
              disabled={!hasEndpoint}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition ${
                live
                  ? "bg-red-600 text-white hover:bg-red-700"
                  : "bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40"
              }`}
            >
              {live ? (
                <><Square className="h-4 w-4" /> Stop feed</>
              ) : (
                <><Play className="h-4 w-4" /> Start live feed</>
              )}
            </button>

            {!live && hasEndpoint && (
              <button
                type="button"
                onClick={fetchData}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border border-gray-300 bg-white text-gray-700 hover:border-blue-400 transition"
              >
                <RefreshCw className="h-4 w-4" /> Fetch once
              </button>
            )}

            {rawJson && (
              <button
                type="button"
                onClick={() => setShowRaw((v) => !v)}
                className="text-xs text-gray-500 hover:text-gray-800 underline"
              >
                {showRaw ? "Hide raw JSON" : "Show raw JSON"}
              </button>
            )}
          </div>

          {fetchError && (
            <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {fetchError}
            </div>
          )}

          {showRaw && rawJson && (
            <pre className="bg-slate-900 text-emerald-300 text-xs rounded-lg p-4 overflow-x-auto max-h-64">
              {rawJson}
            </pre>
          )}

          {/* Live data table */}
          {rows.length > 0 && columns.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Activity className="h-4 w-4 text-blue-600" />
                <span className="text-sm font-medium text-gray-700">Real-time readings</span>
                <span className="text-xs text-gray-400">({rows.length} samples)</span>
              </div>
              <div className="overflow-x-auto rounded-lg border border-gray-200">
                <table className="min-w-full text-xs">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-200">
                      {columns.map((col) => (
                        <th
                          key={col}
                          className="px-3 py-2 text-left font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap"
                        >
                          {col === "_time" ? "Time" : col.replace(/_/g, " ")}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 bg-white">
                    {rows.slice(0, 20).map((row, i) => (
                      <tr
                        key={i}
                        className={`transition ${i === 0 && live ? "bg-blue-50/60" : "hover:bg-gray-50"}`}
                      >
                        {columns.map((col) => (
                          <td
                            key={col}
                            className={`px-3 py-2 font-mono whitespace-nowrap ${
                              col === "_time" ? "text-gray-400" : "text-gray-800"
                            }`}
                          >
                            {row[col] !== undefined ? String(row[col]) : "—"}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {rows.length > 20 && (
                <p className="text-xs text-gray-400 mt-1 text-right">
                  Showing 20 of {rows.length} samples
                </p>
              )}
            </div>
          )}

          {rows.length === 0 && !fetchError && (
            <p className="text-sm text-gray-400 italic">
              {hasEndpoint
                ? 'Click "Start live feed" or "Fetch once" to load data.'
                : "This asset has no API endpoint configured."}
            </p>
          )}
        </div>
      )}
    </div>
  )
}

export default function MyAssetsPage() {
  const { user, profile, loading: authLoading } = useUserProfile()
  const [assets, setAssets] = useState<AssetEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  const isOwner = profile?.userType === "datasource"
  const isClient = profile?.userType === "dataclient"

  useEffect(() => {
    if (!user || (!isOwner && !isClient)) {
      setAssets([])
      setLoading(false)
      return
    }

    let cancelled = false
    ;(async () => {
      try {
        setLoading(true)
        setError("")

        if (isOwner) {
          // Data owner: fetch their own assets directly
          const snap = await getDocs(
            query(collection(db, "assets"), where("ownerId", "==", user.uid))
          )
          const list: AssetEntry[] = snap.docs.map((d) => {
            const x = d.data()
            return {
              assetId: d.id,
              assetName: String(x.name ?? "Asset"),
              federationId: x.federationId ?? undefined,
              federationName: x.federationName ?? undefined,
              apiEndpoint: x.apiEndpoint ?? undefined,
              dataFormat: x.dataFormat ?? undefined,
              exchangeMode: x.exchangeMode ?? undefined,
              accessType: x.accessType ?? undefined,
              assetType: x.assetType ?? undefined,
              description: x.description ?? undefined,
              isOwner: true,
            }
          })
          if (!cancelled) setAssets(list)
        } else {
          // Data client: fetch approved access requests
          const snap = await getDocs(
            query(
              collection(db, "accessRequests"),
              where("requesterId", "==", user.uid),
              where("status", "in", ["approved", "accepted", "active", "granted"]),
            )
          )
          const requests = snap.docs.map((d) => {
            const x = d.data()
            return {
              assetId: String(x.assetId ?? ""),
              assetName: String(x.assetName ?? "Asset"),
              federationId: x.federationId ?? undefined,
              federationName: x.federationName ?? undefined,
            }
          }).filter((r) => r.assetId)

          const withDetails = await Promise.all(
            requests.map(async (r) => {
              try {
                const assetSnap = await getDoc(doc(db, "assets", r.assetId))
                if (!assetSnap.exists()) return { ...r, isOwner: false } as AssetEntry
                const d = assetSnap.data()
                return {
                  ...r,
                  apiEndpoint: d.apiEndpoint ?? undefined,
                  dataFormat: d.dataFormat ?? undefined,
                  exchangeMode: d.exchangeMode ?? undefined,
                  accessType: d.accessType ?? undefined,
                  assetType: d.assetType ?? undefined,
                  description: d.description ?? undefined,
                  isOwner: false,
                } as AssetEntry
              } catch {
                return { ...r, isOwner: false } as AssetEntry
              }
            })
          )
          if (!cancelled) setAssets(withDetails)
        }
      } catch {
        if (!cancelled) setError("Could not load your assets.")
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()

    return () => { cancelled = true }
  }, [user, isOwner, isClient])

  if (authLoading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-16 text-center text-gray-600">
        <Loader2 className="inline h-6 w-6 animate-spin text-blue-600" />
      </div>
    )
  }

  if (!user) {
    return (
      <div className="max-w-lg mx-auto px-4 py-16 text-center">
        <p className="text-gray-700 mb-4">Sign in to see your assets.</p>
        <Link href="/" className="text-blue-600 font-medium hover:underline">Back to home</Link>
      </div>
    )
  }

  const subtitle = isOwner
    ? "Your data assets. Start a live feed to stream real-time API data from any asset you own."
    : "Assets you have approved access to. Start a live feed to stream real-time API data."

  return (
    <div className="max-w-5xl mx-auto px-4 py-10">
      <div className="mb-8">
        <Link
          href={isOwner ? "/assets/browse" : "/access/my-requests"}
          className="text-sm text-blue-600 hover:underline"
        >
          ← {isOwner ? "Browse assets" : "My requests"}
        </Link>
        <div className="flex items-center gap-3 mt-4">
          <Activity className="h-8 w-8 text-blue-600" />
          <div>
            <h1 className="text-3xl font-bold text-gray-900">My Assets</h1>
            <p className="text-gray-500 text-sm mt-0.5">{subtitle}</p>
          </div>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 mb-6">
          {error}
        </div>
      )}

      {loading ? (
        <p className="text-gray-500 flex items-center gap-2">
          <Loader2 className="h-5 w-5 animate-spin" /> Loading assets…
        </p>
      ) : assets.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white p-8 text-center text-gray-600">
          <p className="font-medium">
            {isOwner ? "No assets found." : "No approved assets yet."}
          </p>
          <p className="text-sm mt-1 text-gray-400">
            {isOwner
              ? "Create an asset to start sharing data."
              : "When a Data Owner approves your access request, the asset will appear here."}
          </p>
          <Link
            href={isOwner ? "/assets/create" : "/access/my-requests"}
            className="mt-4 inline-block text-blue-600 font-medium hover:underline text-sm"
          >
            {isOwner ? "+ Create asset" : "View my requests"}
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {assets.map((asset) => (
            <AssetLiveFeed key={asset.assetId} asset={asset} />
          ))}
        </div>
      )}
    </div>
  )
}
