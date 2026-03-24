"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { doc, serverTimestamp, updateDoc } from "firebase/firestore"
import { ChevronLeft, Plug } from "lucide-react"
import { db } from "@/lib/firebase"
import { buildDataOwnerConnectorFields } from "@/lib/dataspace"
import { useUserProfile } from "@/lib/use-user-profile"

export default function ConnectorProfilePage() {
  const { user, profile, loading } = useUserProfile()
  const [organizationLegalName, setOrganizationLegalName] = useState("")
  const [participantId, setParticipantId] = useState("")
  const [connectorDspBaseUrl, setConnectorDspBaseUrl] = useState("")
  const [connectorManagementBaseUrl, setConnectorManagementBaseUrl] = useState("")
  const [federatedCatalogUrl, setFederatedCatalogUrl] = useState("")
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ type: "ok" | "err"; text: string } | null>(null)

  useEffect(() => {
    if (!profile) return
    setOrganizationLegalName(profile.organizationLegalName ?? "")
    setParticipantId(profile.participantId ?? "")
    setConnectorDspBaseUrl(profile.connectorDspBaseUrl ?? "")
    setConnectorManagementBaseUrl(profile.connectorManagementBaseUrl ?? "")
    setFederatedCatalogUrl(profile.federatedCatalogUrl ?? "")
  }, [profile])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user) return
    setMessage(null)
    setSaving(true)
    try {
      const connector = buildDataOwnerConnectorFields({
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
        setMessage({ type: "err", text: "Participant ID is required (e.g. EDC participant identifier)." })
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
      setMessage({ type: "ok", text: "Connector profile saved." })
    } catch {
      setMessage({ type: "err", text: "Could not save. Check your connection and try again." })
    } finally {
      setSaving(false)
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

  if (profile?.userType !== "datasource") {
    return (
      <div className="max-w-lg mx-auto py-16 px-4 text-center">
        <p className="text-gray-700 mb-4">
          Connector registration is for <strong>Data Owner</strong> accounts only. Your account is a Data Client.
        </p>
        <Link href="/" className="text-blue-600 font-medium hover:underline">
          Back to home
        </Link>
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto py-8 px-4">
      <Link
        href="/"
        className="inline-flex items-center gap-1 text-sm text-blue-700 hover:text-blue-900 mb-6"
      >
        <ChevronLeft size={18} />
        Home
      </Link>

      <div className="flex items-center gap-3 mb-2">
        <Plug className="text-indigo-600" size={28} />
        <h1 className="text-2xl font-bold text-gray-900">Connector profile</h1>
      </div>
      <p className="text-gray-600 text-sm mb-6">
        Register your dataspace connector details after creating your Data Owner account. These fields mirror typical EDC /
        IDSA configuration (legal entity, participant ID, DSP URL, management API, federated catalog).
      </p>

      {message && (
        <div
          className={`mb-4 rounded-md px-4 py-3 text-sm ${
            message.type === "ok" ? "bg-green-50 text-green-800 border border-green-200" : "bg-red-50 text-red-800 border border-red-200"
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
            placeholder="e.g. EDC_PARTICIPANT_ID"
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
    </div>
  )
}
