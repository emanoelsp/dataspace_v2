"use client"

import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { doc, getDoc, updateDoc, deleteDoc } from "firebase/firestore"
import { db } from "@/lib/firebase"
import Link from "next/link"
import { CheckCircle, ChevronLeft, Edit, Trash2 } from "lucide-react"

type Compliance = {
  id: string
  federation?: string
  federationName?: string
  federationId?: string
  legalBasis?: string | string[]
  termsText?: string
  termsAccepted?: boolean
  consentLogs?: string
  signature?: string
  signatureHash?: string
  createdAt?: { toDate?: () => Date }
  updatedAt?: { toDate?: () => Date } | string
}

function Toast({ show, message, onClose, error = false }: { show: boolean; message: string; onClose: () => void; error?: boolean }) {
  useEffect(() => {
    if (show) {
      const timer = setTimeout(onClose, 2500)
      return () => clearTimeout(timer)
    }
  }, [show, onClose])
  if (!show) return null
  return (
    <div className="fixed bottom-6 right-6 z-50">
      <div className={`${error ? "bg-red-600" : "bg-green-600"} text-white px-6 py-3 rounded-lg shadow-lg flex items-center gap-3`}>
        <CheckCircle size={20} />
        <span>{message}</span>
        <button onClick={onClose} className="ml-2 text-white font-bold">×</button>
      </div>
    </div>
  )
}

function DeleteModal({ show, onConfirm, onCancel }: { show: boolean; onConfirm: () => void; onCancel: () => void }) {
  if (!show) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-lg border border-gray-200 max-w-sm w-full p-8 relative">
        <h2 className="text-xl font-bold mb-4 text-gray-800">Delete Compliance</h2>
        <p className="mb-6 text-gray-700">Are you sure you want to delete this compliance record? This action cannot be undone.</p>
        <div className="flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="px-4 py-2 rounded bg-gray-200 hover:bg-gray-300 text-gray-800 font-medium"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="px-4 py-2 rounded bg-red-600 hover:bg-red-700 text-white font-medium"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  )
}

