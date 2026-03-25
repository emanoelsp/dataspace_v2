"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import {
  collection,
  doc,
  getDocs,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from "firebase/firestore"
import { ChevronLeft, Plug, Workflow } from "lucide-react"
import { db } from "@/lib/firebase"
import { buildConnectorFields } from "@/lib/dataspace"
import { useUserProfile } from "@/lib/use-user-profile"

type ConnectorConnection = {
  id: string
  ownerId?: string
  ownerName?: string
  ownerEmail?: string
  requesterId?: string
  requesterName?: string
  requesterEmail?: string
  providerParticipantId?: string
  providerConnectorDspBaseUrl?: string
  consumerParticipantId?: string
  consumerConnectorDspBaseUrl?: string
  status: string
  createdAt?: { toDate?: () => Date }
  updatedAt?: { toDate?: () => Date }
}

function sortByTimestamp<T extends { updatedAt?: { toDate?: () => Date }; createdAt?: { toDate?: () => Date } }>(rows: T[]) {
  return [...rows].sort((a, b) => {
    const aTime = a.updatedAt?.toDate ? a.updatedAt.toDate().getTime() : a.createdAt?.toDate ? a.createdAt.toDate().getTime() : 0
    const bTime = b.updatedAt?.toDate ? b.updatedAt.toDate().getTime() : b.createdAt?.toDate ? b.createdAt.toDate().getTime() : 0
    return bTime - aTime
  })
}

function statusBadgeClass(status: string) {
  if (status === "active") return "border-green-200 bg-green-50 text-green-800"
  if (status === "requested") return "border-amber-200 bg-amber-50 text-amber-900"
  if (status === "rejected") return "border-red-200 bg-red-50 text-red-800"
  return "border-gray-200 bg-gray-50 text-gray-700"
}

