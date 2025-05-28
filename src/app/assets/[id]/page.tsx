"use client"

import { useEffect, useState, useRef } from "react"
import { useParams, useRouter } from "next/navigation"
import { doc, getDoc, updateDoc, deleteDoc } from "firebase/firestore"
import { db } from "@/lib/firebase"
import Link from "next/link"


interface Asset {
  id: string
  name: string
  description: string
  assetType: string
  purpose: string
  semanticId?: string
  apiEndpoint?: string
  dataFormat?: string
  accessType?: string
  licenseType?: string
  createdAt?: unknown // ajuste de any para unknown
  updatedAt?: unknown // ajuste de any para unknown
  location?: string
  status?: string
  speed?: string
  protocol?: string
  active?: boolean
}


type DynamicRow = Record<string, unknown>

const COMPLIANCE_ITEMS = [
  "I confirm this asset is compliant with federation rules.",
  "I have reviewed the data privacy and security requirements.",
  "I acknowledge the asset's API is stable and documented.",
  "I agree to monitor and maintain the asset's availability.",
]

// Toast de confirmação de delete
function DeleteToast({ message, actionLabel, onAction, onClose }: { message: string, actionLabel: string, onAction: () => void, onClose: () => void }) {
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

function ComplianceModal({
  open,
  onClose,
  onConfirm,
  brokerUrl,
}: {
  open: boolean
  onClose: () => void
  onConfirm: () => void
  brokerUrl: string
}) {
  const [checked, setChecked] = useState<boolean[]>(Array(COMPLIANCE_ITEMS.length).fill(false))

  useEffect(() => {
    if (!open) setChecked(Array(COMPLIANCE_ITEMS.length).fill(false))
  }, [open])

  const allChecked = checked.every(Boolean)

  return !open ? null : (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-lg border border-gray-200 max-w-lg w-full p-8 relative">
        <button
          onClick={onClose}
          className="absolute top-3 right-3 text-gray-400 hover:text-gray-700"
          aria-label="Close"
        >
          ×
        </button>
        <h2 className="text-xl font-bold mb-4 text-gray-800">Compliance Confirmation</h2>
        <div className="mb-4 space-y-2">
          {COMPLIANCE_ITEMS.map((item, idx) => (
            <label key={item} className="flex items-center gap-2 text-gray-700">
              <input
                type="checkbox"
                checked={checked[idx]}
                onChange={e => {
                  const arr = [...checked]
                  arr[idx] = e.target.checked
                  setChecked(arr)
                }}
              />
              {item}
            </label>
          ))}
        </div>
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">Broker API URL for external access</label>
          <input
            type="text"
            value={brokerUrl}
            readOnly
            className="w-full border border-gray-300 rounded-md p-2 bg-gray-100 text-gray-700"
          />
        </div>
        <button
          className="bg-blue-600 text-white px-5 py-2 rounded-md hover:bg-blue-700 w-full font-semibold disabled:opacity-50"
          disabled={!allChecked}
          onClick={onConfirm}
        >
          Confirm and Start Query
        </button>
      </div>
    </div>
  )
}

function Toast({ show, onClose, message, error = false }: { show: boolean; onClose: () => void; message: string; error?: boolean }) {
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
        <span>{message}</span>
        <button onClick={onClose} className="ml-2 text-white font-bold">×</button>
      </div>
    </div>
  )
}

// Utilitário para formatar timestamp
function formatTimestamp(date: Date) {
  const pad = (n: number) => n.toString().padStart(2, "0")
  const year = date.getFullYear()
  const month = pad(date.getMonth() + 1)
  const day = pad(date.getDate())
  const hours = pad(date.getHours())
  const minutes = pad(date.getMinutes())
  const seconds = pad(date.getSeconds())
  return `${hours}:${minutes}:${seconds} ${year}/${month}/${day}`
}

