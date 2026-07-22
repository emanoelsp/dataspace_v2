"use client"

import Link from "next/link"
import { useCallback, useEffect, useState } from "react"
import {
  collection,
  getDocs,
  orderBy,
  query,
  where,
} from "firebase/firestore"
import { ArrowLeft, Check, Loader2, XCircle } from "lucide-react"
import { db } from "@/lib/firebase"
import { useUserProfile } from "@/lib/use-user-profile"
import {
  finalizeAccessRequestDecision,
  type AccessRequestDecision,
} from "@/lib/access-request-decisions"

type ReviewRow = {
  id: string
  assetId: string
  assetName: string
  federationName: string
  purpose: string
  status: string
  requesterEmail?: string
  requesterName?: string
  contractAgreementId?: string
  createdAt?: { toDate?: () => Date }
  decisionAt?: { toDate?: () => Date }
  decisionByEmail?: string
}

function formatDate(value: { toDate?: () => Date } | undefined) {
  if (!value?.toDate) return "—"
  try {
    return value.toDate().toLocaleString()
  } catch {
    return "—"
  }
}

export default function ReviewAccessRequestsPage() {
  const { user, profile, loading: profileLoading } = useUserProfile()
  const [rows, setRows] = useState<ReviewRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [actingId, setActingId] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!user) {
      setRows([])
      setLoading(false)
      return
    }
    try {
      setLoading(true)
      setError("")
      const q = query(
        collection(db, "accessRequests"),
        where("assetOwnerId", "==", user.uid),
        orderBy("createdAt", "desc"),
      )
      const snap = await getDocs(q)
      setRows(
        snap.docs.map((d) => {
          const data = d.data()
          return {
            id: d.id,
            assetId: (data.assetId as string) ?? "",
            assetName: (data.assetName as string) ?? "—",
            federationName: (data.federationName as string) ?? "",
            purpose: (data.purpose as string) ?? "",
            status: (data.status as string) ?? "pending",
            requesterEmail: data.requesterEmail as string | undefined,
            requesterName: data.requesterName as string | undefined,
            contractAgreementId: data.contractAgreementId as string | undefined,
            createdAt: data.createdAt as { toDate?: () => Date } | undefined,
            decisionAt: data.decisionAt as { toDate?: () => Date } | undefined,
            decisionByEmail: data.decisionByEmail as string | undefined,
          }
        }),
      )
    } catch {
      setError("Could not load access requests. If this persists, ensure the Firestore index exists.")
    } finally {
      setLoading(false)
    }
  }, [user])

  useEffect(() => {
    void load()
  }, [load])

  const decide = async (id: string, decision: AccessRequestDecision) => {
    if (!user) return
    setActingId(id)
    setError("")
    try {
      await finalizeAccessRequestDecision(db, id, user, decision)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not update the request.")
    } finally {
      setActingId(null)
    }
  }

  const isOwner = profile?.userType === "datasource"

  if (profileLoading) {
    return (
      <div className="container mx-auto max-w-5xl px-4 py-12 flex justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    )
  }

  if (!user) {
    return (
      <div className="container mx-auto max-w-5xl px-4 py-12">
        <p className="text-gray-600">Sign in as a Data Owner to review access requests.</p>
        <Link href="/" className="mt-4 inline-block text-blue-600 hover:underline">
          Back to home
        </Link>
      </div>
    )
  }

  if (!isOwner) {
    return (
      <div className="container mx-auto max-w-5xl px-4 py-12">
        <p className="text-gray-600">This page is only available to Data Owners.</p>
        <Link href="/dashboard" className="mt-4 inline-block text-blue-600 hover:underline">
          Dashboard
        </Link>
      </div>
    )
  }

  return (
    <div className="container mx-auto max-w-5xl px-4 py-8">
      <Link
        href="/dashboard"
        className="inline-flex items-center gap-2 text-sm text-gray-600 hover:text-blue-600 mb-6"
      >
        <ArrowLeft className="h-4 w-4" />
        Dashboard
      </Link>

      <h1 className="text-2xl font-semibold text-gray-900">Review access requests</h1>
      <p className="mt-2 text-gray-600 text-sm max-w-2xl">
        Approve or reject pending requests for your assets. Approving issues a credential grant and an access token
        for the requester, aligned with the asset control plane.
      </p>

      {error && (
        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      )}

      {loading ? (
        <div className="mt-10 flex justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
        </div>
      ) : rows.length === 0 ? (
        <p className="mt-10 text-gray-500">No access requests for your assets yet.</p>
      ) : (
        <ul className="mt-8 space-y-4">
          {rows.map((row) => {
            const pending = row.status === "pending"
            const approved = row.status === "approved"
            const rejected = row.status === "rejected"
            return (
              <li
                key={row.id}
                className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm"
              >
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-gray-900">{row.assetName}</p>
                    <p className="text-sm text-gray-500 mt-1">
                      Requester: {row.requesterName ?? "—"}{" "}
                      {row.requesterEmail ? `(${row.requesterEmail})` : ""}
                    </p>
                    {row.federationName ? (
                      <p className="text-sm text-gray-500">Federation: {row.federationName}</p>
                    ) : null}
                    <p className="mt-3 text-sm text-gray-700 whitespace-pre-wrap">{row.purpose}</p>
                    <p className="mt-2 text-xs text-gray-400">
                      Submitted: {formatDate(row.createdAt)}
                      {row.contractAgreementId ? ` · Agreement: ${row.contractAgreementId}` : ""}
                    </p>
                    {!pending && (
                      <p className="mt-2 text-xs text-gray-500">
                        Decision: {formatDate(row.decisionAt)}
                        {row.decisionByEmail ? ` · ${row.decisionByEmail}` : ""}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-2 shrink-0">
                    <span
                      className={`inline-flex rounded-full px-3 py-1 text-xs font-medium border ${
                        approved
                          ? "bg-green-100 text-green-800 border-green-200"
                          : rejected
                            ? "bg-red-100 text-red-800 border-red-200"
                            : "bg-amber-100 text-amber-900 border-amber-200"
                      }`}
                    >
                      {row.status}
                    </span>
                    {pending && (
                      <div className="flex gap-2">
                        <button
                          type="button"
                          disabled={actingId === row.id}
                          onClick={() => void decide(row.id, "approved")}
                          className="inline-flex items-center gap-1 rounded-lg bg-green-600 px-3 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
                        >
                          {actingId === row.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Check className="h-4 w-4" />
                          )}
                          Approve
                        </button>
                        <button
                          type="button"
                          disabled={actingId === row.id}
                          onClick={() => void decide(row.id, "rejected")}
                          className="inline-flex items-center gap-1 rounded-lg border border-red-300 bg-white px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
                        >
                          <XCircle className="h-4 w-4" />
                          Reject
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
