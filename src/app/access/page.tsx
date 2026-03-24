"use client"

import Link from "next/link"
import { useEffect, useMemo, useState } from "react"
import { addDoc, collection, getDocs, query, serverTimestamp, where } from "firebase/firestore"
import { Clock3, FileCheck2, KeyRound, ShieldCheck } from "lucide-react"
import { db } from "@/lib/firebase"
import { useAuthUser } from "@/lib/use-auth-user"
import { buildOwnershipFields, buildRequesterFields, sanitizeMultilineText } from "@/lib/dataspace"

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

export default function AccessPage() {
  const { user, loading: authLoading } = useAuthUser()
  const [assets, setAssets] = useState<AssetOption[]>([])
  const [requests, setRequests] = useState<AccessRequestItem[]>([])
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
        const mappedAssets = assetsSnapshot.docs.map((docSnapshot) => ({
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
        return
      }

      try {
        const requestsQuery = query(collection(db, "accessRequests"), where("requesterId", "==", user.uid))
        const requestsSnapshot = await getDocs(requestsQuery)
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

        setRequests(mappedRequests)
      } catch {
        setError("Failed to load your access requests.")
      }
    }

    fetchRequests()
  }, [user])

  const selectedAsset = useMemo(
    () => assets.find((asset) => asset.id === assetId) ?? null,
    [assetId, assets],
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

    try {
      setSubmitting(true)
      setError("")
      setMessage("")

      await addDoc(collection(db, "accessRequests"), {
        assetId: selectedAsset.id,
        assetName: selectedAsset.name,
        federationId: selectedAsset.federationId ?? "",
        federationName: selectedAsset.federationName ?? "",
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
              Controlled Access Request
            </div>
            <h1 className="text-3xl font-bold text-gray-900">Request access to a CPS asset</h1>
            <p className="mt-3 max-w-2xl text-gray-600">
              This flow supports the contract negotiation stage described in the dataspace architecture. The request is
              stored in Firestore with requester identity, asset ownership context, and audit metadata.
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
                I confirm that access will respect the asset contract, traceability requirements, and the declared
                purpose of use.
              </span>
            </label>

            <div className="flex flex-wrap gap-3">
              <button
                onClick={requestAccess}
                disabled={submitting || authLoading || loading}
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
            <h2 className="mb-4 text-lg font-bold text-gray-900">Why this matters</h2>
            <div className="space-y-4 text-sm text-gray-600">
              <div className="flex items-start gap-3">
                <ShieldCheck className="mt-0.5 h-5 w-5 text-blue-600" />
                <p>Authenticated identities prevent anonymous publishing and access negotiation.</p>
              </div>
              <div className="flex items-start gap-3">
                <FileCheck2 className="mt-0.5 h-5 w-5 text-blue-600" />
                <p>Each request is tied to a declared purpose to support usage control and compliance.</p>
              </div>
              <div className="flex items-start gap-3">
                <Clock3 className="mt-0.5 h-5 w-5 text-blue-600" />
                <p>Firestore timestamps provide a chronological audit trail for later review.</p>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-lg font-bold text-gray-900">My recent requests</h2>
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
