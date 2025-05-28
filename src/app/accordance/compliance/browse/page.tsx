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

interface Compliance {
  id: string
  federationId: string
  federationName: string
  legalBasis: string[] | string
  signature: string
  createdAt?: { toDate?: () => Date }
}

function StatusDot({ status }: { status: "ok" | "warn" | "none" }) {
  let color = "bg-green-500"
  let title = "Compliances found"
  if (status === "warn") {
    color = "bg-yellow-400"
    title = "Some missing info"
  } else if (status === "none") {
    color = "bg-red-500"
    title = "No compliance"
  }
  return (
    <span
      title={title}
      className={`inline-block w-3 h-3 rounded-full mr-1 align-middle ${color}`}
      aria-label={title}
    />
  )
}

export default function ComplianceBrowsePage() {
  const [searchTerm, setSearchTerm] = useState("")
  const [federations, setFederations] = useState<Federation[]>([])
  const [compliances, setCompliances] = useState<Compliance[]>([])
  const [expanded, setExpanded] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState("all")

  useEffect(() => {
    const fetchFederationsAndCompliances = async () => {
      try {
        setLoading(true)
        const federationsSnap = await getDocs(collection(db, "federations"))
        const federationsData = federationsSnap.docs.map((doc) => ({
          id: doc.id,
          name: doc.data().name,
          description: doc.data().description,
        }))
        setFederations(federationsData)

        const compliancesSnap = await getDocs(collection(db, "compliance"))
        const compliancesData = compliancesSnap.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        })) as Compliance[]
        setCompliances(compliancesData)
      } catch {
        // erro silencioso
      } finally {
        setLoading(false)
      }
    }
    fetchFederationsAndCompliances()
  }, [])

  // Filtro federations por busca
  const filteredFederations = federations.filter((f) =>
    f.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    f.description.toLowerCase().includes(searchTerm.toLowerCase())
  )

  // Filtro compliance por filtro rápido
  function filterCompliancesByFederation(federationId: string) {
    let filtered = compliances.filter(c => c.federationId === federationId)
    if (filter === "lgpd") {
      filtered = filtered.filter(c =>
        Array.isArray(c.legalBasis)
          ? c.legalBasis.some((b) => b.toLowerCase().includes("lgpd"))
          : (c.legalBasis || "").toLowerCase().includes("lgpd")
      )
    }
    if (filter === "gdpr") {
      filtered = filtered.filter(c =>
        Array.isArray(c.legalBasis)
          ? c.legalBasis.some((b) => b.toLowerCase().includes("gdpr"))
          : (c.legalBasis || "").toLowerCase().includes("gdpr")
      )
    }
    return filtered
  }

  // Status: se tem compliance, verde, se não tem, vermelho
  function getFederationStatus(
    compliances: Compliance[]
  ): { status: "ok" | "warn" | "none"; label: string } {
    if (compliances.length === 0) return { status: "none", label: "No compliance" }
    // Se algum compliance não tem legalBasis, warn
    const hasWarn = compliances.some(c => !c.legalBasis || (Array.isArray(c.legalBasis) && c.legalBasis.length === 0))
    if (hasWarn) return { status: "warn", label: "Some missing info" }
    return { status: "ok", label: `${compliances.length} compliance${compliances.length !== 1 ? "s" : ""}` }
  }

  if (loading) return <p className="p-8 text-gray-600">Loading compliances...</p>

  return (
    <>
      <div className="flex justify-between items-center mb-6 mt-4 container mx-auto">
        <Link href="/accordance/compliance" className="text-blue-600 hover:underline mb-4 inline-block">
          ← Back to Compliance
        </Link>
        <Link href="/accordance/compliance/create">
          <button className="bg-blue-600 text-white px-5 py-2 rounded-md hover:bg-blue-700">+ Create Compliance </button>
        </Link>
      </div>

      <div className="max-w-4xl mx-auto p-8 bg-white rounded-xl shadow-lg border border-gray-200 mt-4">
        <h1 className="text-3xl font-bold text-gray-800 mb-6 text-center">Federations and Compliance</h1>

         <div className="flex gap-2 mb-4">
          <input
            type="text"
            placeholder="Search federations, compliance, legal basis..."
            className="w-full p-2 border border-gray-300 rounded-md focus:ring-blue-600 focus:border-blue-600"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          /> 
          <p> Vigor Law: </p> 
          <select
            value={filter}
            onChange={e => setFilter(e.target.value)}
            className="border border-gray-300 rounded px-2 py-2 text-sm"
          >
            <option value="all">All</option>
            <option value="lgpd">LGPD</option>
            <option value="gdpr">GDPR</option>
          </select>
        </div>

        {filteredFederations.length === 0 ? (
          <p className="text-gray-600 italic">No federations found.</p>
        ) : (
          <ul className="space-y-4">
            {filteredFederations.map((federation) => {
              const federationCompliances = filterCompliancesByFederation(federation.id)
              const { status, label } = getFederationStatus(federationCompliances)
              return (
                <li key={federation.id} className="border rounded-lg shadow-sm bg-white">
                  <div className="flex justify-between items-center p-4">
                    <div>
                      <h2 className="text-xl font-semibold">{federation.name}</h2>
                      <p className="text-gray-700 text-sm">{federation.description}</p>
                      <p className="text-gray-500 text-xs mt-1 flex items-center gap-1">
                        <StatusDot status={status} />
                        {label}
                      </p>
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
                      {federationCompliances.length === 0 ? (
                        <p className="text-gray-500 italic">No compliance records for this federation.</p>
                      ) : (
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="text-left border-b">
                              <th className="py-2">Legal Basis</th>
                              <th className="py-2">Signature</th>
                              <th className="py-2">Created</th>
                              <th className="py-2"></th>
                            </tr>
                          </thead>
                          <tbody>
                            {federationCompliances.map(c => (
                              <tr key={c.id} className="border-b last:border-b-0">
                                <td className="py-2">
                                  {Array.isArray(c.legalBasis)
                                    ? c.legalBasis.join(", ")
                                    : c.legalBasis}
                                </td>
                                <td className="py-2">{c.signature}</td>
                                <td className="py-2 text-xs text-gray-500">
                                  {c.createdAt?.toDate
                                    ? new Date(c.createdAt.toDate()).toLocaleString()
                                    : ""}
                                </td>
                                <td className="py-2">
                                  <Link
                                    href={`/accordance/compliance/${c.id}`}
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