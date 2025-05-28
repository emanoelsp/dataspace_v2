"use client"

import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { doc, getDoc, updateDoc, deleteDoc } from "firebase/firestore"
import { db } from "@/lib/firebase"
import Link from "next/link"

// Toast simples
function Toast({ message, actionLabel, onAction, onClose }: { message: string, actionLabel: string, onAction: () => void, onClose: () => void }) {
    return (
        <div className="fixed inset-0 flex items-center justify-center z-50 bg-black/30">
            <div className="bg-white rounded-lg shadow-lg p-6 max-w-sm w-full border border-gray-200">
                <div className="mb-4 text-gray-800">{message}</div>
                <div className="flex justify-end gap-2">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 rounded bg-gray-200 hover:bg-gray-300 text-gray-800 font-medium"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={onAction}
                        className="px-4 py-2 rounded bg-red-600 hover:bg-red-700 text-white font-medium"
                    >
                        {actionLabel}
                    </button>
                </div>
            </div>
        </div>
    )
}

// Definição de tipos para Federation e EditForm
type Federation = {
    id: string
    name?: string
    description?: string
    scope?: string
    notes?: string
    federationType?: string
    governanceModel?: string
    memberCriteria?: string
    dataDomains?: string
    usageRules?: string
    licenseType?: string
    dataLaw?: string
    traceabilityAccepted?: boolean
    ownershipAccepted?: boolean
    termsAccepted?: boolean
    organization?: string
    contactEmail?: string
    website?: string
    createdAt?: unknown // ajuste de any para unknown
    updatedAt?: unknown // ajuste de any para unknown
    [key: string]: unknown // ajuste de any para unknown
}

type EditForm = Federation

