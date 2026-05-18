"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  where,
  writeBatch,
} from "firebase/firestore"
import { ChevronLeft, Cpu, Save } from "lucide-react"
import { db } from "@/lib/firebase"
import {
  buildConnectorProfileFields,
  buildDefaultConnectorMirrorFields,
  buildEmptyConnectorProfile,
  CONNECTOR_ENVIRONMENTS,
  CONNECTOR_ROLES,
  CONNECTOR_SCOPE_TYPES,
  SIDECAR_PROTOCOLS,
} from "@/lib/connector-profiles"
import { buildOwnershipFields } from "@/lib/dataspace"
import { useUserProfile } from "@/lib/use-user-profile"

export default function ConfigureConnectorPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { user, profile, loading } = useUserProfile()
  const connectorId = searchParams?.get("id") ?? ""

  const defaultRole = profile?.userType === "datasource" ? "provider" : profile?.userType === "dataclient" ? "consumer" : "hybrid"

  const [form, setForm] = useState(() => buildEmptyConnectorProfile(defaultRole, profile?.organizationLegalName))
  const [pageLoading, setPageLoading] = useState(Boolean(connectorId))
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ type: "ok" | "err"; text: string } | null>(null)

  const isEditing = Boolean(connectorId)

  useEffect(() => {
    if (!profile) return
    if (connectorId) return
    setForm((current) => ({
      ...current,
      organizationLegalName: current.organizationLegalName || profile.organizationLegalName || "",
      connectorRole: current.connectorRole || defaultRole,
      isDefault: current.isDefault,
    }))
  }, [connectorId, defaultRole, profile])

  useEffect(() => {
    const loadConnector = async () => {
      if (!connectorId || !user) {
        setPageLoading(false)
        return
      }

      try {
        setPageLoading(true)
        setMessage(null)
        const snapshot = await getDoc(doc(db, "connectorProfiles", connectorId))
        if (!snapshot.exists()) {
          setMessage({ type: "err", text: "Connector profile not found." })
          return
        }

        const data = snapshot.data()
        if (data.ownerId !== user.uid) {
          setMessage({ type: "err", text: "You cannot edit a connector that belongs to another participant." })
          return
        }

        setForm({
          connectorName: typeof data.connectorName === "string" ? data.connectorName : "",
          organizationLegalName: typeof data.organizationLegalName === "string" ? data.organizationLegalName : "",
          participantId: typeof data.participantId === "string" ? data.participantId : "",
          connectorRole:
            (typeof data.connectorRole === "string" ? data.connectorRole : defaultRole) as "provider" | "consumer" | "hybrid",
          scopeType:
            (typeof data.scopeType === "string" ? data.scopeType : "project") as
              | "department"
              | "project"
              | "plant"
              | "customer"
              | "ecosystem"
              | "shared-service",
          scopeLabel: typeof data.scopeLabel === "string" ? data.scopeLabel : "",
          environment:
            (typeof data.environment === "string" ? data.environment : "production") as
              | "shop-floor"
              | "operations"
              | "lab"
              | "staging"
              | "production",
          networkZone: typeof data.networkZone === "string" ? data.networkZone : "",
          sidecarProtocol:
            (typeof data.sidecarProtocol === "string" ? data.sidecarProtocol : "http") as "http" | "mqtt" | "opcua" | "hybrid",
          sidecarEndpoint: typeof data.sidecarEndpoint === "string" ? data.sidecarEndpoint : "",
          certificateRef: typeof data.certificateRef === "string" ? data.certificateRef : "",
          connectorDspBaseUrl: typeof data.connectorDspBaseUrl === "string" ? data.connectorDspBaseUrl : "",
          connectorManagementBaseUrl: typeof data.connectorManagementBaseUrl === "string" ? data.connectorManagementBaseUrl : "",
          federatedCatalogUrl: typeof data.federatedCatalogUrl === "string" ? data.federatedCatalogUrl : "",
          isDefault: Boolean(data.isDefault),
          status: typeof data.status === "string" ? data.status : "active",
        })
      } catch {
        setMessage({ type: "err", text: "Could not load the connector profile." })
      } finally {
        setPageLoading(false)
      }
    }

    void loadConnector()
  }, [connectorId, defaultRole, user])

  const title = isEditing ? "Edit connector" : "Configure connector"
  const subtitle = useMemo(() => {
    if (profile?.userType === "datasource") {
      return "Create a confined provider connector for a project, department, plant, or ecosystem inside the organization."
    }
    if (profile?.userType === "dataclient") {
      return "Create a consumer connector for an internal team or project that will request trusted access to provider connectors."
    }
    return "Create a connector profile for the INTRA dataspace control plane."
  }, [profile?.userType])

  const setField = <K extends keyof typeof form>(field: K, value: (typeof form)[K]) => {
    setForm((current) => ({ ...current, [field]: value }))
  }

  const validate = () => {
    const normalized = buildConnectorProfileFields(form)

    if (normalized.connectorName.length < 2) {
      return "Connector name is required."
    }
    if (normalized.organizationLegalName.length < 2) {
      return "Legal organization name is required."
    }
    if (normalized.scopeLabel.length < 2) {
      return "Project, department, plant, or ecosystem label is required."
    }
    if (normalized.participantId.length < 2) {
      return "Participant ID is required."
    }
    if (!normalized.connectorDspBaseUrl) {
      return "DSP / protocol base URL must be a valid URL."
    }

    return null
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!user) return

    const validationError = validate()
    if (validationError) {
      setMessage({ type: "err", text: validationError })
      return
    }

    try {
      setSaving(true)
      setMessage(null)

      const connector = buildConnectorProfileFields(form)
      const existingSnapshot = await getDocs(query(collection(db, "connectorProfiles"), where("ownerId", "==", user.uid)))
      const existingRows = existingSnapshot.docs.map((snapshot) => ({
        id: snapshot.id,
        ...snapshot.data(),
      })) as Array<{ id: string; isDefault?: boolean; [key: string]: unknown }>
      const hasAnotherDefault = existingRows.some((row) => row.id !== connectorId && row.isDefault)
      const shouldBecomeDefault = connector.isDefault || existingRows.length === 0 || !hasAnotherDefault
      const batch = writeBatch(db)
      let targetId = connectorId

      if (isEditing) {
        batch.update(doc(db, "connectorProfiles", connectorId), {
          ...connector,
          isDefault: shouldBecomeDefault,
          updatedAt: serverTimestamp(),
        })
      } else {
        const createdRef = doc(collection(db, "connectorProfiles"))
        targetId = createdRef.id
        batch.set(createdRef, {
          ...connector,
          isDefault: shouldBecomeDefault,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          ...buildOwnershipFields(user),
        })
      }

      if (shouldBecomeDefault) {
        existingRows.forEach((row) => {
          if (row.id !== targetId && row.isDefault) {
            batch.update(doc(db, "connectorProfiles", row.id), {
              isDefault: false,
              updatedAt: serverTimestamp(),
            })
          }
        })

        batch.update(doc(db, "users", user.uid), {
          ...buildDefaultConnectorMirrorFields({ ...connector, isDefault: true }, targetId),
          updatedAt: serverTimestamp(),
        })
      }

      await batch.commit()
      setMessage({ type: "ok", text: isEditing ? "Connector updated successfully." : "Connector created successfully." })
      router.push("/profile/connector")
      router.refresh()
    } catch {
      setMessage({ type: "err", text: "Could not save the connector profile." })
    } finally {
      setSaving(false)
    }
  }

  if (loading || pageLoading) {
    return (
      <div className="min-h-[40vh] flex items-center justify-center text-gray-600">
        Loading connector form…
      </div>
    )
  }

  if (!user) {
    return (
      <div className="max-w-lg mx-auto py-16 px-4 text-center">
        <p className="text-gray-700 mb-4">Sign in to configure connectors.</p>
        <Link href="/" className="text-blue-600 font-medium hover:underline">
          Back to home
        </Link>
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto py-8 px-4">
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
        <Link href="/profile/connector" className="hover:text-blue-900">
          Connector profile
        </Link>
        <span className="text-gray-400">/</span>
        <span className="text-gray-600">{title}</span>
      </div>

      <div className="mb-6 flex items-center gap-3">
        <Cpu className="text-indigo-600" size={28} />
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{title}</h1>
          <p className="mt-1 max-w-3xl text-sm text-gray-600">{subtitle}</p>
        </div>
      </div>

      <div className="mb-6 rounded-xl border border-blue-100 bg-blue-50/70 p-5 text-sm text-blue-900">
        <p className="font-semibold text-blue-950">Intraorganizational connector model</p>
        <p className="mt-2">
          Use one connector per project, department, plant, customer enclave, or ecosystem when you need isolated maintenance windows,
          network zones, trust relationships, or sidecar connections to the shop floor.
        </p>
      </div>

      {message ? (
        <div
          className={`mb-4 rounded-md px-4 py-3 text-sm ${
            message.type === "ok"
              ? "border border-green-200 bg-green-50 text-green-800"
              : "border border-red-200 bg-red-50 text-red-800"
          }`}
        >
          {message.text}
        </div>
      ) : null}

      <form onSubmit={handleSubmit} className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm space-y-6">
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label htmlFor="connector-name" className="block text-sm font-medium text-gray-700">Connector name *</label>
            <input
              id="connector-name"
              type="text"
              value={form.connectorName}
              onChange={(event) => setField("connectorName", event.target.value)}
              className="mt-1 block w-full rounded-md border border-gray-300 p-2 shadow-sm"
              placeholder="e.g. Welding Line Project Connector"
              required
            />
          </div>
          <div>
            <label htmlFor="connector-org" className="block text-sm font-medium text-gray-700">Legal organization name *</label>
            <input
              id="connector-org"
              type="text"
              value={form.organizationLegalName}
              onChange={(event) => setField("organizationLegalName", event.target.value)}
              className="mt-1 block w-full rounded-md border border-gray-300 p-2 shadow-sm"
              required
            />
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="block text-sm font-medium text-gray-700">Connector role *</label>
            <select
              value={form.connectorRole}
              onChange={(event) => setField("connectorRole", event.target.value as typeof form.connectorRole)}
              className="mt-1 block w-full rounded-md border border-gray-300 p-2 shadow-sm"
            >
              {CONNECTOR_ROLES.map((value) => (
                <option key={value} value={value}>
                  {value === "provider" ? "Provider" : value === "consumer" ? "Consumer" : "Hybrid"}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="connector-participant-id" className="block text-sm font-medium text-gray-700">Participant ID *</label>
            <input
              id="connector-participant-id"
              type="text"
              value={form.participantId}
              onChange={(event) => setField("participantId", event.target.value)}
              className="mt-1 block w-full rounded-md border border-gray-300 p-2 font-mono text-sm shadow-sm"
              placeholder="urn:company:project:connector"
              required
            />
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="block text-sm font-medium text-gray-700">Scope type *</label>
            <select
              value={form.scopeType}
              onChange={(event) => setField("scopeType", event.target.value as typeof form.scopeType)}
              className="mt-1 block w-full rounded-md border border-gray-300 p-2 shadow-sm"
            >
              {CONNECTOR_SCOPE_TYPES.map((value) => (
                <option key={value} value={value}>
                  {value === "department"
                    ? "Department"
                    : value === "project"
                      ? "Project"
                      : value === "plant"
                        ? "Plant"
                        : value === "customer"
                          ? "Customer enclave"
                          : value === "ecosystem"
                            ? "External ecosystem"
                            : "Shared service"}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="connector-scope-label" className="block text-sm font-medium text-gray-700">Scope label *</label>
            <input
              id="connector-scope-label"
              type="text"
              value={form.scopeLabel}
              onChange={(event) => setField("scopeLabel", event.target.value)}
              className="mt-1 block w-full rounded-md border border-gray-300 p-2 shadow-sm"
              placeholder="e.g. Body Shop Line 3"
              required
            />
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="block text-sm font-medium text-gray-700">Environment *</label>
            <select
              value={form.environment}
              onChange={(event) => setField("environment", event.target.value as typeof form.environment)}
              className="mt-1 block w-full rounded-md border border-gray-300 p-2 shadow-sm"
            >
              {CONNECTOR_ENVIRONMENTS.map((value) => (
                <option key={value} value={value}>
                  {value === "shop-floor"
                    ? "Shop floor"
                    : value.charAt(0).toUpperCase() + value.slice(1)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Network zone</label>
            <input
              type="text"
              value={form.networkZone}
              onChange={(event) => setField("networkZone", event.target.value)}
              className="mt-1 block w-full rounded-md border border-gray-300 p-2 shadow-sm"
              placeholder="e.g. OT Zone A / VLAN 120"
            />
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="block text-sm font-medium text-gray-700">Sidecar protocol *</label>
            <select
              value={form.sidecarProtocol}
              onChange={(event) => setField("sidecarProtocol", event.target.value as typeof form.sidecarProtocol)}
              className="mt-1 block w-full rounded-md border border-gray-300 p-2 shadow-sm"
            >
              {SIDECAR_PROTOCOLS.map((value) => (
                <option key={value} value={value}>
                  {value.toUpperCase()}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="connector-sidecar-endpoint" className="block text-sm font-medium text-gray-700">Sidecar endpoint</label>
            <input
              id="connector-sidecar-endpoint"
              type="text"
              value={form.sidecarEndpoint}
              onChange={(event) => setField("sidecarEndpoint", event.target.value)}
              className="mt-1 block w-full rounded-md border border-gray-300 p-2 font-mono text-sm shadow-sm"
              placeholder="http://edge-gateway.local:8080 or mqtt://broker.local:1883"
            />
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label htmlFor="connector-dsp-url" className="block text-sm font-medium text-gray-700">DSP / protocol base URL *</label>
            <input
              id="connector-dsp-url"
              type="url"
              value={form.connectorDspBaseUrl}
              onChange={(event) => setField("connectorDspBaseUrl", event.target.value)}
              className="mt-1 block w-full rounded-md border border-gray-300 p-2 font-mono text-sm shadow-sm"
              placeholder="https://connector.example.org/api/v1/dsp"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Management API base URL</label>
            <input
              type="url"
              value={form.connectorManagementBaseUrl}
              onChange={(event) => setField("connectorManagementBaseUrl", event.target.value)}
              className="mt-1 block w-full rounded-md border border-gray-300 p-2 font-mono text-sm shadow-sm"
              placeholder="https://connector.example.org/api/management"
            />
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="block text-sm font-medium text-gray-700">Federated catalog URL</label>
            <input
              type="url"
              value={form.federatedCatalogUrl}
              onChange={(event) => setField("federatedCatalogUrl", event.target.value)}
              className="mt-1 block w-full rounded-md border border-gray-300 p-2 font-mono text-sm shadow-sm"
              placeholder="https://catalog.dataspace.example.org"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Certificate / identity reference</label>
            <input
              type="text"
              value={form.certificateRef}
              onChange={(event) => setField("certificateRef", event.target.value)}
              className="mt-1 block w-full rounded-md border border-gray-300 p-2 shadow-sm"
              placeholder="e.g. x509://corp-pki/provider-01"
            />
          </div>
        </div>

        <label className="flex items-start gap-3 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
          <input
            type="checkbox"
            checked={form.isDefault}
            onChange={(event) => setField("isDefault", event.target.checked)}
            className="mt-1"
          />
          <span className="text-sm text-gray-700">
            <span className="font-medium text-gray-900">Use as default connector</span>
            <span className="block mt-1">
              The current control-plane pages use the default connector mirrored to the participant profile. Keep this enabled
              if this connector should back federations and asset requests by default.
            </span>
          </span>
        </label>

        <div className="flex flex-wrap justify-end gap-3">
          <Link
            href="/profile/connector"
            className="rounded-md border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </Link>
          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-md bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
          >
            <Save className="h-4 w-4" />
            {saving ? "Saving..." : isEditing ? "Save connector" : "Create connector"}
          </button>
        </div>
      </form>
    </div>
  )
}
