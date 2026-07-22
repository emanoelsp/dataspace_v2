"use client"

import Link from "next/link"
import { useEffect, useMemo, useState } from "react"
import { addDoc, collection, getDocs, query, serverTimestamp, where } from "firebase/firestore"
import { Clock3, FileCheck2, KeyRound, ShieldCheck } from "lucide-react"
import { db } from "@/lib/firebase"
import { useAuthUser } from "@/lib/use-auth-user"
import { buildOwnershipFields, buildRequesterFields, sanitizeMultilineText } from "@/lib/dataspace"
import { isPublishedInCatalog } from "@/lib/catalog-visibility"

interface AssetOption {
  id: string
  name: string
  federationId?: string
  federationName?: string
  purpose?: string
  accessType?: string
  ownerId?: string
  ownerEmail?: string
}

interface AccessRequestItem {
  id: string
  assetName: string
  purpose: string
  status: string
  createdAt?: { toDate?: () => Date }
}

interface MembershipItem {
  id: string
  federationId?: string
  federationName?: string
  membershipType?: string
  status: string
  createdAt?: { toDate?: () => Date }
}

interface AgreementItem {
  id: string
  assetId?: string
  assetName?: string
  status: string
  createdAt?: { toDate?: () => Date }
}

interface ConnectionItem {
  id: string
  ownerId?: string
  ownerName?: string
  ownerEmail?: string
  providerParticipantId?: string
  status: string
  createdAt?: { toDate?: () => Date }
}