export default function ConnectorProfilePage() {
  const { user, profile, loading } = useUserProfile()
  const [organizationLegalName, setOrganizationLegalName] = useState("")
  const [participantId, setParticipantId] = useState("")
  const [connectorDspBaseUrl, setConnectorDspBaseUrl] = useState("")
  const [connectorManagementBaseUrl, setConnectorManagementBaseUrl] = useState("")
  const [federatedCatalogUrl, setFederatedCatalogUrl] = useState("")
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ type: "ok" | "err"; text: string } | null>(null)
  const [connectionsLoading, setConnectionsLoading] = useState(false)
  const [connectionsMessage, setConnectionsMessage] = useState("")
  const [connectionsError, setConnectionsError] = useState("")
  const [connections, setConnections] = useState<ConnectorConnection[]>([])
  const [connectionsVersion, setConnectionsVersion] = useState(0)

  useEffect(() => {
    if (!profile) return
    setOrganizationLegalName(profile.organizationLegalName ?? "")
    setParticipantId(profile.participantId ?? "")
    setConnectorDspBaseUrl(profile.connectorDspBaseUrl ?? "")
    setConnectorManagementBaseUrl(profile.connectorManagementBaseUrl ?? "")
    setFederatedCatalogUrl(profile.federatedCatalogUrl ?? "")
  }, [profile])

  const isOwner = profile?.userType === "datasource"
  const isClient = profile?.userType === "dataclient"
  const connectorKind = isOwner ? "provider" : isClient ? "consumer" : "dataspace"
  const connectorReady = useMemo(
    () => Boolean((profile?.participantId ?? participantId).trim() && (profile?.connectorDspBaseUrl ?? connectorDspBaseUrl).trim()),
    [connectorDspBaseUrl, participantId, profile?.connectorDspBaseUrl, profile?.participantId],
  )

  useEffect(() => {
    const loadConnections = async () => {
      if (!user || !profile?.userType) {
        setConnections([])
        return
      }

      try {
        setConnectionsLoading(true)
        setConnectionsError("")

        const ref = collection(db, "connectorConnections")
        const connectionQuery = isOwner
          ? query(ref, where("ownerId", "==", user.uid))
          : query(ref, where("requesterId", "==", user.uid))

        const snapshot = await getDocs(connectionQuery)
        const rows = sortByTimestamp(
          snapshot.docs.map((docSnapshot) => ({
            id: docSnapshot.id,
            ...docSnapshot.data(),
          }) as ConnectorConnection),
        )

        setConnections(rows)
      } catch {
        setConnectionsError("Could not load connector connections.")
      } finally {
        setConnectionsLoading(false)
      }
    }

    void loadConnections()
  }, [isOwner, profile?.userType, user, connectionsVersion])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user) return
    setMessage(null)
    setSaving(true)
    try {
      const connector = buildConnectorFields({
        organizationLegalName,
        participantId,
        connectorDspBaseUrl,
        connectorManagementBaseUrl,
        federatedCatalogUrl,
      })
      if (connector.organizationLegalName.length < 2) {
        setMessage({ type: "err", text: "Legal organization name is required (min. 2 characters)." })
        return
      }
      if (connector.participantId.length < 2) {
        setMessage({ type: "err", text: "Participant ID is required." })
        return
      }
      if (!connector.connectorDspBaseUrl) {
        setMessage({ type: "err", text: "DSP / protocol base URL must be a valid URL." })
        return
      }
      await updateDoc(doc(db, "users", user.uid), {
        ...connector,
        updatedAt: serverTimestamp(),
      })
      setMessage({ type: "ok", text: `${connectorKind[0].toUpperCase()}${connectorKind.slice(1)} connector profile saved.` })
    } catch {
      setMessage({ type: "err", text: "Could not save. Check your connection and try again." })
    } finally {
      setSaving(false)
    }
  }

  const updateConnectionStatus = async (connectionId: string, status: "active" | "rejected" | "revoked") => {
    if (!isOwner) return

    try {
      setConnectionsError("")
      setConnectionsMessage("")

      await updateDoc(doc(db, "connectorConnections", connectionId), {
        status,
        updatedAt: serverTimestamp(),
        approvedAt: status === "active" ? serverTimestamp() : null,
        rejectedAt: status === "rejected" ? serverTimestamp() : null,
        revokedAt: status === "revoked" ? serverTimestamp() : null,
      })

      setConnectionsMessage(
        status === "active"
          ? "Consumer connector connection approved."
          : status === "rejected"
            ? "Consumer connector request rejected."
            : "Connector connection revoked.",
      )
      setConnectionsVersion((value) => value + 1)
    } catch {
      setConnectionsError("Could not update the connector connection status.")
    }
  }

  if (loading) {
    return (
      <div className="min-h-[40vh] flex items-center justify-center text-gray-600">
        Loading profile…
      </div>
    )
  }

  if (!user) {
    return (
      <div className="max-w-lg mx-auto py-16 px-4 text-center">
        <p className="text-gray-700 mb-4">Sign in to configure your connector profile.</p>
        <Link href="/" className="text-blue-600 font-medium hover:underline">
          Back to home
        </Link>
      </div>
    )
  }

  const processSteps = isOwner
    ? [
        "Create and register the provider connector.",
        "Approve consumer connector connections.",
        "Manage federation memberships linked to this connector.",
        "Publish asset policies and approve asset agreements.",
      ]
    : [
        "Register the consumer connector.",
        "Request a connection to a provider connector from a federation page.",
        "Request federation membership after the connector connection is active.",
        "Request asset agreements and consume only after approval and credential issuance.",
      ]

  const requestedConnections = connections.filter((connection) => connection.status === "requested")
  const activeConnections = connections.filter((connection) => connection.status === "active")

  return (
    <div className="max-w-5xl mx-auto py-8 px-4">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-blue-700 mb-6">
        <Link href="/" className="inline-flex items-center gap-1 hover:text-blue-900">
          <ChevronLeft size={18} />
          Home
        </Link>
        <span className="text-gray-400">/</span>
        <Link href="/profile" className="hover:text-blue-900">
          Profile
        </Link>
        <span className="text-gray-400">/</span>
        <span className="text-gray-600">Connector</span>
      </div>

      <div className="grid gap-8 lg:grid-cols-[1.1fr_0.9fr]">
        <section>
          <div className="flex items-center gap-3 mb-2">
            <Plug className="text-indigo-600" size={28} />
            <h1 className="text-2xl font-bold text-gray-900">{connectorKind[0].toUpperCase()}{connectorKind.slice(1)} connector profile</h1>
          </div>
          <p className="text-gray-600 text-sm mb-6">
            This profile represents your {connectorKind} connector identity in the INTRA dataspace control plane:
            participant ID, DSP endpoint, management endpoint, and optional catalog URL.
          </p>

          {!connectorReady ? (
            <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              Complete the participant ID and DSP URL first. Connector-to-connector connection, federation membership,
              and asset access requests depend on this profile.
            </div>
          ) : null}

          {message && (
            <div
              className={`mb-4 rounded-md px-4 py-3 text-sm ${
                message.type === "ok"
                  ? "bg-green-50 text-green-800 border border-green-200"
                  : "bg-red-50 text-red-800 border border-red-200"
              }`}
            >
              {message.text}
            </div>
          )}

          <form onSubmit={handleSubmit} className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">Legal organization name *</label>
              <input
                type="text"
                value={organizationLegalName}
                onChange={(e) => setOrganizationLegalName(e.target.value)}
                className="mt-1 block w-full rounded-md border border-gray-300 p-2 shadow-sm"
                required
                minLength={2}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Participant ID *</label>
              <input
                type="text"
                value={participantId}
                onChange={(e) => setParticipantId(e.target.value)}
                className="mt-1 block w-full rounded-md border border-gray-300 p-2 shadow-sm font-mono text-sm"
                required
                minLength={2}
                placeholder="e.g. INTRA_PARTICIPANT_ID"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">DSP / protocol base URL *</label>
              <input
                type="url"
                value={connectorDspBaseUrl}
                onChange={(e) => setConnectorDspBaseUrl(e.target.value)}
                className="mt-1 block w-full rounded-md border border-gray-300 p-2 shadow-sm font-mono text-sm"
                required
                placeholder="https://connector.example.org/api/v1/dsp"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Management API base URL (optional)</label>
              <input
                type="url"
                value={connectorManagementBaseUrl}
                onChange={(e) => setConnectorManagementBaseUrl(e.target.value)}
                className="mt-1 block w-full rounded-md border border-gray-300 p-2 shadow-sm font-mono text-sm"
                placeholder="https://connector.example.org/api/management"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Federated Catalog URL (optional)</label>
              <input
                type="url"
                value={federatedCatalogUrl}
                onChange={(e) => setFederatedCatalogUrl(e.target.value)}
                className="mt-1 block w-full rounded-md border border-gray-300 p-2 shadow-sm font-mono text-sm"
                placeholder="https://catalog.dataspace.example.org"
              />
            </div>

            <button
              type="submit"
              disabled={saving}
              className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-2.5 px-4 rounded-md disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save connector profile"}
            </button>
          </form>
        </section>

        <section className="space-y-6">
          <div className="rounded-xl border border-blue-100 bg-blue-50/70 p-5">
            <div className="flex items-center gap-2 text-blue-800 mb-2">
              <Workflow className="h-5 w-5" />
              <h2 className="font-semibold">Process in this role</h2>
            </div>
            <ol className="space-y-2 text-sm text-blue-900">
              {processSteps.map((step, index) => (
                <li key={step}>
                  <span className="font-semibold">{index + 1}.</span> {step}
                </li>
              ))}
            </ol>
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold text-gray-900 mb-2">
              {isOwner ? "Consumer connector requests" : "Provider connector connections"}
            </h2>
            <p className="text-sm text-gray-600 mb-4">
              {isOwner
                ? "Approve or reject consumer connector requests before federation membership and asset agreements."
                : "These are the provider connectors your consumer connector requested or established connections with."}
            </p>

            {connectionsMessage ? (
              <div className="mb-3 rounded-md border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
                {connectionsMessage}
              </div>
            ) : null}

            {connectionsError ? (
              <div className="mb-3 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                {connectionsError}
              </div>
            ) : null}

            {connectionsLoading ? (
              <p className="text-sm text-gray-500">Loading connector connections...</p>
            ) : connections.length === 0 ? (
              <p className="text-sm text-gray-500">
                {isOwner
                  ? "No consumer connector requests yet."
                  : "No provider connection requests yet. Open a federation and request the connector connection first."}
              </p>
            ) : (
              <div className="space-y-5">
                {isOwner ? (
                  <div className="text-sm text-gray-700">
                    <p><span className="font-medium">Requested:</span> {requestedConnections.length}</p>
                    <p className="mt-1"><span className="font-medium">Active:</span> {activeConnections.length}</p>
                  </div>
                ) : null}

                <ul className="space-y-3">
                  {connections.map((connection) => (
                    <li key={connection.id} className="rounded-lg border border-gray-200 bg-gray-50 p-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="font-medium text-gray-900">
                            {isOwner
                              ? connection.requesterName ?? connection.requesterEmail ?? connection.requesterId
                              : connection.ownerName ?? connection.ownerEmail ?? connection.ownerId}
                          </p>
                          <p className="mt-1 text-xs text-gray-500">
                            Provider participant: {connection.providerParticipantId || "not informed"}
                          </p>
                          <p className="mt-1 text-xs text-gray-500">
                            Consumer participant: {connection.consumerParticipantId || "not informed"}
                          </p>
                        </div>
                        <span className={`rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-wide ${statusBadgeClass(connection.status)}`}>
                          {connection.status}
                        </span>
                      </div>

                      <div className="mt-3 grid gap-2 text-xs text-gray-600">
                        <p>Provider DSP: {connection.providerConnectorDspBaseUrl || "not informed"}</p>
                        <p>Consumer DSP: {connection.consumerConnectorDspBaseUrl || "not informed"}</p>
                      </div>

                      {isOwner ? (
                        <div className="mt-3 flex flex-wrap gap-2">
                          {connection.status === "requested" ? (
                            <>
                              <button
                                type="button"
                                onClick={() => updateConnectionStatus(connection.id, "active")}
                                className="rounded-md bg-green-600 px-3 py-2 text-xs font-medium text-white hover:bg-green-700"
                              >
                                Approve connection
                              </button>
                              <button
                                type="button"
                                onClick={() => updateConnectionStatus(connection.id, "rejected")}
                                className="rounded-md bg-red-600 px-3 py-2 text-xs font-medium text-white hover:bg-red-700"
                              >
                                Reject
                              </button>
                            </>
                          ) : connection.status === "active" ? (
                            <button
                              type="button"
                              onClick={() => updateConnectionStatus(connection.id, "revoked")}
                              className="rounded-md bg-gray-700 px-3 py-2 text-xs font-medium text-white hover:bg-gray-800"
                            >
                              Revoke connection
                            </button>
                          ) : null}
                        </div>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  )
}
