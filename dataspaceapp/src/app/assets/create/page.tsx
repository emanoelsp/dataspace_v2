"use client"

import React, { useState, useEffect, Suspense } from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { collection, addDoc, getDocs, serverTimestamp } from "firebase/firestore"
import { db } from "@/lib/firebase"
import { CheckCircle, Layers, Box, Code, FileText, ChevronLeft, X } from "lucide-react"
import { buildOwnershipFields, sanitizeMultilineText, sanitizeOptionalText, sanitizeText, sanitizeUrl } from "@/lib/dataspace"
import { EXCHANGE_MODES } from "@/lib/intra-dataspace"
import { useAuthUser } from "@/lib/use-auth-user"

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
  connectorProfileId?: string
  connectorName?: string
  participantId?: string
  connectorDspBaseUrl?: string
  connectorManagementBaseUrl?: string
  federatedCatalogUrl?: string
  connectorScopeType?: string
  connectorScopeLabel?: string
  sidecarProtocol?: string
  sidecarEndpoint?: string
}

function slugifyEquipment(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32)
}

function CreateAssetPageInner() {
  const { user, loading: authLoading } = useAuthUser()
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
  const [assetKind] = useState("data")
  const [purpose] = useState("")
  const [semanticId] = useState("")
  const [aasId, setAasId] = useState("")
  const [irdi, setIrdi] = useState("")
  const [semanticModel] = useState("AAS / IEC 63278")

  const [aasEndpoint, setAasEndpoint] = useState("")
  const [dataEndpoint, setDataEndpoint] = useState("")
  const [equipmentSlug, setEquipmentSlug] = useState("")
  const [dataFormat, setDataFormat] = useState("JSON")
  const [exchangeMode, setExchangeMode] = useState("stream")
  const [accessType] = useState("Federation")

  const [step, setStep] = useState(1)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitSuccess, setSubmitSuccess] = useState(false)
  const [errorMessage, setErrorMessage] = useState("")
  const [apiTestResult, setApiTestResult] = useState<string | null>(null)
  const [isTestingApi, setIsTestingApi] = useState(false)
  const [showToast, setShowToast] = useState(false)
  const [isFetchingAas, setIsFetchingAas] = useState(false)
  const [aasFetchStatus, setAasFetchStatus] = useState<"idle" | "success" | "failed">("idle")

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
          connectorProfileId: doc.data().connectorProfileId,
          connectorName: doc.data().connectorName,
          participantId: doc.data().participantId,
          connectorDspBaseUrl: doc.data().connectorDspBaseUrl,
          connectorManagementBaseUrl: doc.data().connectorManagementBaseUrl,
          federatedCatalogUrl: doc.data().federatedCatalogUrl,
          connectorScopeType: doc.data().connectorScopeType,
          connectorScopeLabel: doc.data().connectorScopeLabel,
          sidecarProtocol: doc.data().sidecarProtocol,
          sidecarEndpoint: doc.data().sidecarEndpoint,
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
    aasEndpoint.trim() !== "" && dataEndpoint.trim() !== "" && dataFormat.trim() !== "" && exchangeMode.trim() !== ""

  // Fetch AAS ID and IRDI directly from the two typed endpoints
  const fetchAasMetadata = async () => {
    setIsFetchingAas(true)
    setAasFetchStatus("idle")
    try {
      const auth = { headers: { Authorization: "Bearer demo" } }
      const [dataRes, aasRes] = await Promise.all([
        fetch(dataEndpoint, auth).catch(() => null),
        fetch(aasEndpoint, auth).catch(() => null),
      ])
      let found = false
      if (dataRes?.ok) {
        const d = await dataRes.json()
        if (typeof d?.eclassIrdi === "string" && d.eclassIrdi) { setIrdi(d.eclassIrdi); found = true }
      }
      if (aasRes?.ok) {
        const env = await aasRes.json()
        const id = env?.assetAdministrationShells?.[0]?.id
        if (id) { setAasId(id); found = true }
      }
      setAasFetchStatus(found ? "success" : "failed")
    } catch {
      setAasFetchStatus("failed")
    } finally {
      setIsFetchingAas(false)
    }
  }

  // Navegação
  const handleNext = async () => {
    if (step === 1 && isStep1Valid()) setStep(2)
    else if (step === 2 && isStep2Valid()) setStep(3)
    else if (step === 3 && isStep3Valid()) {
      await fetchAasMetadata()
      setStep(4)
    }
  }
  const handleBack = () => {
    if (step > 1) setStep(step - 1)
  }

  // Teste de API — testa o data endpoint
  const handleApiTest = async () => {
    if (!dataEndpoint) {
      setApiTestResult("Please enter the Data Endpoint to test.")
      return
    }
    setIsTestingApi(true)
    setApiTestResult(null)
    try {
      const response = await fetch(dataEndpoint, {
        method: "GET",
        headers: { Accept: "application/json, text/plain, */*", Authorization: "Bearer demo" },
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

    if (!user) {
      setErrorMessage("Sign in before registering an asset.")
      return
    }

    const normalizedDataEndpoint = sanitizeUrl(dataEndpoint)
    const normalizedAasEndpoint = sanitizeUrl(aasEndpoint)

    if (!normalizedDataEndpoint || !normalizedAasEndpoint) {
      setErrorMessage("Provide valid URLs for both AAS and Data endpoints.")
      return
    }

    setIsSubmitting(true)
    setErrorMessage("")
    try {
      const selectedFederation = federations.find((federation) => federation.id === federationId)
      const finalEquipmentSlug = equipmentSlug || slugifyEquipment(name)
      const baseUrl = normalizedDataEndpoint.replace(/\/api\/data\/?.*$/i, "")

      // Harvest capabilities from the data and AAS endpoints for catalog indexing
      let capabilities: string[] = []
      let capabilitySemantics: string[] = []
      try {
        const authHeaders = { headers: { Authorization: "Bearer demo" } }
        const [dataRes, aasRes] = await Promise.all([
          fetch(normalizedDataEndpoint, authHeaders),
          fetch(`${normalizedAasEndpoint}?submodel=OperationalData`, authHeaders),
        ])
        if (dataRes.ok) {
          const d = await dataRes.json()
          capabilities = Object.keys(d?.metrics ?? {}).slice(0, 64)
        }
        if (aasRes.ok) {
          const env = await aasRes.json()
          const collect = (els: Array<{ semanticId?: { keys?: Array<{ value?: string }> }; submodelElements?: unknown[] }>) => {
            for (const el of els ?? []) {
              const sem = el?.semanticId?.keys?.[0]?.value
              if (sem) capabilitySemantics.push(sem)
              if (Array.isArray(el?.submodelElements)) collect(el.submodelElements as typeof els)
            }
          }
          for (const sm of env?.submodels ?? []) collect(sm?.submodelElements ?? [])
          capabilitySemantics = Array.from(new Set(capabilitySemantics)).slice(0, 96)
        }
      } catch { /* unreachable CPS — catalog stored without capabilities, can be refreshed later */ }

      await addDoc(collection(db, "assets"), {
        name: sanitizeText(name),
        equipmentSlug: finalEquipmentSlug,
        capabilities,
        capabilitySemantics,
        federationId,
        federationName: sanitizeText(federationName),
        connectorProfileId: sanitizeOptionalText(selectedFederation?.connectorProfileId ?? ""),
        connectorName: sanitizeOptionalText(selectedFederation?.connectorName ?? ""),
        connectorParticipantId: sanitizeOptionalText(selectedFederation?.participantId ?? ""),
        connectorDspBaseUrl: sanitizeOptionalText(selectedFederation?.connectorDspBaseUrl ?? ""),
        connectorManagementBaseUrl: sanitizeOptionalText(selectedFederation?.connectorManagementBaseUrl ?? ""),
        federatedCatalogUrl: sanitizeOptionalText(selectedFederation?.federatedCatalogUrl ?? ""),
        connectorScopeType: sanitizeOptionalText(selectedFederation?.connectorScopeType ?? ""),
        connectorScopeLabel: sanitizeOptionalText(selectedFederation?.connectorScopeLabel ?? ""),
        sidecarProtocol: sanitizeOptionalText(selectedFederation?.sidecarProtocol ?? ""),
        sidecarEndpoint: sanitizeOptionalText(selectedFederation?.sidecarEndpoint ?? ""),
        description: sanitizeMultilineText(description),
        assetType: sanitizeText(assetType),
        assetKind: sanitizeText(assetKind),
        purpose: sanitizeText(purpose),
        semanticId: sanitizeOptionalText(semanticId),
        aasId: sanitizeOptionalText(aasId),
        irdi: sanitizeOptionalText(irdi),
        semanticModel: sanitizeOptionalText(semanticModel),
        aasEndpoint: normalizedAasEndpoint,
        dataEndpoint: normalizedDataEndpoint,
        apiEndpoint: normalizedDataEndpoint,
        dataFormat: sanitizeText(dataFormat),
        exchangeMode: sanitizeText(exchangeMode),
        accessType: sanitizeOptionalText(accessType),
        publishedInCatalog: true,
        status: "draft",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        ...buildOwnershipFields(user),
      })

      // Register the CPS with the federation's Sidecar PEP so it can proxy
      // requests to this equipment using the connector's known sidecar URL.
      try {
        await fetch("/api/sidecar/register-equipment", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            idToken: await user.getIdToken(),
            sidecarUrl: sanitizeOptionalText(selectedFederation?.sidecarEndpoint ?? "") || undefined,
            id: finalEquipmentSlug,
            name: sanitizeText(name),
            baseUrl,
            aasEndpoint: normalizedAasEndpoint,
            dataEndpoint: normalizedDataEndpoint,
            eclassIrdi: sanitizeOptionalText(irdi) || undefined,
            connectorId: sanitizeOptionalText(selectedFederation?.connectorProfileId ?? "") || undefined,
            dataOwnerId: user.uid,
            dataOwnerName: user.displayName ?? user.email ?? "",
          }),
        })
      } catch {
        // sidecar registration is best-effort: asset remains valid in the catalog
      }

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
                <label htmlFor="asset-name" className="block text-sm font-medium text-gray-700 mb-1">Asset Name *</label>
                <input
                  id="asset-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Industrial Robot Sensor Data"
                  required
                  className="border border-gray-300 p-3 w-full rounded-md shadow-sm focus:ring-blue-600 focus:border-blue-600"
                />
              </div>
              <div>
                <label htmlFor="asset-description" className="block text-sm font-medium text-gray-700 mb-1">Description *</label>
                <textarea
                  id="asset-description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Describe the asset, its content, and its value for the industry."
                  required
                  rows={4}
                  className="border border-gray-300 p-3 w-full rounded-md shadow-sm focus:ring-blue-600 focus:border-blue-600"
                />
              </div>
              <div>
                <label htmlFor="asset-type" className="block text-sm font-medium text-gray-700 mb-1">Asset Type *</label>
                <select
                  id="asset-type"
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
                <label htmlFor="asset-aas-endpoint" className="block text-sm font-medium text-gray-700 mb-1">AAS Endpoint *</label>
                <input
                  id="asset-aas-endpoint"
                  value={aasEndpoint}
                  onChange={(e) => setAasEndpoint(e.target.value)}
                  placeholder="e.g. http://192.168.0.82:3001/api/aas"
                  required
                  className="border border-gray-300 p-3 w-full rounded-md shadow-sm focus:ring-blue-600 focus:border-blue-600 font-mono text-sm"
                />
                <p className="text-xs text-gray-500 mt-1">Asset Administration Shell endpoint (IDTA-01001-3-0).</p>
              </div>
              <div>
                <label htmlFor="asset-data-endpoint" className="block text-sm font-medium text-gray-700 mb-1">Data Endpoint *</label>
                <input
                  id="asset-data-endpoint"
                  value={dataEndpoint}
                  onChange={(e) => setDataEndpoint(e.target.value)}
                  placeholder="e.g. http://192.168.0.82:3001/api/data"
                  required
                  className="border border-gray-300 p-3 w-full rounded-md shadow-sm focus:ring-blue-600 focus:border-blue-600 font-mono text-sm"
                />
                <p className="text-xs text-gray-500 mt-1">Real-time operational data endpoint.</p>
              </div>
              <div>
                <label htmlFor="asset-equipment-slug" className="block text-sm font-medium text-gray-700 mb-1">Equipment ID (Sidecar route)</label>
                <input
                  id="asset-equipment-slug"
                  value={equipmentSlug}
                  onChange={(e) => setEquipmentSlug(slugifyEquipment(e.target.value))}
                  placeholder={name ? `auto: ${slugifyEquipment(name)}` : "e.g. cnc, press, agv-01"}
                  className="border border-gray-300 p-3 w-full rounded-md shadow-sm focus:ring-blue-600 focus:border-blue-600"
                />
                <p className="text-xs text-gray-500 mt-1">
                  CPS identifier in the Sidecar PEP (/api/proxy/&#123;id&#125;/data). If empty, derived from the asset name.
                </p>
              </div>
              <div>
                <label htmlFor="asset-data-format" className="block text-sm font-medium text-gray-700 mb-1">Data Format *</label>
                <select
                  id="asset-data-format"
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
                <label htmlFor="asset-exchange-mode" className="block text-sm font-medium text-gray-700 mb-1">Exchange Mode *</label>
                <select
                  id="asset-exchange-mode"
                  value={exchangeMode}
                  onChange={(e) => setExchangeMode(e.target.value)}
                  required
                  className="border border-gray-300 p-3 w-full rounded-md shadow-sm focus:ring-blue-600 focus:border-blue-600"
                >
                  <option value="">-- Select Exchange Mode --</option>
                  {EXCHANGE_MODES.map((value) => (
                    <option key={value} value={value}>
                      {value === "batch" ? "Batch" : value === "stream" ? "Stream" : "Hybrid"}
                    </option>
                  ))}
                </select>
              </div>
              
              <div>
                <button
                  type="button"
                  onClick={handleApiTest}
                  disabled={!dataEndpoint || isTestingApi}
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
                disabled={!isStep3Valid() || isFetchingAas}
                className="bg-blue-600 hover:bg-blue-700 text-white font-semibold px-6 py-3 rounded-md shadow-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isFetchingAas ? "Fetching from API..." : "Next: Review & Register"}
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
                <p><strong>Asset Kind:</strong> {assetKind || <span className="text-gray-400">N/A</span>}</p>
                <p><strong>Purpose of Operation:</strong> {purpose || <span className="text-gray-400">N/A</span>}</p>
                <p><strong>Semantic ID:</strong> {semanticId || <span className="text-gray-400">N/A</span>}</p>
                {aasFetchStatus === "success" ? (
                  <div className="mt-2 rounded-md border border-green-200 bg-green-50 p-3 text-sm">
                    <p className="text-xs font-semibold text-green-700 mb-1">✅ Retrieved from API</p>
                    <p><strong>AAS ID:</strong> {aasId || <span className="text-gray-400">Not found</span>}</p>
                    <p><strong>IRDI / ECLASS:</strong> {irdi || <span className="text-gray-400">Not found</span>}</p>
                  </div>
                ) : aasFetchStatus === "failed" ? (
                  <div className="mt-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm">
                    <p className="text-xs font-semibold text-amber-700 mb-2">⚠️ Could not retrieve from API — fill in manually if available</p>
                    <div className="space-y-2">
                      <div>
                        <label className="block text-xs text-gray-600 mb-1">AAS ID</label>
                        <input
                          value={aasId}
                          onChange={(e) => setAasId(e.target.value)}
                          placeholder="e.g. urn:dataspace:plant1:equipment:cnc:001"
                          className="border border-gray-300 p-2 w-full rounded-md text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-600 mb-1">IRDI / ECLASS</label>
                        <input
                          value={irdi}
                          onChange={(e) => setIrdi(e.target.value)}
                          placeholder="e.g. 0173-1#01-ACJ843#001"
                          className="border border-gray-300 p-2 w-full rounded-md text-sm"
                        />
                      </div>
                    </div>
                  </div>
                ) : null}
                <p><strong>Semantic Model:</strong> {semanticModel || <span className="text-gray-400">N/A</span>}</p>
              </section>
              <section className="mb-6">
                <h2 className="font-semibold text-lg mb-1">3. Technical Info</h2>
                <p><strong>AAS Endpoint:</strong> {aasEndpoint || <span className="text-gray-400">N/A</span>}</p>
                <p><strong>Data Endpoint:</strong> {dataEndpoint || <span className="text-gray-400">N/A</span>}</p>
                <p><strong>Data Format:</strong> {dataFormat || <span className="text-gray-400">N/A</span>}</p>
                <p><strong>Exchange Mode:</strong> {exchangeMode || <span className="text-gray-400">N/A</span>}</p>
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

        {!authLoading && !user && (
          <div className="mb-6 rounded-md border-l-4 border-amber-500 bg-amber-50 p-4 text-sm text-amber-800">
            Sign in using the header before submitting. New assets now carry ownership metadata used by access
            requests and audit logs.
          </div>
        )}

        <StepIndicator currentStep={step} submitSuccess={submitSuccess} />

        <div className="space-y-5">
          {renderStep()}
        </div>

        <div className="mt-8 p-4 bg-blue-50 border-l-4 border-blue-500 text-blue-700 text-sm rounded-md">
          <strong>Note:</strong> All fields marked with * are required. The information you provide will be visible to potential users and integrators in the dataspace. For CPS/Advanced Industry assets, provide detailed type, format, purpose, and access rules.
        </div>
      </div>
    </>
  )
}

// Exporta o componente com Suspense para uso correto do useSearchParams
export default function CreateAssetPage() {
  return (
    <Suspense fallback={<div className="p-8 text-gray-600">Loading...</div>}>
      <CreateAssetPageInner />
    </Suspense>
  )
}