export default function AccessPage() {
  const { user, loading: authLoading } = useAuthUser()
  const [assets, setAssets] = useState<AssetOption[]>([])
  const [requests, setRequests] = useState<AccessRequestItem[]>([])
  const [connections, setConnections] = useState<ConnectionItem[]>([])
  const [memberships, setMemberships] = useState<MembershipItem[]>([])
  const [agreements, setAgreements] = useState<AgreementItem[]>([])
  const [assetId, setAssetId] = useState("")
  const [purpose, setPurpose] = useState("")
  const [contractAccepted, setContractAccepted] = useState(false)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState("")
  const [error, setError] = useState("")

  useEffect(() => {
    const fetchAssets = async () => {
      try {
        setLoading(true)
        const assetsSnapshot = await getDocs(collection(db, "assets"))
        const mappedAssets = assetsSnapshot.docs
          .filter((docSnapshot) => isPublishedInCatalog(docSnapshot.data().publishedInCatalog))
          .map((docSnapshot) => ({
            id: docSnapshot.id,
            name: docSnapshot.data().name,
            federationId: docSnapshot.data().federationId,
            federationName: docSnapshot.data().federationName,
            purpose: docSnapshot.data().purpose,
            accessType: docSnapshot.data().accessType,
            ownerId: docSnapshot.data().ownerId,
            ownerEmail: docSnapshot.data().ownerEmail,
          })) as AssetOption[]

        setAssets(mappedAssets)
      } catch {
        setError("Failed to load available assets.")
      } finally {
        setLoading(false)
      }
    }

    fetchAssets()
  }, [])

  useEffect(() => {
    const fetchRequests = async () => {
      if (!user) {
        setRequests([])
        setConnections([])
        setMemberships([])
        setAgreements([])
        return
      }

      try {
        const [requestsSnapshot, connectionsSnapshot, membershipsSnapshot, agreementsSnapshot] = await Promise.all([
          getDocs(query(collection(db, "accessRequests"), where("requesterId", "==", user.uid))),
          getDocs(query(collection(db, "connectorConnections"), where("requesterId", "==", user.uid))),
          getDocs(query(collection(db, "federationMemberships"), where("requesterId", "==", user.uid))),
          getDocs(query(collection(db, "contractAgreements"), where("requesterId", "==", user.uid))),
        ])
        const mappedRequests = requestsSnapshot.docs
          .map((docSnapshot) => ({
            id: docSnapshot.id,
            assetName: docSnapshot.data().assetName,
            purpose: docSnapshot.data().purpose,
            status: docSnapshot.data().status ?? "pending",
            createdAt: docSnapshot.data().createdAt,
          }))
          .sort((a, b) => {
            const aTime = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : 0
            const bTime = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : 0
            return bTime - aTime
          }) as AccessRequestItem[]

        const mappedConnections = connectionsSnapshot.docs
          .map((docSnapshot) => ({
            id: docSnapshot.id,
            ownerId: docSnapshot.data().ownerId,
            ownerName: docSnapshot.data().ownerName,
            ownerEmail: docSnapshot.data().ownerEmail,
            providerParticipantId: docSnapshot.data().providerParticipantId,
            status: docSnapshot.data().status ?? "requested",
            createdAt: docSnapshot.data().createdAt,
          }))
          .sort((a, b) => {
            const aTime = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : 0
            const bTime = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : 0
            return bTime - aTime
          }) as ConnectionItem[]

        const mappedMemberships = membershipsSnapshot.docs
          .map((docSnapshot) => ({
            id: docSnapshot.id,
            federationId: docSnapshot.data().federationId,
            federationName: docSnapshot.data().federationName,
            membershipType: docSnapshot.data().membershipType,
            status: docSnapshot.data().status ?? "requested",
            createdAt: docSnapshot.data().createdAt,
          }))
          .sort((a, b) => {
            const aTime = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : 0
            const bTime = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : 0
            return bTime - aTime
          }) as MembershipItem[]

        const mappedAgreements = agreementsSnapshot.docs
          .map((docSnapshot) => ({
            id: docSnapshot.id,
            assetId: docSnapshot.data().assetId,
            assetName: docSnapshot.data().assetName,
            status: docSnapshot.data().status ?? "requested",
            createdAt: docSnapshot.data().createdAt,
          }))
          .sort((a, b) => {
            const aTime = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : 0
            const bTime = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : 0
            return bTime - aTime
          }) as AgreementItem[]

        setRequests(mappedRequests)
        setConnections(mappedConnections)
        setMemberships(mappedMemberships)
        setAgreements(mappedAgreements)
      } catch {
        setError("Failed to load your membership, agreement, or access history.")
      }
    }

    fetchRequests()
  }, [user])

  const selectedAsset = useMemo(
    () => assets.find((asset) => asset.id === assetId) ?? null,
    [assetId, assets],
  )
  const selectedConnection = useMemo(
    () =>
      selectedAsset
        ? connections.find((connection) => connection.ownerId === selectedAsset.ownerId && connection.status === "active") ?? null
        : null,
    [connections, selectedAsset],
  )
  const selectedMembership = useMemo(
    () =>
      selectedAsset?.federationId
        ? memberships.find((membership) => membership.federationId === selectedAsset.federationId && membership.status === "active") ?? null
        : null,
    [memberships, selectedAsset?.federationId],
  )
  const selectedAgreement = useMemo(
    () =>
      selectedAsset
        ? agreements.find((agreement) => agreement.assetId === selectedAsset.id && agreement.status === "finalized") ?? null
        : null,
    [agreements, selectedAsset],
  )
  const canRegisterAccessRequest = Boolean(
    selectedAsset &&
    selectedConnection &&
    (!selectedAsset.federationId || selectedMembership) &&
    selectedAgreement,
  )

  const requestAccess = async () => {
    if (!user) {
      setError("Sign in before requesting access.")
      return
    }

    if (!assetId || !purpose.trim() || !contractAccepted) {
      setError("Select an asset, describe the purpose, and accept the contract terms.")
      return
    }

    if (!selectedAsset) {
      setError("The selected asset is no longer available.")
      return
    }

    if (!selectedConnection) {
      setError("Connect your consumer connector to the provider connector before registering an asset access request.")
      return
    }

    if (selectedAsset.federationId && !selectedMembership) {
      setError("Activate federation membership before registering an asset access request.")
      return
    }

    if (!selectedAgreement) {
      setError("Finalize the asset agreement before registering an access request.")
      return
    }

    try {
      setSubmitting(true)
      setError("")
      setMessage("")

      await addDoc(collection(db, "accessRequests"), {
        assetId: selectedAsset.id,
        assetName: selectedAsset.name,
        federationId: selectedAsset.federationId ?? "",
        federationName: selectedAsset.federationName ?? "",
        connectorConnectionId: selectedConnection.id,
        federationMembershipId: selectedMembership?.id ?? "",
        contractAgreementId: selectedAgreement.id,
        assetOwnerId: selectedAsset.ownerId ?? "",
        assetOwnerEmail: selectedAsset.ownerEmail ?? "",
        accessType: selectedAsset.accessType ?? "",
        purpose: sanitizeMultilineText(purpose),
        contractAccepted,
        status: "pending",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        ...buildRequesterFields(user),
        ...buildOwnershipFields(user),
      })

      setAssetId("")
      setPurpose("")
      setContractAccepted(false)
      setMessage("Access request submitted and registered for audit.")

      const requestsQuery = query(collection(db, "accessRequests"), where("requesterId", "==", user.uid))
      const requestsSnapshot = await getDocs(requestsQuery)
      setRequests(
        requestsSnapshot.docs
          .map((docSnapshot) => ({
            id: docSnapshot.id,
            assetName: docSnapshot.data().assetName,
            purpose: docSnapshot.data().purpose,
            status: docSnapshot.data().status ?? "pending",
            createdAt: docSnapshot.data().createdAt,
          }))
          .sort((a, b) => {
            const aTime = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : 0
            const bTime = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : 0
            return bTime - aTime
          }),
      )
    } catch {
      setError("Failed to submit the access request.")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="max-w-6xl mx-auto px-6 py-10">
      <div className="grid gap-8 lg:grid-cols-[1.2fr_0.8fr]">
        <section className="rounded-2xl border border-gray-200 bg-white p-8 shadow-sm">
          <div className="mb-8">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-blue-50 px-4 py-2 text-sm font-medium text-blue-700">
              <KeyRound className="h-4 w-4" />
              Access Workspace
            </div>
            <h1 className="text-3xl font-bold text-gray-900">Follow the client-side connector process</h1>
            <p className="mt-3 max-w-2xl text-gray-600">
              In the INTRA flow, the Data Client first establishes a connector connection, then activates federation
              membership, then finalizes the asset agreement, and only after that registers the access request for
              audit and usage control.
            </p>
          </div>

          {!authLoading && !user && (
            <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              Sign in using the header before submitting a request. Browsing remains available, but write operations
              now require authenticated identities.
            </div>
          )}

          {message && (
            <div className="mb-4 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
              {message}
            </div>
          )}

          {error && (
            <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
              {error}
            </div>
          )}

          <div className="grid gap-6">
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700">Asset</label>
              <select
                value={assetId}
                onChange={(event) => setAssetId(event.target.value)}
                className="w-full rounded-lg border border-gray-300 px-4 py-3 shadow-sm focus:border-blue-600 focus:outline-none"
                disabled={loading}
              >
                <option value="">Select an asset</option>
                {assets.map((asset) => (
                  <option key={asset.id} value={asset.id}>
                    {asset.name} {asset.federationName ? `• ${asset.federationName}` : ""}
                  </option>
                ))}
              </select>
            </div>

            {selectedAsset && (
              <div className="rounded-xl border border-blue-100 bg-blue-50 p-4 text-sm text-blue-900">
                <p className="font-semibold">{selectedAsset.name}</p>
                <p className="mt-1">Federation: {selectedAsset.federationName || "Not informed"}</p>
                <p className="mt-1">Access type: {selectedAsset.accessType || "Not informed"}</p>
                <p className="mt-1">Declared purpose: {selectedAsset.purpose || "Not informed"}</p>
                <div className="mt-4 border-t border-blue-200/70 pt-4">
                  <p><span className="font-medium">Connector connection:</span> {selectedConnection?.status ?? "missing"}</p>
                  <p className="mt-1"><span className="font-medium">Federation membership:</span> {selectedAsset.federationId ? selectedMembership?.status ?? "missing" : "not required"}</p>
                  <p className="mt-1"><span className="font-medium">Asset agreement:</span> {selectedAgreement?.status ?? "missing"}</p>
                </div>
                {selectedAsset.federationId ? (
                  <div className="mt-4 flex flex-wrap gap-3">
                    <Link
                      href={`/federations/${selectedAsset.federationId}`}
                      className="rounded-lg border border-blue-600 px-4 py-2 font-semibold text-blue-700 transition hover:bg-white/70"
                    >
                      Open federation flow
                    </Link>
                    <Link
                      href={`/assets/${selectedAsset.id}`}
                      className="rounded-lg border border-blue-600 px-4 py-2 font-semibold text-blue-700 transition hover:bg-white/70"
                    >
                      Open asset agreement
                    </Link>
                  </div>
                ) : null}
              </div>
            )}

            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700">Purpose of use</label>
              <textarea
                value={purpose}
                onChange={(event) => setPurpose(event.target.value)}
                rows={4}
                placeholder="Describe why this access is required and how the data will be used."
                className="w-full rounded-lg border border-gray-300 px-4 py-3 shadow-sm focus:border-blue-600 focus:outline-none"
              />
            </div>

            <label className="flex items-start gap-3 rounded-xl border border-gray-200 bg-gray-50 p-4 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={contractAccepted}
                onChange={(event) => setContractAccepted(event.target.checked)}
                className="mt-1 h-4 w-4 rounded border-gray-300 text-blue-600"
              />
              <span>
                I confirm that this request respects the signed asset policy, traceability requirements, and the
                declared purpose of use.
              </span>
            </label>

            <div className="flex flex-wrap gap-3">
              <button
                onClick={requestAccess}
                disabled={submitting || authLoading || loading || !canRegisterAccessRequest}
                className="rounded-lg bg-blue-600 px-6 py-3 font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {submitting ? "Submitting..." : "Submit access request"}
              </button>
              <Link
                href="/search"
                className="rounded-lg border border-blue-600 px-6 py-3 font-semibold text-blue-600 transition hover:bg-blue-50"
              >
                Browse catalog
              </Link>
            </div>
          </div>
        </section>

        <section className="space-y-6">
          <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-lg font-bold text-gray-900">My connector connections</h2>
            {connections.length === 0 ? (
              <p className="text-sm text-gray-500">No provider connector connections registered yet.</p>
            ) : (
              <ul className="space-y-3">
                {connections.slice(0, 5).map((connection) => (
                  <li key={connection.id} className="rounded-xl border border-gray-100 bg-gray-50 p-4">
                    <p className="font-medium text-gray-900">
                      {connection.ownerName || connection.ownerEmail || connection.ownerId || "Provider connector"}
                    </p>
                    <p className="mt-2 text-xs uppercase tracking-wide text-blue-700">
                      {connection.status}
                      {connection.providerParticipantId ? ` · ${connection.providerParticipantId}` : ""}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-lg font-bold text-gray-900">My federation memberships</h2>
            {memberships.length === 0 ? (
              <p className="text-sm text-gray-500">No federation memberships registered yet.</p>
            ) : (
              <ul className="space-y-3">
                {memberships.slice(0, 5).map((membership) => (
                  <li key={membership.id} className="rounded-xl border border-gray-100 bg-gray-50 p-4">
                    <p className="font-medium text-gray-900">{membership.federationName || "Unnamed federation"}</p>
                    <p className="mt-2 text-xs uppercase tracking-wide text-indigo-700">
                      {membership.status}
                      {membership.membershipType ? ` · ${membership.membershipType}` : ""}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-lg font-bold text-gray-900">My asset agreements</h2>
            {agreements.length === 0 ? (
              <p className="text-sm text-gray-500">No contract agreements registered yet.</p>
            ) : (
              <ul className="space-y-3">
                {agreements.slice(0, 5).map((agreement) => (
                  <li key={agreement.id} className="rounded-xl border border-gray-100 bg-gray-50 p-4">
                    <p className="font-medium text-gray-900">{agreement.assetName || agreement.assetId || "Unnamed asset"}</p>
                    <p className="mt-2 text-xs uppercase tracking-wide text-blue-700">{agreement.status}</p>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-lg font-bold text-gray-900">Why this matters</h2>
            <div className="space-y-4 text-sm text-gray-600">
              <div className="flex items-start gap-3">
                <ShieldCheck className="mt-0.5 h-5 w-5 text-blue-600" />
                <p>Authenticated connector identities prevent connector-less membership and asset negotiation.</p>
              </div>
              <div className="flex items-start gap-3">
                <FileCheck2 className="mt-0.5 h-5 w-5 text-blue-600" />
                <p>Each request is tied to a connection, membership, agreement, and declared purpose.</p>
              </div>
              <div className="flex items-start gap-3">
                <Clock3 className="mt-0.5 h-5 w-5 text-blue-600" />
                <p>Firestore timestamps provide a chronological audit trail for later review.</p>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-lg font-bold text-gray-900">My recent requests</h2>
              <Link
                href="/access/my-requests"
                className="text-sm font-medium text-blue-600 hover:text-blue-800 hover:underline"
              >
                Open all requests →
              </Link>
            </div>
            {requests.length === 0 ? (
              <p className="text-sm text-gray-500">No access requests registered for the current session.</p>
            ) : (
              <ul className="space-y-3">
                {requests.slice(0, 5).map((request) => (
                  <li key={request.id} className="rounded-xl border border-gray-100 bg-gray-50 p-4">
                    <p className="font-medium text-gray-900">{request.assetName}</p>
                    <p className="mt-1 text-sm text-gray-600">{request.purpose}</p>
                    <p className="mt-2 text-xs uppercase tracking-wide text-blue-700">{request.status}</p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      </div>
    </div>
  )
}
