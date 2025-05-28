"use client"

import {
  UserPlus,
  Users,
  FileCheck2,
  Package,
  Brain,
  Settings,
  Globe,
  Search,
  FileText,
  Key,
  CheckCircle,
  Database,
  FolderSearch,
} from "lucide-react"
import { useState } from "react"
import Link from "next/link"

export default function HomePage() {
  const [selectedProcess, setSelectedProcess] = useState<"federation" | "discovery" | null>(null)

  const federationSteps = [
    {
      id: 1,
      title: "Federation Registry",
      description: "Register a new federation with a unique identifier and initial configuration.",
      icon: UserPlus,
      color: "bg-blue-600",
    },
    {
      id: 2,
      title: "Scope Definition",
      description: "Define the scope, operational rules, and participating entities for the federation.",
      icon: Users,
      color: "bg-indigo-600",
    },
    {
      id: 3,
      title: "Associate a Compliance Contract",
      description: "Link a compliance contract to establish legal and operational terms.",
      icon: FileCheck2,
      color: "bg-cyan-600",
    },
    {
      id: 4,
      title: "Asset Onboarding",
      description: "Integrate data assets, APIs, and resources into the federation registry.",
      icon: Package,
      color: "bg-purple-600",
    },
    {
      id: 5,
      title: "Semantic Identification",
      description: "Apply ontologies to generate standardized semantic identifiers for assets.",
      icon: Brain,
      color: "bg-pink-600",
    },
    {
      id: 6,
      title: "Adjust Governance",
      description: "Configure governance policies and rules for the federation.",
      icon: Settings,
      color: "bg-yellow-500",
    },
    {
      id: 7,
      title: "Publish Federation",
      description: "Enable discoverability and controlled access to the federation and its assets.",
      icon: Globe,
      color: "bg-green-600",
    },
  ]

  const discoverySteps = [
    {
      id: 1,
      title: "Find Federations",
      description: "Search and locate federations relevant to your needs.",
      icon: FolderSearch,
      color: "bg-blue-600",
    },
    {
      id: 2,
      title: "Asset Discovery",
      description: "Locate relevant data assets through semantic search, metadata, or keywords.",
      icon: Search,
      color: "bg-emerald-600",
    },
    {
      id: 3,
      title: "Metadata Review",
      description: "Access technical documentation, data schemas, and usage policies.",
      icon: FileText,
      color: "bg-teal-600",
    },
    {
      id: 4,
      title: "Active Contracts",
      description: "Review current compliance contracts associated with the asset.",
      icon: FileCheck2,
      color: "bg-cyan-600",
    },
    {
      id: 5,
      title: "Access Request",
      description: "Submit a formal request outlining intended data usage and scope.",
      icon: Key,
      color: "bg-cyan-700",
    },
    {
      id: 6,
      title: "Authorization",
      description: "Obtain necessary approvals from federation and asset administrators.",
      icon: CheckCircle,
      color: "bg-blue-600",
    },
    {
      id: 7,
      title: "Data Consumption",
      description: "Securely access and integrate data via authorized endpoints.",
      icon: Database,
      color: "bg-indigo-600",
    },
  ]

  const ProcessFlow = ({
    steps,
    title,
  }: {
    steps: typeof federationSteps
    title: string
  }) => (
    <section className="bg-white p-8 rounded-2xl shadow-md border border-gray-200">
      <h2 className="text-2xl font-bold text-gray-800 mb-10 text-center uppercase tracking-wide">
        {title}
      </h2>
      <div className="relative">
        {steps.map((step, index) => {
          const IconComponent = step.icon
          const isDescriptionLeft = index % 2 === 0 // true for left, false for right
          return (
            <div key={step.id} className="flex items-center w-full">
              {/* Conditional rendering for left description */}
              {isDescriptionLeft ? (
                <div className="w-5/12 text-right pr-2">
                  <h3 className="text-lg font-semibold text-gray-900 mb-1">
                    {step.id}. {step.title}
                  </h3>
                  <p className="text-gray-600 text-sm leading-relaxed">{step.description}</p>
                </div>
              ) : (
                <div className="w-5/12"></div>
              )}

              {/* Central line with icon */}
              <div className="w-2/12 flex flex-col items-center">
                <div className={`${step.color} p-4 rounded-full shadow-lg z-10`}>
                  <IconComponent className="w-6 h-6 text-white" />
                </div>
                {index < steps.length - 1 && (
                  <div className="w-1 h-24 bg-gray-200" />
                )}
              </div>

              {/* Conditional rendering for right description */}
              {!isDescriptionLeft ? (
                <div className="w-5/12 text-left pl-2">
                  <h3 className="text-lg font-semibold text-gray-900 mb-1">
                    {step.id}. {step.title}
                  </h3>
                  <p className="text-gray-600 text-sm leading-relaxed">{step.description}</p>
                </div>
              ) : (
                <div className="w-5/12"></div>
              )}
            </div>
          )
        })}
      </div>
    </section>
  )

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Main title */}
      <div className="bg-gradient-to-r from-blue-100 to-indigo-100 py-8">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center">
            <h1 className="text-5xl font-extrabold text-blue-900 leading-tight mb-4">
              Unlock the Power of Connected Manufacturing
            </h1>
            <p className="text-xl text-blue-700 font-light max-w-3xl mx-auto">
              Seamlessly share, discover, and control industrial data across federated networks
            </p>
          </div>
        </div>
      </div>

      {/* Start your journey */}
      <section className="max-w-6xl mx-auto px-6 py-16">
        <div className="bg-gradient-to-r from-blue-700 to-indigo-700 rounded-2xl p-10 text-white text-center shadow-lg">
          <h2 className="text-2xl font-bold mb-3">Start Your Federated Data Journey</h2>
          <p className="text-base opacity-90 mb-6">
            Empower your operations with secure, standardized, and discoverable data exchange.
          </p>
          <div className="flex flex-wrap justify-center gap-4">
            <Link href="/federations" className="bg-white text-blue-700 px-6 py-3 rounded-md font-semibold shadow-sm hover:bg-gray-100 transition-colors">
              Initiate Federation
            </Link>
            <Link href="/assets" className="border-2 border-white text-white px-6 py-3 rounded-md font-semibold hover:bg-white hover:text-blue-700 transition-colors">
              Find Assets
            </Link>
            <Link href="/search" className="bg-white text-blue-700 px-6 py-3 rounded-md font-semibold shadow-sm hover:bg-gray-100 transition-colors">
              Discover Data
            </Link>
          </div>
        </div>
      </section>

      {/* Guidance section */}
      <section className="max-w-6xl mx-auto px-6 py-10">
        <h2 className="text-2xl font-bold text-gray-800 mb-6 text-center">Guidance</h2>
        <p className="text-center text-gray-600 mb-8 max-w-2xl mx-auto">
          These <b>process flows</b> illustrate the key steps involved in both <b>Federation</b> and <b>Discovery</b> within our platform. Understanding these workflows helps you navigate and utilize the system effectively, from registering new federations to discovering and consuming data assets securely.
        </p>
        <div className="flex justify-center gap-4 mb-10">
          <button
            onClick={() => setSelectedProcess("federation")}
            className={`px-6 py-3 rounded-md font-semibold transition-colors ${selectedProcess === "federation"
                ? "bg-blue-700 text-white"
                : "bg-white text-blue-700 border border-blue-700 hover:bg-blue-50"
              }`}
          >
            Show Federation Flow
          </button>
          <button
            onClick={() => setSelectedProcess("discovery")}
            className={`px-6 py-3 rounded-md font-semibold transition-colors ${selectedProcess === "discovery"
                ? "bg-indigo-700 text-white"
                : "bg-white text-indigo-700 border border-indigo-700 hover:bg-indigo-50"
              }`}
          >
            Show Discovery Flow
          </button>
        </div>

        {/* Dynamic flow display */}
        {selectedProcess === "federation" && (
          <ProcessFlow steps={federationSteps} title="Federation Process" />
        )}
        {selectedProcess === "discovery" && (
          <ProcessFlow steps={discoverySteps} title="Discovery Process" />
        )}
      </section>
    </div>
  )
}