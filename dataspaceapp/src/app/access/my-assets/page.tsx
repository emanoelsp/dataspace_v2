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
  Clock,
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
  isOwner: boolean
}

type Snapshot = {
  ts: string
  data: unknown
}

function formatTimestamp(d: Date) {
  const p = (n: number) => String(n).padStart(2, "0")
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}

function renderVal(v: unknown): string {
  if (v === null || v === undefined) return "—"
  if (typeof v === "object") return JSON.stringify(v)
  return String(v)
}

function extractPayload(raw: unknown): unknown {
  if (Array.isArray(raw) && raw.length > 0) return raw[0]
  if (typeof raw === "object" && raw !== null) {
    const d = raw as Record<string, unknown>
    if (Array.isArray(d.data) && d.data.length > 0) return d.data[0]
    return raw
  }
  return raw
}

// Generic renderer: primitives as tag grid, objects as labeled sections
function DataDisplay({ data }: { data: unknown }) {
  if (data === null || data === undefined) return null

  if (typeof data !== "object" || Array.isArray(data)) {
    return (
      <div className="text-xs font-mono bg-gray-50 rounded p-2 text-gray-800">
        {Array.isArray(data) ? JSON.stringify(data, null, 2) : String(data)}
      </div>
    )
  }

  const entries = Object.entries(data as Record<string, unknown>)
  const primitives = entries.filter(
    ([, v]) => typeof v !== "object" || v === null,
  )
  const nested = entries.filter(
    ([, v]) => typeof v === "object" && v !== null && !Array.isArray(v),
  )
  const arrays = entries.filter(([, v]) => Array.isArray(v))

  return (
    <div className="space-y-3">
      {/* Primitive fields */}
      {primitives.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
          {primitives.map(([k, v]) => (
            <div key={k} className="bg-gray-50 rounded-lg border border-gray-200 px-3 py-2 min-w-0">
              <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-wide truncate">{k}</p>
              <p className="text-sm text-gray-900 font-mono truncate" title={renderVal(v)}>
                {renderVal(v)}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Nested object sections */}
      {nested.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {nested.map(([sectionKey, sectionVal]) => {
            const subEntries = Object.entries(sectionVal as Record<string, unknown>)
            return (
              <div key={sectionKey} className="rounded-lg border border-gray-200 bg-white overflow-hidden">
                <div className="bg-gray-50 border-b border-gray-200 px-3 py-1.5">
                  <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">{sectionKey}</p>
                </div>
                <div className="px-3 py-2 space-y-1">
                  {subEntries.map(([k, v]) =>
                    typeof v === "object" && v !== null ? (
                      <div key={k}>
                        <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-wide">{k}</p>
                        <p className="text-xs font-mono text-gray-700 truncate">{JSON.stringify(v)}</p>
                      </div>
                    ) : (
                      <div key={k} className="flex justify-between gap-2 items-baseline">
                        <span className="text-xs text-gray-500 shrink-0 max-w-[45%] truncate">{k}</span>
                        <span className="text-xs font-mono text-gray-900 text-right truncate" title={renderVal(v)}>
                          {renderVal(v)}
                        </span>
                      </div>
                    )
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Array fields */}
      {arrays.map(([k, v]) => (
        <div key={k}>
          <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-wide mb-1">{k}</p>
          <p className="text-xs font-mono text-gray-700 bg-gray-50 rounded p-2 break-all">
            {JSON.stringify(v)}
          </p>
        </div>
      ))}
    </div>
  )
}

function AssetLiveFeed({ asset }: { asset: AssetEntry }) {
  const [expanded, setExpanded] = useState(false)
  const [live, setLive] = useState(false)
  const [snapshots, setSnapshots] = useState<Snapshot[]>([])
  const [lastFetch, setLastFetch] = useState<Date | null>(null)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [online, setOnline] = useState<boolean | null>(null)
  const [rawJson, setRawJson] = useState<string | null>(null)
  const [showRaw, setShowRaw] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const intervalRef = useRef<NodeJS.Timeout | null>(null)

  const fetchData = useCallback(async () => {
    if (!asset.apiEndpoint) return
    try {
      const res = await fetch(asset.apiEndpoint, { headers: { Accept: "application/json" } })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json = await res.json()
      setRawJson(JSON.stringify(json, null, 2))
      const payload = extractPayload(json)
      const now = new Date()
      setSnapshots((prev) => [{ ts: formatTimestamp(now), data: payload }, ...prev].slice(0, 60))
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
      setSnapshots([])
      setLive(true)
    }
  }

  const hasEndpoint = Boolean(asset.apiEndpoint)
  const latest = snapshots[0] ?? null

  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
      {/* Header row */}
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
          <div className="flex flex-wrap gap-4 text-xs text-gray-600">
            {asset.assetType && <span><strong className="text-gray-700">Type:</strong> {asset.assetType}</span>}
            {asset.dataFormat && <span><strong className="text-gray-700">Format:</strong> {asset.dataFormat}</span>}
            {asset.exchangeMode && <span><strong className="text-gray-700">Exchange:</strong> {asset.exchangeMode}</span>}
            {asset.accessType && <span><strong className="text-gray-700">Access:</strong> {asset.accessType}</span>}
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
              {live ? <><Square className="h-4 w-4" /> Stop feed</> : <><Play className="h-4 w-4" /> Start live feed</>}
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
            <pre className="bg-slate-900 text-emerald-300 text-xs rounded-lg p-4 overflow-x-auto max-h-72 leading-relaxed">
              {rawJson}
            </pre>
          )}

          {/* Latest reading */}
          {latest ? (
            <div>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Activity className="h-4 w-4 text-blue-600" />
                  <span className="text-sm font-semibold text-gray-700">Latest reading</span>
                  <span className="text-xs text-gray-400 font-mono bg-gray-100 px-2 py-0.5 rounded">
                    {latest.ts}
                  </span>
                  {live && (
                    <span className="text-xs text-green-600 animate-pulse">● updating every 2s</span>
                  )}
                </div>
                {snapshots.length > 1 && (
                  <button
                    type="button"
                    onClick={() => setHistoryOpen((v) => !v)}
                    className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-800"
                  >
                    <Clock className="h-3.5 w-3.5" />
                    {historyOpen ? "Hide history" : `History (${snapshots.length})`}
                  </button>
                )}
              </div>
              <DataDisplay data={latest.data} />
            </div>
          ) : (
            !fetchError && (
              <p className="text-sm text-gray-400 italic">
                {hasEndpoint
                  ? 'Click "Start live feed" or "Fetch once" to load data.'
                  : "This asset has no API endpoint configured."}
              </p>
            )
          )}

          {/* History: compact timestamps */}
          {historyOpen && snapshots.length > 1 && (
            <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
              <div className="bg-gray-50 border-b border-gray-200 px-3 py-2">
                <p className="text-xs font-semibold text-gray-500">Fetch history</p>
              </div>
              <div className="divide-y divide-gray-100 max-h-64 overflow-y-auto">
                {snapshots.slice(1).map((snap, i) => (
                  <div key={i} className="flex items-center gap-3 px-3 py-2">
                    <span className="font-mono text-xs text-gray-400 w-16 shrink-0">{snap.ts}</span>
                    <span className="text-xs text-gray-500 truncate">
                      {snap.data && typeof snap.data === "object"
                        ? Object.entries(snap.data as Record<string, unknown>)
                            .filter(([, v]) => typeof v !== "object")
                            .slice(0, 3)
                            .map(([k, v]) => `${k}: ${v}`)
                            .join("  ·  ")
                        : String(snap.data)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
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
