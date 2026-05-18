"use client"

import Link from "next/link"
import { useCallback, useEffect, useState } from "react"
import {
  collection,
  getDocs,
  query,
  where,
} from "firebase/firestore"
import {
  ChevronDown,
  ChevronRight,
  ExternalLink,
  FileText,
  Gavel,
  Loader2,
} from "lucide-react"
import { db } from "@/lib/firebase"
import { useUserProfile } from "@/lib/use-user-profile"

type AccessRequestRow = {
  id: string
  assetId: string
  assetName: string
  federationId: string
  federationName: string
  purpose: string
  status: string
  contractAccepted?: boolean
  accessType?: string
  createdAt?: { toDate?: () => Date }
}

type GovernanceSnippet = {
  id: string
  policies?: string
  roles?: string
  audit?: string
  usagePeriods?: string
  revocation?: string
}

type ComplianceSnippet = {
  id: string
  federationName?: string
  legalBasis?: unknown
  termsText?: string
}

function normalizeStatus(raw: string) {
  const s = raw.trim().toLowerCase()
  if (["approved", "accepted", "active", "granted"].includes(s)) return "approved" as const
  if (["rejected", "denied", "declined"].includes(s)) return "rejected" as const
  return "pending" as const
}

function statusBadgeClass(kind: ReturnType<typeof normalizeStatus>) {
  if (kind === "approved") return "bg-green-100 text-green-800 border-green-200"
  if (kind === "rejected") return "bg-red-100 text-red-800 border-red-200"
  return "bg-amber-100 text-amber-900 border-amber-200"
}