export default function ComplianceDetailsPage() {
  const params = useParams()
  const router = useRouter()
  const [compliance, setCompliance] = useState<Compliance | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showToast, setShowToast] = useState(false)
  const [toastMsg, setToastMsg] = useState("")
  const [toastError, setToastError] = useState(false)
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [editForm, setEditForm] = useState<Compliance | null>(null)

  useEffect(() => {
    const fetchCompliance = async () => {
      if (!params || !("id" in params)) {
        setLoading(false)
        return
      }
      try {
        setLoading(true)
        setError(null)
        const docRef = doc(db, "compliance", params.id as string)
        const docSnap = await getDoc(docRef)
        if (docSnap.exists()) {
          const data = docSnap.data()
          setCompliance({ id: docSnap.id, ...data })
          setEditForm({ id: docSnap.id, ...data })
        } else {
          setError("Compliance record not found")
        }
      } catch {
        setError("Error loading compliance record")
      } finally {
        setLoading(false)
      }
    }
    fetchCompliance()
  }, [params])

  // Edição
  const handleEdit = () => setIsEditing(true)
  const handleCancelEdit = () => {
    setEditForm(compliance)
    setIsEditing(false)
  }
  const handleInputChange = (field: keyof Compliance, value: string | boolean) => {
    if (editForm) setEditForm({ ...editForm, [field]: value })
  }
  const handleSave = async () => {
    if (!editForm || !compliance) return
    try {
      const docRef = doc(db, "compliance", compliance.id)
      await updateDoc(docRef, {
        ...editForm,
        updatedAt: new Date(),
      })
      setCompliance(editForm)
      setIsEditing(false)
      setToastMsg("Compliance updated successfully.")
      setToastError(false)
      setShowToast(true)
    } catch {
      setToastMsg("Error updating compliance.")
      setToastError(true)
      setShowToast(true)
    }
  }

  // Exclusão
  const handleDelete = () => setShowDeleteModal(true)
  const confirmDelete = async () => {
    if (!compliance) return
    try {
      setIsDeleting(true)
      setShowDeleteModal(false)
      const docRef = doc(db, "compliance", compliance.id)
      await deleteDoc(docRef)
      setToastMsg("Compliance deleted successfully.")
      setToastError(false)
      setShowToast(true)
      setTimeout(() => {
        router.push("/accordance/compliance/browse")
      }, 1200)
    } catch {
      setToastMsg("Failed to delete compliance.")
      setToastError(true)
      setShowToast(true)
      setIsDeleting(false)
    }
  }

  if (loading) return <p className="p-8 text-gray-600">Loading compliance...</p>
  if (error) return <p className="p-8 text-red-600">{error}</p>
  if (!compliance) return <p className="p-8 text-gray-600">Compliance not found</p>

  // Renderização formal do documento
  function renderFormalDocument() {
    return (
      <div className="bg-white p-8 rounded-lg border border-gray-300 shadow-lg font-serif text-gray-900 max-w-2xl mx-auto">
        <header className="mb-8 text-center">
          <h1 className="text-2xl font-bold mb-1 tracking-tight">Compliance Registration Document</h1>
          <p className="text-base text-gray-500">Generated on {compliance && compliance.createdAt?.toDate ? new Date(compliance.createdAt.toDate()).toLocaleDateString() : "-"}</p>
        </header>
        <section className="mb-6">
          <h2 className="font-semibold text-lg mb-1">1. Federation</h2>
          <p>
            <strong>Name:</strong> {compliance && (compliance.federationName || compliance.federation) || <span className="text-gray-400">N/A</span>}{" "}
            <span className="text-gray-400">({compliance && compliance.federationId || "N/A"})</span>
          </p>
        </section>
        <section className="mb-6">
          <h2 className="font-semibold text-lg mb-1">2. Legal Basis</h2>
          <p>
            <strong>Legal Basis:</strong>{" "}
            {compliance
              ? Array.isArray(compliance.legalBasis)
                ? compliance.legalBasis.join(", ")
                : compliance.legalBasis || <span className="text-gray-400">N/A</span>
              : <span className="text-gray-400">N/A</span>}
          </p>
        </section>
        <section className="mb-6">
          <h2 className="font-semibold text-lg mb-1">3. Terms & Conditions</h2>
          <p>
            <strong>Accepted:</strong> {compliance && compliance.termsAccepted ? "Yes" : "No"}
          </p>
          <p>
            <strong>Terms Text:</strong>{" "}
            <span className="whitespace-pre-line">{compliance && compliance.termsText ? compliance.termsText : <span className="text-gray-400">N/A</span>}</span>
          </p>
        </section>
        <section className="mb-6">
          <h2 className="font-semibold text-lg mb-1">4. Consent Logs</h2>
          <p>
            <strong>Details:</strong> {compliance && compliance.consentLogs ? compliance.consentLogs : <span className="text-gray-400">N/A</span>}
          </p>
        </section>
        <section className="mb-6">
          <h2 className="font-semibold text-lg mb-1">5. Digital Signature</h2>
          <p>
            <strong>Signature:</strong> {compliance && compliance.signature ? compliance.signature : <span className="text-gray-400">N/A</span>}
          </p>
          <p className="text-xs text-gray-400 mt-2">
            <strong>Signature Hash:</strong> {compliance && compliance.signatureHash ? compliance.signatureHash : "-"}
          </p>
        </section>
        <footer className="mt-8 text-xs text-gray-400">
          Created: {compliance && compliance.createdAt?.toDate ? new Date(compliance.createdAt.toDate()).toLocaleString() : "-"}
          {compliance && compliance.updatedAt && (
            <> | Updated: {typeof compliance.updatedAt === "object" && "toDate" in compliance.updatedAt && typeof compliance.updatedAt.toDate === "function"
              ? new Date(compliance.updatedAt.toDate()).toLocaleString()
                : compliance.updatedAt
                ? (typeof compliance.updatedAt === "string" || compliance.updatedAt instanceof Date
                    ? new Date(compliance.updatedAt).toLocaleString()
                    : "-")
                : "-"
            }</>
          )}
        </footer>
      </div>
    )
  }

  const complianceFields: { key: keyof Compliance, label: string, type?: string }[] = [
    { key: "federation", label: "Federation" },
    { key: "legalBasis", label: "Legal Basis" },
    { key: "termsText", label: "Terms & Conditions" },
    { key: "termsAccepted", label: "Terms Accepted", type: "boolean" },
    { key: "consentLogs", label: "Consent Logs" },
    { key: "signature", label: "Digital Signature" },
    { key: "signatureHash", label: "Signature Hash" },
  ]

  const renderField = (field: { key: keyof Compliance, label: string, type?: string }) => {
    if (isEditing) {
      if (field.type === "boolean") {
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
      if (field.key === "termsText" || field.key === "consentLogs") {
        return (
          <div key={field.key}>
            <label className="block text-sm font-medium text-gray-700 mb-2">{field.label}</label>
            <textarea
              value={editForm?.[field.key] || ""}
              onChange={e => handleInputChange(field.key, e.target.value)}
              rows={field.key === "termsText" ? 6 : 3}
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
              editForm?.[field.key] === undefined || editForm?.[field.key] === null
                ? ""
                : Array.isArray(editForm?.[field.key])
                  ? (editForm && editForm[field.key] ? (editForm[field.key] as string[]).join(", ") : "")
                  : typeof editForm?.[field.key] === "object"
                    ? JSON.stringify(editForm?.[field.key])
                    : String(editForm?.[field.key])
            }
            onChange={e => handleInputChange(field.key, e.target.value)}
            className="w-full p-3 border border-gray-300 rounded-md focus:ring-blue-600 focus:border-blue-600"
          />
        </div>
      )
    }
    return null
  }

  return (
    <>
      <Toast
        show={showToast}
        message={toastMsg}
        onClose={() => setShowToast(false)}
        error={toastError}
      />
      <DeleteModal
        show={showDeleteModal}
        onConfirm={confirmDelete}
        onCancel={() => setShowDeleteModal(false)}
      />

      <div className="flex justify-between items-center mb-6 mt-4 container mx-auto">
        <Link href="/accordance/compliance/browse" className="text-blue-600 hover:underline mb-4 inline-flex items-center">
          <ChevronLeft size={20} className="mr-1" /> Back to Compliance List
        </Link>
        <Link href="/accordance/compliance/create">
          <button className="bg-blue-600 text-white px-5 py-2 rounded-md hover:bg-blue-700">+ Create Compliance </button>
        </Link>
      </div>

      <div className="max-w-3xl mx-auto p-8 bg-white rounded-xl shadow-lg border border-gray-200 mt-4">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold text-gray-800">Compliance Record</h1>
          {!isEditing ? (
            <div className="flex gap-2">
              <button
                onClick={handleEdit}
                className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 flex items-center gap-1"
              >
                <Edit size={18} /> Edit
              </button>
              <button
                onClick={handleDelete}
                disabled={isDeleting}
                className="bg-red-600 text-white px-4 py-2 rounded-md hover:bg-red-700 flex items-center gap-1 disabled:opacity-50"
              >
                <Trash2 size={18} /> {isDeleting ? "Deleting..." : "Delete"}
              </button>
            </div>
          ) : (
            <div className="flex gap-2">
              <button
                onClick={handleSave}
                className="bg-green-600 text-white px-4 py-2 rounded-md hover:bg-green-700"
              >
                Save
              </button>
              <button
                onClick={handleCancelEdit}
                className="bg-gray-600 text-white px-4 py-2 rounded-md hover:bg-gray-700"
              >
                Cancel
              </button>
            </div>
          )}
        </div>

        {!isEditing ? (
          renderFormalDocument()
        ) : (
          <div className="space-y-6">
            {complianceFields.map(renderField)}
          </div>
        )}
      </div>
    </>
  )
}