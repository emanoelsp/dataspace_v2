"use client"

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

export default function DashboardPage() {
  // Simulação de dados (substitua por fetch real se necessário)
  const stats = [
    {
      label: "Federations",
      value: 8,
      icon: <Users className="w-8 h-8 text-blue-600" />,
    },
    {
      label: "Assets",
      value: 124,
      icon: <Package className="w-8 h-8 text-indigo-600" />,
    },
    {
      label: "Contracts",
      value: 37,
      icon: <FileText className="w-8 h-8 text-green-600" />,
    },
    {
      label: "Access Requests",
      value: 59,
      icon: <Key className="w-8 h-8 text-yellow-600" />,
    },
    {
      label: "Total Accesses",
      value: 412,
      icon: <Activity className="w-8 h-8 text-pink-600" />,
    },
    {
      label: "Usage Time (h)",
      value: 287,
      icon: <Clock className="w-8 h-8 text-gray-600" />,
    },
    {
      label: "Active Data Owners",
      value: 5,
      icon: <ShieldCheck className="w-8 h-8 text-blue-800" />,
    },
    {
      label: "Active Data Clients",
      value: 12,
      icon: <Globe className="w-8 h-8 text-cyan-700" />,
    },
    {
      label: "Federations with Most Assets",
      value: "Federation A (34 assets)",
      icon: <TrendingUp className="w-8 h-8 text-orange-600" />,
    },
  ]

  const federationsAssets = [
    { name: "Federation A", assets: 34 },
    { name: "Federation B", assets: 22 },
    { name: "Federation C", assets: 18 },
    { name: "Federation D", assets: 12 },
  ]

  return (
    <div className="max-w-7xl mx-auto px-6 py-10">
      <h1 className="text-3xl font-bold mb-2 text-blue-800">Dashboard</h1>
      <p className="text-gray-600 mb-8">Dataspace overview for Data Owners and Data Clients</p>

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
          {federationsAssets.map((f) => (
            <div key={f.name} className="flex justify-between items-center px-4 py-2 border-b last:border-b-0">
              <span className="font-medium text-gray-700">{f.name}</span>
              <span className="text-blue-700 font-bold">{f.assets} assets</span>
            </div>
          ))}
        </div>
      </div>

      {/* Usage Chart Placeholder */}
      <div className="bg-white rounded-lg shadow p-6 border border-blue-50">
        <h2 className="text-xl font-semibold text-blue-700 mb-4 flex items-center">
          <BarChart3 className="w-6 h-6 mr-2 text-blue-600" />
          Usage Overview (Last 30 Days)
        </h2>
        <div className="h-40 flex items-center justify-center text-gray-400">
          {/* Aqui você pode integrar um gráfico real, como Chart.js ou Recharts */}
          <span>[Usage chart placeholder]</span>
        </div>
      </div>
    </div>
  )
}