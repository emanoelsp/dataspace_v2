"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { collection, getDocs } from "firebase/firestore"
import { db } from "@/lib/firebase"
import { ChevronDown, ChevronUp, FileText } from "lucide-react"

interface Federation {
  id: string
  name: string
  description: string
}

interface Asset {
  id: string
  name: string
  assetType: string
  purpose: string
  federationId: string
  active?: boolean
}

function StatusDot({ color, title }: { color: string; title: string }) {
  return (
    <span
      title={title}
      className={`inline-block w-3 h-3 rounded-full mr-1 align-middle ${color}`}
      aria-label={title}
    />
  )
}

export default function FederationsBrowsePage() {
  const [searchTerm, setSearchTerm] = useState("")
  const [federations, setFederations] = useState<Federation[]>([])
  const [assets, setAssets] = useState<Asset[]>([])
  const [expanded, setExpanded] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchFederationsAndAssets = async () => {
      try {
        setLoading(true)
        const federationsSnap = await getDocs(collection(db, "federations"))
        const federationsData = federationsSnap.docs.map((doc) => ({
          id: doc.id,
          name: doc.data().name,
          description: doc.data().description,
        }))
        setFederations(federationsData)

        const assetsSnap = await getDocs(collection(db, "assets"))
        const assetsData = assetsSnap.docs.map((doc) => ({
          id: doc.id,
          name: doc.data().name,
          assetType: doc.data().assetType,
          purpose: doc.data().purpose || "",
          federationId: doc.data().federationId,
          active: doc.data().active !== false, // if not present, assume true
        }))
        setAssets(assetsData)
      } catch (error) {
        console.error("Error fetching federations or assets:", error)
      } finally {
        setLoading(false)
      }
    }
    fetchFederationsAndAssets()
  }, [])

  const filteredFederations = federations.filter((f) =>
    f.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    f.description.toLowerCase().includes(searchTerm.toLowerCase())
  )

  function getFederationStatus(federatedAssets: Asset[]) {
    const activeCount = federatedAssets.filter(a => a.active !== false).length
    const offlineCount = federatedAssets.filter(a => a.active === false).length

    if (federatedAssets.length === 0) {
      return (
        <div className="flex items-center gap-2 text-xs text-gray-500 mt-1">
          <StatusDot color="bg-red-500" title="No assets" />
          No assets
        </div>
      )
    }

    return (
      <div className="flex flex-col gap-0.5 text-xs text-gray-500 mt-1">
        {activeCount > 0 && (
          <div className="flex items-center gap-1">
            <StatusDot color="bg-green-500" title="Online" />
            {activeCount} online
          </div>
        )}
        {offlineCount > 0 && (
          <div className="flex items-center gap-1">
            <StatusDot color="bg-yellow-400" title="Offline" />
            {offlineCount} offline
          </div>
        )}
      </div>
    )
  }

  if (loading) return <p className="p-8 text-gray-600">Loading federations...</p>

  return (
    <>
      <div className="flex justify-between items-center mb-6 mt-4 container mx-auto">
        <Link href="/assets" className="text-blue-600 hover:underline mb-4 inline-block">
          ← Back to Assets
        </Link>
        <Link href="/assets/create">
          <button className="bg-blue-600 text-white px-5 py-2 rounded-md hover:bg-blue-700">+ Create Asset</button>
        </Link>
      </div>

      <div className="max-w-4xl mx-auto p-8 bg-white rounded-xl shadow-lg border border-gray-200 mt-4">
        <h1 className="text-3xl font-bold text-gray-800 mb-6 text-center">Federations and Assets</h1>

        <input
          type="text"
          placeholder="Search federations, assets, data ..."
          className="w-full p-3 mb-6 border border-gray-300 rounded-md focus:ring-blue-600 focus:border-blue-600"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />

        {filteredFederations.length === 0 ? (
          <p className="text-gray-600 italic">No federations found.</p>
        ) : (
          <ul className="space-y-4">
            {filteredFederations.map((federation) => {
              const federatedAssets = assets.filter(a => a.federationId === federation.id)
              return (
                <li key={federation.id} className="border rounded-lg shadow-sm bg-white">
                  <div className="flex justify-between items-center p-4">
                    <div>
                      <h2 className="text-xl font-semibold">{federation.name}</h2>
                      <p className="text-gray-700 text-sm">{federation.description}</p>
                      {getFederationStatus(federatedAssets)}
                    </div>
                    <button
                      className="flex items-center gap-1 text-blue-600 hover:underline text-sm"
                      onClick={() => setExpanded(expanded === federation.id ? null : federation.id)}
                    >
                      {expanded === federation.id ? (
                        <>
                          Hide details <ChevronUp size={18} />
                        </>
                      ) : (
                        <>
                          View details <ChevronDown size={18} />
                        </>
                      )}
                    </button>
                  </div>
                  {expanded === federation.id && (
                    <div className="border-t px-4 py-3 bg-gray-50">
                      {federatedAssets.length === 0 ? (
                        <p className="text-gray-500 italic">No federated assets.</p>
                      ) : (
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="text-left border-b">
                              <th className="py-2">Name</th>
                              <th className="py-2">Type</th>
                              <th className="py-2">Purpose</th>
                              <th className="py-2"></th>
                            </tr>
                          </thead>
                          <tbody>
                            {federatedAssets.map(asset => (
                              <tr key={asset.id} className="border-b last:border-b-0">
                                <td className="py-2 flex items-center gap-2">
                                  <StatusDot color={asset.active === false ? "bg-yellow-400" : "bg-green-500"} title={asset.active === false ? "Offline" : "Online"} />
                                  {asset.name}
                                </td>
                                <td className="py-2">{asset.assetType}</td>
                                <td className="py-2">{asset.purpose}</td>
                                <td className="py-2">
                                  <Link
                                    href={`/assets/${asset.id}`}
                                    className="inline-flex items-center gap-1 text-blue-600 hover:underline"
                                  >
                                    <FileText size={16} /> Access
                                  </Link>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </>
  )
}