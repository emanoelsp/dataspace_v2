"use client"

import { useEffect, useState, useCallback, useRef } from "react"
import { collection, getDocs, query, where } from "firebase/firestore"
import { db } from "@/lib/firebase"
import { useUserProfile } from "@/lib/use-user-profile"
import { Activity, RefreshCw, Shield, Wifi, WifiOff } from "lucide-react"
import type { User } from "firebase/auth"
import type { DataspaceUserProfile } from "@/lib/use-user-profile"

// ─── Types ────────────────────────────────────────────────────────────────────

type SidecarToken = {
  token?: string
  status?: string
  dataClientId?: string
  dataClientName?: string
  dataOwnerId?: string
  dataOwnerName?: string
  assetId?: string
  assetName?: string
  federationId?: string
  federationName?: string
  equipmentType?: string
  issuedAt?: string
  expiresAt?: string
  permissions?: string[]
  contractRef?: string
  usageCount?: number
  lastUsedAt?: string
}

type SidecarLogEntry = {
  tokenId?: string
  assetId?: string
  assetName?: string
  equipmentType?: string
  dataClientId?: string
  dataClientName?: string
  endpoint?: string
  method?: string
  statusCode?: number
  responseTimeMs?: number
  success?: boolean
  error?: string
  proxyTimestamp?: string
  timestamp?: string
}

type FirestoreTimestamp = { toDate?: () => Date }

type AgreementDoc = {
  status?: string
  signedByConsumerAt?: FirestoreTimestamp | string | null
  signedByProviderAt?: FirestoreTimestamp | string | null
  createdAt?: FirestoreTimestamp | string | null
}

type FirestoreToken = {
  id: string
  status?: string
  assetId?: string
  assetName?: string
  federationId?: string
  federationName?: string
  expiresAt?: FirestoreTimestamp | Date
  issuedAt?: FirestoreTimestamp
  createdAt?: FirestoreTimestamp
}

