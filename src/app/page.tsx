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
  ChevronDown,
  ChevronUp,
  Zap,
  Shield,
  TrendingUp,
  Network,
  LucideShield as FileShield,
  Layers,
  ArrowRight,
  ArrowDown,
} from "lucide-react"
import { useState } from "react"
import Link from "next/link"

export default function HomePage() {
  const [expandedOnboarding, setExpandedOnboarding] = useState(false)
  const [expandedConsumption, setExpandedConsumption] = useState(false)

  const federationSetupSteps = [
    {
      id: 1,
      title: "Register Federation",
      description:
        "Define the federation type (Public, Consortium, or Private) that determines asset visibility in the dataspace catalog.",
      icon: Network,
      color: "bg-purple-600",
      details: "Controls who can discover CPS: entire organization, specific groups, or restricted list.",
    },
    {
      id: 2,
      title: "Register Global Governance",
      description:
        "Establish high-level policies and compliance rules that apply to the entire ecosystem or federated groups.",
      icon: FileShield,
      color: "bg-pink-600",
      details: "E.g., 'Quality data only accessible by inspection and ERP', 'Priority in emergency stops'.",
    },
    {
      id: 3,
      title: "Register Assets in Federation",
      description:
        "Register CPS with unique identity (DID), functional modeling, and define their visibility level in the federation.",
      icon: Layers,
      color: "bg-cyan-600",
      details: "Each CPS publishes its capabilities and APIs, respecting the defined federation type.",
    },
    {
      id: 4,
      title: "Register Local Governance",
      description:
        "Create CPS-specific ContractOffers, defining low-level policies: quotas, federated data types, and access periods.",
      icon: Settings,
      color: "bg-indigo-600",
      details: "E.g., 'Control: 100 calls/s for temperature', 'Maintenance: 1 call/min for vibration'.",
    },
  ]

  const onboardingSteps = [
    {
      id: 1,
      title: "1. Asset Registration ('Plug')",
      description:
        "Register a new Cyber-Physical System (CPS) with a unique identity (DID) in the organizational dataspace.",
      icon: UserPlus,
      color: "bg-blue-600",
    },
    {
      id: 2,
      title: "2. Define Functional Scope",
      description: "Model the asset's capabilities (e.g., 'screwing M5') for discovery by the Control Architecture.",
      icon: Users,
      color: "bg-indigo-600",
    },
    {
      id: 3,
      title: "3. Define Contract Offers",
      description:
        "Create auditable `ContractOffers` specifying data policies (quotas, data types) for different clients (e.g., Control vs. Maintenance).",
      icon: FileCheck2,
      color: "bg-cyan-600",
    },
    {
      id: 4,
      title: "4. Apply Semantic Wrapper",
      description:
        "Package the asset's native API (e.g., 'status: 5') with a wrapper to translate it to the common organizational ontology (e.g., 'state: InFault').",
      icon: Package,
      color: "bg-purple-600",
    },
    {
      id: 5,
      title: "5. Configure Federated Data",
      description:
        "Selectively define which data (e.g., real-time status, maintenance logs) is offered in each `ContractOffer`.",
      icon: Brain,
      color: "bg-pink-600",
    },
    {
      id: 6,
      title: "6. Set Discovery Governance",
      description:
        "Configure asset visibility (e.g., 'Private' to its cell, 'Consortium' for maintenance, 'Public' to plant BI).",
      icon: Settings,
      color: "bg-yellow-500",
    },
    {
      id: 7,
      title: "7. Publish to Catalog",
      description:
        "Publish the CPS metadata and signed contracts to the Dataspace Broker. The 'Plug' phase is complete and the asset is now discoverable.",
      icon: Globe,
      color: "bg-green-600",
    },
  ]

  const consumptionSteps = [
    {
      id: 1,
      title: "1. Asset Discovery",
      description:
        "The Client (e.g., Control Architecture) queries the Broker for assets by functional needs (e.g., 'capability: screwing M5').",
      icon: FolderSearch,
      color: "bg-blue-600",
    },
    {
      id: 2,
      title: "2. Review Contract Offers",
      description:
        "The Client reviews the `ContractOffers` from discovered assets to find a policy match (e.g., 'real-time_control_contract').",
      icon: Search,
      color: "bg-emerald-600",
    },
    {
      id: 3,
      title: "3. Review Offer Details",
      description:
        "Inspect the policy details: semantic data offered (`temperature`), quotas (`100/s`), and the owner's signature.",
      icon: FileText,
      color: "bg-teal-600",
    },
    {
      id: 4,
      title: "4. Sign Contract Agreement",
      description:
        "The Client digitally signs the `ContractOffer` to create a binding, auditable `ContractAgreement` (Pillar 5).",
      icon: FileCheck2,
      color: "bg-cyan-600",
    },
    {
      id: 5,
      title: "5. Receive Access Token",
      description:
        "The Dataspace validates the signed agreement and issues a short-lived, scoped access token (e.g., JWT) to the Client.",
      icon: Key,
      color: "bg-cyan-700",
    },
    {
      id: 6,
      title: "6. Authorization Confirmed ('Play')",
      description: "The Client is now authorized to access the asset's data. This completes the 'Play' setup phase.",
      icon: CheckCircle,
      color: "bg-blue-600",
    },
    {
      id: 7,
      title: "7. Federated Data Consumption",
      description:
        "Client uses the token to consume data **directly from the CPS source** (no central copy), respecting the signed contract.",
      icon: Database,
      color: "bg-indigo-600",
    },
  ]

  const ProcessFlow = ({
    steps,
    expanded,
  }: {
    steps: typeof onboardingSteps
    expanded: boolean
  }) => {
    const displaySteps = expanded ? steps : steps.slice(0, 3)

    return (
      <div className="space-y-4">
        {displaySteps.map((step) => {
          const IconComponent = step.icon
          return (
            <div
              key={step.id}
              className="flex items-start gap-4 p-4 rounded-lg bg-gray-50 hover:bg-gray-100 transition-colors"
            >
              <div className={`${step.color} p-3 rounded-lg shadow-sm flex-shrink-0`}>
                <IconComponent className="w-5 h-5 text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-base font-semibold text-gray-900 mb-1">{step.title}</h3>
                <p className="text-sm text-gray-600 leading-relaxed">{step.description}</p>
              </div>
            </div>
          )
        })}
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white">
      {/* Hero Section - Improved */}
      <div className="bg-gradient-to-br from-blue-600 via-indigo-600 to-blue-700 text-white">
        <div className="max-w-7xl mx-auto px-6 py-16">
          <div className="text-center mb-12">
            <div className="inline-flex items-center gap-2 bg-white/10 backdrop-blur-sm px-4 py-2 rounded-full mb-6">
              <Zap className="w-4 h-4" />
              <span className="text-sm font-medium">Intra-Organizational Dataspace</span>
            </div>
            <h1 className="text-5xl md:text-6xl font-extrabold leading-tight mb-6">
              Unlock the Power of Connected Manufacturing,
              <br />
              <span className="text-blue-200">Simplified</span>
            </h1>
            <p className="text-xl text-blue-100 font-light max-w-3xl mx-auto leading-relaxed">
              Seamlessly discover, govern, and access real-time data from your Cyber-Physical Systems (CPS) on the shop
              floor.
            </p>
          </div>

          {/* Key Benefits */}
          <div className="grid md:grid-cols-3 gap-6 mb-12">
            <div className="bg-white/10 backdrop-blur-sm rounded-xl p-6 border border-white/20">
              <Shield className="w-8 h-8 mb-3 text-blue-200" />
              <h3 className="font-semibold text-lg mb-2">Secure & Auditable</h3>
              <p className="text-sm text-blue-100">Digital contracts with full traceability</p>
            </div>
            <div className="bg-white/10 backdrop-blur-sm rounded-xl p-6 border border-white/20">
              <TrendingUp className="w-8 h-8 mb-3 text-blue-200" />
              <h3 className="font-semibold text-lg mb-2">Real-Time Access</h3>
              <p className="text-sm text-blue-100">Direct federated data consumption</p>
            </div>
            <div className="bg-white/10 backdrop-blur-sm rounded-xl p-6 border border-white/20">
              <Globe className="w-8 h-8 mb-3 text-blue-200" />
              <h3 className="font-semibold text-lg mb-2">Plug & Play</h3>
              <p className="text-sm text-blue-100">Dynamic asset discovery and reconfiguration</p>
            </div>
          </div>

          {/* Primary CTAs */}
          <div className="flex flex-wrap justify-center gap-4">
            <Link
              href="/federations"
              className="bg-white text-blue-700 px-8 py-4 rounded-lg font-semibold shadow-lg hover:shadow-xl hover:scale-105 transition-all flex items-center gap-2"
            >
              <UserPlus className="w-5 h-5" />
              Register CPS Asset
            </Link>
            <Link
              href="/assets"
              className="bg-blue-500 text-white px-8 py-4 rounded-lg font-semibold shadow-lg hover:bg-blue-400 hover:shadow-xl hover:scale-105 transition-all flex items-center gap-2"
            >
              <Search className="w-5 h-5" />
              Discover Assets
            </Link>
          </div>
        </div>
      </div>

      {/* Example Scenario - Enhanced */}
      <section className="max-w-7xl mx-auto px-6 py-16">
        <div className="bg-gradient-to-br from-indigo-50 to-blue-50 p-8 md:p-12 rounded-2xl shadow-lg border-2 border-indigo-200">
          <div className="flex items-start gap-4 mb-6">
            <div className="bg-indigo-600 p-3 rounded-lg">
              <Zap className="w-6 h-6 text-white" />
            </div>
            <div>
              <h2 className="text-3xl font-bold text-gray-900 mb-2">The Resilient Production Cell</h2>
              <p className="text-indigo-600 font-medium">Real-world scenario demonstration</p>
            </div>
          </div>

          <div className="bg-white p-6 rounded-xl shadow-sm border border-indigo-100">
            <p className="text-gray-700 leading-relaxed">
              A <span className="font-semibold text-indigo-600">Control Architecture</span> (Client) needs a &apos;screwing&apos;
              function. It queries the <span className="font-semibold text-indigo-600">Dataspace Broker</span> and finds
              two available CPS robots. It reviews their{" "}
              <code className="bg-indigo-50 px-2 py-1 rounded text-sm">ContractOffers</code>, digitally signs an
              agreement for real-time control, and starts the{" "}
              <span className="font-semibold text-indigo-600">&apos;Play&apos; </span> phase.
            </p>
            <div className="my-4 border-t border-indigo-100"></div>
            <p className="text-gray-700 leading-relaxed">
              Later, one robot goes offline (<span className="font-semibold text-red-600">&apos;Unplug&apos; </span>). The Control
              Architecture repeats the discovery process, finds a new available robot, signs a new contract, and
              seamlessly reconfigures the cell—all governed by the dataspace.
            </p>
          </div>
        </div>
      </section>

      <section className="max-w-7xl mx-auto px-6 py-2 relative">
        {/* Background decoration */}
        <div className="absolute inset-0 bg-gradient-to-b from-purple-50/50 to-transparent pointer-events-none rounded-3xl"></div>

        <div className="relative z-10">
          <div className="text-center mb-16">
            <div className="inline-flex items-center gap-2 bg-purple-100 px-4 py-2 rounded-full mb-4 shadow-sm">
              <Network className="w-4 h-4 text-purple-600" />
              <span className="text-sm font-semibold text-purple-600">Phase 1: Foundation Setup</span>
            </div>
            <h2 className="text-4xl md:text-5xl font-bold text-gray-900 mb-4">Federation Configuration</h2>
            <p className="text-lg text-gray-600 max-w-3xl mx-auto leading-relaxed">
              Before connecting CPS assets, establish the governance framework that defines{" "}
              <span className="font-semibold text-purple-600">global policies</span>, controls{" "}
              <span className="font-semibold text-purple-600">asset visibility</span>, and ensures{" "}
              <span className="font-semibold text-purple-600">data sovereignty</span> across the organization.
            </p>
          </div>

          {/* Horizontal Flow with improved spacing */}
          <div className="relative mb-16">
            {/* Connection Lines */}
            <div className="hidden lg:block absolute top-1/2 left-0 right-0 h-1 bg-gradient-to-r from-purple-300 via-pink-300 to-indigo-300 -translate-y-1/2 z-0 rounded-full"></div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 relative z-10">
              {federationSetupSteps.map((step, index) => {
                const IconComponent = step.icon
                return (
                  <div key={step.id} className="relative group">
                    <div className="bg-white rounded-2xl shadow-lg border-2 border-gray-200 hover:border-purple-400 transition-all duration-300 hover:shadow-2xl hover:-translate-y-1 p-6 h-full">
                      {/* Step Number Badge */}
                      <div className="absolute -top-4 -left-4 bg-gradient-to-br from-purple-600 to-pink-600 text-white w-10 h-10 rounded-full flex items-center justify-center font-bold text-base shadow-lg group-hover:scale-110 transition-transform">
                        {index + 1}
                      </div>

                      {/* Icon */}
                      <div
                        className={`${step.color} p-4 rounded-xl shadow-md mb-5 inline-flex group-hover:scale-105 transition-transform`}
                      >
                        <IconComponent className="w-7 h-7 text-white" />
                      </div>

                      {/* Content */}
                      <h3 className="text-lg font-bold text-gray-900 mb-3 leading-tight">{step.title}</h3>
                      <p className="text-sm text-gray-600 leading-relaxed mb-4">{step.description}</p>

                      {/* Details */}
                      <div className="bg-gradient-to-br from-gray-50 to-gray-100 rounded-lg p-4 border border-gray-200">
                        <p className="text-xs text-gray-600 leading-relaxed font-medium">{step.details}</p>
                      </div>

                      {/* Arrow for desktop */}
                      {index < federationSetupSteps.length - 1 && (
                        <div className="hidden lg:block absolute top-1/2 -right-10 -translate-y-1/2 z-20">
                          <ArrowRight className="w-8 h-8 text-purple-400 drop-shadow-md" />
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Key Concept Highlight - Improved */}
          <div className="bg-gradient-to-br from-purple-50 via-pink-50 to-purple-50 rounded-2xl p-8 border-2 border-purple-200 shadow-lg">
            <div className="flex items-start gap-5">
              <div className="bg-gradient-to-br from-purple-600 to-pink-600 p-4 rounded-xl flex-shrink-0 shadow-md">
                <Shield className="w-7 h-7 text-white" />
              </div>
              <div className="flex-1">
                <h3 className="text-2xl font-bold text-gray-900 mb-3">Dual-Level Federated Governance</h3>
                <p className="text-gray-700 leading-relaxed text-base">
                  The architecture implements <span className="font-semibold text-purple-600">global governance</span>{" "}
                  (compliance policies for the entire ecosystem) and{" "}
                  <span className="font-semibold text-pink-600">local governance</span> (data-specific contracts per
                  CPS). This ensures asset autonomy operates with security, traceability, and non-repudiation through
                  digitally signed{" "}
                  <code className="bg-purple-100 px-2 py-1 rounded text-sm font-mono">ContractOffers</code>.
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="flex justify-center mt-2 mb-2">
          <div className="flex flex-col items-center gap-3">
            <div className="w-1 h-12 bg-gradient-to-b from-purple-300 to-blue-300 rounded-full"></div>
            <div className="bg-gradient-to-br from-blue-600 to-indigo-600 p-3 rounded-full shadow-lg">
              <ArrowDown className="w-6 h-6 text-white" />
            </div>
            <div className="w-1 h-12 bg-gradient-to-b from-blue-300 to-indigo-300 rounded-full"></div>
          </div>
        </div>
      </section>

      <section className="max-w-7xl mx-auto px-6 py-6 relative">
        {/* Background decoration */}
        <div className="absolute inset-0 bg-gradient-to-b from-blue-50/30 to-transparent pointer-events-none rounded-3xl"></div>

        <div className="relative z-10">
          <div className="text-center mb-12">
            <div className="inline-flex items-center gap-2 bg-blue-100 px-4 py-2 rounded-full mb-4 shadow-sm">
              <Zap className="w-4 h-4 text-blue-600" />
              <span className="text-sm font-semibold text-blue-600">Phase 2: Asset Operations</span>
            </div>
            <h2 className="text-4xl md:text-5xl font-bold text-gray-900 mb-4">Operational Workflows</h2>
            <p className="text-lg text-gray-600 max-w-3xl mx-auto leading-relaxed">
              With the federation configured, explore the operational flows:{" "}
              <span className="font-semibold text-blue-600">CPS Onboarding</span> (Plug) and{" "}
              <span className="font-semibold text-indigo-600">Data Consumption</span> (Play)
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-8">
            {/* Onboarding Flow - Enhanced */}
            <div className="bg-white rounded-2xl shadow-xl border-2 border-gray-200 overflow-hidden hover:shadow-2xl transition-shadow">
              <div className="bg-gradient-to-r from-blue-600 to-blue-700 p-7 text-white">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-2xl font-bold">CPS Onboarding</h3>
                  <span className="bg-white/20 backdrop-blur-sm px-4 py-1.5 rounded-full text-sm font-semibold shadow-sm">
                    Asset &apos;Plug&apos;
                  </span>
                </div>
                <p className="text-blue-100 text-sm leading-relaxed">
                  Register and configure your CPS assets for discovery
                </p>
              </div>

              <div className="p-6">
                <ProcessFlow steps={onboardingSteps} expanded={expandedOnboarding} />

                {!expandedOnboarding && (
                  <div className="mt-6 text-center">
                    <button
                      onClick={() => setExpandedOnboarding(true)}
                      className="inline-flex items-center gap-2 text-blue-600 hover:text-blue-700 font-semibold transition-colors hover:gap-3"
                    >
                      <span>Show all {onboardingSteps.length} steps</span>
                      <ChevronDown className="w-5 h-5" />
                    </button>
                  </div>
                )}

                {expandedOnboarding && (
                  <div className="mt-6 text-center">
                    <button
                      onClick={() => setExpandedOnboarding(false)}
                      className="inline-flex items-center gap-2 text-blue-600 hover:text-blue-700 font-semibold transition-colors"
                    >
                      <span>Show less</span>
                      <ChevronUp className="w-5 h-5" />
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Consumption Flow - Enhanced */}
            <div className="bg-white rounded-2xl shadow-xl border-2 border-gray-200 overflow-hidden hover:shadow-2xl transition-shadow">
              <div className="bg-gradient-to-r from-indigo-600 to-indigo-700 p-7 text-white">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-2xl font-bold">Data Consumption</h3>
                  <span className="bg-white/20 backdrop-blur-sm px-4 py-1.5 rounded-full text-sm font-semibold shadow-sm">
                    Client &apos; Play &apos;
                  </span>
                </div>
                <p className="text-indigo-100 text-sm leading-relaxed">
                  Discover and consume data through auditable contracts
                </p>
              </div>

              <div className="p-6">
                <ProcessFlow steps={consumptionSteps} expanded={expandedConsumption} />

                {!expandedConsumption && (
                  <div className="mt-6 text-center">
                    <button
                      onClick={() => setExpandedConsumption(true)}
                      className="inline-flex items-center gap-2 text-indigo-600 hover:text-indigo-700 font-semibold transition-colors hover:gap-3"
                    >
                      <span>Show all {consumptionSteps.length} steps</span>
                      <ChevronDown className="w-5 h-5" />
                    </button>
                  </div>
                )}

                {expandedConsumption && (
                  <div className="mt-6 text-center">
                    <button
                      onClick={() => setExpandedConsumption(false)}
                      className="inline-flex items-center gap-2 text-indigo-600 hover:text-indigo-700 font-semibold transition-colors"
                    >
                      <span>Show less</span>
                      <ChevronUp className="w-5 h-5" />
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Secondary CTA */}
      <section className="max-w-7xl mx-auto px-6 py-16">
        <div className="bg-gradient-to-r from-gray-900 to-gray-800 rounded-2xl p-12 text-center text-white shadow-xl">
          <h2 className="text-3xl font-bold mb-4">Ready to Get Started?</h2>
          <p className="text-gray-300 mb-8 max-w-2xl mx-auto">
            Query the broker to explore available CPS assets and start building your resilient production architecture.
          </p>
          <Link
            href="/search"
            className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-8 py-4 rounded-lg font-semibold shadow-lg hover:shadow-xl hover:scale-105 transition-all"
          >
            <Search className="w-5 h-5" />
            Query the Broker
          </Link>
        </div>
      </section>
    </div>
  )
}