export default function AssetDetailsPage() {
  const params = useParams()
  const router = useRouter()
  const [asset, setAsset] = useState<Asset | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [dynamicRows, setDynamicRows] = useState<DynamicRow[]>([])
  const [isQuerying, setIsQuerying] = useState(false)
  const [showCompliance, setShowCompliance] = useState(false)
  const [brokerUrl, setBrokerUrl] = useState("")
  const [showBrokerUrl, setShowBrokerUrl] = useState(false)
  const [page, setPage] = useState(0)
  const [showToast, setShowToast] = useState(false)
  const [toastMsg, setToastMsg] = useState("")
  const [toastError, setToastError] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [editForm, setEditForm] = useState<Asset | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [showDeleteToast, setShowDeleteToast] = useState(false)
  const intervalRef = useRef<NodeJS.Timeout | null>(null)
  const [cpsHeader, setCpsHeader] = useState<Record<string, unknown>>({
    id: "-",
    type: "-",
    location: "-",
    status: "-",
    speed: "-",
    protocol: "-",
  })

  // Fetch asset
  useEffect(() => {
    const fetchAsset = async () => {
      if (!params || !("id" in params)) {
        setLoading(false)
        return
      }
      try {
        setLoading(true)
        setError(null)
        const docRef = doc(db, "assets", params.id as string)
        const docSnap = await getDoc(docRef)
        if (docSnap.exists()) {
          const data = docSnap.data()
          const assetData: Asset = {
            id: docSnap.id,
            name: data.name,
            description: data.description,
            assetType: data.assetType,
            purpose: data.purpose,
            semanticId: data.semanticId,
            apiEndpoint: data.apiEndpoint,
            dataFormat: data.dataFormat,
            accessType: data.accessType,
            licenseType: data.licenseType,
            createdAt: data.createdAt,
            updatedAt: data.updatedAt,
            location: data.location || "-",
            status: data.status || "-",
            speed: data.speed || "-",
            protocol: data.protocol || "-",
            active: data.active !== false,
          }
          setAsset(assetData)
          setEditForm(assetData)
          setBrokerUrl(`https://broker.example.com/api/assets/${docSnap.id}`)
        } else {
          setError("Asset not found")
        }
      } catch {
        setError("Error loading asset")
      } finally {
        setLoading(false)
      }
    }
    fetchAsset()
  }, [params])

  // Fetch CPS Fixed Data from API header (id, type, location, status, speed, protocol)
  useEffect(() => {
    const fetchHeader = async () => {
      if (asset?.apiEndpoint) {
        try {
          const res = await fetch(asset.apiEndpoint)
          if (!res.ok) throw new Error()
          const data = await res.json()
          const d = Array.isArray(data) ? data[0] : data
          setCpsHeader({
            id: d.id ?? asset.id,
            type: d.type ?? asset.assetType,
            location: d.location ?? asset.location,
            status: d.status ?? asset.status,
            speed: d.speed ?? asset.speed,
            protocol: d.protocol ?? asset.protocol,
          })
        } catch {
          setCpsHeader({
            id: asset?.id,
            type: asset?.assetType,
            location: asset?.location,
            status: asset?.status,
            speed: asset?.speed,
            protocol: asset?.protocol,
          })
        }
      } else if (asset) {
        setCpsHeader({
          id: asset.id,
          type: asset.assetType,
          location: asset.location,
          status: asset.status,
          speed: asset.speed,
          protocol: asset.protocol,
        })
      }
    }
    if (asset) fetchHeader()
  }, [asset])

  // Fetch dynamic data from API or simulate
  const fetchDynamicData = async () => {
    if (!asset?.apiEndpoint) return
    try {
      const res = await fetch(asset.apiEndpoint)
      if (!res.ok) throw new Error(`Error fetching data: ${res.status}`)
      const data = await res.json()
      const d = Array.isArray(data) ? data[0] : data
      setDynamicRows(prev => [
        { timestamp: formatTimestamp(new Date()), ...d },
        ...prev,
      ].slice(0, 100))
    } catch {
      // ignore errors
    }
  }

  const fetchSimulatedData = () => {
    setDynamicRows(prev => [
      {
        timestamp: formatTimestamp(new Date()),
        temperature: +(20 + Math.random() * 10).toFixed(2),
        pressure: +(1 + Math.random()).toFixed(2),
        flowRate: +(100 + Math.random() * 50).toFixed(2),
      },
      ...prev,
    ].slice(0, 100))
  }

  // Query interval
  useEffect(() => {
    if (isQuerying) {
      intervalRef.current = setInterval(() => {
        if (asset?.apiEndpoint) {
          fetchDynamicData()
        } else {
          fetchSimulatedData()
        }
      }, 1000)
      setShowBrokerUrl(true)
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current)
      setShowBrokerUrl(false)
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isQuerying, asset?.apiEndpoint])

  // Pagination for real-time data (20 rows per page)
  const pageSize = 20
  const pagedRows = dynamicRows.slice(page * pageSize, (page + 1) * pageSize)
  const totalPages = Math.ceil(dynamicRows.length / pageSize)

  // Real-Time Readings: only temperature, pressure, flowRate
  const realTimeColumns = ["timestamp", "temperature", "pressure", "flowRate"]

  // Asset actions
  const handleToggleActive = async () => {
    if (!asset) return
    try {
      if (asset.active) {
        await updateDoc(doc(db, "assets", asset.id), { active: false })
        setAsset({ ...asset, active: false })
        setEditForm({ ...asset, active: false })
        setIsQuerying(false)
      } else {
        await updateDoc(doc(db, "assets", asset.id), { active: true })
        setAsset({ ...asset, active: true })
        setEditForm({ ...asset, active: true })
      }
    } catch {
      setToastMsg("Failed to update asset status.")
      setToastError(true)
      setShowToast(true)
    }
  }

  // Edição
  const handleEdit = () => setIsEditing(true)

  const handleSave = async () => {
    if (!editForm || !asset) return
    try {
      const docRef = doc(db, "assets", asset.id)
      await updateDoc(docRef, {
        ...editForm,
        updatedAt: new Date(),
      })
      setAsset(editForm)
      setIsEditing(false)
      setToastMsg("Asset updated successfully.")
      setToastError(false)
      setShowToast(true)
    } catch {
      setToastMsg("Error updating asset.")
      setToastError(true)
      setShowToast(true)
    }
  }

  const handleCancel = () => {
    setEditForm(asset)
    setIsEditing(false)
  }

  // Toast de confirmação de delete
  const handleDelete = () => {
    setShowDeleteToast(true)
  }

  const confirmDelete = async () => {
    if (!asset) return
    try {
      setIsDeleting(true)
      setShowDeleteToast(false)
      const docRef = doc(db, "assets", asset.id)
      await deleteDoc(docRef)
      setToastMsg("Asset deleted successfully.")
      setToastError(false)
      setShowToast(true)
      setTimeout(() => {
        router.push("/assets/browse")
      }, 1200)
    } catch {
      setToastMsg("Failed to delete asset.")
      setToastError(true)
      setShowToast(true)
      setIsDeleting(false)
    }
  }

  const handleInputChange = (field: keyof Asset, value: string | boolean) => {
    if (editForm) {
      setEditForm({ ...editForm, [field]: value })
    }
  }

  if (loading) return <p className="p-8 text-gray-600">Loading asset...</p>
  if (error) return <p className="p-8 text-red-600">{error}</p>
  if (!asset) return <p className="p-8 text-gray-600">Asset not found</p>

  // Organização dos campos para edição
  const assetFields: { key: keyof Asset; label: string }[] = [
    { key: "name", label: "Name" },
    { key: "description", label: "Description" },
    { key: "assetType", label: "Type" },
    { key: "purpose", label: "Purpose" },
    { key: "semanticId", label: "Semantic ID" },
    { key: "apiEndpoint", label: "API Endpoint" },
    { key: "dataFormat", label: "Data Format" },
    { key: "accessType", label: "Access" },
    { key: "licenseType", label: "License" },
    { key: "location", label: "Location" },
    { key: "status", label: "Status" },
    { key: "speed", label: "Speed" },
    { key: "protocol", label: "Protocol" },
  ]

  // Função para renderizar campo
  const renderField = (field: { key: keyof Asset, label: string }) => {
    if (isEditing) {
      if (field.key === "description") {
        return (
          <div key={field.key}>
            <label className="block text-sm font-medium text-gray-700 mb-2">{field.label}</label>
            <textarea
              value={
                editForm?.[field.key] !== undefined && (typeof editForm[field.key] === "string" || typeof editForm[field.key] === "number")
                  ? String(editForm[field.key])
                  : ""
              }
              onChange={e => handleInputChange(field.key, e.target.value)}
              rows={4}
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
            value={editForm?.[field.key] !== undefined ? String(editForm[field.key]) : ""}
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
        <p className="text-gray-800">{asset[field.key] !== undefined && asset[field.key] !== null ? String(asset[field.key]) : "Not informed"}</p>
      </div>
    )
  }

  return (
    <>
     <div className="flex justify-between items-center mb-6 mt-4 container mx-auto">
        <Link href="/assets/browse" className="text-blue-600 hover:underline mb-4 inline-block">
          ← Back to Browse Assets
        </Link>
        <Link href="/assets/create">
          <button className="bg-blue-600 text-white px-5 py-2 rounded-md hover:bg-blue-700">+ Create Asset</button>
        </Link>
      </div>
    
    
    <div className="max-w-4xl mx-auto p-8">
      
      {/* Toast de confirmação de delete */}
      {showDeleteToast && (
        <DeleteToast
          message={`Are you sure you want to delete "${asset.name}"? This action cannot be undone.`}
          actionLabel={isDeleting ? "Deleting..." : "Delete"}
          onAction={confirmDelete}
          onClose={() => setShowDeleteToast(false)}
        />
      )}

      <ComplianceModal
        open={showCompliance}
        onClose={() => setShowCompliance(false)}
        onConfirm={() => {
          setShowCompliance(false)
          setIsQuerying(true)
          setShowBrokerUrl(true)
        }}
        brokerUrl={brokerUrl}
      />

      <Toast
        show={showToast}
        onClose={() => setShowToast(false)}
        message={toastMsg}
        error={toastError}
      />

      <div className="flex justify-between items-start mb-8">
        <div>
         
          <h1 className="text-3xl font-bold text-gray-800">Asset Details</h1>
        </div>
        <div className="flex gap-2">
          {!isEditing ? (
            <>
              <button
                onClick={handleEdit}
                className="bg-blue-700 text-white px-4 py-2 rounded-md hover:bg-yellow-600 font-semibold"
              >
                Edit
              </button>
              <button
                onClick={handleToggleActive}
                className={`px-4 py-2 rounded-md font-semibold ${
                  asset.active
                    ? "bg-gray-400 text-white hover:bg-gray-500"
                    : "bg-green-600 text-white hover:bg-green-700"
                }`}
              >
                {asset.active ? "Deactivate" : "Activate"}
              </button>
              <button
                onClick={handleDelete}
                disabled={isDeleting}
                className="bg-red-600 text-white px-4 py-2 rounded-md hover:bg-red-700 font-semibold disabled:opacity-50"
              >
                {isDeleting ? "Deleting..." : "Delete"}
              </button>
            </>
          ) : (
            <>
              <button
                onClick={handleSave}
                className="bg-green-600 text-white px-4 py-2 rounded-md hover:bg-green-700 font-semibold"
              >
                Save
              </button>
              <button
                onClick={handleCancel}
                className="bg-gray-600 text-white px-4 py-2 rounded-md hover:bg-gray-700 font-semibold"
              >
                Cancel
              </button>
            </>
          )}
        </div>
      </div>

      {/* Physical characteristics */}
      <div className="bg-white rounded-lg shadow-sm border p-6 mb-8">
        <h2 className="text-xl font-semibold mb-4">Physical Characteristics</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {assetFields.map(renderField)}
        </div>
      </div>

      {/* CPS Fixed Data */}
      <div className="bg-white rounded-lg shadow-sm border p-6 mb-8">
        <h2 className="text-xl font-semibold mb-4">CPS Fixed Data</h2>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm border">
            <thead>
              <tr>
                {["id", "type", "location", "status", "speed", "protocol"].map((key) => (
                  <th key={key} className="py-2 px-3 border-b bg-gray-50 text-gray-700">{key}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                {["id", "type", "location", "status", "speed", "protocol"].map((key) => (
                  <td key={key} className="py-2 px-3">{cpsHeader[key] !== undefined ? String(cpsHeader[key]) : "-"}</td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Control buttons */}
      {!isEditing && (
        <div className="flex gap-4 mb-4 items-center">
          <button
            onClick={() => setShowCompliance(true)}
            disabled={isQuerying || asset.active === false}
            className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 disabled:opacity-50"
          >
            Start Query
          </button>
          <button
            onClick={() => {
              setIsQuerying(false)
              setToastMsg("Query stopped successfully.")
              setToastError(false)
              setShowToast(true)
            }}
            disabled={!isQuerying}
            className="bg-gray-400 text-white px-4 py-2 rounded-md hover:bg-gray-500 disabled:opacity-50"
          >
            Stop Query
          </button>
          {showBrokerUrl && (
            <span className="ml-4 text-sm bg-gray-100 px-3 py-2 rounded border border-gray-300 text-gray-700 select-all">
              <b>Broker API:</b> {brokerUrl}
            </span>
          )}
        </div>
      )}

      {/* Real-Time Data */}
      <div className="bg-white rounded-lg shadow-sm border p-6">
        <h2 className="text-xl font-semibold mb-4">Real-Time Readings</h2>
        {dynamicRows.length === 0 && (
          <p className="text-gray-500 italic">No dynamic readings yet. Click Start Query.</p>
        )}
        {dynamicRows.length > 0 && (
          <>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm border">
                <thead>
                  <tr>
                    {realTimeColumns.map((key) => (
                      <th key={key} className="py-2 px-3 border-b bg-gray-50 text-gray-700">{key}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {pagedRows.map((row, idx) => (
                    <tr key={idx} className="border-b last:border-b-0">
                      {realTimeColumns.map((key) => (
                        <td key={key} className="py-2 px-3">{row[key] !== undefined ? String(row[key]) : "-"}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {/* Pagination controls */}
            <div className="flex justify-end gap-2 mt-2">
              <button
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0}
                className="px-3 py-1 rounded bg-gray-200 text-gray-700 hover:bg-gray-300 disabled:opacity-50"
              >
                Previous
              </button>
              <span className="px-2 py-1 text-gray-600">
                Page {page + 1} of {totalPages || 1}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                disabled={page >= totalPages - 1}
                className="px-3 py-1 rounded bg-gray-200 text-gray-700 hover:bg-gray-300 disabled:opacity-50"
              >
                Next
              </button>
            </div>
          </>
        )}
      </div>
    </div>
    </>
  )
}