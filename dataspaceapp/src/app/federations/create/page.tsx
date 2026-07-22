"use client"

import React, { useState } from "react"
import { addDoc, collection, getDocs, query, serverTimestamp, where } from "firebase/firestore"
import { db } from "@/lib/firebase"
import { CheckCircle, Building, Layers, FileText, ChevronLeft, X } from "lucide-react"
import Link from "next/link"
import { buildOwnershipFields, sanitizeMultilineText, sanitizeText } from "@/lib/dataspace"
import { mapLegacyFederationType } from "@/lib/intra-dataspace"
import { useUserProfile } from "@/lib/use-user-profile"

const steps = [
  { id: 1, title: "Basic Info", icon: Building },
  { id: 2, title: "Federation Type", icon: Layers },
  { id: 3, title: "Review & Submit", icon: FileText },
]

// Toast Modal
function SuccessToast({
  open,
  onClose,
  federationName,
}: {
  open: boolean
  onClose: () => void
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
          <h2 className="text-xl font-bold text-gray-800">Federation Created!</h2>
        </div>
        <p className="mb-6 text-gray-700">
          Your federation <span className="font-semibold">{federationName}</span> was successfully registered.
        </p>
        <div className="space-y-3">
          <Link
            href="/federations/browse"
            className="block w-full text-center bg-blue-600 text-white font-semibold px-4 py-2 rounded-md hover:bg-blue-700 transition"
          >
            View All Federations
          </Link>
          <Link
            href={`/assets/create?federationName=${encodeURIComponent(federationName)}`}
            className="block w-full text-center bg-white text-blue-600 border border-blue-600 font-semibold px-4 py-2 rounded-md hover:bg-blue-600 hover:text-white transition"
          >
            Add Assets to This Federation
          </Link>
          <Link
            href={`/accordance/compliance/create?federationName=${encodeURIComponent(federationName)}`}
            className="block w-full text-center bg-white text-blue-600 border border-blue-600 font-semibold px-4 py-2 rounded-md hover:bg-blue-600 hover:text-white transition"
          >
            Add Compliance Contracts
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
            className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-white transition-all duration-300 ${
              (id < 3 && currentStep >= id) || (id === 3 && (currentStep >= 3 || submitSuccess))
                ? "bg-blue-600"
                : "bg-gray-300"
            }`}
          >
            {(id < 3 && currentStep > id) || (id === 3 && submitSuccess)
              ? <CheckCircle size={20} />
              : <Icon size={20} />}
          </div>
          <p className={`text-sm mt-2 ${
            (id < 3 && currentStep >= id) || (id === 3 && (currentStep >= 3 || submitSuccess))
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

export default function CreateFederationPage() {
  const { user, profile, loading: authLoading } = useUserProfile()
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [organization, setOrganization] = useState("")
  const [connectorOptions, setConnectorOptions] = useState<Array<{
    id: string
    connectorName?: string
    participantId?: string
    connectorDspBaseUrl?: string
    connectorManagementBaseUrl?: string
    federatedCatalogUrl?: string
    scopeType?: string
    scopeLabel?: string
    sidecarProtocol?: string
    sidecarEndpoint?: string
    isDefault?: boolean
  }>>([])
  const [selectedConnectorId, setSelectedConnectorId] = useState("")
  const [loadingConnectors, setLoadingConnectors] = useState(true)

  // Federation Structure
  const [federationType, setFederationType] = useState("")
  const [catalogVisibility, setCatalogVisibility] = useState("")
  const [admissionMode, setAdmissionMode] = useState("")

  const [step, setStep] = useState(1)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitSuccess, setSubmitSuccess] = useState(false)
  const [errorMessage, setErrorMessage] = useState("")
  const [showToast, setShowToast] = useState(false)

  React.useEffect(() => {
    if (profile?.organizationLegalName) {
      setOrganization((current) => current || profile.organizationLegalName || "")
    }
  }, [profile?.organizationLegalName])

  React.useEffect(() => {
    const loadConnectors = async () => {
      if (!user) {
        setConnectorOptions([])
        setLoadingConnectors(false)
        return
      }

      try {
        setLoadingConnectors(true)
        const snapshot = await getDocs(query(collection(db, "connectorProfiles"), where("ownerId", "==", user.uid)))
        const rows = snapshot.docs.map((docSnapshot) => ({
          id: docSnapshot.id,
          ...docSnapshot.data(),
        })) as Array<{ id: string; isDefault?: boolean; [key: string]: unknown }>
        setConnectorOptions(rows)

        const preferred = rows.find((row) => row.isDefault) ?? rows[0]
        if (preferred) {
          setSelectedConnectorId((current) => current || preferred.id)
        }
      } catch {
        setConnectorOptions([])
      } finally {
        setLoadingConnectors(false)
      }
    }

    void loadConnectors()
  }, [user])

  const isStep1Valid = () =>
    name.trim() !== "" &&
    description.trim() !== "" &&
    selectedConnectorId.trim() !== ""
  const isStep2Valid = () => federationType.trim() !== ""

  const handleFederationTypeChange = (value: string) => {
    setFederationType(value)
    const mapped = mapLegacyFederationType(value)
    setCatalogVisibility(mapped.catalogVisibility)
    setAdmissionMode(mapped.admissionMode)
  }

  const handleNext = () => {
    if (step === 1 && isStep1Valid()) setStep(2)
    else if (step === 2 && isStep2Valid()) setStep(3)
  }

  const handleBack = () => {
    if (step > 1) setStep(step - 1)
  }

   const handleSubmit = async () => {
    if (!isStep1Valid() || !isStep2Valid()) {
      setErrorMessage("Please fill in all required fields before submitting.")
      return
    }

    if (!user) {
      setErrorMessage("Sign in before registering a federation.")
      return
    }



    setIsSubmitting(true)
    setErrorMessage("")
    try {
      const selectedConnector = connectorOptions.find((connector) => connector.id === selectedConnectorId)
      if (!selectedConnector) {
        setErrorMessage("Select the connector that will operate this federation.")
        return
      }

      await addDoc(collection(db, "federations"), {
        name: sanitizeText(name),
        description: sanitizeMultilineText(description),
        organization: sanitizeText(organization),
        connectorProfileId: selectedConnector.id,
        connectorName: sanitizeText(selectedConnector.connectorName ?? ""),
        participantId: sanitizeText(selectedConnector.participantId ?? ""),
        connectorDspBaseUrl: sanitizeText(selectedConnector.connectorDspBaseUrl ?? ""),
        connectorManagementBaseUrl: sanitizeText(selectedConnector.connectorManagementBaseUrl ?? ""),
        federatedCatalogUrl: sanitizeText(selectedConnector.federatedCatalogUrl ?? ""),
        connectorScopeType: sanitizeText(selectedConnector.scopeType ?? ""),
        connectorScopeLabel: sanitizeText(selectedConnector.scopeLabel ?? ""),
        sidecarProtocol: sanitizeText(selectedConnector.sidecarProtocol ?? ""),
        sidecarEndpoint: sanitizeText(selectedConnector.sidecarEndpoint ?? ""),
        federationType: sanitizeText(federationType),
        catalogVisibility: sanitizeText(catalogVisibility),
        admissionMode: sanitizeText(admissionMode),
        dataDomains: "",
        mainDomain: "",
        contactEmail: (user.email ?? "").toLowerCase(),
        website: "",
        publishedInCatalog: true,
        status: "draft",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        ...buildOwnershipFields(user),
      })
      setSubmitSuccess(true)
      setShowToast(true)
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
              <Building className="text-blue-600" size={28} />
              Step 1: Basic Information
            </h2>
            <p className="text-gray-600 mb-6">
              Provide basic information about your federation. This will help others understand its purpose and scope.
            </p>
            <div className="space-y-4">
              <div>
                <label htmlFor="fed-name" className="block text-sm font-medium text-gray-700 mb-1">Federation Name *</label>
                <input
                  id="fed-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Smart City Data Alliance"
                  required
                  className="border border-gray-300 p-3 w-full rounded-md shadow-sm focus:ring-blue-600 focus:border-blue-600"
                />
              </div>
              <div>
                <label htmlFor="fed-description" className="block text-sm font-medium text-gray-700 mb-1">Description *</label>
                <textarea
                  id="fed-description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Describe the purpose and scope of this federation"
                  required
                  rows={4}
                  className="border border-gray-300 p-3 w-full rounded-md shadow-sm focus:ring-blue-600 focus:border-blue-600"
                />
              </div>
              <div>
                <label htmlFor="fed-org" className="block text-sm font-medium text-gray-700 mb-1">Organization *</label>
                <input
                  id="fed-org"
                  value={organization}
                  onChange={(e) => setOrganization(e.target.value)}
                  placeholder="Your organization name"
                  required
                  className="border border-gray-300 p-3 w-full rounded-md shadow-sm focus:ring-blue-600 focus:border-blue-600"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Operating Connector *</label>
                <select
                  value={selectedConnectorId}
                  onChange={(e) => setSelectedConnectorId(e.target.value)}
                  required
                  className="border border-gray-300 p-3 w-full rounded-md shadow-sm focus:ring-blue-600 focus:border-blue-600"
                >
                  <option value="">
                    {loadingConnectors ? "-- Loading connectors --" : "-- Select connector --"}
                  </option>
                  {connectorOptions.map((connector) => (
                    <option key={connector.id} value={connector.id}>
                      {connector.connectorName || connector.participantId || connector.id}
                      {connector.scopeLabel ? ` · ${connector.scopeLabel}` : ""}
                      {connector.isDefault ? " · default" : ""}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-xs text-gray-500">
                  Choose which confined connector of your organization will expose and govern this federation.
                </p>
                {!loadingConnectors && connectorOptions.length === 0 ? (
                  <p className="mt-2 text-xs text-amber-700">
                    No connector configured yet. Create one first in <Link href="/profile/connector/configure" className="underline">Configure connector</Link>.
                  </p>
                ) : null}
              </div>
            </div>
            <div className="mt-6 flex justify-end">
              <button
                type="button"
                onClick={handleNext}
                disabled={!isStep1Valid()}
                className="bg-blue-600 hover:bg-blue-700 text-white font-semibold px-6 py-3 rounded-md shadow-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Next: Federation Structure
              </button>
            </div>
          </>
        )
      case 2:
        return (
          <>
            <h2 className="text-2xl font-semibold text-gray-800 mb-4 flex items-center gap-2">
              <Layers className="text-blue-600" size={28} />
              Step 2: Federation Structure
            </h2>
            <p className="text-gray-600 mb-6">
              Define the structure of your federation. This includes the type, covered data domains, and main domain of expertise.
            </p>
            <div className="space-y-4">
              <div>
                <label htmlFor="fed-type" className="block text-sm font-medium text-gray-700 mb-1">Federation Type *</label>
                <select
                  id="fed-type"
                  value={federationType}
                  onChange={(e) => handleFederationTypeChange(e.target.value)}
                  required
                  className="border border-gray-300 p-3 w-full rounded-md shadow-sm focus:ring-blue-600 focus:border-blue-600"
                >
                  <option value="">-- Select Type --</option>
                  <option value="Open">Aberta — assina o contrato e consome</option>
                  <option value="Consortium">Consórcio — entrada somente por convite</option>
                  <option value="Private">Privada — solicitação + aprovação</option>
                </select>
              </div>
              {federationType ? (
                <div className="rounded-md border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">
                  <p className="font-semibold mb-1">Fluxo de adesão derivado do tipo:</p>
                  {federationType === "Open" ? (
                    <p>🔓 <b>Aberta</b> — visível no catálogo; qualquer participante assina o contrato e consome, sem pré-aprovação.</p>
                  ) : federationType === "Consortium" ? (
                    <p>✉️ <b>Consórcio</b> — catálogo restrito aos membros; a entrada ocorre exclusivamente por convite do dono.</p>
                  ) : (
                    <p>🔒 <b>Privada</b> — visível no catálogo para permitir a descoberta; a entrada exige solicitação e aprovação do dono.</p>
                  )}
                  <p className="mt-2 text-xs text-blue-700">
                    catalogVisibility: <span className="font-mono">{catalogVisibility}</span> · admissionMode: <span className="font-mono">{admissionMode}</span>
                  </p>
                </div>
              ) : null}
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
                Next: Review & Submit
              </button>
            </div>
          </>
        )
      case 3:
        return (
          <>
            <h2 className="text-2xl font-semibold text-gray-800 mb-4 flex items-center gap-2">
              <FileText className="text-blue-600" size={28} />
              Step 3: Review & Submit
            </h2>
            <p className="text-gray-600 mb-6">
              Carefully review your federation details below. This document summarizes all provided information in a formal, printable format.
            </p>
            <div className="bg-white p-8 rounded-lg border border-gray-300 shadow-lg mb-8 font-serif text-gray-900 max-w-2xl mx-auto">
              <header className="mb-8 text-center">
                <h1 className="text-2xl font-bold mb-1 tracking-tight">Federation Registration Document</h1>
                <p className="text-base text-gray-500">Generated on {new Date().toLocaleDateString()}</p>
              </header>
              <section className="mb-6">
                <h2 className="font-semibold text-lg mb-1">1. Basic Information</h2>
                <p><strong>Federation Name:</strong> {name || <span className="text-gray-400">N/A</span>}</p>
                <p><strong>Description:</strong> <span className="whitespace-pre-line">{description || <span className="text-gray-400">N/A</span>}</span></p>
                <p><strong>Organization:</strong> {organization || <span className="text-gray-400">N/A</span>}</p>
                <p><strong>Connector:</strong> {connectorOptions.find((connector) => connector.id === selectedConnectorId)?.connectorName || <span className="text-gray-400">N/A</span>}</p>
              </section>
              <section className="mb-6">
                <h2 className="font-semibold text-lg mb-1">2. Federation Structure</h2>
                <p><strong>Type:</strong> {federationType || <span className="text-gray-400">N/A</span>}</p>
                <p><strong>Catalog Visibility:</strong> {catalogVisibility || <span className="text-gray-400">N/A</span>}</p>
                <p><strong>Admission Mode:</strong> {admissionMode || <span className="text-gray-400">N/A</span>}</p>
              </section>
            </div>
            {submitSuccess && (
              <div className="p-3 bg-green-100 text-green-800 border-l-4 border-green-500 rounded-md mb-4 flex items-center gap-2">
                <CheckCircle size={20} /> Federation registered successfully!
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
                {isSubmitting ? "Submitting..." : "Register Federation"}
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
        federationName={name}
      />

      <div className="flex justify-between items-center mb-6 mt-4 container mx-auto">
        <Link href="/federations" className="text-blue-600 hover:underline mb-4 inline-flex items-center">
          <ChevronLeft size={20} className="mr-1" /> Back to Federations
        </Link>
        <Link href="/federations/browse">
          <button className="bg-blue-600 text-white px-5 py-2 rounded-md hover:bg-blue-700">Browse Federations</button>
        </Link>
      </div>

      <div className="max-w-4xl mx-auto p-8 bg-white rounded-xl shadow-lg border border-gray-200 mt-4">
        <h1 className="text-3xl font-bold text-gray-800 mb-6 text-center">Create a New Federation</h1>

        {!authLoading && !user && (
          <div className="mb-6 rounded-md border-l-4 border-amber-500 bg-amber-50 p-4 text-sm text-amber-800">
            Sign in using the header before submitting. Federation registration now stores ownership metadata for
            safer edit and audit flows.
          </div>
        )}

        <StepIndicator currentStep={step} submitSuccess={submitSuccess} />

        <div className="space-y-5">
          {renderStep()}
        </div>

        <div className="mt-8 p-4 bg-blue-50 border-l-4 border-blue-500 text-blue-700 text-sm rounded-md">
          <strong>Note:</strong> All fields marked with * are required. The information you provide will be visible to potential members of your federation.
        </div>
      </div>
    </>
  )
}
