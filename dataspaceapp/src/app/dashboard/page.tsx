"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { collection, getDocs } from "firebase/firestore"
import {
  Users,
  Package,
  FileText,
  Key,
  Clock,
  BarChart3,
  ShieldCheck,
  Globe,
  Activity,
  TrendingUp,
} from "lucide-react"
import { db } from "@/lib/firebase"
import { useUserProfile } from "@/lib/use-user-profile"

type DashboardMetrics = {
  federations: number
  assets: number
  compliance: number
  governance: number
  accessRequests: number
  accessLogs: number
  dataOwners: number
  dataClients: number
  topFederation: string
  federationBreakdown: { name: string; assets: number }[]
}

export default function DashboardPage() {
  const { user, loading: authLoading } = useUserProfile()
  const [metrics, setMetrics] = useState<DashboardMetrics>({
    federations: 0,
    assets: 0,
    compliance: 0,
    governance: 0,
    accessRequests: 0,
    accessLogs: 0,
    dataOwners: 0,
    dataClients: 0,
    topFederation: "No federation registered",
    federationBreakdown: [],
  })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user) {
      return
    }

    const fetchMetrics = async () => {
      try {
        setLoading(true)

        const [
          federationsSnapshot,
          assetsSnapshot,
          complianceSnapshot,
          governanceSnapshot,
          accessRequestsSnapshot,
          accessLogsSnapshot,
          usersSnapshot,
        ] = await Promise.all([
          getDocs(collection(db, "federations")),
          getDocs(collection(db, "assets")),
          getDocs(collection(db, "compliance")),
          getDocs(collection(db, "governance")),
          getDocs(collection(db, "accessRequests")),
          getDocs(collection(db, "accessLogs")),
          getDocs(collection(db, "users")),
        ])

        const federationNames = new Map<string, string>()
        federationsSnapshot.docs.forEach((docSnapshot) => {
          federationNames.set(docSnapshot.id, docSnapshot.data().name ?? docSnapshot.id)
        })

        const federationCounts = new Map<string, number>()
        assetsSnapshot.docs.forEach((docSnapshot) => {
          const federationId = docSnapshot.data().federationId
          if (!federationId) {
            return
          }

          federationCounts.set(federationId, (federationCounts.get(federationId) ?? 0) + 1)
        })

        const federationBreakdown = Array.from(federationCounts.entries())
          .map(([federationId, assets]) => ({
            name: federationNames.get(federationId) ?? federationId,
            assets,
          }))
          .sort((a, b) => b.assets - a.assets)

        const users = usersSnapshot.docs.map((docSnapshot) => docSnapshot.data().userType)

        setMetrics({
          federations: federationsSnapshot.size,
          assets: assetsSnapshot.size,
          compliance: complianceSnapshot.size,
          governance: governanceSnapshot.size,
          accessRequests: accessRequestsSnapshot.size,
          accessLogs: accessLogsSnapshot.size,
          dataOwners: users.filter((userType) => userType === "datasource").length,
          dataClients: users.filter((userType) => userType === "dataclient").length,
          topFederation: federationBreakdown[0]
            ? `${federationBreakdown[0].name} (${federationBreakdown[0].assets} assets)`
            : "No federation registered",
          federationBreakdown,
        })
      } finally {
        setLoading(false)
      }
    }

    fetchMetrics()
  }, [user])

  const stats = [
    {
      label: "Federations",
      value: metrics.federations,
      icon: <Users className="w-8 h-8 text-blue-600" />,
    },
    {
      label: "Assets",
      value: metrics.assets,
      icon: <Package className="w-8 h-8 text-indigo-600" />,
    },
    {
      label: "Compliance Records",
      value: metrics.compliance,
      icon: <FileText className="w-8 h-8 text-green-600" />,
    },
    {
      label: "Access Requests",
      value: metrics.accessRequests,
      icon: <Key className="w-8 h-8 text-yellow-600" />,
    },
    {
      label: "Access Logs",
      value: metrics.accessLogs,
      icon: <Activity className="w-8 h-8 text-pink-600" />,
    },
    {
      label: "Governance Policies",
      value: metrics.governance,
      icon: <Clock className="w-8 h-8 text-gray-600" />,
    },
    {
      label: "Active Data Owners",
      value: metrics.dataOwners,
      icon: <ShieldCheck className="w-8 h-8 text-blue-800" />,
    },
    {
      label: "Active Data Clients",
      value: metrics.dataClients,
      icon: <Globe className="w-8 h-8 text-cyan-700" />,
    },
    {
      label: "Federations with Most Assets",
      value: metrics.topFederation,
      icon: <TrendingUp className="w-8 h-8 text-orange-600" />,
    },
  ]

  if (authLoading) {
    return (
      <div className="min-h-[40vh] flex items-center justify-center text-gray-600 max-w-7xl mx-auto px-6">
        Checking session…
      </div>
    )
  }

  if (!user) {
    return (
      <div className="max-w-lg mx-auto py-16 px-4 text-center">
        <h1 className="text-2xl font-bold text-blue-800 mb-2">Dashboard</h1>
        <p className="text-gray-700 mb-4">Sign in to view the dataspace overview and metrics.</p>
        <p className="text-sm text-gray-500 mb-6">Use Login or Signup in the header.</p>
        <Link href="/" className="text-blue-600 font-medium hover:underline">
          Back to home
        </Link>
      </div>
    )
  }

  return (
    <div className="max-w-7xl mx-auto px-6 py-10">
      <h1 className="text-3xl font-bold mb-2 text-blue-800">Dashboard</h1>
      <p className="text-gray-600 mb-8">
        Dataspace overview for Data Owners and Data Clients
        {loading ? " • syncing data..." : " • live metrics from Firestore"}
      </p>

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 mb-10">
        {stats.map((stat, idx) => (
          <div
            key={idx}
            className="flex items-center bg-white rounded-lg shadow p-5 border border-blue-50 hover:shadow-md transition"
          >
            <div className="mr-4">{stat.icon}</div>
            <div>
              <div className="text-2xl font-bold text-blue-900">{stat.value}</div>
              <div className="text-sm text-gray-500">{stat.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Assets per Federation */}
      <div className="bg-white rounded-lg shadow p-6 border border-blue-50 mb-10">
        <h2 className="text-xl font-semibold text-blue-700 mb-4">Assets per Federation</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {metrics.federationBreakdown.length === 0 ? (
            <div className="px-4 py-2 text-sm text-gray-500">No federated assets registered yet.</div>
          ) : (
            metrics.federationBreakdown.map((f) => (
              <div key={f.name} className="flex justify-between items-center px-4 py-2 border-b last:border-b-0">
                <span className="font-medium text-gray-700">{f.name}</span>
                <span className="text-blue-700 font-bold">{f.assets} assets</span>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Usage Chart Placeholder */}
      <div className="bg-white rounded-lg shadow p-6 border border-blue-50">
        <h2 className="text-xl font-semibold text-blue-700 mb-4 flex items-center">
          <BarChart3 className="w-6 h-6 mr-2 text-blue-600" />
          Operational Reading
        </h2>
        <div className="grid gap-3 text-sm text-gray-600">
          <p>
            Compliance and governance records establish the control plane that supports discovery, access negotiation,
            and auditable data exchange.
          </p>
          <p>
            Access request and access log counts indicate how much of the consumption flow is already instrumented in
            this prototype.
          </p>
          <p>
            The next high-value step is exposing owner-side review of pending access requests and contract outcomes.
          </p>
        </div>
      </div>
    </div>
  )
}
