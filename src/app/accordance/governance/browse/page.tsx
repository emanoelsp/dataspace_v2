"use client"

import React, { useState, useEffect, Suspense } from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { collection, addDoc, getDocs, serverTimestamp } from "firebase/firestore"
import { db } from "@/lib/firebase"
import { CheckCircle, FileCheck, FileText, FileSignature, BookOpen, ClipboardList, ChevronLeft, X } from "lucide-react"

const steps = [
  { id: 1, title: "Choose Federation", icon: FileCheck },
  { id: 2, title: "Legal Basis", icon: BookOpen },
  { id: 3, title: "Terms & Conditions", icon: FileText },
  { id: 4, title: "Consent Logs", icon: ClipboardList },
  { id: 5, title: "Digital Signature", icon: FileSignature },
  { id: 6, title: "Review & Register", icon: CheckCircle },
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
          <h2 className="text-xl font-bold text-gray-800">Compliance Registered!</h2>
        </div>
        <p className="mb-6 text-gray-700">
          Compliance for <span className="font-semibold">{federationName}</span> was successfully registered.
        </p>
        <div className="space-y-3">
          <Link
            href="/accordance/compliance/create"
            className="block w-full text-center bg-blue-600 text-white font-semibold px-4 py-2 rounded-md hover:bg-blue-700 transition"
          >
            Add Another Compliance
          </Link>
          <Link
            href="/accordance/compliance/browse"
            className="block w-full text-center bg-white text-blue-600 border border-blue-600 font-semibold px-4 py-2 rounded-md hover:bg-blue-600 hover:text-white transition"
          >
            View All Compliances
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
            className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-white transition-all duration-300 ${(id < 6 && currentStep >= id) || (id === 6 && submitSuccess)
              ? "bg-blue-600"
              : "bg-gray-300"
              }`}
          >
            {(id < 6 && currentStep > id) || (id === 6 && submitSuccess)
              ? <CheckCircle size={20} />
              : <Icon size={20} />}
          </div>
          <p className={`text-sm mt-2 ${(id < 6 && currentStep >= id) || (id === 6 && submitSuccess)
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

function GovernanceBrowseContent() {
  const searchParams = useSearchParams()
  const initialFederationId = searchParams?.get("federationId") || ""
  const initialFederationName = searchParams?.get("federationName") || ""

  // Form states
  const [federationId, setFederationId] = useState(initialFederationId)
  const [federationName, setFederationName] = useState(initialFederationName)
  const [federations, setFederations] = useState<Federation[]>([])
  const [loadingFederations, setLoadingFederations] = useState(true)

  const [legalBasis, setLegalBasis] = useState<string[]>([])
  const [otherLegalBasis, setOtherLegalBasis] = useState("")
  const [termsAccepted, setTermsAccepted] = useState(false)
  const [termsText, setTermsText] = useState("")
  const [consentLogs, setConsentLogs] = useState("")
  const [signature, setSignature] = useState("")
  const [step, setStep] = useState(1)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitSuccess, setSubmitSuccess] = useState(false)
  const [errorMessage, setErrorMessage] = useState("")
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

  // Legal basis options
  const legalOptions = [
    { value: "LGPD", label: "LGPD (Brazil)" },
    { value: "GDPR", label: "GDPR (European Union)" },
    { value: "CCPA", label: "CCPA (California, USA)" },
    { value: "Other", label: "Other" },
  ]

  // Validations
  const isStep1Valid = () => federationId.trim() !== ""
  const isStep2Valid = () => legalBasis.length > 0 && (legalBasis.includes("Other") ? otherLegalBasis.trim() !== "" : true)
  const isStep3Valid = () => termsAccepted && termsText.trim() !== ""
  const isStep4Valid = () => consentLogs.trim() !== ""
  const isStep5Valid = () => signature.trim() !== ""

  // Navigation
  const handleNext = () => {
    if (step === 1 && isStep1Valid()) setStep(2)
    else if (step === 2 && isStep2Valid()) setStep(3)
    else if (step === 3 && isStep3Valid()) setStep(4)
    else if (step === 4 && isStep4Valid()) setStep(5)
    else if (step === 5 && isStep5Valid()) setStep(6)
  }
  const handleBack = () => {
    if (step > 1) setStep(step - 1)
  }

  // Submission
  const handleSubmit = async () => {
    if (!isStep1Valid() || !isStep2Valid() || !isStep3Valid() || !isStep4Valid() || !isStep5Valid()) {
      setErrorMessage("Please fill in all required fields before submitting.")
      return
    }
    setIsSubmitting(true)
    setErrorMessage("")
    try {
      await addDoc(collection(db, "compliance"), {
        federationId,
        federationName,
        legalBasis: legalBasis.includes("Other") ? [...legalBasis.filter(l => l !== "Other"), otherLegalBasis] : legalBasis,
        termsAccepted,
        termsText,
        consentLogs,
        signature,
        createdAt: serverTimestamp(),
        signatureHash: btoa(signature + Date.now()),
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
              <FileCheck className="text-blue-600" size={28} />
              Step 1: Choose Federation
            </h2>
            <p className="text-gray-600 mb-6">
              Select the federation this compliance will be associated with.
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
                Next: Legal Basis
              </button>
            </div>
          </>
        )
      case 2:
        return (
          <>
            <h2 className="text-2xl font-semibold text-gray-800 mb-4 flex items-center gap-2">
              <BookOpen className="text-blue-600" size={28} />
              Step 2: Legal Basis
            </h2>
            <p className="text-gray-600 mb-6">
              Select the legal basis for data processing. You may select more than one.
            </p>
            <div className="space-y-2">
              {legalOptions.map(opt => (
                <label key={opt.value} className="flex items-center gap-2 text-gray-700">
                  <input
                    type="checkbox"
                    checked={legalBasis.includes(opt.value)}
                    onChange={e => {
                      if (e.target.checked) setLegalBasis([...legalBasis, opt.value])
                      else setLegalBasis(legalBasis.filter(l => l !== opt.value))
                    }}
                  />
                  {opt.label}
                </label>
              ))}
              {legalBasis.includes("Other") && (
                <input
                  type="text"
                  value={otherLegalBasis}
                  onChange={e => setOtherLegalBasis(e.target.value)}
                  placeholder="Specify other legal basis"
                  className="border border-gray-300 p-2 w-full rounded-md mt-2"
                />
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
                Next: Terms & Conditions
              </button>
            </div>
          </>
        )
      case 3:
        return (
          <>
            <h2 className="text-2xl font-semibold text-gray-800 mb-4 flex items-center gap-2">
              <FileText className="text-blue-600" size={28} />
              Step 3: Terms & Conditions
            </h2>
            <p className="text-gray-600 mb-6">
              Create or paste the terms and conditions for data access. The user must accept these terms.
            </p>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Terms & Conditions *</label>
              <textarea
                value={termsText}
                onChange={(e) => setTermsText(e.target.value)}
                placeholder="Enter the terms and conditions for data access"
                required
                rows={6}
                className="border border-gray-300 p-3 w-full rounded-md shadow-sm focus:ring-blue-600 focus:border-blue-600"
              />
            </div>
            <div className="flex items-center mt-4">
              <input
                id="termsAccepted"
                type="checkbox"
                checked={termsAccepted}
                onChange={(e) => setTermsAccepted(e.target.checked)}
                className="focus:ring-blue-500 h-4 w-4 text-blue-600 border-gray-300 rounded"
              />
              <label htmlFor="termsAccepted" className="ml-2 text-sm text-gray-700">
                I accept the Terms & Conditions *
              </label>
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
                Next: Consent Logs
              </button>
            </div>
          </>
        )
      case 4:
        return (
          <>
            <h2 className="text-2xl font-semibold text-gray-800 mb-4 flex items-center gap-2">
              <ClipboardList className="text-blue-600" size={28} />
              Step 4: Consent Logs
            </h2>
            <p className="text-gray-600 mb-6">
              Authorize and describe how consent logs will be recorded and managed.
            </p>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Consent Log Details *</label>
              <textarea
                value={consentLogs}
                onChange={(e) => setConsentLogs(e.target.value)}
                placeholder="Describe how consent logs will be handled"
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
                Next: Digital Signature
              </button>
            </div>
          </>
        )
      case 5:
        return (
          <>
            <h2 className="text-2xl font-semibold text-gray-800 mb-4 flex items-center gap-2">
              <FileSignature className="text-blue-600" size={28} />
              Step 5: Digital Signature
            </h2>
            <p className="text-gray-600 mb-6">
              Sign digitally to authorize this compliance record.
            </p>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Digital Signature *</label>
              <input
                value={signature}
                onChange={(e) => setSignature(e.target.value)}
                placeholder="Type your full name as a digital signature"
                required
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
                Next: Review & Register
              </button>
            </div>
          </>
        )
      case 6:
        return (
          <>
            <h2 className="text-2xl font-semibold text-gray-800 mb-4 flex items-center gap-2">
              <CheckCircle className="text-blue-600" size={28} />
              Step 6: Review & Register
            </h2>
            <p className="text-gray-600 mb-6">
              Carefully review your compliance details below. This document summarizes all provided information in a formal, printable format.
            </p>
            <div className="bg-white p-8 rounded-lg border border-gray-300 shadow-lg mb-8 font-serif text-gray-900 max-w-2xl mx-auto">
              <header className="mb-8 text-center">
                <h1 className="text-2xl font-bold mb-1 tracking-tight">Compliance Registration Document</h1>
                <p className="text-base text-gray-500">Generated on {new Date().toLocaleDateString()}</p>
              </header>
              <section className="mb-6">
                <h2 className="font-semibold text-lg mb-1">1. Federation</h2>
                <p><strong>Name:</strong> {federationName || <span className="text-gray-400">N/A</span>} <span className="text-gray-400">({federationId || "N/A"})</span></p>
              </section>
              <section className="mb-6">
                <h2 className="font-semibold text-lg mb-1">2. Legal Basis</h2>
                <p>
                  <strong>Legal Basis:</strong>{" "}
                  {legalBasis.length > 0
                    ? legalBasis.map(l =>
                        l === "Other" ? otherLegalBasis : l
                      ).join(", ")
                    : <span className="text-gray-400">N/A</span>}
                </p>
              </section>
              <section className="mb-6">
                <h2 className="font-semibold text-lg mb-1">3. Terms & Conditions</h2>
                <p><strong>Accepted:</strong> {termsAccepted ? "Yes" : "No"}</p>
                <p><strong>Terms Text:</strong> <span className="whitespace-pre-line">{termsText || <span className="text-gray-400">N/A</span>}</span></p>
              </section>
              <section className="mb-6">
                <h2 className="font-semibold text-lg mb-1">4. Consent Logs</h2>
                <p><strong>Details:</strong> {consentLogs || <span className="text-gray-400">N/A</span>}</p>
              </section>
              <section className="mb-6">
                <h2 className="font-semibold text-lg mb-1">5. Digital Signature</h2>
                <p><strong>Signature:</strong> {signature || <span className="text-gray-400">N/A</span>}</p>
                <p className="text-xs text-gray-400 mt-2">
                  <strong>Signature Hash:</strong> {signature ? btoa(signature + "hash") : "-"}
                </p>
              </section>
            </div>
            {submitSuccess && (
              <div className="p-3 bg-green-100 text-green-800 border-l-4 border-green-500 rounded-md mb-4 flex items-center gap-2">
                <CheckCircle size={20} /> Compliance registered successfully!
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
                {isSubmitting ? "Submitting..." : "Register Compliance"}
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
        federationName={federationName}
      />

      <div className="flex justify-between items-center mb-6 mt-4 container mx-auto">
        <Link href="/accordance/compliance" className="text-blue-600 hover:underline mb-4 inline-flex items-center">
          <ChevronLeft size={20} className="mr-1" /> Back to Compliance
        </Link>
        <Link href="/accordance/compliance/browse">
          <button className="bg-blue-600 text-white px-5 py-2 rounded-md hover:bg-blue-700">Browse Compliance</button>
        </Link>
      </div>

      <div className="max-w-4xl mx-auto p-8 bg-white rounded-xl shadow-lg border border-gray-200 mt-4">
        <h1 className="text-3xl font-bold text-gray-800 mb-6 text-center">Register a New Compliance</h1>
        <StepIndicator currentStep={step} submitSuccess={submitSuccess} />
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

export default function GovernanceBrowsePage() {
  return (
    <Suspense fallback={<div className="p-8 text-gray-600">Carregando...</div>}>
      <GovernanceBrowseContent />
    </Suspense>
  )
}