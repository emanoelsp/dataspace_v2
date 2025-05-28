"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { collection, getDocs } from "firebase/firestore"
import { db } from "@/lib/firebase"
import { ChevronDown, ChevronUp, FileText, FileCheck2, FolderEditIcon } from "lucide-react"

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
  domain?: string
}

interface DataContract {
  id: string
  name: string
  date: string
  federationId: string
  signature?: string // Add signature if available in your compliance doc
}

function Dot({ color, title }: { color: string; title: string }) {
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
  const [contracts, setContracts] = useState<DataContract[]>([])
  const [expandedAssets, setExpandedAssets] = useState<string | null>(null)
  const [expandedContracts, setExpandedContracts] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchAll = async () => {
      try {
        setLoading(true)
        const [federationsSnap, assetsSnap, contractsSnap] = await Promise.all([
          getDocs(collection(db, "federations")),
          getDocs(collection(db, "assets")),
          getDocs(collection(db, "compliance")),
        ])
        setFederations(
          federationsSnap.docs.map((doc) => ({
            id: doc.id,
            name: doc.data().name,
            description: doc.data().description,
          }))
        )
        setAssets(
          assetsSnap.docs.map((doc) => ({
            id: doc.id,
            name: doc.data().name,
            assetType: doc.data().assetType,
            purpose: doc.data().purpose || "",
            federationId: doc.data().federationId,
            active: doc.data().active !== false,
            domain: doc.data().domain || "",
          }))
        )
        setContracts(
          contractsSnap.docs.map((doc) => ({
            id: doc.id,
            name: doc.data().name,
            date: doc.data().date,
            federationId: doc.data().federationId,
            signature: doc.data().signature || "", // If signature exists
          }))
        )
      } catch (error) {
        console.error("Error fetching federations, assets or contracts:", error)
      } finally {
        setLoading(false)
      }
    }
    fetchAll()
  }, [])

  const filteredFederations = federations.filter((f) =>
    f.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    f.description.toLowerCase().includes(searchTerm.toLowerCase())
  )

  function getAssetStatusCounts(federatedAssets: Asset[]) {
    const active = federatedAssets.filter(a => a.active !== false).length
    const offline = federatedAssets.filter(a => a.active === false).length
    return { active, offline }
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
          placeholder="Search federations, assets, contracts ..."
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
              const federationContracts = contracts.filter(c => c.federationId === federation.id)
              const { active, offline } = getAssetStatusCounts(federatedAssets)
              const noAssets = federatedAssets.length === 0

              return (
                <li key={federation.id} className="border rounded-lg shadow-sm bg-white">
                  <div className="flex flex-col gap-2 p-4">
                    <div className="flex justify-between items-center">
                      <div>
                        <h2 className="text-xl font-semibold">{federation.name}</h2>
                        <p className="text-gray-700 text-sm">{federation.description}</p>
                      </div>
                      <Link
                        href={`/federations/${federation.id}`}
                        className="flex items-center gap-1 text-blue-600 hover:underline text-sm"
                      >
                        View Federation  <FolderEditIcon />
                      </Link>
                    </div>

                    {/* Contracts row */}
                    <div className="flex items-center gap-3 mt-2">
                      {federationContracts.length > 0 ? (
                        <>
                          <Dot color="bg-blue-500" title="Data contracts available" />
                          <span className="text-blue-700 text-sm font-medium">{federationContracts.length} data contract{federationContracts.length > 1 ? "s" : ""}</span>
                        </>
                      ) : (
                        <>
                          <Dot color="bg-purple-500" title="No data contracts" />
                          <span className="text-purple-700 text-sm font-medium">No data contracts</span>
                        </>
                      )}
                      <button
                        className="flex items-center gap-1 text-blue-600 hover:underline text-xs"
                        onClick={() => setExpandedContracts(expandedContracts === federation.id ? null : federation.id)}
                      >
                        {expandedContracts === federation.id ? (
                          <>Hide contracts <ChevronUp size={16} /></>
                        ) : (
                          <>View contracts <ChevronDown size={16} /></>
                        )}
                      </button>
                    </div>
                    {expandedContracts === federation.id && federationContracts.length > 0 && (
                      <div className="bg-blue-50 border rounded p-2 mb-2">
                        <ul className="space-y-1">
                          {federationContracts.map(contract => (
                            <li key={contract.id} className="flex items-center justify-between">
                              <div>
                                <span className="font-medium">{contract.name}</span>
                                <span className="ml-2 text-xs text-gray-500">{contract.date}</span>
                                <span className="ml-3 text-xs text-gray-700">
                                  {federation.name}
                                </span>
                                {contract.signature && (
                                  <span className="ml-3 text-xs text-gray-500 italic">
                                    Signature: {contract.signature}
                                  </span>
                                )}
                              </div>
                              <Link
                                href={`/accordance/compliance/${contract.id}`}
                                className="inline-flex items-center gap-1 text-blue-600 hover:underline text-xs"
                              >
                                <FileCheck2 size={15} /> View contract
                              </Link>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* Assets row */}
                    <div className="flex items-center gap-3 mt-2">
                      {noAssets ? (
                        <>
                          <Dot color="bg-red-500" title="No assets" />
                          <span className="text-red-700 text-sm font-medium">No assets</span>
                        </>
                      ) : (
                        <>
                          <Dot color="bg-green-500" title="Active assets" />
                          <span className="text-green-700 text-sm font-medium">{active} active</span>
                          {offline > 0 && (
                            <>
                              <Dot color="bg-yellow-400" title="Offline assets" />
                              <span className="text-yellow-700 text-sm font-medium">{offline} offline</span>
                            </>
                          )}
                        </>
                      )}
                      <button
                        className="flex items-center gap-1 text-blue-600 hover:underline text-xs"
                        onClick={() => setExpandedAssets(expandedAssets === federation.id ? null : federation.id)}
                      >
                        {expandedAssets === federation.id ? (
                          <>Hide assets <ChevronUp size={16} /></>
                        ) : (
                          <>View assets <ChevronDown size={16} /></>
                        )}
                      </button>
                    </div>
                    {expandedAssets === federation.id && federatedAssets.length > 0 && (
                      <div className="bg-gray-50 border rounded p-2 mt-2">
                        <ul className="space-y-1">
                          {federatedAssets.map(asset => (
                            <li key={asset.id} className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <Dot
                                  color={asset.active === false ? "bg-yellow-400" : "bg-green-500"}
                                  title={asset.active === false ? "Offline" : "Active"}
                                />
                                <span className="font-medium">{asset.name}</span>
                                {asset.domain && (
                                  <span className="ml-2 text-xs text-gray-500">{asset.domain}</span>
                                )}
                              </div>
                              <Link
                                href={`/assets/${asset.id}`}
                                className="inline-flex items-center gap-1 text-blue-600 hover:underline text-xs"
                              >
                                <FileText size={15} /> View asset
                              </Link>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </>
  )
}