type FirestoreLog = {
  id: string
  assetId?: string
  assetName?: string
  federationId?: string
  federationName?: string
  status?: string
  source?: string
  equipmentType?: string
  success?: boolean
  statusCode?: number
  endpoint?: string
  proxyTimestamp?: string
  createdAt?: FirestoreTimestamp
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toDate(value?: string | FirestoreTimestamp | Date | null): Date | null {
  if (!value) return null
  if (typeof value === "string") return new Date(value)
  if (value instanceof Date) return value
  if ("toDate" in value && value.toDate) return value.toDate()
  return null
}

function formatTime(value?: string | FirestoreTimestamp | Date | null): string {
  const d = toDate(value)
  if (!d) return "—"
  const p = (n: number) => String(n).padStart(2, "0")
  return `${p(d.getDate())}/${p(d.getMonth() + 1)} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}

function ttlLabel(value?: string | FirestoreTimestamp | Date | null): string {
  const d = toDate(value)
  if (!d) return "—"
  const diff = d.getTime() - Date.now()
  if (diff <= 0) {
    const ago = Math.abs(Math.round(diff / 60000))
    return ago < 60 ? `Expired ${ago}m ago` : `Expired ${Math.round(ago / 60)}h ago`
  }
  const min = Math.round(diff / 60000)
  return min < 60 ? `In ${min}m` : `In ${Math.floor(min / 60)}h ${min % 60}m`
}

function isExpired(value?: string | FirestoreTimestamp | Date | null): boolean {
  const d = toDate(value)
  return d ? d.getTime() <= Date.now() : true
}

function StatusBadge({ status }: { status?: string }) {
  const s = (status ?? "").toLowerCase()
  if (s === "active")
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-50 text-green-700 border border-green-200">
        ● Active
      </span>
    )
  if (s === "expired")
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-50 text-red-700 border border-red-200">
        ● Expired
      </span>
    )
  if (s === "revoked")
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-orange-50 text-orange-700 border border-orange-200">
        ● Revoked
      </span>
    )
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-gray-50 text-gray-600 border border-gray-200">
      {status ?? "—"}
    </span>
  )
}

function AuthBadge({ success, statusCode }: { success?: boolean; statusCode?: number }) {
  if (success === true)
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-50 text-green-700 border border-green-200">
        ✓ {statusCode ?? 200}
      </span>
    )
  if (success === false)
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-50 text-red-700 border border-red-200">
        ✗ {statusCode ?? "—"}
      </span>
    )
  return <span className="text-gray-400 text-xs">—</span>
}

// ─── Owner View ───────────────────────────────────────────────────────────────

function OwnerView({ profile, user }: { profile: DataspaceUserProfile; user: User }) {
  const [tab, setTab] = useState<"tokens" | "log" | "metrics">("tokens")
  const [tokens, setTokens] = useState<SidecarToken[]>([])
  const [logEntries, setLogEntries] = useState<SidecarLogEntry[]>([])
  const [sidecarOnline, setSidecarOnline] = useState<boolean | null>(null)
  const [loading, setLoading] = useState(false)
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null)
  const [autoRefresh, setAutoRefresh] = useState(false)
  const intervalRef = useRef<NodeJS.Timeout | null>(null)
  const [agreements, setAgreements] = useState<AgreementDoc[]>([])

  const hasSidecar = Boolean(profile.sidecarEndpoint)

  const fetchSidecar = useCallback(async () => {
    if (!hasSidecar) return
    setLoading(true)
    try {
      const idToken = await user.getIdToken()
      const [tokRes, logRes] = await Promise.all([
        fetch("/api/sidecar/monitor", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            idToken,
            sidecarUrl: profile.sidecarEndpoint,
            type: "tokens",
            limit: 200,
          }),
        }),
        fetch("/api/sidecar/monitor", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            idToken,
            sidecarUrl: profile.sidecarEndpoint,
            type: "access-log",
            limit: 200,
          }),
        }),
      ])

      if (tokRes.ok && logRes.ok) {
        const tokData = await tokRes.json()
        const logData = await logRes.json()
        setTokens(tokData.data?.tokens ?? [])
        setLogEntries(logData.data?.entries ?? [])
        setSidecarOnline(true)
      } else {
        setSidecarOnline(false)
      }
    } catch {
      setSidecarOnline(false)
    } finally {
      setLoading(false)
      setLastRefresh(new Date())
    }
  }, [user, profile.sidecarEndpoint, hasSidecar])

  useEffect(() => {
    fetchSidecar()
  }, [fetchSidecar])

  useEffect(() => {
    if (autoRefresh) {
      intervalRef.current = setInterval(fetchSidecar, 10_000)
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [autoRefresh, fetchSidecar])

  useEffect(() => {
    const fetchAgreements = async () => {
      try {
        const snap = await getDocs(
          query(collection(db, "contractAgreements"), where("ownerId", "==", user.uid))
        )
        setAgreements(snap.docs.map(d => d.data() as AgreementDoc))
      } catch { /* ignore */ }
    }
    fetchAgreements()
  }, [user.uid])

  const activeTokens = tokens.filter((t) => t.status === "active")
  const revokedTokens = tokens.filter((t) => t.status === "expired" || t.status === "revoked")
  const authorizedCount = logEntries.filter((e) => e.success === true).length
  const blockedCount = logEntries.filter((e) => e.success === false).length

  // ── Métricas computadas ────────────────────────────────────────────────────
  const totalAgreements = agreements.length
  const finalizedAgreements = agreements.filter(a => a.status === "finalized").length
  const conversionRate = totalAgreements > 0
    ? Math.round((finalizedAgreements / totalAgreements) * 100)
    : null

  const negotiationTimesH = agreements
    .filter(a => a.status === "finalized")
    .map(a => {
      const start = toDate(a.signedByConsumerAt ?? a.createdAt)
      const end = toDate(a.signedByProviderAt)
      return start && end ? (end.getTime() - start.getTime()) / 3_600_000 : null
    })
    .filter((v): v is number => v !== null && v >= 0)
  const avgNegotiationH = negotiationTimesH.length > 0
    ? (negotiationTimesH.reduce((a, b) => a + b, 0) / negotiationTimesH.length).toFixed(1)
    : null

  const avgUsagePerContract = activeTokens.length > 0
    ? (activeTokens.reduce((s, t) => s + (t.usageCount ?? 0), 0) / activeTokens.length).toFixed(1)
    : null

  const dspSuccessRate = logEntries.length > 0
    ? Math.round((logEntries.filter(e => e.success === true).length / logEntries.length) * 100)
    : null

  const validLatencies = logEntries.filter(e => e.responseTimeMs !== undefined)
  const avgLatencyMs = validLatencies.length > 0
    ? Math.round(validLatencies.reduce((s, e) => s + (e.responseTimeMs ?? 0), 0) / validLatencies.length)
    : null

  const expiredNotRenewed = tokens
    .filter(t => t.status === "expired" || t.status === "revoked")
    .filter(exp =>
      !tokens.some(
        a => a.dataClientId === exp.dataClientId &&
             a.assetId === exp.assetId &&
             a.status === "active"
      )
    ).length

  const kpis = [
    { label: "Active Tokens", value: activeTokens.length, cls: "text-green-600" },
    { label: "Expired / Revoked", value: revokedTokens.length, cls: "text-red-600" },
    { label: "Authorized Requests", value: authorizedCount, cls: "text-blue-600" },
    { label: "Blocked Requests", value: blockedCount, cls: "text-orange-600" },
  ]

  return (
    <div className="max-w-7xl mx-auto px-6 py-10">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-3xl font-bold text-blue-800 flex items-center gap-2">
            <Shield className="w-8 h-8" />
            Sidecar Access Monitor
          </h1>
          <p className="text-gray-500 mt-1 text-sm">
            Live view of who is accessing your data — active tokens, expiry, and every access decision.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {sidecarOnline !== null && (
            <span
              className={`flex items-center gap-1 text-sm font-medium px-3 py-1 rounded-full border ${
                sidecarOnline
                  ? "text-green-700 bg-green-50 border-green-200"
                  : "text-red-700 bg-red-50 border-red-200"
              }`}
            >
              {sidecarOnline ? <Wifi className="w-4 h-4" /> : <WifiOff className="w-4 h-4" />}
              {sidecarOnline ? "Sidecar online" : "Sidecar offline"}
            </span>
          )}
          {lastRefresh && (
            <span className="text-xs text-gray-400">
              Updated {lastRefresh.toLocaleTimeString("pt-BR")}
            </span>
          )}
          <button
            onClick={() => setAutoRefresh((v) => !v)}
            className={`text-sm px-3 py-1.5 rounded-md font-medium border transition ${
              autoRefresh
                ? "bg-blue-600 text-white border-blue-600"
                : "bg-white text-gray-700 border-gray-300 hover:border-blue-400"
            }`}
          >
            {autoRefresh ? "Auto-refresh ✓" : "Auto-refresh"}
          </button>
          <button
            onClick={fetchSidecar}
            disabled={loading || !hasSidecar}
            className="flex items-center gap-1 text-sm px-3 py-1.5 rounded-md font-medium border border-gray-300 bg-white text-gray-700 hover:border-blue-400 disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>
      </div>

      {!hasSidecar && (
        <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          No sidecar endpoint is configured in your connector profile. Add a sidecar endpoint to
          enable real-time P2P access monitoring.
        </div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
        {kpis.map(({ label, value, cls }) => (
          <div
            key={label}
            className="bg-white rounded-lg border border-gray-100 shadow-sm p-4"
          >
            <div className={`text-3xl font-bold ${cls}`}>{value}</div>
            <div className="text-xs text-gray-500 mt-1">{label}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b border-gray-200">
        {(
          [
            { key: "tokens", label: `Token Registry (${tokens.length})` },
            { key: "log", label: `Access Log (${logEntries.length})` },
            { key: "metrics", label: "Métricas" },
          ] as const
        ).map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition ${
              tab === key
                ? "border-blue-600 text-blue-700"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Token Registry */}
      {tab === "tokens" && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          {tokens.length === 0 ? (
            <p className="p-8 text-sm text-gray-400 text-center">
              {hasSidecar && sidecarOnline === true
                ? "No tokens registered in the sidecar yet."
                : hasSidecar && sidecarOnline === false
                  ? "Sidecar is offline — unable to retrieve token registry."
                  : "Configure a sidecar endpoint to see tokens here."}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100">
                    {["Client", "Asset", "Equipment", "Issued", "Expires", "Status"].map((h) => (
                      <th
                        key={h}
                        className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {tokens.map((t, i) => (
                    <tr key={i} className="hover:bg-gray-50 transition">
                      <td className="px-4 py-3">
                        <div className="font-medium text-gray-800 truncate max-w-[180px]">
                          {t.dataClientName ?? t.dataClientId ?? "—"}
                        </div>
                        {t.dataClientId && (
                          <div className="text-xs text-gray-400 font-mono truncate max-w-[180px]">
                            {t.dataClientId}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="truncate max-w-[160px] text-gray-800">
                          {t.assetName ?? t.assetId ?? "—"}
                        </div>
                        {t.federationName && (
                          <div className="text-xs text-gray-400 truncate max-w-[160px]">
                            {t.federationName}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className="uppercase font-mono text-xs bg-gray-100 px-2 py-1 rounded">
                          {t.equipmentType ?? "—"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-600 text-xs whitespace-nowrap">
                        {formatTime(t.issuedAt)}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`text-xs font-medium ${
                            !isExpired(t.expiresAt) ? "text-green-700" : "text-red-600"
                          }`}
                        >
                          {ttlLabel(t.expiresAt)}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={t.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Access Log */}
      {tab === "log" && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          {logEntries.length === 0 ? (
            <p className="p-8 text-sm text-gray-400 text-center">
              {hasSidecar && sidecarOnline === true
                ? "No access events logged yet."
                : hasSidecar && sidecarOnline === false
                  ? "Sidecar is offline — access log unavailable."
                  : "Configure a sidecar endpoint to see access events."}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100">
                    {["Time", "Client", "Endpoint", "Decision", "Response ms", "Equipment"].map(
                      (h) => (
                        <th
                          key={h}
                          className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide"
                        >
                          {h}
                        </th>
                      ),
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {logEntries.map((e, i) => (
                    <tr
                      key={i}
                      className={`hover:bg-gray-50 transition ${e.success === false ? "bg-red-50/40" : ""}`}
                    >
                      <td className="px-4 py-3 font-mono text-xs text-gray-600 whitespace-nowrap">
                        {formatTime(e.proxyTimestamp ?? e.timestamp)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-medium truncate max-w-[160px]">
                          {e.dataClientName ?? e.dataClientId ?? "—"}
                        </div>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-gray-600 truncate max-w-[180px]">
                        {e.method && (
                          <span className="text-blue-500 mr-1 font-semibold">{e.method}</span>
                        )}
                        {e.endpoint ?? "—"}
                      </td>
                      <td className="px-4 py-3">
                        <AuthBadge success={e.success} statusCode={e.statusCode} />
                        {e.error && (
                          <div className="text-xs text-red-500 mt-0.5 truncate max-w-[120px]">
                            {e.error}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-600 text-xs">
                        {e.responseTimeMs !== undefined ? `${e.responseTimeMs} ms` : "—"}
                      </td>
                      <td className="px-4 py-3">
                        <span className="uppercase font-mono text-xs bg-gray-100 px-2 py-1 rounded">
                          {e.equipmentType ?? "—"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Métricas */}
      {tab === "metrics" && (
        <div className="space-y-6">
          {/* Row 1: ciclo de dados (Firestore) */}
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Ciclo de Dados — Negociação de Contratos</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Taxa de Conversão</p>
                <p className="text-3xl font-bold text-blue-700">
                  {conversionRate !== null ? `${conversionRate}%` : "—"}
                </p>
                <p className="text-xs text-gray-400 mt-1">
                  {finalizedAgreements} finalizados / {totalAgreements} negociações
                </p>
                <p className="text-xs text-gray-400 mt-3 leading-relaxed">
                  Proporção de acordos solicitados que chegaram ao estado <em>finalized</em>.
                </p>
              </div>

              <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Tempo Médio de Negociação</p>
                <p className="text-3xl font-bold text-purple-700">
                  {avgNegotiationH !== null ? `${avgNegotiationH} h` : "—"}
                </p>
                <p className="text-xs text-gray-400 mt-1">
                  {negotiationTimesH.length} acordos finalizados com timestamp
                </p>
                <p className="text-xs text-gray-400 mt-3 leading-relaxed">
                  Intervalo médio entre assinatura do consumidor e aprovação do provedor.
                </p>
              </div>

              <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Acessos por Contrato Ativo</p>
                <p className="text-3xl font-bold text-teal-700">
                  {avgUsagePerContract !== null ? avgUsagePerContract : "—"}
                </p>
                <p className="text-xs text-gray-400 mt-1">
                  média de usos · {activeTokens.length} contratos ativos
                </p>
                <p className="text-xs text-gray-400 mt-3 leading-relaxed">
                  Média de requisições P2P realizadas por contrato vigente (proxy para volume de dados).
                </p>
              </div>
            </div>
          </div>

          {/* Row 2: conector DSP (sidecar) */}
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Conector DSP — Sidecar Proxy</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Taxa de Sucesso DSP</p>
                <p className={`text-3xl font-bold ${dspSuccessRate !== null && dspSuccessRate >= 90 ? "text-green-700" : dspSuccessRate !== null ? "text-orange-600" : "text-gray-400"}`}>
                  {dspSuccessRate !== null ? `${dspSuccessRate}%` : "—"}
                </p>
                <p className="text-xs text-gray-400 mt-1">
                  {authorizedCount} ok · {blockedCount} bloqueados
                </p>
                <p className="text-xs text-gray-400 mt-3 leading-relaxed">
                  Proporção de requisições P2P autorizadas pelo sidecar proxy.
                </p>
              </div>

              <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Latência Média do Conector</p>
                <p className={`text-3xl font-bold ${avgLatencyMs !== null && avgLatencyMs < 300 ? "text-green-700" : avgLatencyMs !== null ? "text-orange-600" : "text-gray-400"}`}>
                  {avgLatencyMs !== null ? `${avgLatencyMs} ms` : "—"}
                </p>
                <p className="text-xs text-gray-400 mt-1">
                  {validLatencies.length} amostras do log de acesso
                </p>
                <p className="text-xs text-gray-400 mt-3 leading-relaxed">
                  Tempo médio de resposta ao encaminhar requisições aos equipamentos.
                </p>
              </div>

              <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Tokens Expirados s/ Renovação</p>
                <p className={`text-3xl font-bold ${expiredNotRenewed === 0 ? "text-green-700" : expiredNotRenewed <= 2 ? "text-orange-600" : "text-red-600"}`}>
                  {tokens.length > 0 ? expiredNotRenewed : "—"}
                </p>
                <p className="text-xs text-gray-400 mt-1">
                  de {revokedTokens.length} expirados/revogados total
                </p>
                <p className="text-xs text-gray-400 mt-3 leading-relaxed">
                  Clientes que perderam acesso sem obter novo token — sinal de abandono silencioso.
                </p>
              </div>
            </div>
          </div>

          {/* Referências */}
          <div className="bg-gray-50 rounded-xl border border-gray-200 p-5 text-xs text-gray-500 space-y-4">
            <p className="font-semibold text-gray-600 text-sm">Fundamentação nas referências</p>

            <div className="space-y-1">
              <p className="font-medium text-gray-700">Taxa de Conversão · Tempo Médio de Negociação</p>
              <p>Nagel, R.; Walda, M.-K.; Meyer, J. P. <span className="italic">IntraDataspace: An architecture of a company-internal Dataspace</span>. eSAAM 2024 — 4th Eclipse Security, AI, Architecture and Modelling Conf. on Data Space. Fraunhofer ISST / IAV GmbH, 2024.</p>
              <p className="italic text-gray-400 border-l-2 border-gray-300 pl-3 mt-1">
                &ldquo;If a contract agreement is reached, which is the final state of the negotiation, the data represented by the asset can be transferred. Additional policy templates can be introduced at any time to accommodate new requirements.&rdquo;
              </p>
            </div>

            <div className="space-y-1">
              <p className="font-medium text-gray-700">Acessos por Contrato · Taxa de Sucesso DSP · Latência Média</p>
              <p>Siska, V.; Karagiannis, V.; Drobics, M. <span className="italic">Building a Dataspace: Technical Overview</span>. Gaia-X Hub Austria, 2023.</p>
              <p className="italic text-gray-400 border-l-2 border-gray-300 pl-3 mt-1">
                &ldquo;Data exchange services are responsible for the actual transactions including contracting, access and usage control, and logging transactions, auditing.&rdquo; (§2.2 — Data Exchange)
              </p>
            </div>

            <div className="space-y-1">
              <p className="font-medium text-gray-700">Tokens Expirados s/ Renovação</p>
              <p>IDSA. <span className="italic">IDS Reference Architecture Model 4.0</span>. International Data Spaces Association, 2024.</p>
              <p className="italic text-gray-400 border-l-2 border-gray-300 pl-3 mt-1">
                &ldquo;The control plane is responsible for all processes leading up to and following a transaction: identity and access management; handling offers; creating, negotiating, and settling contracts; logging.&rdquo; (§3.5)
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Client View ──────────────────────────────────────────────────────────────

function ClientView({ user }: { user: User }) {
  const [tab, setTab] = useState<"tokens" | "history">("tokens")
  const [tokens, setTokens] = useState<FirestoreToken[]>([])
  const [logs, setLogs] = useState<FirestoreLog[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true)
      try {
        const [tokSnap, logSnap] = await Promise.all([
          getDocs(query(collection(db, "accessTokens"), where("requesterId", "==", user.uid))),
          getDocs(query(collection(db, "accessLogs"), where("requesterId", "==", user.uid))),
        ])

        const sortByCreated = <T extends { createdAt?: FirestoreTimestamp }>(docs: T[]) =>
          docs.sort(
            (a, b) =>
              (b.createdAt?.toDate?.()?.getTime() ?? 0) -
              (a.createdAt?.toDate?.()?.getTime() ?? 0),
          )

        setTokens(
          sortByCreated(
            tokSnap.docs.map((d) => ({ id: d.id, ...d.data() } as FirestoreToken)),
          ),
        )
        setLogs(
          sortByCreated(
            logSnap.docs.map((d) => ({ id: d.id, ...d.data() } as FirestoreLog)),
          ),
        )
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [user.uid])

  const activeTokens = tokens.filter((t) => t.status === "active")
  const expiredTokens = tokens.filter((t) =>
    ["expired", "revoked"].includes(t.status ?? ""),
  )

  const kpis = [
    { label: "Total Tokens", value: tokens.length, cls: "text-blue-600" },
    { label: "Active Tokens", value: activeTokens.length, cls: "text-green-600" },
    { label: "Expired / Revoked", value: expiredTokens.length, cls: "text-red-600" },
    { label: "Access Events", value: logs.length, cls: "text-purple-600" },
  ]

  return (
    <div className="max-w-7xl mx-auto px-6 py-10">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-blue-800 flex items-center gap-2">
          <Activity className="w-8 h-8" />
          My Access Monitor
        </h1>
        <p className="text-gray-500 mt-1 text-sm">
          Track your active access tokens and your complete data access history.
        </p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
        {kpis.map(({ label, value, cls }) => (
          <div
            key={label}
            className="bg-white rounded-lg border border-gray-100 shadow-sm p-4"
          >
            <div className={`text-3xl font-bold ${cls}`}>{value}</div>
            <div className="text-xs text-gray-500 mt-1">{label}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b border-gray-200">
        {(
          [
            { key: "tokens", label: `My Tokens (${tokens.length})` },
            { key: "history", label: `My Access History (${logs.length})` },
          ] as const
        ).map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition ${
              tab === key
                ? "border-blue-600 text-blue-700"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="py-8 text-center text-sm text-gray-400">Loading...</p>
      ) : tab === "tokens" ? (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          {tokens.length === 0 ? (
            <p className="p-8 text-sm text-gray-400 text-center">
              No access tokens generated yet. Start a query on an asset page.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100">
                    {["Asset", "Federation", "Issued", "Expires", "Status"].map((h) => (
                      <th
                        key={h}
                        className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {tokens.map((t) => (
                    <tr key={t.id} className="hover:bg-gray-50 transition">
                      <td className="px-4 py-3">
                        <div className="font-medium text-gray-800 truncate max-w-[200px]">
                          {t.assetName ?? t.assetId ?? "—"}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-gray-600 truncate max-w-[160px]">
                        {t.federationName ?? t.federationId ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-600 whitespace-nowrap">
                        {formatTime(t.issuedAt)}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`text-xs font-medium ${
                            !isExpired(t.expiresAt) ? "text-green-700" : "text-red-600"
                          }`}
                        >
                          {ttlLabel(t.expiresAt)}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={t.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          {logs.length === 0 ? (
            <p className="p-8 text-sm text-gray-400 text-center">
              No access events found yet.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100">
                    {["Time", "Asset", "Federation", "Source", "Decision"].map((h) => (
                      <th
                        key={h}
                        className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {logs.map((l) => (
                    <tr key={l.id} className="hover:bg-gray-50 transition">
                      <td className="px-4 py-3 font-mono text-xs text-gray-600 whitespace-nowrap">
                        {formatTime(l.createdAt)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-medium truncate max-w-[180px]">
                          {l.assetName ?? l.assetId ?? "—"}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-gray-500 truncate max-w-[150px]">
                        {l.federationName ?? l.federationId ?? "—"}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`text-xs px-2 py-0.5 rounded-full font-medium border ${
                            l.source === "sidecar-proxy"
                              ? "bg-purple-50 text-purple-700 border-purple-200"
                              : "bg-blue-50 text-blue-700 border-blue-200"
                          }`}
                        >
                          {l.source === "sidecar-proxy" ? "Sidecar" : "App"}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {l.success !== undefined ? (
                          <AuthBadge success={l.success} statusCode={l.statusCode} />
                        ) : (
                          <span className="text-xs text-gray-600 capitalize">
                            {l.status ?? "—"}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function SidecarMonitorPage() {
  const { user, profile, loading } = useUserProfile()

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-gray-500 text-sm">
        Loading...
      </div>
    )
  }

  if (!user || !profile) {
    return (
      <div className="max-w-lg mx-auto py-16 px-4 text-center">
        <h1 className="text-2xl font-bold text-blue-800 mb-2">Access Monitor</h1>
        <p className="text-gray-600">Sign in to view the access monitor.</p>
      </div>
    )
  }

  if (profile.userType === "datasource") {
    return <OwnerView profile={profile} user={user} />
  }

  return <ClientView user={user} />
}
