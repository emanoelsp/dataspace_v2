"use client"

import React, { useState, useEffect } from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { collection, addDoc, getDocs, serverTimestamp } from "firebase/firestore"
import { db } from "@/lib/firebase"
import { CheckCircle, Layers, Box, Code, FileText, ChevronLeft, X } from "lucide-react"

const steps = [
  { id: 1, title: "Choose Federation", icon: Layers },
  { id: 2, title: "Asset Details", icon: Box },
  { id: 3, title: "Technical Info", icon: Code },
  { id: 4, title: "Review & Register", icon: FileText },
]

// Toast Modal
function SuccessToast({
  open,
  onClose,
  assetName,
  federationId,
  federationName,
}: {
  open: boolean
  onClose: () => void
  assetName: string
  federationId: string
  federationName: string
}) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
      <div className="bg-white rounded-xl shadow-lg border border-gray-200 max-w-md w-full p-8 relative">
        <button
          onClick={onClose}
          className="absolute top-3 right-3 text-gray-400 hover:text-gray-700"
          aria-label="Close"
        >
          <X size={22} />
        </button>
        <div className="flex items-center gap-3 mb-4">
          <CheckCircle className="text-green-600" size={32} />
          <h2 className="text-xl font-bold text-gray-800">Asset Registered!</h2>
        </div>
        <p className="mb-6 text-gray-700">
          Your asset <span className="font-semibold">{assetName}</span> was successfully registered.
        </p>
        <div className="space-y-3">
          <Link
            href={`/assets/create?federationId=${federationId}&federationName=${encodeURIComponent(federationName)}`}
            className="block w-full text-center bg-blue-600 text-white font-semibold px-4 py-2 rounded-md hover:bg-blue-700 transition"
          >
            Add Another Asset
          </Link>
          <Link
            href="/assets/browse"
            className="block w-full text-center bg-white text-blue-600 border border-blue-600 font-semibold px-4 py-2 rounded-md hover:bg-blue-600 hover:text-white transition"
          >
            View All Assets
          </Link>
          <Link
            href={`/accordance/compliance/create?assetName=${encodeURIComponent(assetName)}&federationId=${federationId}&federationName=${encodeURIComponent(federationName)}`}
            className="block w-full text-center bg-white text-blue-600 border border-blue-600 font-semibold px-4 py-2 rounded-md hover:bg-blue-600 hover:text-white transition"
          >
            Add Governance Rules to This Asset
          </Link>
          <Link
            href="/"
            className="block w-full text-center bg-gray-100 text-gray-700 border border-gray-200 font-semibold px-4 py-2 rounded-md hover:bg-gray-200 transition"
          >
            Back to Home
          </Link>
        </div>
      </div>
    </div>
  )
}

