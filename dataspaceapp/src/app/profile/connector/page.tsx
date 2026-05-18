"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import {
  addDoc,
  collection,
  doc,
  getDocs,
  query,
  serverTimestamp,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore"
import { ChevronLeft, Pencil, Plug, Plus, Trash2, Workflow } from "lucide-react"
import { db } from "@/lib/firebase"
import {
  buildConnectorProfileFields,
  buildDefaultConnectorMirrorFields,
  clearDefaultConnectorMirrorFields,
  getConnectorScopeLabel,
  getDefaultConnectorName,
} from "@/lib/connector-profiles"
import { buildOwnershipFields } from "@/lib/dataspace"
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

type ConnectorProfileRow = {
  id: string
  connectorName?: string
  organizationLegalName?: string
  participantId?: string
  connectorRole?: string
  scopeType?: string
  scopeLabel?: string
  environment?: string
  networkZone?: string
  sidecarProtocol?: string
  sidecarEndpoint?: string
  certificateRef?: string
  connectorDspBaseUrl?: string
  connectorManagementBaseUrl?: string
  federatedCatalogUrl?: string
  isDefault?: boolean
  status?: string
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
  if (status === "revoked") return "border-gray-300 bg-gray-100 text-gray-700"
  return "border-gray-200 bg-gray-50 text-gray-700"
}

function connectorBadgeClass(role?: string) {
  if (role === "provider") return "border-blue-200 bg-blue-50 text-blue-800"
  if (role === "consumer") return "border-emerald-200 bg-emerald-50 text-emerald-800"
  return "border-purple-200 bg-purple-50 text-purple-800"
}

