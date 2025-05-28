'use client'
import { useState, useEffect, useCallback } from 'react'
import { Search, Filter, ExternalLink, ChevronDown, ChevronUp, Layers, Database, Building, Globe } from 'lucide-react'
import Link from 'next/link'
import { collection, getDocs, query, where, or, and } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { useRouter } from 'next/navigation'

// Removido: interface Asset (não utilizada)

interface Federation {
  id: string
  name: string
  description: string
  organization: string
  contactEmail: string
  website: string
  dataLaw: string
  termsAccepted: boolean
  ownershipAccepted: boolean
  traceabilityAccepted: boolean
  createdAt: Date
}

interface DiscoveryResult {
  id: string
  name: string
  type: 'asset' | 'federation'
  description?: string
  semanticId?: string
  apiEndpoint?: string
  federationId?: string
  federationName?: string
  organization?: string
  contactEmail?: string
  website?: string
  dataLaw?: string
  status?: string
  createdAt: Date
}

export default function DiscoveryPage() {
  const router = useRouter()
  const [searchTerm, setSearchTerm] = useState('')
  const [results, setResults] = useState<DiscoveryResult[]>([])
  const [loading, setLoading] = useState(false)
  const [showFilters, setShowFilters] = useState(false)
  const [filters, setFilters] = useState({
    type: 'all',
    dataLaw: '',
    status: '',
    hasApi: false,
    termsAccepted: false,
    traceabilityAccepted: false
  })

  // Corrigido: useCallback para search, para não gerar warning de dependência
  const search = useCallback(async () => {
    setLoading(true)
    try {
      let assetsQuery = query(collection(db, 'assets'))
      let federationsQuery = query(collection(db, 'federations'))

      // Apply search term filters
      if (searchTerm) {
        assetsQuery = query(
          assetsQuery,
          or(
            where('name', '>=', searchTerm),
            where('name', '<=', searchTerm + '\uf8ff'),
            where('semanticId', '>=', searchTerm),
            where('semanticId', '<=', searchTerm + '\uf8ff')
          )
        )

        federationsQuery = query(
          federationsQuery,
          or(
            where('name', '>=', searchTerm),
            where('name', '<=', searchTerm + '\uf8ff'),
            where('organization', '>=', searchTerm),
            where('organization', '<=', searchTerm + '\uf8ff')
          )
        )
      }

      // Apply advanced filters
      const assetConditions = []
      const federationConditions = []
      
      if (filters.type === 'asset' || filters.type === 'all') {
        if (filters.status) {
          assetConditions.push(where('status', '==', filters.status))
        }
        if (filters.hasApi) {
          assetConditions.push(where('apiEndpoint', '!=', ''))
        }
      }

      if (filters.type === 'federation' || filters.type === 'all') {
        if (filters.dataLaw) {
          federationConditions.push(where('dataLaw', '==', filters.dataLaw))
        }
        if (filters.termsAccepted) {
          federationConditions.push(where('termsAccepted', '==', true))
        }
        if (filters.traceabilityAccepted) {
          federationConditions.push(where('traceabilityAccepted', '==', true))
        }
      }

      if (assetConditions.length > 0) {
        assetsQuery = query(assetsQuery, and(...assetConditions))
      }
      if (federationConditions.length > 0) {
        federationsQuery = query(federationsQuery, and(...federationConditions))
      }

      const [assetsSnapshot, federationsSnapshot] = await Promise.all([
        getDocs(assetsQuery),
        getDocs(federationsQuery)
      ])

      // Get federation names for assets
      const federationsData = federationsSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        createdAt: doc.data().createdAt?.toDate()
      })) as Federation[]

      const assetsData = assetsSnapshot.docs.map(doc => {
        const assetData = doc.data()
        const federation = federationsData.find(f => f.id === assetData.federationId)
        return {
          id: doc.id,
          name: assetData.name,
          description: assetData.description,
          semanticId: assetData.semanticId,
          apiEndpoint: assetData.apiEndpoint,
          federationId: assetData.federationId,
          status: assetData.status,
          createdAt: assetData.createdAt?.toDate(),
          type: 'asset' as const,
          federationName: federation?.name,
        } as DiscoveryResult
      })

      const completeFederationsData = federationsData.map(doc => ({
        type: 'federation' as const,
        ...doc,
        createdAt: doc.createdAt
      }))

      // Combine and sort by creation date (newest first)
      const combinedResults = [...assetsData, ...completeFederationsData].sort(
        (a, b) => b.createdAt.getTime() - a.createdAt.getTime()
      )

      setResults(combinedResults)
    } catch (error) {
      console.error('Search failed:', error)
    } finally {
      setLoading(false)
    }
  }, [searchTerm, filters])

  useEffect(() => {
    search()
  }, [filters, search])

  const handleViewDetails = (item: DiscoveryResult) => {
    if (item.type === 'asset') {
      router.push(`/assets/${item.id}?apiEndpoint=${encodeURIComponent(item.apiEndpoint || '')}`)
    } else {
      router.push(`/federations/${item.id}/assets`)
    }
  }

  const dataLaws = ['LGPD', 'GDPR', 'CCPA', 'Other']
  const statusOptions = ['active', 'inactive', 'pending']

  return (
    <div className="max-w-6xl mx-auto p-8 bg-white rounded-xl shadow-lg border border-gray-200 mt-4">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold text-gray-800 flex items-center gap-2">
          <Layers className="text-blue-600" size={28} />
          Data Space Discovery
        </h1>
        <Link href="/assets/create">
          <button className="bg-blue-600 text-white px-5 py-2 rounded-md hover:bg-blue-700">
            Register Asset
          </button>
        </Link>
      </div>

      <div className="mb-8">
        <div className="relative flex items-center mb-4">
          <Search className="absolute left-3 text-gray-400" size={20} />
          <input
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search assets or federations by name, semantic ID or organization..."
            className="border border-gray-300 p-3 pl-10 w-full rounded-md shadow-sm focus:ring-blue-600 focus:border-blue-600"
            onKeyPress={(e) => e.key === 'Enter' && search()}
          />
          <button
            onClick={search}
            disabled={loading}
            className="ml-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold px-6 py-3 rounded-md shadow-sm transition-colors disabled:opacity-50 flex items-center"
          >
            {loading ? 'Searching...' : 'Search'}
          </button>
        </div>

        <div className="border rounded-md overflow-hidden">
          <button
            onClick={() => setShowFilters(!showFilters)}
            className="w-full flex justify-between items-center p-3 bg-gray-50 hover:bg-gray-100"
          >
            <div className="flex items-center">
              <Filter size={18} className="mr-2 text-gray-600" />
              <span className="font-medium">Advanced Filters</span>
            </div>
            {showFilters ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
          </button>

          {showFilters && (
            <div className="p-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
                <select
                  value={filters.type}
                  onChange={(e) => setFilters({...filters, type: e.target.value})}
                  className="border border-gray-300 p-2 w-full rounded-md shadow-sm focus:ring-blue-600 focus:border-blue-600"
                >
                  <option value="all">All Types</option>
                  <option value="asset">Assets</option>
                  <option value="federation">Federations</option>
                </select>
              </div>

              {filters.type !== 'federation' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Asset Status</label>
                  <select
                    value={filters.status}
                    onChange={(e) => setFilters({...filters, status: e.target.value})}
                    className="border border-gray-300 p-2 w-full rounded-md shadow-sm focus:ring-blue-600 focus:border-blue-600"
                  >
                    <option value="">Any Status</option>
                    {statusOptions.map((status) => (
                      <option key={status} value={status}>{status}</option>
                    ))}
                  </select>
                </div>
              )}

              {filters.type !== 'asset' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Data Law</label>
                  <select
                    value={filters.dataLaw}
                    onChange={(e) => setFilters({...filters, dataLaw: e.target.value})}
                    className="border border-gray-300 p-2 w-full rounded-md shadow-sm focus:ring-blue-600 focus:border-blue-600"
                  >
                    <option value="">Any Data Law</option>
                    {dataLaws.map((law) => (
                      <option key={law} value={law}>{law}</option>
                    ))}
                  </select>
                </div>
              )}

              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="hasApi"
                  checked={filters.hasApi}
                  onChange={(e) => setFilters({...filters, hasApi: e.target.checked})}
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                />
                <label htmlFor="hasApi" className="ml-2 block text-sm text-gray-700">
                  Has API Endpoint
                </label>
              </div>

              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="termsAccepted"
                  checked={filters.termsAccepted}
                  onChange={(e) => setFilters({...filters, termsAccepted: e.target.checked})}
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                />
                <label htmlFor="termsAccepted" className="ml-2 block text-sm text-gray-700">
                  Terms Accepted
                </label>
              </div>

              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="traceabilityAccepted"
                  checked={filters.traceabilityAccepted}
                  onChange={(e) => setFilters({...filters, traceabilityAccepted: e.target.checked})}
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                />
                <label htmlFor="traceabilityAccepted" className="ml-2 block text-sm text-gray-700">
                  Traceability Enabled
                </label>
              </div>
            </div>
          )}
        </div>
      </div>

      {results.length > 0 ? (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-xl font-semibold text-gray-800">
              {results.length} results found
            </h2>
            <div className="text-sm text-gray-500">
              Sorted by most recent
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4">
            {results.map((item) => (
              <div key={`${item.type}-${item.id}`} className="border rounded-lg p-4 hover:shadow-md transition-shadow">
                <div className="flex justify-between">
                  <div>
                    <h3 className="text-lg font-semibold flex items-center gap-2">
                      {item.type === 'asset' ? (
                        <>
                          <Database size={18} className="text-blue-500" />
                          {item.name}
                        </>
                      ) : (
                        <>
                          <Building size={18} className="text-green-500" />
                          {item.name}
                        </>
                      )}
                    </h3>
                    <p className="text-gray-600 text-sm mt-1">{item.description || 'No description available'}</p>
                  </div>
                  <div className="text-right">
                    <span className="inline-block bg-gray-100 text-gray-800 text-xs px-2 py-1 rounded-full">
                      {item.type === 'asset' ? 'Asset' : 'Federation'}
                    </span>
                    {item.type === 'asset' && item.federationName && (
                      <span className="block mt-1 inline-block bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded-full">
                        {item.federationName}
                      </span>
                    )}
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                  {item.type === 'asset' ? (
                    <>
                      <div>
                        <p className="text-gray-500">Semantic ID</p>
                        <p className="font-mono text-xs truncate">{item.semanticId}</p>
                      </div>
                      <div>
                        <p className="text-gray-500">Status</p>
                        <span className={`px-2 py-1 rounded-full text-xs ${
                          item.status === 'active' ? 'bg-green-100 text-green-800' :
                          item.status === 'inactive' ? 'bg-red-100 text-red-800' :
                          'bg-yellow-100 text-yellow-800'
                        }`}>
                          {item.status}
                        </span>
                      </div>
                      <div>
                        <p className="text-gray-500">API Endpoint</p>
                        {item.apiEndpoint ? (
                          <a 
                            href={item.apiEndpoint} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="text-blue-600 hover:underline text-sm flex items-center"
                          >
                            <ExternalLink size={14} className="mr-1" /> Access API
                          </a>
                        ) : (
                          <span className="text-gray-400">Not available</span>
                        )}
                      </div>
                    </>
                  ) : (
                    <>
                      <div>
                        <p className="text-gray-500">Organization</p>
                        <p>{item.organization}</p>
                      </div>
                      <div>
                        <p className="text-gray-500">Data Law</p>
                        <p>{item.dataLaw}</p>
                      </div>
                      <div>
                        <p className="text-gray-500">Contact</p>
                        <a href={`mailto:${item.contactEmail}`} className="text-blue-600 hover:underline">
                          {item.contactEmail}
                        </a>
                      </div>
                    </>
                  )}
                </div>

                <div className="mt-4 flex justify-between items-center">
                  <div className="flex items-center text-sm text-gray-500">
                    <Globe size={14} className="mr-1" />
                    Created: {item.createdAt.toLocaleDateString()}
                  </div>
                  <div className="flex space-x-2">
                    <button 
                      onClick={() => handleViewDetails(item)}
                      className="text-blue-600 hover:underline text-sm font-medium"
                    >
                      View Details
                    </button>
                    {item.type === 'federation' && item.website && (
                      <a 
                        href={item.website.startsWith('http') ? item.website : `https://${item.website}`}
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:underline text-sm font-medium flex items-center"
                      >
                        <ExternalLink size={14} className="mr-1" /> Website
                      </a>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : !loading ? (
        <div className="text-center py-12">
          <Search size={48} className="mx-auto text-gray-400 mb-4" />
          <h3 className="text-lg font-medium text-gray-900">No results found</h3>
          <p className="mt-1 text-sm text-gray-500">
            Try adjusting your search or filters to find what you&apos;re looking for.
          </p>
        </div>
      ) : null}

      {loading && (
        <div className="text-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto"></div>
          <p className="mt-3 text-sm text-gray-500">Searching across data space...</p>
        </div>
      )}

      <div className="mt-8 p-4 bg-blue-50 border-l-4 border-blue-500 text-blue-700 text-sm rounded-md">
        <strong>Discovery powered by:</strong> Combines federated search across multiple data spaces with semantic matching capabilities.
      </div>
    </div>
  )
}