function StepIndicator({ currentStep, submitSuccess }: { currentStep: number, submitSuccess: boolean }) {
  return (
    <div className="flex justify-center mb-8">
      {steps.map(({ id, title, icon: Icon }) => (
        <div key={id} className="flex flex-col items-center mx-2">
          <div
            className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-white transition-all duration-300 ${(id < 4 && currentStep >= id) || (id === 4 && submitSuccess)
              ? "bg-blue-600"
              : "bg-gray-300"
              }`}
          >
            {(id < 4 && currentStep > id) || (id === 4 && submitSuccess)
              ? <CheckCircle size={20} />
              : <Icon size={20} />}
          </div>
          <p className={`text-sm mt-2 ${(id < 4 && currentStep >= id) || (id === 4 && submitSuccess)
            ? "text-blue-600 font-semibold"
            : "text-gray-500"
            }`}>
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
  description: string
}

export default function CreateAssetPage() {
  const searchParams = useSearchParams()
  const initialFederationId = searchParams?.get("federationId") || ""
  const initialFederationName = searchParams?.get("federationName") || ""

  // Form states
  const [federationId, setFederationId] = useState(initialFederationId)
  const [federationName, setFederationName] = useState(initialFederationName)
  const [federations, setFederations] = useState<Federation[]>([])
  const [loadingFederations, setLoadingFederations] = useState(true)

  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [assetType, setAssetType] = useState("")
  const [purpose, setPurpose] = useState("")
  const [semanticId, setSemanticId] = useState("")

  const [apiEndpoint, setApiEndpoint] = useState("")
  const [dataFormat, setDataFormat] = useState("")
  const [accessType, setAccessType] = useState("")

  const [step, setStep] = useState(1)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitSuccess, setSubmitSuccess] = useState(false)
  const [errorMessage, setErrorMessage] = useState("")
  const [apiTestResult, setApiTestResult] = useState<string | null>(null)
  const [isTestingApi, setIsTestingApi] = useState(false)
  const [showToast, setShowToast] = useState(false)

  // Fetch federations
  useEffect(() => {
    const fetchFederations = async () => {
      try {
        setLoadingFederations(true)
        const querySnapshot = await getDocs(collection(db, "federations"))
        const fetchedFederations: Federation[] = querySnapshot.docs.map((doc) => ({
          id: doc.id,
          name: doc.data().name,
          description: doc.data().description,
        }))
        setFederations(fetchedFederations)
        if (initialFederationId && !initialFederationName) {
          const preselectedFed = fetchedFederations.find((fed) => fed.id === initialFederationId)
          if (preselectedFed) setFederationName(preselectedFed.name)
        }
      } catch {
        setErrorMessage("Failed to load federations. Please try again.")
      } finally {
        setLoadingFederations(false)
      }
    }
    fetchFederations()
  }, [initialFederationId, initialFederationName])

  useEffect(() => {
    setFederationId(searchParams?.get("federationId") || "")
    setFederationName(searchParams?.get("federationName") || "")
  }, [searchParams])

  const handleFederationSelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const selectedId = e.target.value
    const selectedFed = federations.find((fed) => fed.id === selectedId)
    setFederationId(selectedId)
    setFederationName(selectedFed ? selectedFed.name : "")
  }

  // Validações
  const isStep1Valid = () => federationId.trim() !== ""
  const isStep2Valid = () =>
    name.trim() !== "" && description.trim() !== "" && assetType.trim() !== ""
  const isStep3Valid = () =>
    apiEndpoint.trim() !== "" && dataFormat.trim() !== ""

  // Navegação
  const handleNext = () => {
    if (step === 1 && isStep1Valid()) setStep(2)
    else if (step === 2 && isStep2Valid()) setStep(3)
    else if (step === 3 && isStep3Valid()) setStep(4)
  }
  const handleBack = () => {
    if (step > 1) setStep(step - 1)
  }

  // Teste de API
  const handleApiTest = async () => {
    if (!apiEndpoint) {
      setApiTestResult("Please enter an API Endpoint to test.")
      return
    }
    setIsTestingApi(true)
    setApiTestResult(null)
    try {
      const response = await fetch(apiEndpoint, {
        method: "GET",
        headers: { Accept: "application/json, text/plain, */*" },
        mode: "cors",
      })
      const contentType = response.headers.get("content-type")
      let responseText = ""
      if (contentType && contentType.includes("application/json")) {
        try {
          responseText = JSON.stringify(await response.json(), null, 2)
        } catch {
          responseText = await response.text()
        }
      } else {
        responseText = await response.text()
      }
      if (response.ok) {
        setApiTestResult(
          `✅ Test successful! Status: ${response.status}. Content-Type: ${contentType || "unknown"}. Response: ${responseText.substring(0, 300)}${responseText.length > 300 ? "..." : ""}`,
        )
      } else {
        setApiTestResult(
          `❌ Test failed! Status: ${response.status} ${response.statusText}. Response: ${responseText.substring(0, 200)}${responseText.length > 200 ? "..." : ""}`,
        )
      }
    } catch (error) {
      const err = error as Error
      setApiTestResult(`❌ Error: ${err.message}`)
    } finally {
      setIsTestingApi(false)
    }
  }

  // Envio do formulário
  const handleSubmit = async () => {
    if (!isStep1Valid() || !isStep2Valid() || !isStep3Valid()) {
      setErrorMessage("Please fill in all required fields before submitting.")
      return
    }
    setIsSubmitting(true)
    setErrorMessage("")
    try {
      await addDoc(collection(db, "assets"), {
        name,
        federationId,
        federationName,
        description,
        assetType,
        purpose,
        semanticId,
        apiEndpoint,
        dataFormat,
        accessType,
        createdAt: serverTimestamp(),
      })
      setSubmitSuccess(true)
      setShowToast(true)
    } catch {
      setErrorMessage("Error submitting the form. Please try again.")
    } finally {
      setIsSubmitting(false)
    }
  }

  // Renderização dos passos
  const renderStep = () => {
    switch (step) {
      case 1:
        return (
          <>
            <h2 className="text-2xl font-semibold text-gray-800 mb-4 flex items-center gap-2">
              <Layers className="text-blue-600" size={28} />
              Step 1: Choose Federation
            </h2>
            <p className="text-gray-600 mb-6">
              Select the federation this asset will belong to. This determines its governance and sharing rules.
            </p>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Federation *</label>
              {loadingFederations ? (
                <p className="p-3 bg-gray-100 rounded-md">Loading federations...</p>
              ) : (
                <select
                  value={federationId}
                  onChange={handleFederationSelect}
                  required
                  className="border border-gray-300 p-3 w-full rounded-md shadow-sm focus:ring-blue-600 focus:border-blue-600"
                >
                  <option value="">-- Select a Federation --</option>
                  {federations.map((fed) => (
                    <option key={fed.id} value={fed.id}>
                      {fed.name} ({fed.id})
                    </option>
                  ))}
                </select>
              )}
              {federationName && (
                <p className="text-sm text-gray-500 mt-1">
                  You selected: <strong>{federationName}</strong>
                </p>
              )}
            </div>
            <div className="mt-6 flex justify-end">
              <button
                type="button"
                onClick={handleNext}
                disabled={!isStep1Valid()}
                className="bg-blue-600 hover:bg-blue-700 text-white font-semibold px-6 py-3 rounded-md shadow-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Next: Asset Details
              </button>
            </div>
          </>
        )
      case 2:
        return (
          <>
            <h2 className="text-2xl font-semibold text-gray-800 mb-4 flex items-center gap-2">
              <Box className="text-blue-600" size={28} />
              Step 2: Asset Details
            </h2>
            <p className="text-gray-600 mb-6">
              Provide essential information about your asset. Good descriptions and semantic IDs help others discover and use your asset.
            </p>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Asset Name *</label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Industrial Robot Sensor Data"
                  required
                  className="border border-gray-300 p-3 w-full rounded-md shadow-sm focus:ring-blue-600 focus:border-blue-600"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description *</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Describe the asset, its content, and its value for the industry."
                  required
                  rows={4}
                  className="border border-gray-300 p-3 w-full rounded-md shadow-sm focus:ring-blue-600 focus:border-blue-600"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Asset Type *</label>
                <select
                  value={assetType}
                  onChange={(e) => setAssetType(e.target.value)}
                  required
                  className="border border-gray-300 p-3 w-full rounded-md shadow-sm focus:ring-blue-600 focus:border-blue-600"
                >
                  <option value="">-- Select Type --</option>
                  <option value="CPS">Cyber-Physical System (CPS)</option>
                  <option value="DigitalTwin">Digital Twin</option>
                  <option value="Dataset">Dataset</option>
                  <option value="API">API</option>
                  <option value="Document">Document</option>
                  <option value="Other">Other</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Purpose of Operation *</label>
                <input
                  value={purpose}
                  onChange={(e) => setPurpose(e.target.value)}
                  placeholder="e.g. Monitoring, Predictive Maintenance, Optimization"
                  required
                  className="border border-gray-300 p-3 w-full rounded-md shadow-sm focus:ring-blue-600 focus:border-blue-600"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Semantic ID</label>
                <input
                  value={semanticId}
                  onChange={(e) => setSemanticId(e.target.value)}
                  placeholder="e.g. urn:data:robot:sensor_001"
                  className="border border-gray-300 p-3 w-full rounded-md shadow-sm focus:ring-blue-600 focus:border-blue-600"
                />
                <p className="text-xs text-gray-500 mt-1">A unique identifier for the asset&apos;s meaning or type.</p>
              </div>
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
                Next: Technical Info
              </button>
            </div>
          </>
        )
      case 3:
        return (
          <>
            <h2 className="text-2xl font-semibold text-gray-800 mb-4 flex items-center gap-2">
              <Code className="text-blue-600" size={28} />
              Step 3: Technical Info
            </h2>
            <p className="text-gray-600 mb-6">
              Provide technical details for this asset. This helps ensure interoperability and integration in the dataspace.
            </p>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">API Endpoint *</label>
                <input
                  value={apiEndpoint}
                  onChange={(e) => setApiEndpoint(e.target.value)}
                  placeholder="e.g. https://api.example.com/data"
                  required
                  className="border border-gray-300 p-3 w-full rounded-md shadow-sm focus:ring-blue-600 focus:border-blue-600"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Data Format *</label>
                <select
                  value={dataFormat}
                  onChange={(e) => setDataFormat(e.target.value)}
                  required
                  className="border border-gray-300 p-3 w-full rounded-md shadow-sm focus:ring-blue-600 focus:border-blue-600"
                >
                  <option value="">-- Select Format --</option>
                  <option value="JSON">JSON</option>
                  <option value="CSV">CSV</option>
                  <option value="XML">XML</option>
                  <option value="Parquet">Parquet</option>
                  <option value="Other">Other</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Access Type</label>
                <select
                  value={accessType}
                  onChange={(e) => setAccessType(e.target.value)}
                  className="border border-gray-300 p-3 w-full rounded-md shadow-sm focus:ring-blue-600 focus:border-blue-600"
                >
                  <option value="">-- Select Access Type --</option>
                  <option value="Public">Public</option>
                  <option value="Federation">Federation Only</option>
                  <option value="Restricted">Restricted</option>
                </select>
              </div>
              <div>
                <button
                  type="button"
                  onClick={handleApiTest}
                  disabled={!apiEndpoint || isTestingApi}
                  className="bg-green-600 hover:bg-green-700 text-white font-semibold px-4 py-2 rounded-md shadow-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {isTestingApi ? (
                    <>
                      <Layers className="animate-pulse" size={20} /> Testing...
                    </>
                  ) : (
                    <>
                      <Layers size={20} /> Test API Connection
                    </>
                  )}
                </button>
                {apiTestResult && (
                  <div
                    className={`mt-3 p-3 rounded-md text-sm border-l-4 ${apiTestResult.includes("✅")
                      ? "bg-green-50 text-green-700 border-green-500"
                      : "bg-yellow-50 text-yellow-700 border-yellow-500"
                      }`}
                  >
                    <pre className="whitespace-pre-wrap font-mono text-xs">{apiTestResult}</pre>
                  </div>
                )}
              </div>
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
                Next: Review & Register
              </button>
            </div>
          </>
        )
      case 4:
        return (
          <>
            <h2 className="text-2xl font-semibold text-gray-800 mb-4 flex items-center gap-2">
              <FileText className="text-blue-600" size={28} />
              Step 4: Review & Register
            </h2>
            <p className="text-gray-600 mb-6">
              Carefully review your asset details below. This document summarizes all provided information in a formal, printable format.
            </p>
            <div className="bg-white p-8 rounded-lg border border-gray-300 shadow-lg mb-8 font-serif text-gray-900 max-w-2xl mx-auto">
              <header className="mb-8 text-center">
                <h1 className="text-2xl font-bold mb-1 tracking-tight">Asset Registration Document</h1>
                <p className="text-base text-gray-500">Generated on {new Date().toLocaleDateString()}</p>
              </header>
              <section className="mb-6">
                <h2 className="font-semibold text-lg mb-1">1. Federation</h2>
                <p><strong>Name:</strong> {federationName || <span className="text-gray-400">N/A</span>} <span className="text-gray-400">({federationId || "N/A"})</span></p>
              </section>
              <section className="mb-6">
                <h2 className="font-semibold text-lg mb-1">2. Asset Details</h2>
                <p><strong>Asset Name:</strong> {name || <span className="text-gray-400">N/A</span>}</p>
                <p><strong>Description:</strong> <span className="whitespace-pre-line">{description || <span className="text-gray-400">N/A</span>}</span></p>
                <p><strong>Type:</strong> {assetType || <span className="text-gray-400">N/A</span>}</p>
                <p><strong>Purpose of Operation:</strong> {purpose || <span className="text-gray-400">N/A</span>}</p>
                <p><strong>Semantic ID:</strong> {semanticId || <span className="text-gray-400">N/A</span>}</p>
              </section>
              <section className="mb-6">
                <h2 className="font-semibold text-lg mb-1">3. Technical Info</h2>
                <p><strong>API Endpoint:</strong> {apiEndpoint || <span className="text-gray-400">N/A</span>}</p>
                <p><strong>Data Format:</strong> {dataFormat || <span className="text-gray-400">N/A</span>}</p>
                <p><strong>Access Type:</strong> {accessType || <span className="text-gray-400">N/A</span>}</p>
              </section>
            </div>
            {submitSuccess && (
              <div className="p-3 bg-green-100 text-green-800 border-l-4 border-green-500 rounded-md mb-4 flex items-center gap-2">
                <CheckCircle size={20} /> Asset registered successfully!
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
                {isSubmitting ? "Submitting..." : "Register Asset"}
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
      <SuccessToast
        open={showToast}
        onClose={() => setShowToast(false)}
        assetName={name}
        federationId={federationId}
        federationName={federationName}
      />

      <div className="flex justify-between items-center mb-6 mt-4 container mx-auto">
        <Link href="/assets" className="text-blue-600 hover:underline mb-4 inline-flex items-center">
          <ChevronLeft size={20} className="mr-1" /> Back to Assets
        </Link>
        <Link href="/assets/browse">
          <button className="bg-blue-600 text-white px-5 py-2 rounded-md hover:bg-blue-700">Browse Assets</button>
        </Link>
      </div>

      <div className="max-w-4xl mx-auto p-8 bg-white rounded-xl shadow-lg border border-gray-200 mt-4">
        <h1 className="text-3xl font-bold text-gray-800 mb-6 text-center">Register a New Dataspace Asset</h1>

        <StepIndicator currentStep={step} submitSuccess={submitSuccess} />

        <div className="space-y-5">
          {renderStep()}
        </div>

        <div className="mt-8 p-4 bg-blue-50 border-l-4 border-blue-500 text-blue-700 text-sm rounded-md">
          <strong>Note:</strong> All fields marked with * are required. The information you provide will be visible to potential users and integrators in the dataspace. Para CPS/Indústria Avançada, detalhe bem o tipo, formato, propósito e regras de acesso do ativo.
        </div>
      </div>
    </>
  )
}