export default function MyAccessRequestsPage() {
  const { user, loading: authLoading } = useUserProfile()
  const [rows, setRows] = useState<AccessRequestRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [policyLoading, setPolicyLoading] = useState<string | null>(null)
  const [policyCache, setPolicyCache] = useState<
    Record<string, { governance: GovernanceSnippet[]; compliance: ComplianceSnippet[] } | undefined>
  >({})

  useEffect(() => {
    if (!user) {
      setRows([])
      setLoading(false)
      return
    }

    let cancelled = false
    ;(async () => {
      try {
        setLoading(true)
        setError("")
        const q = query(collection(db, "accessRequests"), where("requesterId", "==", user.uid))
        const snap = await getDocs(q)
        const list = snap.docs
          .map((d) => {
            const x = d.data()
            return {
              id: d.id,
              assetId: String(x.assetId ?? ""),
              assetName: String(x.assetName ?? "Asset"),
              federationId: String(x.federationId ?? ""),
              federationName: String(x.federationName ?? ""),
              purpose: String(x.purpose ?? ""),
              status: String(x.status ?? "pending"),
              contractAccepted: Boolean(x.contractAccepted),
              accessType: x.accessType != null ? String(x.accessType) : undefined,
              createdAt: x.createdAt,
            } as AccessRequestRow
          })
          .sort((a, b) => {
            const ta = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : 0
            const tb = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : 0
            return tb - ta
          })
        if (!cancelled) setRows(list)
      } catch {
        if (!cancelled) setError("Could not load your access requests.")
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [user])

  const loadPolicies = useCallback(async (r: AccessRequestRow) => {
    if (!r.federationId || !r.assetId) {
      setPolicyCache((prev) => ({
        ...prev,
        [r.id]: { governance: [], compliance: [] },
      }))
      return
    }

    setPolicyLoading(r.id)
    try {
      const govQ = query(collection(db, "governance"), where("federation", "==", r.federationId))
      const compQ = query(collection(db, "compliance"), where("federationId", "==", r.federationId))

      const [govSnap, compSnap] = await Promise.all([getDocs(govQ), getDocs(compQ)])

      const governance: GovernanceSnippet[] = govSnap.docs
        .filter((d) => {
          const assets = d.data().assets
          return Array.isArray(assets) && assets.includes(r.assetId)
        })
        .map((d) => {
          const x = d.data()
          return {
            id: d.id,
            policies: typeof x.policies === "string" ? x.policies : undefined,
            roles: typeof x.roles === "string" ? x.roles : undefined,
            audit: typeof x.audit === "string" ? x.audit : undefined,
            usagePeriods: typeof x.usagePeriods === "string" ? x.usagePeriods : undefined,
            revocation: typeof x.revocation === "string" ? x.revocation : undefined,
          }
        })

      const compliance: ComplianceSnippet[] = compSnap.docs.map((d) => {
        const x = d.data()
        return {
          id: d.id,
          federationName: typeof x.federationName === "string" ? x.federationName : undefined,
          legalBasis: x.legalBasis,
          termsText: typeof x.termsText === "string" ? x.termsText : undefined,
        }
      })

      setPolicyCache((prev) => ({ ...prev, [r.id]: { governance, compliance } }))
    } catch {
      setPolicyCache((prev) => ({ ...prev, [r.id]: { governance: [], compliance: [] } }))
    } finally {
      setPolicyLoading(null)
    }
  }, [])

  const toggleExpand = (r: AccessRequestRow) => {
    if (expandedId === r.id) {
      setExpandedId(null)
      return
    }
    setExpandedId(r.id)
    if (!policyCache[r.id]) {
      void loadPolicies(r)
    }
  }

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
        <p className="text-gray-700 mb-4">Sign in to see your access requests.</p>
        <Link href="/" className="text-blue-600 font-medium hover:underline">
          Back to home
        </Link>
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-10">
      <div className="mb-8">
        <Link href="/access" className="text-sm text-blue-600 hover:underline">
          ← Request access
        </Link>
        <h1 className="mt-4 text-3xl font-bold text-gray-900">My requests</h1>
        <p className="mt-2 text-gray-600 text-sm">
          Track consumption requests, review governance and compliance context registered for the federation, and open
          approved resources (asset endpoint or federation).
        </p>
      </div>

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>
      ) : null}

      {loading ? (
        <p className="text-gray-500 flex items-center gap-2">
          <Loader2 className="h-5 w-5 animate-spin" /> Loading requests…
        </p>
      ) : rows.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white p-8 text-center text-gray-600">
          <p>No access requests yet.</p>
          <Link href="/access" className="mt-4 inline-block text-blue-600 font-medium hover:underline">
            Submit a request
          </Link>
        </div>
      ) : (
        <ul className="space-y-4">
          {rows.map((r) => {
            const kind = normalizeStatus(r.status)
            const approved = kind === "approved"
            const expanded = expandedId === r.id
            const bundle = policyCache[r.id]
            const loadingPol = policyLoading === r.id

            return (
              <li key={r.id} className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
                <button
                  type="button"
                  onClick={() => toggleExpand(r)}
                  className="flex w-full items-start gap-3 px-5 py-4 text-left hover:bg-gray-50 transition-colors"
                >
                  {expanded ? (
                    <ChevronDown className="h-5 w-5 text-gray-500 shrink-0 mt-0.5" />
                  ) : (
                    <ChevronRight className="h-5 w-5 text-gray-500 shrink-0 mt-0.5" />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2 gap-y-1">
                      <span className="font-semibold text-gray-900">{r.assetName}</span>
                      <span
                        className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-medium ${statusBadgeClass(kind)}`}
                      >
                        {kind === "pending" ? "Pending approval" : kind === "approved" ? "Approved" : "Rejected"}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 mt-1">
                      {r.federationName ? (
                        <>
                          Federation: {r.federationName}
                          {" · "}
                        </>
                      ) : null}
                      {r.createdAt?.toDate
                        ? `Requested ${r.createdAt.toDate().toLocaleString()}`
                        : null}
                    </p>
                  </div>
                </button>

                {expanded && (
                  <div className="border-t border-gray-100 px-5 py-4 bg-gray-50/80 space-y-4">
                    <div>
                      <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Declared purpose</h3>
                      <p className="mt-1 text-sm text-gray-800 whitespace-pre-wrap">{r.purpose || "—"}</p>
                    </div>
                    <div className="flex flex-wrap gap-4 text-sm text-gray-600">
                      <span>
                        <strong className="text-gray-700">Contract accepted:</strong> {r.contractAccepted ? "Yes" : "No"}
                      </span>
                      {r.accessType ? (
                        <span>
                          <strong className="text-gray-700">Access type (asset):</strong> {r.accessType}
                        </span>
                      ) : null}
                    </div>

                    <div>
                      <h3 className="flex items-center gap-2 text-sm font-semibold text-gray-900">
                        <Gavel className="h-4 w-4 text-indigo-600" />
                        Associated policies
                      </h3>
                      {loadingPol ? (
                        <p className="mt-2 text-sm text-gray-500 flex items-center gap-2">
                          <Loader2 className="h-4 w-4 animate-spin" /> Loading governance & compliance…
                        </p>
                      ) : bundle ? (
                        <div className="mt-3 space-y-4">
                          <div>
                            <p className="text-xs font-medium text-gray-500 mb-2">Governance (matching federation + asset)</p>
                            {bundle.governance.length === 0 ? (
                              <p className="text-sm text-gray-500">No governance record lists this asset yet.</p>
                            ) : (
                              <ul className="space-y-3">
                                {bundle.governance.map((g) => (
                                  <li key={g.id} className="rounded-lg border border-white bg-white p-3 text-sm">
                                    {g.roles ? (
                                      <p className="text-gray-700">
                                        <strong className="text-gray-900">Roles:</strong> {g.roles}
                                      </p>
                                    ) : null}
                                    {g.policies ? (
                                      <p className="text-gray-700 mt-2">
                                        <strong className="text-gray-900">Policies:</strong> {g.policies}
                                      </p>
                                    ) : null}
                                    {g.usagePeriods ? (
                                      <p className="text-gray-700 mt-2">
                                        <strong className="text-gray-900">Usage periods:</strong> {g.usagePeriods}
                                      </p>
                                    ) : null}
                                    {g.audit ? (
                                      <p className="text-gray-700 mt-2">
                                        <strong className="text-gray-900">Audit:</strong> {g.audit}
                                      </p>
                                    ) : null}
                                    {g.revocation ? (
                                      <p className="text-gray-700 mt-2">
                                        <strong className="text-gray-900">Revocation:</strong> {g.revocation}
                                      </p>
                                    ) : null}
                                  </li>
                                ))}
                              </ul>
                            )}
                          </div>
                          <div>
                            <p className="text-xs font-medium text-gray-500 mb-2 flex items-center gap-1">
                              <FileText className="h-3.5 w-3.5" />
                              Compliance (federation)
                            </p>
                            {bundle.compliance.length === 0 ? (
                              <p className="text-sm text-gray-500">No compliance record for this federation.</p>
                            ) : (
                              <ul className="space-y-3">
                                {bundle.compliance.map((c) => (
                                  <li key={c.id} className="rounded-lg border border-white bg-white p-3 text-sm text-gray-700">
                                    {c.federationName ? <p className="font-medium text-gray-900">{c.federationName}</p> : null}
                                    {c.legalBasis != null ? (
                                      <p className="mt-1">
                                        <strong>Legal basis:</strong>{" "}
                                        {Array.isArray(c.legalBasis) ? c.legalBasis.join(", ") : String(c.legalBasis)}
                                      </p>
                                    ) : null}
                                    {c.termsText ? (
                                      <p className="mt-2 text-xs text-gray-600 line-clamp-6 whitespace-pre-wrap">{c.termsText}</p>
                                    ) : null}
                                  </li>
                                ))}
                              </ul>
                            )}
                          </div>
                        </div>
                      ) : null}
                    </div>

                    {approved && r.assetId ? (
                      <div className="flex flex-wrap gap-3 pt-2">
                        <Link
                          href={`/assets/${r.assetId}`}
                          className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700"
                        >
                          Access asset
                          <ExternalLink className="h-4 w-4" />
                        </Link>
                        {r.federationId ? (
                          <Link
                            href={`/federations/${r.federationId}`}
                            className="inline-flex items-center gap-2 rounded-lg border border-blue-600 bg-white px-4 py-2.5 text-sm font-semibold text-blue-700 hover:bg-blue-50"
                          >
                            Open federation
                            <ExternalLink className="h-4 w-4" />
                          </Link>
                        ) : null}
                      </div>
                    ) : !approved ? (
                      <p className="text-xs text-gray-500">
                        When the Data Owner approves this request, buttons to open the asset and federation will appear here.
                      </p>
                    ) : null}
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
