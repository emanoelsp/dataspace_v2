"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { Search } from "lucide-react"
import { DiscoveryPageShell } from "@/components/discovery-page-shell"
import { fetchAllFederations, textIncludes, type FederationRecord } from "@/lib/discovery-search"

export default function SearchFederationPage() {
  const [rows, setRows] = useState<FederationRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState("")
  const [catalogVisibility, setCatalogVisibility] = useState("")
  const [admissionMode, setAdmissionMode] = useState("")
  const [mainDomain, setMainDomain] = useState("")
  const [dataDomainFragment, setDataDomainFragment] = useState("")

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const data = await fetchAllFederations()
        if (!cancelled) setRows(data)
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const filtered = useMemo(() => {
    return rows.filter((f) => {
      const blob = [f.name, f.description, f.organization, f.mainDomain, f.dataDomains, f.contactEmail]
        .filter(Boolean)
        .join(" ")
      if (!textIncludes(blob, q)) return false
      if (catalogVisibility && (f.catalogVisibility ?? "") !== catalogVisibility) return false
      if (admissionMode && (f.admissionMode ?? "") !== admissionMode) return false
      if (mainDomain.trim() && !textIncludes(f.mainDomain ?? "", mainDomain)) return false
      if (dataDomainFragment.trim() && !textIncludes(f.dataDomains ?? "", dataDomainFragment)) return false
      return true
    })
  }, [rows, q, catalogVisibility, admissionMode, mainDomain, dataDomainFragment])

  return (
    <DiscoveryPageShell
      title="Discovery by federation"
      subtitle="Search federations by organizational and structural metadata: catalog visibility, admission mode, main domain of expertise, and data domains (intra-organizational catalog view aligned with the INTRA access model)."
    >
      <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm space-y-4 mb-8">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">Text (name, description, organization, domains)</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                className="w-full border border-gray-300 rounded-md pl-10 pr-3 py-2 text-sm"
                placeholder="e.g. manufacturing, consortium, quality…"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Catalog visibility</label>
            <select
              value={catalogVisibility}
              onChange={(e) => setCatalogVisibility(e.target.value)}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
            >
              <option value="">Any</option>
              <option value="public">Public catalog</option>
              <option value="members">Members only</option>
              <option value="hidden">Hidden</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Admission mode</label>
            <select
              value={admissionMode}
              onChange={(e) => setAdmissionMode(e.target.value)}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
            >
              <option value="">Any</option>
              <option value="self-service">Self-service</option>
              <option value="approval">Approval required</option>
              <option value="invite-only">Invite only</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Main domain</label>
            <input
              value={mainDomain}
              onChange={(e) => setMainDomain(e.target.value)}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
              placeholder="e.g. machining, assembly line"
            />
          </div>
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">Data domains (comma list contains)</label>
            <input
              value={dataDomainFragment}
              onChange={(e) => setDataDomainFragment(e.target.value)}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
              placeholder="Fragment to match inside CSV domains (e.g. IoT, MES)"
            />
          </div>
        </div>
      </div>

      {loading ? (
        <p className="text-gray-500 text-sm">Loading federations…</p>
      ) : (
        <ul className="space-y-3">
          {filtered.length === 0 ? (
            <li className="text-gray-500 text-sm">No federations match these filters.</li>
          ) : (
            filtered.map((f) => (
              <li
                key={f.id}
                className="rounded-lg border border-gray-100 bg-white p-4 shadow-sm hover:border-blue-200 transition-colors"
              >
                <div className="flex flex-wrap gap-2 justify-between items-start">
                  <div>
                    <h2 className="font-semibold text-gray-900">{f.name}</h2>
                    <p className="text-sm text-gray-600 mt-1 line-clamp-2">{f.description}</p>
                    <p className="text-xs text-gray-500 mt-2">
                      <span className="font-medium">Organization:</span> {f.organization}
                      {f.catalogVisibility ? (
                        <>
                          {" "}
                          · <span className="font-medium">Visibility:</span> {f.catalogVisibility}
                        </>
                      ) : null}
                    </p>
                    {f.admissionMode ? (
                      <p className="text-xs text-gray-500 mt-1">
                        <span className="font-medium">Admission:</span> {f.admissionMode}
                        {f.federationType ? (
                          <>
                            {" "}
                            · <span className="font-medium">Legacy type:</span> {f.federationType}
                          </>
                        ) : null}
                      </p>
                    ) : null}
                    {f.mainDomain ? (
                      <p className="text-xs text-gray-500 mt-1">
                        <span className="font-medium">Main domain:</span> {f.mainDomain}
                      </p>
                    ) : null}
                    {f.dataDomains ? (
                      <p className="text-xs text-gray-500 mt-1">
                        <span className="font-medium">Data domains:</span> {f.dataDomains}
                      </p>
                    ) : null}
                  </div>
                  <Link
                    href={`/federations/${f.id}`}
                    className="text-sm font-medium text-blue-600 hover:text-blue-800 whitespace-nowrap"
                  >
                    Open federation →
                  </Link>
                </div>
              </li>
            ))
          )}
        </ul>
      )}
    </DiscoveryPageShell>
  )
}
