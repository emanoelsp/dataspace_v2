"use client"

import React, { useState, useEffect } from "react"
import { collection, addDoc, serverTimestamp, getDocs, query, where } from "firebase/firestore"
import { db } from "@/lib/firebase"
import {
  Shield,
  Package,
  UserCog,
  Key,
  Eye,
  Clock,
  Undo2,
  CheckCircle,
  ChevronLeft,
} from "lucide-react"
import Link from "next/link"

const steps = [
  { id: 1, title: "Federation Selection", icon: Shield },
  { id: 2, title: "Asset Selection", icon: Package },
  { id: 3, title: "Roles & Permissions", icon: UserCog },
  { id: 4, title: "Access Policies", icon: Key },
  { id: 5, title: "Audit & Traceability", icon: Eye },
  { id: 6, title: "Usage Periods", icon: Clock },
  { id: 7, title: "Revocation & Supervision", icon: Undo2 },
  { id: 8, title: "Review & Submit", icon: CheckCircle },
]

function StepIndicator({ currentStep }: { currentStep: number }) {
  return (
    <div className="flex justify-center mb-8">
      {steps.map(({ id, title, icon: Icon }) => (
        <div key={id} className="flex flex-col items-center mx-2">
          <div
            className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-white transition-all duration-300 ${
              currentStep >= id ? "bg-blue-600" : "bg-gray-300"
            }`}
          >
            {currentStep > id ? <CheckCircle size={20} /> : <Icon size={20} />}
          </div>
          <p className={`text-sm mt-2 ${currentStep >= id ? "text-blue-600 font-semibold" : "text-gray-500"}`}>
            {title}
          </p>
        </div>
      ))}
    </div>
  )
}

interface Federation {
  id: string
  name: string
}

interface Asset {
  id: string
  name: string
  federationId?: string
}

export default function GovernanceCreatePage() {
  // Step 1: Federation Selection
  const [federation, setFederation] = useState("")
  const [federations, setFederations] = useState<Federation[]>([])
  // Step 2: Asset Selection
  const [assets, setAssets] = useState<Asset[]>([])
  const [selectedAssets, setSelectedAssets] = useState<string[]>([])
  // Step 3: Roles & Permissions
  const [roles, setRoles] = useState("")
  // Step 4: Access Policies
  const [policies, setPolicies] = useState("")
  // Step 5: Audit & Traceability
  const [audit, setAudit] = useState("")
  // Step 6: Usage Periods
  const [usagePeriods, setUsagePeriods] = useState("")
  // Step 7: Revocation & Supervision
  const [revocation, setRevocation] = useState("")
  // Step 8: Review & Submit
  const [step, setStep] = useState(1)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitSuccess, setSubmitSuccess] = useState(false)
  const [errorMessage, setErrorMessage] = useState("")

  // Carregar federações do Firestore (coleção "federations")
  useEffect(() => {
    const fetchFederations = async () => {
      const snap = await getDocs(collection(db, "federations"))
      setFederations(
        snap.docs.map(doc => ({
          id: doc.id,
          name: doc.data().name ?? doc.id,
        }))
      )
    }
    fetchFederations()
  }, [])

  // Carregar assets da federação selecionada
  useEffect(() => {
    if (!federation) {
      setAssets([])
      setSelectedAssets([])
      return
    }
    const fetchAssets = async () => {
      const q = query(collection(db, "assets"), where("federationId", "==", federation))
      const snap = await getDocs(q)
      setAssets(
        snap.docs.map(doc => ({
          id: doc.id,
          name: doc.data().name ?? doc.id,
          federationId: doc.data().federationId,
        }))
      )
      setSelectedAssets([])
    }
    fetchAssets()
  }, [federation])

  const isStep1Valid = () => federation.trim() !== ""
  const isStep2Valid = () => selectedAssets.length > 0
  const isStep3Valid = () => roles.trim() !== ""
  const isStep4Valid = () => policies.trim() !== ""
  const isStep5Valid = () => audit.trim() !== ""
  const isStep6Valid = () => usagePeriods.trim() !== ""
  const isStep7Valid = () => revocation.trim() !== ""

  const handleNext = () => {
    if (step === 1 && isStep1Valid()) setStep(2)
    else if (step === 2 && isStep2Valid()) setStep(3)
    else if (step === 3 && isStep3Valid()) setStep(4)
    else if (step === 4 && isStep4Valid()) setStep(5)
    else if (step === 5 && isStep5Valid()) setStep(6)
    else if (step === 6 && isStep6Valid()) setStep(7)
    else if (step === 7 && isStep7Valid()) setStep(8)
  }

  const handleBack = () => {
    if (step > 1) setStep(step - 1)
  }

  const handleAssetToggle = (id: string) => {
    setSelectedAssets((prev) =>
      prev.includes(id) ? prev.filter((a) => a !== id) : [...prev, id]
    )
  }

  const handleSubmit = async () => {
    if (
      !isStep1Valid() ||
      !isStep2Valid() ||
      !isStep3Valid() ||
      !isStep4Valid() ||
      !isStep5Valid() ||
      !isStep6Valid() ||
      !isStep7Valid()
    ) {
      setErrorMessage("Please fill in all required fields before submitting.")
      return
    }
    setIsSubmitting(true)
    setErrorMessage("")
    try {
      await addDoc(collection(db, "governance"), {
        federation,
        assets: selectedAssets,
        roles,
        policies,
        audit,
        usagePeriods,
        revocation,
        createdAt: serverTimestamp(),
      })
      setSubmitSuccess(true)
    } catch {
      setErrorMessage("Error submitting the form. Please try again.")
    } finally {
      setIsSubmitting(false)
    }
  }

  const renderStep = () => {
    switch (step) {
      case 1:
        return (
          <>
            <h2 className="text-2xl font-semibold text-gray-800 mb-4 flex items-center gap-2">
              <Shield className="text-blue-600" size={28} />
              Step 1: Federation Selection
            </h2>
            <p className="text-gray-600 mb-6">
              Choose the federation where governance policies will be applied.
            </p>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Federation *</label>
              <select
                value={federation}
                onChange={e => setFederation(e.target.value)}
                required
                className="border border-gray-300 p-3 w-full rounded-md shadow-sm focus:ring-blue-600 focus:border-blue-600"
              >
                <option value="">Select a federation</option>
                {federations.map(f => (
                  <option key={f.id} value={f.id}>{f.name || f.id}</option>
                ))}
              </select>
            </div>
            <div className="mt-6 flex justify-end">
              <button
                type="button"
                onClick={handleNext}
                disabled={!isStep1Valid()}
                className="bg-blue-600 hover:bg-blue-700 text-white font-semibold px-6 py-3 rounded-md shadow-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Next: Asset Selection
              </button>
            </div>
          </>
        )
      case 2:
        return (
          <>
            <h2 className="text-2xl font-semibold text-gray-800 mb-4 flex items-center gap-2">
              <Package className="text-blue-600" size={28} />
              Step 2: Asset Selection
            </h2>
            <p className="text-gray-600 mb-6">
              Select the assets to govern within the selected federation.
            </p>
            <div>
              {assets.length === 0 ? (
                <div className="text-gray-500 italic">No assets found for this federation.</div>
              ) : (
                <ul className="space-y-2">
                  {assets.map(asset => (
                    <li key={asset.id} className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={selectedAssets.includes(asset.id)}
                        onChange={() => handleAssetToggle(asset.id)}
                        id={`asset-${asset.id}`}
                        className="h-4 w-4"
                      />
                      <label htmlFor={`asset-${asset.id}`} className="text-gray-800 cursor-pointer">
                        {asset.name || asset.id}
                      </label>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="mt-6 flex justify-between">
              <button
                type="button"
                onClick={handleBack}
                className="bg-gray-300 hover:bg-gray-400 text-gray-800 font-semibold px-6 py-3 rounded-md shadow-sm transition-colors"
              >
                Previous
              </button>
              <button
                type="button"
                onClick={handleNext}
                disabled={!isStep2Valid()}
                className="bg-blue-600 hover:bg-blue-700 text-white font-semibold px-6 py-3 rounded-md shadow-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Next: Roles & Permissions
              </button>
            </div>
          </>
        )
      case 3:
        return (
          <>
            <h2 className="text-2xl font-semibold text-gray-800 mb-4 flex items-center gap-2">
              <UserCog className="text-blue-600" size={28} />
              Step 3: Roles & Permissions
            </h2>
            <p className="text-gray-600 mb-6">
              Define user roles (e.g., admin, contributor, viewer) and assign permissions for data access and actions.
            </p>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Roles & Permissions *</label>
              <textarea
                value={roles}
                onChange={(e) => setRoles(e.target.value)}
                placeholder="Describe roles and permissions (e.g., Admin: full access, Viewer: read-only)"
                required
                rows={4}
                className="border border-gray-300 p-3 w-full rounded-md shadow-sm focus:ring-blue-600 focus:border-blue-600"
              />
            </div>
            <div className="mt-6 flex justify-between">
              <button
                type="button"
                onClick={handleBack}
                className="bg-gray-300 hover:bg-gray-400 text-gray-800 font-semibold px-6 py-3 rounded-md shadow-sm transition-colors"
              >
                Previous
              </button>
              <button
                type="button"
                onClick={handleNext}
                disabled={!isStep3Valid()}
                className="bg-blue-600 hover:bg-blue-700 text-white font-semibold px-6 py-3 rounded-md shadow-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Next: Access Policies
              </button>
            </div>
          </>
        )
      case 4:
        return (
          <>
            <h2 className="text-2xl font-semibold text-gray-800 mb-4 flex items-center gap-2">
              <Key className="text-blue-600" size={28} />
              Step 4: Access Policies
            </h2>
            <p className="text-gray-600 mb-6">
              Set up access control policies, including who can view, edit, or share data.
            </p>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Access Policies *</label>
              <textarea
                value={policies}
                onChange={(e) => setPolicies(e.target.value)}
                placeholder="Describe access policies (e.g., Only managers can approve access requests)"
                required
                rows={4}
                className="border border-gray-300 p-3 w-full rounded-md shadow-sm focus:ring-blue-600 focus:border-blue-600"
              />
            </div>
            <div className="mt-6 flex justify-between">
              <button
                type="button"
                onClick={handleBack}
                className="bg-gray-300 hover:bg-gray-400 text-gray-800 font-semibold px-6 py-3 rounded-md shadow-sm transition-colors"
              >
                Previous
              </button>
              <button
                type="button"
                onClick={handleNext}
                disabled={!isStep4Valid()}
                className="bg-blue-600 hover:bg-blue-700 text-white font-semibold px-6 py-3 rounded-md shadow-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Next: Audit & Traceability
              </button>
            </div>
          </>
        )
      case 5:
        return (
          <>
            <h2 className="text-2xl font-semibold text-gray-800 mb-4 flex items-center gap-2">
              <Eye className="text-blue-600" size={28} />
              Step 5: Audit & Traceability
            </h2>
            <p className="text-gray-600 mb-6">
              Enable auditing and traceability to monitor all actions and changes for compliance and security.
            </p>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Audit & Traceability *</label>
              <textarea
                value={audit}
                onChange={(e) => setAudit(e.target.value)}
                placeholder="Describe audit and traceability mechanisms (e.g., All access is logged and reviewed monthly)"
                required
                rows={4}
                className="border border-gray-300 p-3 w-full rounded-md shadow-sm focus:ring-blue-600 focus:border-blue-600"
              />
            </div>
            <div className="mt-6 flex justify-between">
              <button
                type="button"
                onClick={handleBack}
                className="bg-gray-300 hover:bg-gray-400 text-gray-800 font-semibold px-6 py-3 rounded-md shadow-sm transition-colors"
              >
                Previous
              </button>
              <button
                type="button"
                onClick={handleNext}
                disabled={!isStep5Valid()}
                className="bg-blue-600 hover:bg-blue-700 text-white font-semibold px-6 py-3 rounded-md shadow-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Next: Usage Periods
              </button>
            </div>
          </>
        )
      case 6:
        return (
          <>
            <h2 className="text-2xl font-semibold text-gray-800 mb-4 flex items-center gap-2">
              <Clock className="text-blue-600" size={28} />
              Step 6: Usage Periods
            </h2>
            <p className="text-gray-600 mb-6">
              Define allowed usage periods and retention policies for each asset.
            </p>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Usage Periods *</label>
              <textarea
                value={usagePeriods}
                onChange={(e) => setUsagePeriods(e.target.value)}
                placeholder="Describe usage periods and retention (e.g., Data can be accessed for 12 months, then archived)"
                required
                rows={4}
                className="border border-gray-300 p-3 w-full rounded-md shadow-sm focus:ring-blue-600 focus:border-blue-600"
              />
            </div>
            <div className="mt-6 flex justify-between">
              <button
                type="button"
                onClick={handleBack}
                className="bg-gray-300 hover:bg-gray-400 text-gray-800 font-semibold px-6 py-3 rounded-md shadow-sm transition-colors"
              >
                Previous
              </button>
              <button
                type="button"
                onClick={handleNext}
                disabled={!isStep6Valid()}
                className="bg-blue-600 hover:bg-blue-700 text-white font-semibold px-6 py-3 rounded-md shadow-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Next: Revocation & Supervision
              </button>
            </div>
          </>
        )
      case 7:
        return (
          <>
            <h2 className="text-2xl font-semibold text-gray-800 mb-4 flex items-center gap-2">
              <Undo2 className="text-blue-600" size={28} />
              Step 7: Revocation & Supervision
            </h2>
            <p className="text-gray-600 mb-6">
              Implement mechanisms for revoking access and supervising ongoing data usage.
            </p>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Revocation & Supervision *</label>
              <textarea
                value={revocation}
                onChange={(e) => setRevocation(e.target.value)}
                placeholder="Describe revocation and supervision mechanisms (e.g., Access can be revoked by admins at any time, periodic reviews)"
                required
                rows={4}
                className="border border-gray-300 p-3 w-full rounded-md shadow-sm focus:ring-blue-600 focus:border-blue-600"
              />
            </div>
            <div className="mt-6 flex justify-between">
              <button
                type="button"
                onClick={handleBack}
                className="bg-gray-300 hover:bg-gray-400 text-gray-800 font-semibold px-6 py-3 rounded-md shadow-sm transition-colors"
              >
                Previous
              </button>
              <button
                type="button"
                onClick={handleNext}
                disabled={!isStep7Valid()}
                className="bg-blue-600 hover:bg-blue-700 text-white font-semibold px-6 py-3 rounded-md shadow-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Next: Review & Submit
              </button>
            </div>
          </>
        )
      case 8:
        return (
          <>
            <h2 className="text-2xl font-semibold text-gray-800 mb-4 flex items-center gap-2">
              <CheckCircle className="text-blue-600" size={28} />
              Step 8: Review & Submit
            </h2>
            <p className="text-gray-600 mb-6">
              Review all information before submitting your governance policy.
            </p>
            <div className="bg-gray-50 p-6 rounded-md border border-gray-200 space-y-3 mb-6">
              <h3 className="font-semibold text-lg mb-2">Federation</h3>
              <p>
                <strong>Federation:</strong> {federations.find(f => f.id === federation)?.name || federation || "N/A"}
              </p>
              <h3 className="font-semibold text-lg mt-4 mb-2">Assets</h3>
              <ul className="list-disc ml-6">
                {assets.filter(a => selectedAssets.includes(a.id)).map(a => (
                  <li key={a.id}>{a.name || a.id}</li>
                ))}
              </ul>
              <h3 className="font-semibold text-lg mt-4 mb-2">Roles & Permissions</h3>
              <p>
                <strong>Details:</strong> {roles || "N/A"}
              </p>
              <h3 className="font-semibold text-lg mt-4 mb-2">Access Policies</h3>
              <p>
                <strong>Details:</strong> {policies || "N/A"}
              </p>
              <h3 className="font-semibold text-lg mt-4 mb-2">Audit & Traceability</h3>
              <p>
                <strong>Details:</strong> {audit || "N/A"}
              </p>
              <h3 className="font-semibold text-lg mt-4 mb-2">Usage Periods</h3>
              <p>
                <strong>Details:</strong> {usagePeriods || "N/A"}
              </p>
              <h3 className="font-semibold text-lg mt-4 mb-2">Revocation & Supervision</h3>
              <p>
                <strong>Details:</strong> {revocation || "N/A"}
              </p>
            </div>
            {submitSuccess && (
              <div className="p-3 bg-green-100 text-green-800 border-l-4 border-green-500 rounded-md mb-4 flex items-center gap-2">
                <CheckCircle size={20} /> Governance policy registered successfully!
              </div>
            )}
            {errorMessage && (
              <div className="p-3 bg-red-100 text-red-800 border-l-4 border-red-500 rounded-md mb-4">
                {errorMessage}
              </div>
            )}
            <div className="mt-6 flex justify-between">
              <button
                type="button"
                onClick={handleBack}
                className="bg-gray-300 hover:bg-gray-400 text-gray-800 font-semibold px-6 py-3 rounded-md shadow-sm transition-colors"
              >
                Previous
              </button>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={isSubmitting || submitSuccess}
                className="bg-blue-600 hover:bg-blue-700 text-white font-semibold px-6 py-3 rounded-md shadow-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSubmitting ? "Submitting..." : "Register Governance Policy"}
              </button>
            </div>
          </>
        )
      default:
        return null
    }
  }

  return (
    <>
      <div className="flex justify-between items-center mb-6 mt-4 container mx-auto">
        <Link href="/accordance/governance" className="text-blue-600 hover:underline mb-4 inline-flex items-center">
          <ChevronLeft size={20} className="mr-1" /> Back to Governance
        </Link>
        <Link href="/accordance/governance/browse">
          <button className="bg-blue-600 text-white px-5 py-2 rounded-md hover:bg-blue-700">Browse Governance</button>
        </Link>
      </div>

      <div className="max-w-4xl mx-auto p-8 bg-white rounded-xl shadow-lg border border-gray-200 mt-4">
        <h1 className="text-3xl font-bold text-gray-800 mb-6 text-center">Create Governance Policy</h1>
        <StepIndicator currentStep={step} />
        <div className="space-y-5">
          {renderStep()}
        </div>
        <div className="mt-8 p-4 bg-blue-50 border-l-4 border-blue-500 text-blue-700 text-sm rounded-md">
          <strong>Note:</strong> All fields marked with * are required. The information you provide will be auditable and visible to authorized users.
        </div>
      </div>
    </>
  )
}