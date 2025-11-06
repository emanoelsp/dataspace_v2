"use client"

import React, { useState } from "react"
import { collection, addDoc, serverTimestamp } from "firebase/firestore"
import { db } from "@/lib/firebase"
import {
  CheckCircle,
  Layers, // Original icon for 'Federation Structure'
  Globe, // Icon for 'Discovery'
  FileText,
  ChevronLeft,
  X,
  ShieldCheck, // New icon for 'Global Policy'
} from "lucide-react"
import Link from "next/link"

// Aligned with V8: Steps are for creating a "Domain" and its Global Policy
const steps = [
  { id: 1, title: "Define Domain", icon: Layers }, // What is this group?
  { id: 2, title: "Discovery Rules", icon: Globe }, // Who can see this group? (Pillar 4)
  { id: 3, title: "Global Policy", icon: ShieldCheck }, // What are the high-level rules? (Pillar 5)
  { id: 4, title: "Review & Create", icon: FileText }, // Review
]

// Toast Modal - Intra-organizational Context
function SuccessToast({
  open,
  onClose,
  domainName,
}: {
  open: boolean
  onClose: () => void
  domainName: string
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
          <h2 className="text-xl font-bold text-gray-800">Data Domain Created!</h2>
        </div>
        <p className="mb-6 text-gray-700">
          Your domain <span className="font-semibold">{domainName}</span> has been successfully
          registered. The high-level Global Policy has been associated with it.
        </p>
        <div className="space-y-3">
          {/* Logical next step: Register a CPS (Asset) in this domain */}
          <Link
            href={`/assets/create?domainName=${encodeURIComponent(domainName)}`}
            className="block w-full text-center bg-blue-600 text-white font-semibold px-4 py-2 rounded-md hover:bg-blue-700 transition"
          >
            Register an Asset (CPS) in this Domain
          </Link>
          <Link
            href="/federations/browse" // Keep route or change to /domains/browse
            className="block w-full text-center bg-white text-blue-600 border border-blue-600 font-semibold px-4 py-2 rounded-md hover:bg-blue-600 hover:text-white transition"
          >
            View All Domains
          </Link>
          {/* 'Add Compliance Contracts' link is removed as it's now part of this flow */}
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

function StepIndicator({ currentStep, submitSuccess }: { currentStep: number; submitSuccess: boolean }) {
  return (
    <div className="flex justify-center mb-8">
      {steps.map(({ id, title, icon: Icon }) => (
        <div key={id} className="flex flex-col items-center mx-2 max-w-[100px] text-center">
          <div
            className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-white transition-all duration-300 ${
              (id < 4 && currentStep >= id) || (id === 4 && submitSuccess)
                ? "bg-blue-600"
                : "bg-gray-300"
            }`}
          >
            {(id < 4 && currentStep > id) || (id === 4 && submitSuccess) ? (
              <CheckCircle size={20} />
            ) : (
              <Icon size={20} />
            )}
          </div>
          <p
            className={`text-sm mt-2 ${
              (id < 4 && currentStep >= id) || (id === 4 && submitSuccess)
                ? "text-blue-600 font-semibold"
                : "text-gray-500"
            }`}
          >
            {title}
          </p>
        </div>
      ))}
    </div>
  )
}

export default function CreateFederationPage() {
  // Step 1: Domain Definition
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")

  // Step 2: Discovery Governance (Pillar 4)
  const [discoveryPolicy, setDiscoveryPolicy] = useState("") // 'federationType' renamed
  const [functionalDomains, setFunctionalDomains] = useState("") // 'dataDomains' renamed
  const [primaryFunction, setPrimaryFunction] = useState("") // 'mainDomain' renamed

  // Step 3: Global Governance (High-Level) (Pillar 5) - New Fields
  const [globalPolicyName, setGlobalPolicyName] = useState("")
  const [globalPolicyRules, setGlobalPolicyRules] = useState("")
  const [globalComplianceStandard, setGlobalComplianceStandard] = useState("")

  // Wizard control state
  const [step, setStep] = useState(1)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitSuccess, setSubmitSuccess] = useState(false)
  const [errorMessage, setErrorMessage] = useState("")
  const [showToast, setShowToast] = useState(false)

  // Validation adapted for new steps
  const isStep1Valid = () => name.trim() !== "" && description.trim() !== ""
  const isStep2Valid = () =>
    discoveryPolicy.trim() !== "" && functionalDomains.trim() !== "" && primaryFunction.trim() !== ""
  const isStep3Valid = () =>
    globalPolicyName.trim() !== "" &&
    globalPolicyRules.trim() !== "" &&
    globalComplianceStandard.trim() !== ""

  const handleNext = () => {
    if (step === 1 && isStep1Valid()) setStep(2)
    else if (step === 2 && isStep2Valid()) setStep(3)
    else if (step === 3 && isStep3Valid()) setStep(4)
  }

  const handleBack = () => {
    if (step > 1) setStep(step - 1)
  }

  const handleSubmit = async () => {
    if (!isStep1Valid() || !isStep2Valid() || !isStep3Valid()) {
      setErrorMessage("Please fill in all required fields before submitting.")
      return
    }
    setIsSubmitting(true)
    setErrorMessage("")
    try {
      await addDoc(collection(db, "dataDomains"), { // Collection renamed from 'federations' to 'dataDomains'
        name,
        description,
        // Step 2
        discoveryPolicy,
        functionalDomains,
        primaryFunction,
        // Step 3
        globalPolicyName,
        globalPolicyRules,
        globalComplianceStandard,
        // Metadata
        createdAt: serverTimestamp(),
        // 'organization', 'contactEmail', 'website' removed
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
      // --- STEP 1: DOMAIN DEFINITION ---
      case 1:
        return (
          <>
            <h2 className="text-2xl font-semibold text-gray-800 mb-4 flex items-center gap-2">
              <Layers className="text-blue-600" size={28} />
              Step 1: Data Domain Definition
            </h2>
            <p className="text-gray-600 mb-6">
              Define a new Domain (Asset Group) to group Cyber-Physical Systems (CPS) with
              similar purposes or locations.
            </p>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Domain (Group) Name *
                </label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g., Production Cell A, Assembly Line B"
                  required
                  className="border border-gray-300 p-3 w-full rounded-md shadow-sm focus:ring-blue-600 focus:border-blue-600"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description *</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Describe this domain's purpose (e.g., 'Groups the welding robots and vision sensors in Cell A')"
                  required
                  rows={4}
                  className="border border-gray-300 p-3 w-full rounded-md shadow-sm focus:ring-blue-600 focus:border-blue-600"
                />
              </div>
              {/* 'Organization' field removed as it's intra-organizational */}
            </div>
            <div className="mt-6 flex justify-end">
              <button
                type="button"
                onClick={handleNext}
                disabled={!isStep1Valid()}
                className="bg-blue-600 hover:bg-blue-700 text-white font-semibold px-6 py-3 rounded-md shadow-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Next: Discovery Rules
              </button>
            </div>
          </>
        )
      // --- STEP 2: DISCOVERY GOVERNANCE (PILLAR 4) ---
      case 2:
        return (
          <>
            <h2 className="text-2xl font-semibold text-gray-800 mb-4 flex items-center gap-2">
              <Globe className="text-blue-600" size={28} />
              Step 2: Discovery Governance (Pillar 4)
            </h2>
            <p className="text-gray-600 mb-6">
              Define the *visibility* of this domain in the Catalog (Broker). Who will be able to
              *discover* the assets (CPS) belonging to this group?
            </p>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Discovery Policy (Visibility) *
                </label>
                <select
                  value={discoveryPolicy}
                  onChange={(e) => setDiscoveryPolicy(e.target.value)}
                  required
                  className="border border-gray-300 p-3 w-full rounded-md shadow-sm focus:ring-blue-600 focus:border-blue-600"
                >
                  <option value="">-- Select Visibility --</option>
                  <option value="Public (Internal)">
                    Public (Internal) (Visible to all internal systems, e.g., BI, ERP)
                  </option>
                  <option value="Consortium (Request-Based)">
                    Consortium (Visible, but CPS access requires Owner approval)
                  </option>
                  <option value="Private (Restricted)">
                    Private (Invisible, except for pre-approved Clients, e.g., Control Arch.)
                  </option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Functional Domains (Ontology) *
                </label>
                <input
                  value={functionalDomains}
                  onChange={(e) => setFunctionalDomains(e.target.value)}
                  placeholder="Common ontology terms. e.g., Assembly, Control, Maintenance, Quality"
                  required
                  className="border border-gray-300 p-3 w-full rounded-md shadow-sm focus:ring-blue-600 focus:border-blue-600"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Primary Function *
                </label>
                <input
                  value={primaryFunction}
                  onChange={(e) => setPrimaryFunction(e.target.value)}
                  placeholder="e.g., Real-time Control, Predictive Analysis"
                  required
                  className="border border-gray-300 p-3 w-full rounded-md shadow-sm focus:ring-blue-600 focus:border-blue-600"
                />
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
                Next: Global Policy
              </button>
            </div>
          </>
        )
      // --- STEP 3: GLOBAL GOVERNANCE (PILLAR 5) ---
      case 3:
        return (
          <>
            <h2 className="text-2xl font-semibold text-gray-800 mb-4 flex items-center gap-2">
              <ShieldCheck className="text-blue-600" size={28} />
              Step 3: Global Governance (High-Level)
            </h2>
            <p className="text-gray-600 mb-6">
              Define the high-level *compliance* policy for this domain. All CPS
              registered here must adhere to these master rules.
            </p>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Global Policy Name *
                </label>
                <input
                  value={globalPolicyName}
                  onChange={(e) => setGlobalPolicyName(e.target.value)}
                  placeholder="e.g., Cell A Safety and Control Policy"
                  required
                  className="border border-gray-300 p-3 w-full rounded-md shadow-sm focus:ring-blue-600 focus:border-blue-600"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Policy Rules (Description) *
                </label>
                <textarea
                  value={globalPolicyRules}
                  onChange={(e) => setGlobalPolicyRules(e.target.value)}
                  placeholder="Describe high-level rules. e.g., 1. Real-time data access restricted to Control Arch. 2. Maintenance logs must be retained for 90 days. 3. Global access quotas..."
                  required
                  rows={5}
                  className="border border-gray-300 p-3 w-full rounded-md shadow-sm focus:ring-blue-600 focus:border-blue-600"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Associated Compliance Standard *
                </label>
                <input
                  value={globalComplianceStandard}
                  onChange={(e) => setGlobalComplianceStandard(e.target.value)}
                  placeholder="e.g., SOP-Manufacturing-001, IEC 62443, ISO 27001"
                  required
                  className="border border-gray-300 p-3 w-full rounded-md shadow-sm focus:ring-blue-600 focus:border-blue-600"
                />
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
                Next: Review & Create
              </button>
            </div>
          </>
        )
      // --- STEP 4: REVIEW & SUBMIT ---
      case 4:
        return (
          <>
            <h2 className="text-2xl font-semibold text-gray-800 mb-4 flex items-center gap-2">
              <FileText className="text-blue-600" size={28} />
              Step 4: Review & Create Domain
            </h2>
            <p className="text-gray-600 mb-6">
              Review the details of your Data Domain and its associated Global Policy.
            </p>
            <div className="bg-white p-8 rounded-lg border border-gray-300 shadow-lg mb-8 font-serif text-gray-900 max-w-2xl mx-auto">
              <header className="mb-8 text-center">
                <h1 className="text-2xl font-bold mb-1 tracking-tight">
                  Data Domain Registration Document
                </h1>
                <p className="text-base text-gray-500">
                  Generated on {new Date().toLocaleDateString()}
                </p>
              </header>
              <section className="mb-6">
                <h2 className="font-semibold text-lg mb-1">1. Domain Definition</h2>
                <p>
                  <strong>Domain Name:</strong> {name || <span className="text-gray-400">N/A</span>}
                </p>
                <p>
                  <strong>Description:</strong>{" "}
                  <span className="whitespace-pre-line">
                    {description || <span className="text-gray-400">N/A</span>}
                  </span>
                </p>
              </section>
              <section className="mb-6">
                <h2 className="font-semibold text-lg mb-1">2. Discovery Governance</h2>
                <p>
                  <strong>Discovery Policy:</strong>{" "}
                  {discoveryPolicy || <span className="text-gray-400">N/A</span>}
                </p>
                <p>
                  <strong>Functional Domains:</strong>{" "}
                  {functionalDomains || <span className="text-gray-400">N/A</span>}
                </p>
                <p>
                  <strong>Primary Function:</strong>{" "}
                  {primaryFunction || <span className="text-gray-400">N/A</span>}
                </p>
              </section>
              <section className="mb-6">
                <h2 className="font-semibold text-lg mb-1">3. Global Governance (High-Level)</h2>
                <p>
                  <strong>Policy Name:</strong>{" "}
                  {globalPolicyName || <span className="text-gray-400">N/A</span>}
                </p>
                <p>
                  <strong>Compliance Standard:</strong>{" "}
                  {globalComplianceStandard || <span className="text-gray-400">N/A</span>}
                </p>
                <p>
                  <strong>Policy Rules:</strong>{" "}
                  <span className="whitespace-pre-line">
                    {globalPolicyRules || <span className="text-gray-400">N/A</span>}
                  </span>
                </p>
              </section>
            </div>
            {submitSuccess && (
              <div className="p-3 bg-green-100 text-green-800 border-l-4 border-green-500 rounded-md mb-4 flex items-center gap-2">
                <CheckCircle size={20} /> Domain registered successfully!
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
                {isSubmitting ? "Registering..." : "Register Domain"}
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
        domainName={name}
      />

      <div className="flex justify-between items-center mb-6 mt-4 container mx-auto">
        <Link
          href="/federations" // Keep route or change to /domains
          className="text-blue-600 hover:underline mb-4 inline-flex items-center"
        >
          <ChevronLeft size={20} className="mr-1" /> Back to Domains
        </Link>
        <Link href="/federations/browse">
          <button className="bg-blue-600 text-white px-5 py-2 rounded-md hover:bg-blue-700">
            Browse Domains
          </button>
        </Link>
      </div>

      <div className="max-w-4xl mx-auto p-8 bg-white rounded-xl shadow-lg border border-gray-200 mt-4">
        <h1 className="text-3xl font-bold text-gray-800 mb-6 text-center">
          Create New Data Domain
        </h1>

        <StepIndicator currentStep={step} submitSuccess={submitSuccess} />

        <div className="space-y-5">{renderStep()}</div>

        <div className="mt-8 p-4 bg-blue-50 border-l-4 border-blue-500 text-blue-700 text-sm rounded-md">
          <strong>Note:</strong> All fields marked with * are required. This information
          defines the governance for all assets (CPS) registered in this domain.
        </div>
      </div>
    </>
  )
}