export default function ConnectorProfilePage() {
  const { user, profile, loading } = useUserProfile()
  const [connectorsLoading, setConnectorsLoading] = useState(false)
  const [connectorsMessage, setConnectorsMessage] = useState("")
  const [connectorsError, setConnectorsError] = useState("")
  const [connectors, setConnectors] = useState<ConnectorProfileRow[]>([])
  const [connectionsLoading, setConnectionsLoading] = useState(false)
  const [connectionsMessage, setConnectionsMessage] = useState("")
  const [connectionsError, setConnectionsError] = useState("")
  const [connections, setConnections] = useState<ConnectorConnection[]>([])
  const [version, setVersion] = useState(0)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const legacyMigrationAttemptedRef = useRef(false)

  const isOwner = profile?.userType === "datasource"
  const isClient = profile?.userType === "dataclient"
  const defaultRole = isOwner ? "provider" : isClient ? "consumer" : "hybrid"

  useEffect(() => {
    const loadConnectors = async () => {
      if (!user) {
        setConnectors([])
        return
      }

      try {
        setConnectorsLoading(true)
        setConnectorsError("")

        const snapshot = await getDocs(query(collection(db, "connectorProfiles"), where("ownerId", "==", user.uid)))
        const rows = sortByTimestamp(
          snapshot.docs.map((docSnapshot) => ({
            id: docSnapshot.id,
            ...docSnapshot.data(),
          }) as ConnectorProfileRow),
        )

        if (
          rows.length === 0 &&
          !legacyMigrationAttemptedRef.current &&
          profile?.participantId &&
          profile?.connectorDspBaseUrl
        ) {
          legacyMigrationAttemptedRef.current = true

          const connector = buildConnectorProfileFields({
            connectorName:
              profile.connectorName ||
              getDefaultConnectorName(defaultRole, profile.organizationLegalName ?? ""),
            organizationLegalName: profile.organizationLegalName ?? "",
            participantId: profile.participantId,
            connectorRole: (profile.connectorRole as "provider" | "consumer" | "hybrid" | undefined) ?? defaultRole,
            scopeType:
              (profile.connectorScopeType as
                | "department"
                | "project"
                | "plant"
                | "customer"
                | "ecosystem"
                | "shared-service"
                | undefined) ?? "shared-service",
            scopeLabel: profile.connectorScopeLabel ?? "Legacy default connector",
            environment:
              (profile.connectorEnvironment as
                | "shop-floor"
                | "operations"
                | "lab"
                | "staging"
                | "production"
                | undefined) ?? "production",
            networkZone: profile.networkZone ?? "",
            sidecarProtocol:
              (profile.sidecarProtocol as "http" | "mqtt" | "opcua" | "hybrid" | undefined) ?? "http",
            sidecarEndpoint: profile.sidecarEndpoint ?? "",
            certificateRef: profile.certificateRef ?? "",
            connectorDspBaseUrl: profile.connectorDspBaseUrl,
            connectorManagementBaseUrl: profile.connectorManagementBaseUrl ?? "",
            federatedCatalogUrl: profile.federatedCatalogUrl ?? "",
            isDefault: true,
            status: "active",
          })

          const connectorRef = await addDoc(collection(db, "connectorProfiles"), {
            ...connector,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
            ...buildOwnershipFields(user),
          })

          await updateDoc(doc(db, "users", user.uid), {
            ...buildDefaultConnectorMirrorFields(connector, connectorRef.id),
            updatedAt: serverTimestamp(),
          })

          setVersion((current) => current + 1)
          return
        }

        setConnectors(rows)
      } catch {
        setConnectorsError("Could not load connector profiles.")
      } finally {
        setConnectorsLoading(false)
      }
    }

    void loadConnectors()
  }, [defaultRole, profile, user, version])

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
  }, [isOwner, profile?.userType, user, version])

  const defaultConnector = useMemo(
    () => connectors.find((connector) => connector.isDefault) ?? null,
    [connectors],
  )

  const requestedConnections = connections.filter((connection) => connection.status === "requested")
  const activeConnections = connections.filter((connection) => connection.status === "active")

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
      setVersion((value) => value + 1)
    } catch {
      setConnectionsError("Could not update the connector connection status.")
    }
  }

  const setDefaultConnector = async (connector: ConnectorProfileRow) => {
    if (!user) return

    try {
      setConnectorsError("")
      setConnectorsMessage("")

      const normalized = buildConnectorProfileFields({
        connectorName: connector.connectorName ?? "",
        organizationLegalName: connector.organizationLegalName ?? "",
        participantId: connector.participantId ?? "",
        connectorRole: (connector.connectorRole as "provider" | "consumer" | "hybrid" | undefined) ?? defaultRole,
        scopeType:
          (connector.scopeType as
            | "department"
            | "project"
            | "plant"
            | "customer"
            | "ecosystem"
            | "shared-service"
            | undefined) ?? "project",
        scopeLabel: connector.scopeLabel ?? "",
        environment:
          (connector.environment as
            | "shop-floor"
            | "operations"
            | "lab"
            | "staging"
            | "production"
            | undefined) ?? "production",
        networkZone: connector.networkZone ?? "",
        sidecarProtocol:
          (connector.sidecarProtocol as "http" | "mqtt" | "opcua" | "hybrid" | undefined) ?? "http",
        sidecarEndpoint: connector.sidecarEndpoint ?? "",
        certificateRef: connector.certificateRef ?? "",
        connectorDspBaseUrl: connector.connectorDspBaseUrl ?? "",
        connectorManagementBaseUrl: connector.connectorManagementBaseUrl ?? "",
        federatedCatalogUrl: connector.federatedCatalogUrl ?? "",
        isDefault: true,
        status: connector.status ?? "active",
      })

      const batch = writeBatch(db)
      connectors.forEach((row) => {
        const nextValue = row.id === connector.id
        if (row.isDefault !== nextValue) {
          batch.update(doc(db, "connectorProfiles", row.id), {
            isDefault: nextValue,
            updatedAt: serverTimestamp(),
          })
        }
      })

      batch.update(doc(db, "users", user.uid), {
        ...buildDefaultConnectorMirrorFields(normalized, connector.id),
        updatedAt: serverTimestamp(),
      })

      await batch.commit()
      setConnectorsMessage(`"${connector.connectorName ?? connector.participantId ?? "Connector"}" is now the default connector.`)
      setVersion((value) => value + 1)
    } catch {
      setConnectorsError("Could not define the default connector.")
    }
  }

  const removeConnector = async (connector: ConnectorProfileRow) => {
    if (!user) return

    try {
      setDeletingId(connector.id)
      setConnectorsError("")
      setConnectorsMessage("")

      const remaining = connectors.filter((row) => row.id !== connector.id)
      const batch = writeBatch(db)
      batch.delete(doc(db, "connectorProfiles", connector.id))

      if (connector.isDefault && remaining.length > 0) {
        const fallback = remaining[0]
        const normalized = buildConnectorProfileFields({
          connectorName: fallback.connectorName ?? "",
          organizationLegalName: fallback.organizationLegalName ?? "",
          participantId: fallback.participantId ?? "",
          connectorRole: (fallback.connectorRole as "provider" | "consumer" | "hybrid" | undefined) ?? defaultRole,
          scopeType:
            (fallback.scopeType as
              | "department"
              | "project"
              | "plant"
              | "customer"
              | "ecosystem"
              | "shared-service"
              | undefined) ?? "project",
          scopeLabel: fallback.scopeLabel ?? "",
          environment:
            (fallback.environment as
              | "shop-floor"
              | "operations"
              | "lab"
              | "staging"
              | "production"
              | undefined) ?? "production",
          networkZone: fallback.networkZone ?? "",
          sidecarProtocol:
            (fallback.sidecarProtocol as "http" | "mqtt" | "opcua" | "hybrid" | undefined) ?? "http",
          sidecarEndpoint: fallback.sidecarEndpoint ?? "",
          certificateRef: fallback.certificateRef ?? "",
          connectorDspBaseUrl: fallback.connectorDspBaseUrl ?? "",
          connectorManagementBaseUrl: fallback.connectorManagementBaseUrl ?? "",
          federatedCatalogUrl: fallback.federatedCatalogUrl ?? "",
          isDefault: true,
          status: fallback.status ?? "active",
        })

        batch.update(doc(db, "connectorProfiles", fallback.id), {
          isDefault: true,
          updatedAt: serverTimestamp(),
        })

        batch.update(doc(db, "users", user.uid), {
          ...buildDefaultConnectorMirrorFields(normalized, fallback.id),
          updatedAt: serverTimestamp(),
        })
      } else if (connector.isDefault) {
        batch.update(doc(db, "users", user.uid), {
          ...clearDefaultConnectorMirrorFields(),
          updatedAt: serverTimestamp(),
        })
      }

      await batch.commit()
      setConnectorsMessage(`Connector "${connector.connectorName ?? connector.participantId ?? connector.id}" removed.`)
      setVersion((value) => value + 1)
    } catch {
      setConnectorsError("Could not delete the connector.")
    } finally {
      setDeletingId(null)
    }
  }

  if (loading) {
    return (
      <div className="min-h-[40vh] flex items-center justify-center text-gray-600">
        Loading connector workspace…
      </div>
    )
  }

  if (!user) {
    return (
      <div className="max-w-lg mx-auto py-16 px-4 text-center">
        <p className="text-gray-700 mb-4">Sign in to configure and manage your connectors.</p>
        <Link href="/" className="text-blue-600 font-medium hover:underline">
          Back to home
        </Link>
      </div>
    )
  }

  const processSteps = isOwner
    ? [
        "Create one or more provider connectors for departments, projects, plants, or external ecosystems.",
        "Choose the default connector used by federations and assets when no dedicated connector is attached.",
        "Approve consumer connector connections before federation membership and asset agreements.",
        "Operate connector maintenance independently for each internal scope.",
      ]
    : [
        "Create one or more consumer connectors for internal projects or plants.",
        "Choose the default connector used to request provider connections and memberships.",
        "Request a connection to a provider connector from a federation page.",
        "Negotiate memberships and asset agreements only after the selected connector is trusted.",
      ]

  return (
    <div className="max-w-6xl mx-auto py-8 px-4">
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
        <span className="text-gray-600">Connector profile</span>
      </div>

      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <Plug className="text-indigo-600" size={28} />
            <h1 className="text-2xl font-bold text-gray-900">Connector profile</h1>
          </div>
          <p className="max-w-3xl text-sm text-gray-600">
            In the INTRA dataspace, one participant can operate multiple confined connectors across projects,
            departments, plants, and ecosystems. This workspace lists those connectors, lets you define the default
            one, and keeps the trust relationships created with other participants.
          </p>
        </div>

        <Link
          href="/profile/connector/configure"
          className="inline-flex items-center gap-2 rounded-md bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-indigo-700"
        >
          <Plus className="h-4 w-4" />
          Configure connector
        </Link>
      </div>

      <div className="grid gap-8 lg:grid-cols-[1.15fr_0.85fr]">
        <section className="space-y-6">
          <div className="rounded-xl border border-indigo-100 bg-indigo-50/60 p-5">
            <h2 className="text-lg font-semibold text-indigo-950">Default connector in use</h2>
            <p className="mt-2 text-sm text-indigo-900/80">
              Existing control-plane flows use the default connector mirrored to your participant profile. Dedicated
              federations can still reference specific connectors when configured for a local scope.
            </p>
            <div className="mt-4 rounded-lg border border-indigo-200 bg-white px-4 py-3 text-sm text-gray-700">
              {defaultConnector ? (
                <>
                  <p className="font-medium text-gray-900">{defaultConnector.connectorName}</p>
                  <p className="mt-1">{getConnectorScopeLabel(defaultConnector.scopeType, defaultConnector.scopeLabel)}</p>
                  <p className="mt-1 font-mono text-xs text-gray-600">{defaultConnector.participantId}</p>
                </>
              ) : (
                <p>No default connector configured yet.</p>
              )}
            </div>
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between gap-3 mb-4">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Configured connectors</h2>
                <p className="text-sm text-gray-600">
                  One legal participant can operate several intraorganizational connectors with isolated scope and maintenance.
                </p>
              </div>
              <span className="rounded-full border border-gray-200 bg-gray-50 px-3 py-1 text-xs font-semibold text-gray-700">
                {connectors.length} connector(s)
              </span>
            </div>

            {connectorsMessage ? (
              <div className="mb-3 rounded-md border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
                {connectorsMessage}
              </div>
            ) : null}

            {connectorsError ? (
              <div className="mb-3 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                {connectorsError}
              </div>
            ) : null}

            {connectorsLoading ? (
              <p className="text-sm text-gray-500">Loading connector profiles...</p>
            ) : connectors.length === 0 ? (
              <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 px-4 py-6 text-sm text-gray-600">
                No connector profiles yet. Create your first confined connector for this participant.
              </div>
            ) : (
              <ul className="space-y-4">
                {connectors.map((connector) => (
                  <li key={connector.id} className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-semibold text-gray-900">{connector.connectorName || "Unnamed connector"}</p>
                          <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide ${connectorBadgeClass(connector.connectorRole)}`}>
                            {connector.connectorRole || "connector"}
                          </span>
                          {connector.isDefault ? (
                            <span className="rounded-full border border-indigo-200 bg-indigo-100 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-indigo-800">
                              default
                            </span>
                          ) : null}
                        </div>
                        <p className="mt-1 text-sm text-gray-700">
                          {getConnectorScopeLabel(connector.scopeType, connector.scopeLabel)}
                        </p>
                        <p className="mt-2 font-mono text-xs text-gray-600">{connector.participantId || "No participant ID"}</p>
                      </div>

                      <span className={`rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-wide ${statusBadgeClass(connector.status ?? "active")}`}>
                        {connector.status ?? "active"}
                      </span>
                    </div>

                    <div className="mt-4 grid gap-3 text-xs text-gray-600 md:grid-cols-2">
                      <p><span className="font-medium text-gray-700">Organization:</span> {connector.organizationLegalName || "—"}</p>
                      <p><span className="font-medium text-gray-700">Environment:</span> {connector.environment || "—"}</p>
                      <p><span className="font-medium text-gray-700">Sidecar:</span> {(connector.sidecarProtocol || "—").toUpperCase()} {connector.sidecarEndpoint ? `· ${connector.sidecarEndpoint}` : ""}</p>
                      <p><span className="font-medium text-gray-700">Network zone:</span> {connector.networkZone || "—"}</p>
                      <p className="md:col-span-2"><span className="font-medium text-gray-700">DSP:</span> {connector.connectorDspBaseUrl || "—"}</p>
                      {connector.connectorManagementBaseUrl ? (
                        <p className="md:col-span-2"><span className="font-medium text-gray-700">Management API:</span> {connector.connectorManagementBaseUrl}</p>
                      ) : null}
                      {connector.federatedCatalogUrl ? (
                        <p className="md:col-span-2"><span className="font-medium text-gray-700">Catalog:</span> {connector.federatedCatalogUrl}</p>
                      ) : null}
                      {connector.certificateRef ? (
                        <p className="md:col-span-2"><span className="font-medium text-gray-700">Identity material:</span> {connector.certificateRef}</p>
                      ) : null}
                    </div>

                    <div className="mt-4 flex flex-wrap gap-2">
                      {!connector.isDefault ? (
                        <button
                          type="button"
                          onClick={() => void setDefaultConnector(connector)}
                          className="rounded-md bg-blue-600 px-3 py-2 text-xs font-medium text-white hover:bg-blue-700"
                        >
                          Set as default
                        </button>
                      ) : null}

                      <Link
                        href={`/profile/connector/configure?id=${encodeURIComponent(connector.id)}`}
                        className="inline-flex items-center gap-1 rounded-md border border-gray-300 bg-white px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-100"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                        Edit
                      </Link>

                      <button
                        type="button"
                        onClick={() => void removeConnector(connector)}
                        disabled={deletingId === connector.id}
                        className="inline-flex items-center gap-1 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700 hover:bg-red-100 disabled:opacity-60"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        {deletingId === connector.id ? "Deleting..." : "Delete"}
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
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
                : "These are the provider connectors your default consumer connector requested or established connections with."}
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
                                onClick={() => void updateConnectionStatus(connection.id, "active")}
                                className="rounded-md bg-green-600 px-3 py-2 text-xs font-medium text-white hover:bg-green-700"
                              >
                                Approve connection
                              </button>
                              <button
                                type="button"
                                onClick={() => void updateConnectionStatus(connection.id, "rejected")}
                                className="rounded-md bg-red-600 px-3 py-2 text-xs font-medium text-white hover:bg-red-700"
                              >
                                Reject
                              </button>
                            </>
                          ) : connection.status === "active" ? (
                            <button
                              type="button"
                              onClick={() => void updateConnectionStatus(connection.id, "revoked")}
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