export default function FederationDetailsPage() {
    const params = useParams()
    const router = useRouter()
    const [federation, setFederation] = useState<Federation | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [isEditing, setIsEditing] = useState(false)
    const [editForm, setEditForm] = useState<EditForm | null>(null)
    const [isDeleting, setIsDeleting] = useState(false)
    const [showDeleteToast, setShowDeleteToast] = useState(false)

    useEffect(() => {
        const fetchFederation = async () => {
            if (!params || !("id" in params)) {
                setLoading(false)
                return
            }

            try {
                setLoading(true)
                setError(null)

                const docRef = doc(db, "federations", params.id as string)
                const docSnap = await getDoc(docRef)

                if (docSnap.exists()) {
                    const data = docSnap.data()
                    setFederation({ id: docSnap.id, ...data })
                    setEditForm({ id: docSnap.id, ...data })
                } else {
                    setError("Federation not found")
                }
            } catch (err) {
                console.error("Error fetching federation:", err)
                setError("Error loading federation")
            } finally {
                setLoading(false)
            }
        }

        fetchFederation()
    }, [params])

    const handleEdit = () => setIsEditing(true)

    const handleSave = async () => {
        if (!editForm || !federation) return

        try {
            const docRef = doc(db, "federations", federation.id)
            await updateDoc(docRef, {
                ...editForm,
                updatedAt: new Date(),
            })
            setFederation(editForm)
            setIsEditing(false)
        } catch (err) {
            console.error("Error updating federation:", err)
            setError("Error updating federation")
        }
    }

    const handleCancel = () => {
        setEditForm(federation)
        setIsEditing(false)
    }

    // Toast de confirmação de delete
    const handleDelete = () => {
        setShowDeleteToast(true)
    }

    const confirmDelete = async () => {
        if (!federation) return
        try {
            setIsDeleting(true)
            setShowDeleteToast(false)
            const docRef = doc(db, "federations", federation.id)
            await deleteDoc(docRef)
            router.push("/federations/browse")
        } catch (err) {
            console.error("Error deleting federation:", err)
            setError("Error deleting federation")
            setIsDeleting(false)
        }
    }

    const handleInputChange = (field: string, value: string | boolean) => {
        if (editForm) {
            setEditForm({ ...editForm, [field]: value })
        }
    }

    if (loading) return <p className="p-8 text-gray-600">Loading...</p>
    if (error) return <p className="p-8 text-red-600">{error}</p>
    if (!federation) return <p className="p-8 text-gray-600">Federation not found</p>

    // Organização dos campos
    const federationFields = [
        { key: "name", label: "Federation Name" },
        { key: "description", label: "Description" },
        { key: "scope", label: "Scope" },
        { key: "notes", label: "Notes" },
    ]
    const domainFields = [
        { key: "federationType", label: "Federation Type" },
        { key: "governanceModel", label: "Governance Model" },
        { key: "memberCriteria", label: "Membership Criteria" },
        { key: "dataDomains", label: "Data Domains" },
        { key: "usageRules", label: "Usage Rules" },
        { key: "licenseType", label: "License Type" },
        { key: "dataLaw", label: "Data Law" },
        { key: "traceabilityAccepted", label: "Traceability Accepted" },
        { key: "ownershipAccepted", label: "Ownership Accepted" },
        { key: "termsAccepted", label: "Terms Accepted" },
    ]
    const orgFields = [
        { key: "organization", label: "Organization" },
    ]
    const contactFields = [
        { key: "contactEmail", label: "Contact Email" },
        { key: "website", label: "Website" },
    ]
    const metadataFields = [
        { key: "id", label: "Federation ID" },
        { key: "createdAt", label: "Created" },
        { key: "updatedAt", label: "Last Updated" },
    ]

    // Campos extras (se houver) que não estão nas listas acima
    const allKnownFields = [
        ...federationFields, ...domainFields, ...orgFields, ...contactFields, ...metadataFields
    ].map(f => f.key)
    const extraFields = Object.keys(federation)
        .filter(key => !allKnownFields.includes(key))

    // Função para renderizar campo
    const renderField = (field: { key: string, label: string }) => {
        if (federation[field.key] === undefined) return null
        const value = federation[field.key]
        if (isEditing) {
            if (typeof value === "boolean") {
                return (
                    <div key={field.key}>
                        <label className="block text-sm font-medium text-gray-700 mb-2">{field.label}</label>
                        <input
                            type="checkbox"
                            checked={!!editForm?.[field.key]}
                            onChange={e => handleInputChange(field.key, e.target.checked)}
                            className="h-4 w-4 text-blue-600 border-gray-300 rounded"
                        />
                    </div>
                )
            }
            if (field.key === "description" || field.key === "notes" || field.key === "usageRules") {
                return (
                    <div key={field.key}>
                        <label className="block text-sm font-medium text-gray-700 mb-2">{field.label}</label>
                        <textarea
                            value={typeof editForm?.[field.key] === "string" || typeof editForm?.[field.key] === "number"
                                ? String(editForm?.[field.key])
                                : ""}
                            onChange={e => handleInputChange(field.key, e.target.value)}
                            rows={field.key === "description" ? 4 : 2}
                            className="w-full p-3 border border-gray-300 rounded-md focus:ring-blue-600 focus:border-blue-600"
                        />
                    </div>
                )
            }
            return (
                <div key={field.key}>
                    <label className="block text-sm font-medium text-gray-700 mb-2">{field.label}</label>
                    <input
                        type="text"
                        value={
                            typeof editForm?.[field.key] === "string" || typeof editForm?.[field.key] === "number"
                                ? String(editForm?.[field.key])
                                : (editForm?.[field.key] !== undefined && editForm?.[field.key] !== null
                                    ? String(editForm?.[field.key])
                                    : "")
                        }
                        onChange={e => handleInputChange(field.key, e.target.value)}
                        className="w-full p-3 border border-gray-300 rounded-md focus:ring-blue-600 focus:border-blue-600"
                    />
                </div>
            )
        }
        // Visualização
        return (
            <div key={field.key}>
                <label className="block text-sm font-medium text-gray-700 mb-2">{field.label}</label>
                <p className="text-gray-700">
                    {typeof value === "boolean"
                        ? value ? "Yes" : "No"
                        : value?.toString()}
                </p>
            </div>
        )
    }

    return (
        <div className="max-w-4xl mx-auto p-8">
            {/* Toast de confirmação de delete */}
            {showDeleteToast && (
                <Toast
                    message={`Are you sure you want to delete "${federation.name}"? This action cannot be undone.`}
                    actionLabel={isDeleting ? "Deleting..." : "Delete"}
                    onAction={confirmDelete}
                    onClose={() => setShowDeleteToast(false)}
                />
            )}

            {/* Header */}
            <div className="flex justify-between items-start mb-8">
                <div>
                    <Link href="/federations/browse" className="text-blue-600 hover:underline mb-4 inline-block">
                        ← Back to Federations
                    </Link>
                </div>
                <div className="flex gap-2">
                    {!isEditing ? (
                        <>
                            <button onClick={handleEdit} className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700">
                                Edit
                            </button>
                            <button
                                onClick={handleDelete}
                                disabled={isDeleting}
                                className="bg-red-600 text-white px-4 py-2 rounded-md hover:bg-red-700 disabled:opacity-50"
                            >
                                {isDeleting ? "Deleting..." : "Delete"}
                            </button>
                        </>
                    ) : (
                        <>
                            <button onClick={handleSave} className="bg-green-600 text-white px-4 py-2 rounded-md hover:bg-green-700">
                                Save
                            </button>
                            <button onClick={handleCancel} className="bg-gray-600 text-white px-4 py-2 rounded-md hover:bg-gray-700">
                                Cancel
                            </button>
                        </>
                    )}
                </div>
            </div>

            {/* Dados da Federação */}
            <div className="bg-white rounded-lg shadow-sm border p-6 mb-8">
                <h2 className="text-2xl font-bold text-gray-800 mb-4">Federation Data</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {federationFields.map(renderField)}
                </div>
            </div>

            {/* Domínio da Federação */}
            <div className="bg-white rounded-lg shadow-sm border p-6 mb-8">
                <h2 className="text-2xl font-bold text-gray-800 mb-4">Domain & Rules</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {domainFields.map(renderField)}
                </div>
            </div>

            {/* Dados da Organização */}
            <div className="bg-white rounded-lg shadow-sm border p-6 mb-8">
                <h2 className="text-2xl font-bold text-gray-800 mb-4">Organization</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {orgFields.map(renderField)}
                </div>
            </div>

            {/* Contatos */}
            <div className="bg-white rounded-lg shadow-sm border p-6 mb-8">
                <h2 className="text-2xl font-bold text-gray-800 mb-4">Contacts</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {contactFields.map(renderField)}
                </div>
            </div>

            {/* Metadata */}
               <div className="bg-gray-50 rounded-lg border p-6 mb-8">
                <h3 className="text-lg font-medium text-gray-800 mb-4">Metadata</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-gray-600">
                    {metadataFields.map(field => {
                        if (federation[field.key] === undefined) return null
                        let value = federation[field.key]
                        if (field.key === "createdAt" || field.key === "updatedAt") {
                            // Corrigido para evitar uso de 'any'
                            if (
                                value &&
                                typeof value === "object" &&
                                "toDate" in value &&
                                typeof (value as { toDate?: () => Date }).toDate === "function"
                            ) {
                                value = (value as { toDate: () => Date }).toDate().toLocaleString()
                            } else if (typeof value === "string" || typeof value === "number" || value instanceof Date) {
                                value = new Date(value).toLocaleString()
                            } else {
                                value = ""
                            }
                        }
                        return (
                            <div key={field.key}>
                                <strong>{field.label}:</strong> {value !== undefined && value !== null ? String(value) : ""}
                            </div>
                        )
                    })}
                </div>
            </div>

            {/* Campos extras */}
            {extraFields.length > 0 && (
                <div className="bg-blue-50 rounded-lg border p-6 mb-8">
                    <h3 className="text-lg font-medium text-blue-800 mb-4">Other Federation Data</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-blue-900">
                        {extraFields.map((field) => (
                            <div key={field}>
                                <strong>{field.replace(/([A-Z])/g, " $1").replace(/^./, str => str.toUpperCase())}:</strong>{" "}
                                {typeof federation[field] === "boolean"
                                    ? federation[field] ? "Yes" : "No"
                                    : federation[field]?.toString()}
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Link para criar asset */}
            {!isEditing && (
                <div>
                    <div className="flex flex-col md:flex-row gap-4 w-full mt-4">
                        <Link
                            href={`/assets/create?federationId=${federation.id}&federationName=${encodeURIComponent(federation.name ?? "")}`}
                            className="inline-block bg-blue-600 text-white border border-blue-600 hover:bg-white hover:text-blue-600 font-semibold px-6 py-3 rounded-md shadow-sm transition-colors w-full text-center"
                        >
                            Add Assets To This Federation
                        </Link>
                        <Link
                            href={`/accordance/compliance/create?federationId=${federation.id}&federationName=${encodeURIComponent(federation.name ?? "")}`}
                            className="inline-block bg-white text-blue-600 border border-blue-600 hover:bg-blue-600 hover:text-white font-semibold px-6 py-3 rounded-md shadow-sm transition-colors w-full text-center"
                        >
                            Add Compliance Rules To This Federation
                        </Link>
                    </div>
                </div>
            )}
        </div>
    )
}