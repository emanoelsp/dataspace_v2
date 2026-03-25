"use client"

import { useEffect, useState, useRef } from "react"
import { useParams, useRouter } from "next/navigation"
import { addDoc, collection, deleteDoc, doc, getDoc, getDocs, query, serverTimestamp, setDoc, updateDoc, where } from "firebase/firestore"
import { db } from "@/lib/firebase"
import Link from "next/link"
import { buildOwnershipFields, buildRequesterFields } from "@/lib/dataspace"
import { useAuthUser } from "@/lib/use-auth-user"
import { useUserProfile } from "@/lib/use-user-profile"


interface Asset {
  id: string
  name: string
  description: string
  assetType: string
  assetKind?: string
  purpose: string
  federationId?: string
  federationName?: string
  semanticId?: string
  aasId?: string
  irdi?: string
  semanticModel?: string
  apiEndpoint?: string
  dataFormat?: string
  exchangeMode?: string
  accessType?: string
  licenseType?: string
  createdAt?: unknown // ajuste de any para unknown
  updatedAt?: unknown // ajuste de any para unknown
  location?: string
  status?: string
  speed?: string
  protocol?: string
  active?: boolean
  publishedInCatalog?: boolean
  ownerId?: string
  ownerEmail?: string
  ownerName?: string
}

type FederationMembership = {
  id: string
  status: string
}

type ConnectorConnection = {
  id: string
  status: string
  providerParticipantId?: string
  consumerParticipantId?: string
  createdAt?: { toDate?: () => Date }
  updatedAt?: { toDate?: () => Date }
}

type ContractOffer = {
  id: string
  status: string
  version?: number
  createdAt?: { toDate?: () => Date }
}

type ContractAgreement = {
  id: string
  requesterId?: string
  requesterName?: string
  requesterEmail?: string
  status: string
  offerId?: string
  validUntil?: { toDate?: () => Date } | Date
  createdAt?: { toDate?: () => Date }
}

type CredentialGrant = {
  id: string
  requesterId?: string
  requesterEmail?: string
  status: string
  credentialType?: string
  issuedAt?: { toDate?: () => Date }
  expiresAt?: { toDate?: () => Date } | Date
}

type AccessToken = {
  id: string
  token?: string
  status: string
  expiresAt?: { toDate?: () => Date } | Date
}

type GovernancePolicy = {
  id: string
  policies?: string
  audit?: string
  usagePeriods?: string
  revocation?: string
  purposeBinding?: boolean
  requiresManualApproval?: boolean
  agreementTtlHours?: number
  accessTokenTtlMinutes?: number
  revocationMode?: string
  createdAt?: { toDate?: () => Date }
}


type DynamicRow = Record<string, unknown>

const COMPLIANCE_ITEMS = [
  "I confirm this asset is compliant with federation rules.",
  "I have reviewed the data privacy and security requirements.",
  "I acknowledge the asset's API is stable and documented.",
  "I agree to monitor and maintain the asset's availability.",
]

// Toast de confirmação de delete
function DeleteToast({ message, actionLabel, onAction, onClose }: { message: string, actionLabel: string, onAction: () => void, onClose: () => void }) {
  return (
    <div className="fixed inset-0 flex items-center justify-center z-50 bg-black/30">
      <div className="bg-white rounded-lg shadow-lg p-6 max-w-sm w-full border border-gray-200">
        <div className="mb-4 text-gray-800">{message}</div>
        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded bg-gray-200 hover:bg-gray-300 text-gray-800 font-medium"
          >
            Cancel
          </button>
          <button
            onClick={onAction}
            className="px-4 py-2 rounded bg-red-600 hover:bg-red-700 text-white font-medium"
          >
            {actionLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

function ComplianceModal({
  open,
  onClose,
  onConfirm,
  brokerUrl,
}: {
  open: boolean
  onClose: () => void
  onConfirm: () => void
  brokerUrl: string
}) {
  const [checked, setChecked] = useState<boolean[]>(Array(COMPLIANCE_ITEMS.length).fill(false))

  useEffect(() => {
    if (!open) setChecked(Array(COMPLIANCE_ITEMS.length).fill(false))
  }, [open])

  const allChecked = checked.every(Boolean)

  return !open ? null : (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-lg border border-gray-200 max-w-lg w-full p-8 relative">
        <button
          onClick={onClose}
          className="absolute top-3 right-3 text-gray-400 hover:text-gray-700"
          aria-label="Close"
        >
          ×
        </button>
        <h2 className="text-xl font-bold mb-4 text-gray-800">Compliance Confirmation</h2>
        <div className="mb-4 space-y-2">
          {COMPLIANCE_ITEMS.map((item, idx) => (
            <label key={item} className="flex items-center gap-2 text-gray-700">
              <input
                type="checkbox"
                checked={checked[idx]}
                onChange={e => {
                  const arr = [...checked]
                  arr[idx] = e.target.checked
                  setChecked(arr)
                }}
              />
              {item}
            </label>
          ))}
        </div>
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">Broker API URL for external access</label>
          <input
            type="text"
            value={brokerUrl}
            readOnly
            className="w-full border border-gray-300 rounded-md p-2 bg-gray-100 text-gray-700"
          />
        </div>
        <button
          className="bg-blue-600 text-white px-5 py-2 rounded-md hover:bg-blue-700 w-full font-semibold disabled:opacity-50"
          disabled={!allChecked}
          onClick={onConfirm}
        >
          Confirm and Start Query
        </button>
      </div>
    </div>
  )
}

function Toast({ show, onClose, message, error = false }: { show: boolean; onClose: () => void; message: string; error?: boolean }) {
  useEffect(() => {
    if (show) {
      const timer = setTimeout(onClose, 2500)
      return () => clearTimeout(timer)
    }
  }, [show, onClose])
  if (!show) return null
  return (
    <div className="fixed bottom-6 right-6 z-50">
      <div className={`${error ? "bg-red-600" : "bg-green-600"} text-white px-6 py-3 rounded-lg shadow-lg flex items-center gap-3`}>
        <span>{message}</span>
        <button onClick={onClose} className="ml-2 text-white font-bold">×</button>
      </div>
    </div>
  )
}

// Utilitário para formatar timestamp
function formatTimestamp(date: Date) {
  const pad = (n: number) => n.toString().padStart(2, "0")
  const year = date.getFullYear()
  const month = pad(date.getMonth() + 1)
  const day = pad(date.getDate())
  const hours = pad(date.getHours())
  const minutes = pad(date.getMinutes())
  const seconds = pad(date.getSeconds())
  return `${hours}:${minutes}:${seconds} ${year}/${month}/${day}`
}

function isTimestampStillValid(value?: { toDate?: () => Date } | Date | null) {
  if (!value) return false
  const date = value instanceof Date ? value : value.toDate ? value.toDate() : null
  if (!date) return false
  return date.getTime() > Date.now()
}

export default function AssetDetailsPage() {
  const { user, loading: authLoading } = useAuthUser()
  const { profile } = useUserProfile()
  const params = useParams()
  const router = useRouter()
  const [asset, setAsset] = useState<Asset | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [dynamicRows, setDynamicRows] = useState<DynamicRow[]>([])
  const [dynamicColumns, setDynamicColumns] = useState<string[]>([])
  const [isQuerying, setIsQuerying] = useState(false)
  const [showCompliance, setShowCompliance] = useState(false)
  const [brokerUrl, setBrokerUrl] = useState("")
  const [showBrokerUrl, setShowBrokerUrl] = useState(false)
  const [page, setPage] = useState(0)
  const [showToast, setShowToast] = useState(false)
  const [toastMsg, setToastMsg] = useState("")
  const [toastError, setToastError] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [editForm, setEditForm] = useState<Asset | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [showDeleteToast, setShowDeleteToast] = useState(false)
  const [accessModelLoading, setAccessModelLoading] = useState(false)
  const [currentConnection, setCurrentConnection] = useState<ConnectorConnection | null>(null)
  const [hasActiveMembership, setHasActiveMembership] = useState(false)
  const [contractOffers, setContractOffers] = useState<ContractOffer[]>([])
  const [currentAgreement, setCurrentAgreement] = useState<ContractAgreement | null>(null)
  const [assetAgreements, setAssetAgreements] = useState<ContractAgreement[]>([])
  const [currentCredential, setCurrentCredential] = useState<CredentialGrant | null>(null)
  const [assetCredentials, setAssetCredentials] = useState<CredentialGrant[]>([])
  const [currentAccessToken, setCurrentAccessToken] = useState<AccessToken | null>(null)
  const [governancePolicy, setGovernancePolicy] = useState<GovernancePolicy | null>(null)
  const [accessVersion, setAccessVersion] = useState(0)
  const intervalRef = useRef<NodeJS.Timeout | null>(null)
  const [cpsHeader, setCpsHeader] = useState<Record<string, unknown>>({
    id: "-",
    type: "-",
    location: "-",
    status: "-",
    speed: "-",
    protocol: "-",
  })

  // Fetch asset
  useEffect(() => {
    const fetchAsset = async () => {
      if (!params || !("id" in params)) {
        setLoading(false)
        return
      }
      try {
        setLoading(true)
        setError(null)
        const docRef = doc(db, "assets", params.id as string)
        const docSnap = await getDoc(docRef)
        if (docSnap.exists()) {
          const data = docSnap.data()
          const assetData: Asset = {
            id: docSnap.id,
            name: data.name,
            description: data.description,
            assetType: data.assetType,
            assetKind: data.assetKind,
            purpose: data.purpose,
            federationId: data.federationId,
            federationName: data.federationName,
            semanticId: data.semanticId,
            aasId: data.aasId,
            irdi: data.irdi,
            semanticModel: data.semanticModel,
            apiEndpoint: data.apiEndpoint,
            dataFormat: data.dataFormat,
            exchangeMode: data.exchangeMode,
            accessType: data.accessType,
            licenseType: data.licenseType,
            createdAt: data.createdAt,
            updatedAt: data.updatedAt,
            location: data.location || "-",
            status: data.status || "-",
            speed: data.speed || "-",
            protocol: data.protocol || "-",
            active: data.active !== false,
            publishedInCatalog: data.publishedInCatalog === true,
            ownerId: data.ownerId,
            ownerEmail: data.ownerEmail,
            ownerName: data.ownerName,
          }
          setAsset(assetData)
          setEditForm(assetData)
          setBrokerUrl(`https://broker.example.com/api/assets/${docSnap.id}`)
        } else {
          setError("Asset not found")
        }
      } catch {
        setError("Error loading asset")
      } finally {
        setLoading(false)
      }
    }
    fetchAsset()
  }, [params])

  const canManageAsset = Boolean(
    user &&
    profile?.userType === "datasource" &&
    asset?.ownerId &&
    user.uid === asset.ownerId,
  )
  const isDataClient = profile?.userType === "dataclient"

  useEffect(() => {
    const loadAccessModel = async () => {
      if (!asset?.id) {
        setCurrentConnection(null)
        setHasActiveMembership(false)
        setContractOffers([])
        setCurrentAgreement(null)
        setAssetAgreements([])
        setCurrentCredential(null)
        setAssetCredentials([])
        setCurrentAccessToken(null)
        setGovernancePolicy(null)
        return
      }

      try {
        setAccessModelLoading(true)

        const tasks: Promise<void>[] = []

        tasks.push((async () => {
          const governanceQuery = query(collection(db, "governance"), where("assets", "array-contains", asset.id))
          const governanceSnapshot = await getDocs(governanceQuery)
          const policy = governanceSnapshot.docs
            .map((docSnapshot) => ({ id: docSnapshot.id, ...docSnapshot.data() } as GovernancePolicy))
            .sort((a, b) => {
              const aTime = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : 0
              const bTime = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : 0
              return bTime - aTime
            })[0] ?? null
          setGovernancePolicy(policy)
        })())

        tasks.push((async () => {
          if (!user || !isDataClient || !asset.ownerId) {
            setCurrentConnection(null)
            return
          }

          const connectionQuery = query(
            collection(db, "connectorConnections"),
            where("ownerId", "==", asset.ownerId),
            where("requesterId", "==", user.uid),
          )
          const connectionSnapshot = await getDocs(connectionQuery)
          const connection = connectionSnapshot.docs
            .map((docSnapshot) => ({ id: docSnapshot.id, ...docSnapshot.data() } as ConnectorConnection))
            .sort((a, b) => {
              const aTime = a.updatedAt?.toDate ? a.updatedAt.toDate().getTime() : a.createdAt?.toDate ? a.createdAt.toDate().getTime() : 0
              const bTime = b.updatedAt?.toDate ? b.updatedAt.toDate().getTime() : b.createdAt?.toDate ? b.createdAt.toDate().getTime() : 0
              return bTime - aTime
            })[0] ?? null

          setCurrentConnection(connection)
        })())

        tasks.push((async () => {
          const offersQuery = query(collection(db, "contractOffers"), where("assetId", "==", asset.id))
          const offersSnapshot = await getDocs(offersQuery)
          const offers = offersSnapshot.docs
            .map((docSnapshot) => ({ id: docSnapshot.id, ...docSnapshot.data() } as ContractOffer))
            .sort((a, b) => {
              const aTime = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : 0
              const bTime = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : 0
              return bTime - aTime
            })
          setContractOffers(offers)
        })())

        tasks.push((async () => {
          if (!user || !isDataClient || !asset.federationId) {
            setHasActiveMembership(false)
            return
          }

          const membershipQuery = query(
            collection(db, "federationMemberships"),
            where("federationId", "==", asset.federationId),
            where("requesterId", "==", user.uid),
          )
          const membershipSnapshot = await getDocs(membershipQuery)
          const membership = membershipSnapshot.docs
            .map((docSnapshot) => ({ id: docSnapshot.id, ...docSnapshot.data() } as FederationMembership))
            .find((row) => row.status === "active")

          setHasActiveMembership(Boolean(membership))
        })())

        tasks.push((async () => {
          if (!user) {
            setCurrentAgreement(null)
            return
          }

          const currentAgreementQuery = query(
            collection(db, "contractAgreements"),
            where("assetId", "==", asset.id),
            where("requesterId", "==", user.uid),
          )
          const currentAgreementSnapshot = await getDocs(currentAgreementQuery)
          const agreement = currentAgreementSnapshot.docs
            .map((docSnapshot) => ({ id: docSnapshot.id, ...docSnapshot.data() } as ContractAgreement))
            .sort((a, b) => {
              const aTime = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : 0
              const bTime = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : 0
              return bTime - aTime
            })[0] ?? null

          setCurrentAgreement(agreement)
        })())

        tasks.push((async () => {
          if (!canManageAsset) {
            setAssetAgreements([])
            return
          }

          const agreementsQuery = query(collection(db, "contractAgreements"), where("assetId", "==", asset.id))
          const agreementsSnapshot = await getDocs(agreementsQuery)
          const agreements = agreementsSnapshot.docs
            .map((docSnapshot) => ({ id: docSnapshot.id, ...docSnapshot.data() } as ContractAgreement))
            .sort((a, b) => {
              const aTime = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : 0
              const bTime = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : 0
              return bTime - aTime
            })

          setAssetAgreements(agreements)
        })())

        tasks.push((async () => {
          if (!user) {
            setCurrentCredential(null)
            return
          }

          const credentialsQuery = query(
            collection(db, "credentialGrants"),
            where("assetId", "==", asset.id),
            where("requesterId", "==", user.uid),
          )
          const credentialsSnapshot = await getDocs(credentialsQuery)
          const credential = credentialsSnapshot.docs
            .map((docSnapshot) => ({ id: docSnapshot.id, ...docSnapshot.data() } as CredentialGrant))
            .sort((a, b) => {
              const aTime = a.issuedAt?.toDate ? a.issuedAt.toDate().getTime() : 0
              const bTime = b.issuedAt?.toDate ? b.issuedAt.toDate().getTime() : 0
              return bTime - aTime
            })[0] ?? null

          setCurrentCredential(credential)
        })())

        tasks.push((async () => {
          if (!user) {
            setCurrentAccessToken(null)
            return
          }

          const tokenQuery = query(
            collection(db, "accessTokens"),
            where("assetId", "==", asset.id),
            where("requesterId", "==", user.uid),
          )
          const tokenSnapshot = await getDocs(tokenQuery)
          const token = tokenSnapshot.docs
            .map((docSnapshot) => ({ id: docSnapshot.id, ...docSnapshot.data() } as AccessToken))
            .sort((a, b) => {
              const aTime = a.expiresAt instanceof Date ? a.expiresAt.getTime() : a.expiresAt?.toDate ? a.expiresAt.toDate().getTime() : 0
              const bTime = b.expiresAt instanceof Date ? b.expiresAt.getTime() : b.expiresAt?.toDate ? b.expiresAt.toDate().getTime() : 0
              return bTime - aTime
            })[0] ?? null

          setCurrentAccessToken(token)
        })())

        tasks.push((async () => {
          if (!canManageAsset) {
            setAssetCredentials([])
            return
          }

          const credentialsQuery = query(collection(db, "credentialGrants"), where("assetId", "==", asset.id))
          const credentialsSnapshot = await getDocs(credentialsQuery)
          const credentials = credentialsSnapshot.docs
            .map((docSnapshot) => ({ id: docSnapshot.id, ...docSnapshot.data() } as CredentialGrant))
            .sort((a, b) => {
              const aTime = a.issuedAt?.toDate ? a.issuedAt.toDate().getTime() : 0
              const bTime = b.issuedAt?.toDate ? b.issuedAt.toDate().getTime() : 0
              return bTime - aTime
            })

          setAssetCredentials(credentials)
        })())

        await Promise.all(tasks)
      } catch (err) {
        console.error("Failed to load contract and credential state:", err)
      } finally {
        setAccessModelLoading(false)
      }
    }

    loadAccessModel()
  }, [asset?.id, asset?.federationId, asset?.ownerId, user, isDataClient, canManageAsset, accessVersion])

  const publishedOffer = contractOffers.find((offer) => offer.status === "published") ?? null
  const agreementTtlHours = governancePolicy?.agreementTtlHours && governancePolicy.agreementTtlHours > 0 ? governancePolicy.agreementTtlHours : 24
  const accessTokenTtlMinutes =
    governancePolicy?.accessTokenTtlMinutes && governancePolicy.accessTokenTtlMinutes > 0 ? governancePolicy.accessTokenTtlMinutes : 15
  const hasActiveConnection = currentConnection?.status === "active"
  const hasFinalizedAgreement = currentAgreement?.status === "finalized" && (!currentAgreement?.validUntil || isTimestampStillValid(currentAgreement.validUntil))
  const hasActiveCredential = currentCredential?.status === "active" && (!currentCredential?.expiresAt || isTimestampStillValid(currentCredential.expiresAt))
  const canConsumeAsset = Boolean(
    user &&
    asset &&
    asset.active !== false &&
    (
      canManageAsset ||
      (isDataClient && hasActiveConnection && hasActiveMembership && hasFinalizedAgreement && hasActiveCredential)
    ),
  )

  // Fetch CPS Fixed Data from API header (id, type, location, status, speed, protocol)
  useEffect(() => {
    const fetchHeader = async () => {
      if (asset?.apiEndpoint) {
        try {
          const res = await fetch(asset.apiEndpoint)
          if (!res.ok) throw new Error()
          const data = await res.json()

          // Lógica para encontrar o cabeçalho
          let headerData = null;
          if (Array.isArray(data)) {
            headerData = data[0];
          } else if (typeof data === 'object' && data !== null) {
            if (data.data && Array.isArray(data.data) && data.data.length > 0) {
              headerData = data.data[0]; // Usa o primeiro item dos dados aninhados se houver
            } else {
              headerData = data; // Usa o objeto raiz
            }
          }

          setCpsHeader({
            id: headerData?.id ?? headerData?.deviceId ?? asset.id,
            type: headerData?.type ?? asset.assetType,
            location: headerData?.location ?? asset.location,
            status: headerData?.status ?? asset.status,
            speed: headerData?.speed ?? asset.speed,
            protocol: headerData?.protocol ?? asset.protocol,
          })
        } catch {
          setCpsHeader({
            id: asset?.id,
            type: asset?.assetType,
            location: asset?.location,
            status: asset?.status,
            speed: asset?.speed,
            protocol: asset?.protocol,
          })
        }
      } else if (asset) {
        setCpsHeader({
          id: asset.id,
          type: asset.assetType,
          location: asset.location,
          status: asset.status,
          speed: asset.speed,
          protocol: asset.protocol,
        })
      }
    }
    if (asset) fetchHeader()
  }, [asset])

  // Fetch dynamic data from API
  const fetchDynamicData = async () => {
    if (!asset?.apiEndpoint) return;
    if (currentAccessToken && !isTimestampStillValid(currentAccessToken.expiresAt ?? null)) {
      setIsQuerying(false)
      setToastMsg("The short-lived access token expired. Start a new query to issue a fresh token.")
      setToastError(true)
      setShowToast(true)
      return
    }
    try {
      const headers: HeadersInit = currentAccessToken?.token
        ? {
            Accept: "application/json, text/plain, */*",
            Authorization: `Bearer ${currentAccessToken.token}`,
            "X-Dataspace-Token": currentAccessToken.token,
          }
        : { Accept: "application/json, text/plain, */*" }
      const res = await fetch(asset.apiEndpoint, { headers })
      if (!res.ok) throw new Error(`Error fetching data: ${res.status}`)
      const data = await res.json() // 'data' é a resposta crua da API

      // --- Lógica "inteligente" para encontrar o dado de tempo real ---
      let dataRow: DynamicRow | null = null;

      if (Array.isArray(data)) {
        // Caso 1: A resposta é um array: [ { ... } ]
        // (Ex: [{"deviceId":"cps3", "Carga_Cilindro":...}])
        dataRow = data[0];
      } else if (typeof data === 'object' && data !== null) {
        if (data.data && Array.isArray(data.data) && data.data.length > 0) {
          // Caso 3: A resposta é um objeto com um array 'data' dentro: { status: "...", data: [ { ... } ] }
          // (Ex: seu novo exemplo de robô de solda)
          dataRow = data.data[0]; // Pegamos o primeiro item do array 'data'
        } else {
          // Caso 2: A resposta é um objeto simples: { id: "...", temperature: ... }
          // (Ex: {"id":"CPS001", "temperature":...})
          dataRow = data;
        }
      }
      // --- Fim da lógica ---

      if (!dataRow) {
        // Se nenhum dado válido foi encontrado, não faz nada
        return;
      }

      // Cria a nova linha, adicionando nosso timestamp de "chegada"
      const newRow: DynamicRow = { timestamp: formatTimestamp(new Date()), ...dataRow };

      // Define as colunas dinamicamente no primeiro fetch
      if (dynamicColumns.length === 0) {
        const allKeys = Object.keys(newRow);
        
        // Chaves para excluir (metadados já mostrados em "CPS Fixed Data" ou dados complexos)
        const keysToExclude = [
          "id", "type", "location", "status", "speed", "protocol", // Da tabela Fixed
          "series", // Arrays complexos
          "ts", "deviceId", // Metadados que podem vir no payload
          "status", "count" // Metadados do seu novo exemplo
        ];
        
        // Filtra as chaves
        const filteredKeys = allKeys.filter(key => !keysToExclude.includes(key));
        
        // Garante que 'timestamp' (o nosso) seja a primeira coluna
        const finalKeys = ["timestamp", ...filteredKeys.filter(k => k !== "timestamp")];
        
        setDynamicColumns(finalKeys);
      }

      setDynamicRows(prev => [newRow, ...prev].slice(0, 100))
    } catch (error) {
      console.error("Failed to fetch dynamic data:", error);
      // ignora erros na UI
    }
  }

  // Fetch simulated data
  const fetchSimulatedData = () => {
    const newRow = {
      // Adicionando 'id' e 'ts' para simular um payload mais complexo
      id: "sim-001",
      ts: new Date().toISOString(),
      timestamp: formatTimestamp(new Date()),
      temperature: +(20 + Math.random() * 10).toFixed(2),
      pressure: +(1 + Math.random()).toFixed(2),
      flowRate: +(100 + Math.random() * 50).toFixed(2),
    };

    // Define as colunas na primeira execução
    if (dynamicColumns.length === 0) {
        const allKeys = Object.keys(newRow);
        const keysToExclude = [
          "id", "type", "location", "status", "speed", "protocol",
          "series", "ts", "deviceId", "status", "count"
        ];
        const filteredKeys = allKeys.filter(key => !keysToExclude.includes(key));
        const finalKeys = ["timestamp", ...filteredKeys.filter(k => k !== "timestamp")];
        setDynamicColumns(finalKeys);
    }

    setDynamicRows(prev => [newRow, ...prev].slice(0, 100))
  }

  // Query interval
  useEffect(() => {
    if (isQuerying) {
      intervalRef.current = setInterval(() => {
        if (asset?.apiEndpoint) {
          fetchDynamicData()
        } else {
          fetchSimulatedData()
        }
      }, 1000)
      setShowBrokerUrl(true)
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current)
      setShowBrokerUrl(false)
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isQuerying, asset?.apiEndpoint, currentAccessToken?.token, currentAccessToken?.expiresAt])

  // Pagination for real-time data (20 rows per page)
  const pageSize = 20
  const pagedRows = dynamicRows.slice(page * pageSize, (page + 1) * pageSize)
  const totalPages = Math.ceil(dynamicRows.length / pageSize)

  // Asset actions
  const handleToggleActive = async () => {
    if (!asset) return
    try {
      if (asset.active) {
        await updateDoc(doc(db, "assets", asset.id), { active: false })
        setAsset({ ...asset, active: false })
        setEditForm({ ...asset, active: false })
        setIsQuerying(false)
      } else {
        await updateDoc(doc(db, "assets", asset.id), { active: true })
        setAsset({ ...asset, active: true })
        setEditForm({ ...asset, active: true })
      }
    } catch {
      setToastMsg("Failed to update asset status.")
      setToastError(true)
      setShowToast(true)
    }
  }

  // Edição
  const handleEdit = () => {
    if (!canManageAsset) return
    setIsEditing(true)
  }

  const handleSave = async () => {
    if (!editForm || !asset || !canManageAsset) return
    try {
      const docRef = doc(db, "assets", asset.id)
      await updateDoc(docRef, {
        ...editForm,
        updatedAt: new Date(),
      })
      setAsset(editForm)
      setIsEditing(false)
      setToastMsg("Asset updated successfully.")
      setToastError(false)
      setShowToast(true)
    } catch {
      setToastMsg("Error updating asset.")
      setToastError(true)
      setShowToast(true)
    }
  }

  const handleCancel = () => {
    setEditForm(asset)
    setIsEditing(false)
  }

  // Toast de confirmação de delete
  const handleDelete = () => {
    if (!canManageAsset) return
    setShowDeleteToast(true)
  }

  const confirmDelete = async () => {
    if (!asset || !canManageAsset) return
    try {
      setIsDeleting(true)
      setShowDeleteToast(false)
      const docRef = doc(db, "assets", asset.id)
      await deleteDoc(docRef)
      setToastMsg("Asset deleted successfully.")
      setToastError(false)
      setShowToast(true)
      setTimeout(() => {
        router.push("/assets/browse")
      }, 1200)
    } catch {
      setToastMsg("Failed to delete asset.")
      setToastError(true)
      setShowToast(true)
      setIsDeleting(false)
    }
  }

  const handleInputChange = (field: keyof Asset, value: string | boolean) => {
    if (editForm) {
      setEditForm({ ...editForm, [field]: value })
    }
  }

  const publishToCatalog = async () => {
    if (!asset || !canManageAsset) return
    if (!profile?.participantId || !profile?.connectorDspBaseUrl) {
      setToastMsg("Configure the provider connector profile before publishing this asset.")
      setToastError(true)
      setShowToast(true)
      return
    }

    try {
      await updateDoc(doc(db, "assets", asset.id), {
        publishedInCatalog: true,
        status: "published",
        updatedAt: serverTimestamp(),
      })
      await setDoc(doc(db, "catalogPublications", `asset-${asset.id}`), {
        scope: "asset",
        scopeId: asset.id,
        connectorParticipantId: currentConnection?.providerParticipantId ?? profile?.participantId ?? asset.ownerId ?? "",
        dspEndpoint: profile?.connectorDspBaseUrl ?? "",
        catalogEndpoint: profile?.federatedCatalogUrl ?? "",
        published: true,
        lastPublishedAt: serverTimestamp(),
        ownerId: asset.ownerId ?? "",
        ownerEmail: asset.ownerEmail ?? "",
        ownerName: asset.ownerName ?? "",
      })
      setAsset({ ...asset, publishedInCatalog: true, status: "published" })
      setEditForm((current) => (current ? { ...current, publishedInCatalog: true, status: "published" } : current))
      setToastMsg("Asset metadata published to the federated catalog.")
      setToastError(false)
      setShowToast(true)
    } catch {
      setToastMsg("Could not publish this asset to the catalog.")
      setToastError(true)
      setShowToast(true)
    }
  }

  const unpublishFromCatalog = async () => {
    if (!asset || !canManageAsset) return

    try {
      await updateDoc(doc(db, "assets", asset.id), {
        publishedInCatalog: false,
        status: asset.active === false ? "inactive" : "draft",
        updatedAt: serverTimestamp(),
      })
      await setDoc(doc(db, "catalogPublications", `asset-${asset.id}`), {
        scope: "asset",
        scopeId: asset.id,
        connectorParticipantId: currentConnection?.providerParticipantId ?? profile?.participantId ?? asset.ownerId ?? "",
        dspEndpoint: profile?.connectorDspBaseUrl ?? "",
        catalogEndpoint: profile?.federatedCatalogUrl ?? "",
        published: false,
        lastPublishedAt: serverTimestamp(),
        ownerId: asset.ownerId ?? "",
        ownerEmail: asset.ownerEmail ?? "",
        ownerName: asset.ownerName ?? "",
      })
      setAsset({ ...asset, publishedInCatalog: false, status: asset.active === false ? "inactive" : "draft" })
      setEditForm((current) => (
        current ? { ...current, publishedInCatalog: false, status: asset.active === false ? "inactive" : "draft" } : current
      ))
      setToastMsg("Asset metadata removed from the federated catalog.")
      setToastError(false)
      setShowToast(true)
    } catch {
      setToastMsg("Could not unpublish this asset from the catalog.")
      setToastError(true)
      setShowToast(true)
    }
  }

  const handleStartQuery = async () => {
    if (!asset) {
      return
    }

    if (!user) {
      setShowCompliance(false)
      setToastMsg("Sign in before starting a query.")
      setToastError(true)
      setShowToast(true)
      return
    }

    if (!canConsumeAsset) {
      setShowCompliance(false)
      setToastMsg("Active connector connection, federation membership, finalized agreement, and active credential are required before consumption.")
      setToastError(true)
      setShowToast(true)
      return
    }

    if (!governancePolicy) {
      setShowCompliance(false)
      setToastMsg("The asset governance policy is missing, so token issuance is blocked.")
      setToastError(true)
      setShowToast(true)
      return
    }

    try {
      const expiresAt = new Date(Date.now() + accessTokenTtlMinutes * 60 * 1000)
      const accessTokenValue = `dsp_${crypto.randomUUID().replace(/-/g, "")}`
      const tokenRef = await addDoc(collection(db, "accessTokens"), {
        token: accessTokenValue,
        scope: "asset.read",
        assetId: asset.id,
        federationId: asset.federationId ?? "",
        agreementId: currentAgreement?.id ?? "",
        credentialGrantId: currentCredential?.id ?? "",
        connectorConnectionId: currentConnection?.id ?? "",
        requesterId: user.uid,
        requesterEmail: user.email ?? "",
        ownerId: asset.ownerId ?? "",
        ownerEmail: asset.ownerEmail ?? "",
        ownerName: asset.ownerName ?? "",
        governancePolicyId: governancePolicy.id,
        status: "active",
        issuedAt: serverTimestamp(),
        expiresAt,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })

      setCurrentAccessToken({
        id: tokenRef.id,
        token: accessTokenValue,
        status: "active",
        expiresAt,
      })

      await addDoc(collection(db, "accessLogs"), {
        assetId: asset.id,
        assetName: asset.name,
        assetOwnerId: asset.ownerId ?? "",
        assetOwnerEmail: asset.ownerEmail ?? "",
        federationId: asset.federationId ?? "",
        federationName: asset.federationName ?? "",
        apiEndpoint: asset.apiEndpoint ?? "",
        brokerUrl,
        status: "started",
        contractAccepted: true,
        connectorConnectionId: currentConnection?.id ?? "",
        contractAgreementId: currentAgreement?.id ?? "",
        credentialGrantId: currentCredential?.id ?? "",
        accessTokenId: tokenRef.id,
        startedAt: serverTimestamp(),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        ...buildRequesterFields(user),
        ...buildOwnershipFields(user),
      })
    } catch {
      setToastMsg("Token issuance or audit persistence failed. The direct query remains blocked.")
      setToastError(true)
      setShowToast(true)
      return
    }

    setShowCompliance(false)
    setIsQuerying(true)
    setShowBrokerUrl(true)
    setDynamicColumns([])
    setDynamicRows([])
    setPage(0)
  }

  if (loading) return <p className="p-8 text-gray-600">Loading asset...</p>
  if (error) return <p className="p-8 text-red-600">{error}</p>
  if (!asset) return <p className="p-8 text-gray-600">Asset not found</p>

  // Organização dos campos para edição
  const assetFields: { key: keyof Asset; label: string }[] = [
    { key: "name", label: "Name" },
    { key: "description", label: "Description" },
    { key: "assetType", label: "Type" },
    { key: "assetKind", label: "Asset Kind" },
    { key: "purpose", label: "Purpose" },
    { key: "semanticId", label: "Semantic ID" },
    { key: "aasId", label: "AAS ID" },
    { key: "irdi", label: "IRDI / ECLASS" },
    { key: "semanticModel", label: "Semantic Model" },
    { key: "apiEndpoint", label: "API Endpoint" },
    { key: "dataFormat", label: "Data Format" },
    { key: "exchangeMode", label: "Exchange Mode" },
    { key: "accessType", label: "Access" },
    { key: "licenseType", label: "License" },
    { key: "location", label: "Location" },
    { key: "status", label: "Status" },
    { key: "speed", label: "Speed" },
    { key: "protocol", label: "Protocol" },
  ]

  // Função para renderizar campo
  const renderField = (field: { key: keyof Asset, label: string }) => {
    if (isEditing) {
      if (field.key === "description") {
        return (
          <div key={field.key}>
            <label className="block text-sm font-medium text-gray-700 mb-2">{field.label}</label>
            <textarea
              value={
                editForm?.[field.key] !== undefined && (typeof editForm[field.key] === "string" || typeof editForm[field.key] === "number")
                  ? String(editForm[field.key])
                  : ""
              }
              onChange={e => handleInputChange(field.key, e.target.value)}
              rows={4}
              className="w-full p-3 border border-gray-300 rounded-md focus:ring-blue-600 focus:border-blue-600"
            />
          </div>
        )
      }
      return (
        <div key={field.key}>
          <label className="block text-sm font-medium text-gray-700 mb-2">{field.label}</label>
          <input
            type="text"
            value={editForm?.[field.key] !== undefined ? String(editForm[field.key]) : ""}
            onChange={e => handleInputChange(field.key, e.target.value)}
            className="w-full p-3 border border-gray-300 rounded-md focus:ring-blue-600 focus:border-blue-600"
          />
        </div>
      )
    }
    // Visualização
    return (
      <div key={field.key}>
        <label className="block text-sm font-medium text-gray-700 mb-2">{field.label}</label>
        <p className="text-gray-800">{asset[field.key] !== undefined && asset[field.key] !== null ? String(asset[field.key]) : "Not informed"}</p>
      </div>
    )
  }

  const publishContractOffer = async () => {
    if (!asset || !canManageAsset) return
    if (!governancePolicy) {
      setToastMsg("Create the asset governance policy before publishing a contract offer.")
      setToastError(true)
      setShowToast(true)
      return
    }

    try {
      await addDoc(collection(db, "contractOffers"), {
        scope: "asset",
        scopeId: asset.id,
        federationId: asset.federationId ?? "",
        assetId: asset.id,
        ownerId: asset.ownerId ?? "",
        ownerEmail: asset.ownerEmail ?? "",
        ownerName: asset.ownerName ?? "",
        policyType: "contract",
        policyPayload: {
          purpose: asset.purpose,
          accessType: asset.accessType ?? "",
          dataFormat: asset.dataFormat ?? "",
          exchangeMode: asset.exchangeMode ?? "",
          semanticId: asset.semanticId ?? "",
          aasId: asset.aasId ?? "",
          irdi: asset.irdi ?? "",
          governancePolicyId: governancePolicy.id,
          governancePolicies: governancePolicy.policies ?? "",
          usagePeriods: governancePolicy.usagePeriods ?? "",
          revocation: governancePolicy.revocation ?? "",
          purposeBinding: governancePolicy.purposeBinding !== false,
          requiresManualApproval: governancePolicy.requiresManualApproval !== false,
          validForHours: agreementTtlHours,
          accessTokenTtlMinutes,
          revocable: governancePolicy.revocationMode !== "time-expiry",
        },
        visibility: "members",
        status: "published",
        version: contractOffers.length + 1,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
      setToastMsg("Standard contract offer published.")
      setToastError(false)
      setShowToast(true)
      setAccessVersion((value) => value + 1)
    } catch {
      setToastMsg("Could not publish the contract offer.")
      setToastError(true)
      setShowToast(true)
    }
  }

  const requestAgreement = async () => {
    if (!asset || !user || !profile || !isDataClient) return

    if (!hasActiveConnection) {
      setToastMsg("Activate the connector connection before requesting an asset contract.")
      setToastError(true)
      setShowToast(true)
      return
    }

    if (!governancePolicy) {
      setToastMsg("The asset governance policy is missing, so the access request cannot be negotiated yet.")
      setToastError(true)
      setShowToast(true)
      return
    }

    if (!hasActiveMembership) {
      setToastMsg("Join the federation before requesting an asset contract.")
      setToastError(true)
      setShowToast(true)
      return
    }

    if (!publishedOffer) {
      setToastMsg("This asset has no published contract offer yet.")
      setToastError(true)
      setShowToast(true)
      return
    }

    if (currentAgreement && ["requested", "negotiating", "finalized"].includes(currentAgreement.status)) {
      setToastMsg("You already have an agreement process for this asset.")
      setToastError(true)
      setShowToast(true)
      return
    }

    try {
      await addDoc(collection(db, "contractAgreements"), {
        offerId: publishedOffer.id,
        federationId: asset.federationId ?? "",
        assetId: asset.id,
        assetName: asset.name,
        providerParticipantId: currentConnection?.providerParticipantId ?? asset.ownerId ?? "",
        consumerParticipantId: currentConnection?.consumerParticipantId ?? profile.participantId ?? user.uid,
        connectorConnectionId: currentConnection?.id ?? "",
        agreementType: "asset",
        status: "requested",
        requesterId: user.uid,
        requesterEmail: user.email ?? "",
        requesterName: profile.name ?? user.displayName ?? user.email ?? user.uid,
        ownerId: asset.ownerId ?? "",
        ownerEmail: asset.ownerEmail ?? "",
        ownerName: asset.ownerName ?? "",
        governancePolicyId: governancePolicy.id,
        purposeBindingAccepted: governancePolicy.purposeBinding !== false,
        signedByConsumerAt: serverTimestamp(),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
      setToastMsg("Contract agreement request submitted.")
      setToastError(false)
      setShowToast(true)
      setAccessVersion((value) => value + 1)
    } catch {
      setToastMsg("Could not request the contract agreement.")
      setToastError(true)
      setShowToast(true)
    }
  }

  const updateAgreementStatus = async (agreement: ContractAgreement, status: "finalized" | "rejected") => {
    if (!asset || !canManageAsset) return

    try {
      if (status === "finalized" && !governancePolicy) {
        setToastMsg("A governance policy is required before approving asset access.")
        setToastError(true)
        setShowToast(true)
        return
      }

      const validUntil = new Date(Date.now() + agreementTtlHours * 60 * 60 * 1000)
      await updateDoc(doc(db, "contractAgreements", agreement.id), {
        status,
        updatedAt: serverTimestamp(),
        signedByProviderAt: status === "finalized" ? serverTimestamp() : null,
        validFrom: status === "finalized" ? serverTimestamp() : null,
        validUntil: status === "finalized" ? validUntil : null,
        governancePolicyId: governancePolicy?.id ?? "",
      })

      if (status === "finalized") {
        await addDoc(collection(db, "credentialGrants"), {
          participantId: agreement.requesterId ?? "",
          requesterId: agreement.requesterId ?? "",
          requesterEmail: agreement.requesterEmail ?? "",
          agreementId: agreement.id,
          assetId: asset.id,
          federationId: asset.federationId ?? "",
          credentialType: "usage",
          status: "active",
          issuedAt: serverTimestamp(),
          expiresAt: validUntil,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          ownerId: asset.ownerId ?? "",
          ownerEmail: asset.ownerEmail ?? "",
          ownerName: asset.ownerName ?? "",
        })
      }

      setToastMsg(status === "finalized" ? "Agreement finalized and credential issued." : "Agreement rejected.")
      setToastError(false)
      setShowToast(true)
      setAccessVersion((value) => value + 1)
    } catch {
      setToastMsg("Could not update the agreement status.")
      setToastError(true)
      setShowToast(true)
    }
  }

  const updateCredentialStatus = async (credential: CredentialGrant, status: "revoked" | "expired") => {
    if (!canManageAsset) return

    try {
      await updateDoc(doc(db, "credentialGrants", credential.id), {
        status,
        updatedAt: serverTimestamp(),
        revokedAt: status === "revoked" ? serverTimestamp() : null,
      })
      setToastMsg(status === "revoked" ? "Usage credential revoked." : "Usage credential marked as expired.")
      setToastError(false)
      setShowToast(true)
      setAccessVersion((value) => value + 1)
    } catch {
      setToastMsg("Could not update the usage credential.")
      setToastError(true)
      setShowToast(true)
    }
  }

  return (
    <>
     <div className="flex justify-between items-center mb-6 mt-4 container mx-auto">
        <Link href="/assets/browse" className="text-blue-600 hover:underline mb-4 inline-block">
          ← Back to Browse Assets
        </Link>
        <Link href="/assets/create">
          <button className="bg-blue-600 text-white px-5 py-2 rounded-md hover:bg-blue-700">+ Create Asset</button>
        </Link>
      </div>
    
    
    <div className="max-w-4xl mx-auto p-8">
      
      {/* Toast de confirmação de delete */}
      {showDeleteToast && (
        <DeleteToast
          message={`Are you sure you want to delete "${asset.name}"? This action cannot be undone.`}
          actionLabel={isDeleting ? "Deleting..." : "Delete"}
          onAction={confirmDelete}
          onClose={() => setShowDeleteToast(false)}
        />
      )}

      <ComplianceModal
        open={showCompliance}
        onClose={() => setShowCompliance(false)}
        onConfirm={handleStartQuery}
        brokerUrl={brokerUrl}
      />

      <Toast
        show={showToast}
        onClose={() => setShowToast(false)}
        message={toastMsg}
        error={toastError}
      />

      <div className="flex justify-between items-start mb-8">
        <div>
         
          <h1 className="text-3xl font-bold text-gray-800">Asset Details</h1>
        </div>
        <div className="flex gap-2">
          {canManageAsset && !isEditing ? (
            <>
              <button
                onClick={handleEdit}
                className="bg-blue-700 text-white px-4 py-2 rounded-md hover:bg-yellow-600 font-semibold"
              >
                Edit
              </button>
              <button
                onClick={handleToggleActive}
                className={`px-4 py-2 rounded-md font-semibold ${
                  asset.active
                    ? "bg-gray-400 text-white hover:bg-gray-500"
                    : "bg-green-600 text-white hover:bg-green-700"
                }`}
              >
                {asset.active ? "Deactivate" : "Activate"}
              </button>
              <button
                onClick={asset.publishedInCatalog ? unpublishFromCatalog : publishToCatalog}
                className={`px-4 py-2 rounded-md font-semibold ${
                  asset.publishedInCatalog
                    ? "bg-slate-700 text-white hover:bg-slate-800"
                    : "bg-indigo-600 text-white hover:bg-indigo-700"
                }`}
              >
                {asset.publishedInCatalog ? "Unpublish Catalog" : "Publish Catalog"}
              </button>
              <button
                onClick={handleDelete}
                disabled={isDeleting}
                className="bg-red-600 text-white px-4 py-2 rounded-md hover:bg-red-700 font-semibold disabled:opacity-50"
              >
                {isDeleting ? "Deleting..." : "Delete"}
              </button>
            </>
          ) : canManageAsset ? (
            <>
              <button
                onClick={handleSave}
                className="bg-green-600 text-white px-4 py-2 rounded-md hover:bg-green-700 font-semibold"
              >
                Save
              </button>
              <button
                onClick={handleCancel}
                className="bg-gray-600 text-white px-4 py-2 rounded-md hover:bg-gray-700 font-semibold"
              >
                Cancel
              </button>
            </>
          ) : null}
          {!canManageAsset && asset.ownerId ? (
            <div className="rounded-md border border-gray-200 bg-gray-50 px-4 py-2 text-sm text-gray-600">
              Read-only view. Only the owning Data Owner can edit this asset.
            </div>
          ) : null}
        </div>
      </div>

      {/* Physical characteristics */}
      <div className="bg-white rounded-lg shadow-sm border p-6 mb-8">
        <h2 className="text-xl font-semibold mb-4">Physical Characteristics</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {assetFields.map(renderField)}
        </div>
      </div>

      {/* CPS Fixed Data */}
      <div className="bg-white rounded-lg shadow-sm border p-6 mb-8">
        <h2 className="text-xl font-semibold mb-4">CPS Fixed Data</h2>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm border">
            <thead>
              <tr>
                {["id", "type", "location", "status", "speed", "protocol"].map((key) => (
                  <th key={key} className="py-2 px-3 border-b bg-gray-50 text-gray-700">{key}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                {["id", "type", "location", "status", "speed", "protocol"].map((key) => (
                  <td key={key} className="py-2 px-3">{cpsHeader[key] !== undefined ? String(cpsHeader[key]) : "-"}</td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {!isEditing && (
        <div className="bg-white rounded-lg shadow-sm border p-6 mb-8">
          <h2 className="text-xl font-semibold mb-4">Contracts & Credentials</h2>
          <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
            <div>
              {accessModelLoading ? (
                <p className="text-sm text-gray-500">Loading access prerequisites...</p>
              ) : (
                <div className="space-y-4">
                  <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 text-sm text-gray-700">
                    <p><span className="font-medium">Governance policy:</span> {governancePolicy ? "attached" : "missing"}</p>
                    <p><span className="font-medium">Catalog publication:</span> {asset.publishedInCatalog ? "published" : "not published"}</p>
                    <p><span className="font-medium">Connector connection:</span> {canManageAsset ? "owner context" : currentConnection?.status ?? "missing"}</p>
                    <p className="mt-1"><span className="font-medium">Federation membership:</span> {canManageAsset ? "owner context" : hasActiveMembership ? "active" : "missing"}</p>
                    <p className="mt-1"><span className="font-medium">Published offer:</span> {publishedOffer ? `v${publishedOffer.version ?? 1}` : "missing"}</p>
                    <p className="mt-1"><span className="font-medium">Agreement:</span> {canManageAsset ? "owner context" : currentAgreement?.status ?? "none"}</p>
                    <p className="mt-1"><span className="font-medium">Credential:</span> {canManageAsset ? "owner context" : currentCredential?.status ?? "none"}</p>
                    <p className="mt-1"><span className="font-medium">Access token:</span> {currentAccessToken?.status ?? "none"}</p>
                  </div>

                  {governancePolicy ? (
                    <div className="rounded-xl border border-blue-100 bg-blue-50 p-4 text-sm text-blue-900">
                      <p className="font-medium">Asset governance policy</p>
                      <p className="mt-1">Manual approval: {governancePolicy.requiresManualApproval === false ? "optional" : "required"}</p>
                      <p className="mt-1">Purpose binding: {governancePolicy.purposeBinding === false ? "optional" : "required"}</p>
                      <p className="mt-1">Agreement lifetime: {agreementTtlHours} hour(s)</p>
                      <p className="mt-1">Access token lifetime: {accessTokenTtlMinutes} minute(s)</p>
                      {governancePolicy.revocationMode ? <p className="mt-1">Revocation mode: {governancePolicy.revocationMode}</p> : null}
                    </div>
                  ) : (
                    <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                      No governance policy is attached to this asset yet. Create one before publishing or approving asset access.
                    </div>
                  )}

                  {isDataClient ? (
                    <div className="space-y-3">
                      {!hasActiveConnection && asset.federationId ? (
                        <p className="text-sm text-amber-700">
                          Connect your consumer connector first in{" "}
                          <Link href={`/federations/${asset.federationId}`} className="font-medium underline">
                            federation details
                          </Link>
                          .
                        </p>
                      ) : null}
                      {!hasActiveMembership && asset.federationId ? (
                        <p className="text-sm text-amber-700">
                          Join the federation first in{" "}
                          <Link href={`/federations/${asset.federationId}`} className="font-medium underline">
                            federation details
                          </Link>
                          .
                        </p>
                      ) : null}
                      <button
                        type="button"
                        onClick={requestAgreement}
                        disabled={!hasActiveConnection || !hasActiveMembership || !publishedOffer || currentAgreement?.status === "requested" || currentAgreement?.status === "finalized"}
                        className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                      >
                        {currentAgreement?.status === "finalized"
                          ? "Agreement ready"
                          : currentAgreement?.status === "requested"
                            ? "Agreement requested"
                            : "Request contract agreement"}
                      </button>
                    </div>
                  ) : null}
                </div>
              )}
            </div>

            <div className="space-y-6">
              {canManageAsset ? (
                <>
                  <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                    <h3 className="font-semibold text-gray-900 mb-3">Owner actions</h3>
                    <button
                      type="button"
                      onClick={publishContractOffer}
                      disabled={Boolean(publishedOffer)}
                      className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                    >
                      {publishedOffer ? "Standard offer published" : "Publish standard contract offer"}
                    </button>
                  </div>

                  <div>
                    <h3 className="font-semibold text-gray-900 mb-3">Asset access requests</h3>
                    {assetAgreements.length === 0 ? (
                      <p className="text-sm text-gray-500">No asset access requests for this asset yet.</p>
                    ) : (
                      <ul className="space-y-3">
                        {assetAgreements.map((agreement) => (
                          <li key={agreement.id} className="rounded-lg border border-gray-200 bg-gray-50 p-4">
                            <p className="font-medium text-gray-900">{agreement.requesterName ?? agreement.requesterEmail ?? agreement.requesterId}</p>
                            <p className="mt-1 text-xs text-gray-500">Status: {agreement.status}</p>
                            {agreement.status === "requested" ? (
                              <div className="mt-3 flex gap-2">
                                <button
                                  type="button"
                                  onClick={() => updateAgreementStatus(agreement, "finalized")}
                                  className="rounded-md bg-green-600 px-3 py-2 text-xs font-medium text-white hover:bg-green-700"
                                >
                                  Finalize
                                </button>
                                <button
                                  type="button"
                                  onClick={() => updateAgreementStatus(agreement, "rejected")}
                                  className="rounded-md bg-red-600 px-3 py-2 text-xs font-medium text-white hover:bg-red-700"
                                >
                                  Reject
                                </button>
                              </div>
                            ) : null}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>

                  <div>
                    <h3 className="font-semibold text-gray-900 mb-3">Issued credentials</h3>
                    {assetCredentials.length === 0 ? (
                      <p className="text-sm text-gray-500">No credentials issued for this asset.</p>
                    ) : (
                      <ul className="space-y-3">
                        {assetCredentials.map((credential) => (
                          <li key={credential.id} className="rounded-lg border border-gray-200 bg-gray-50 p-4">
                            <p className="font-medium text-gray-900">{credential.requesterEmail ?? credential.requesterId}</p>
                            <p className="mt-1 text-xs text-gray-500">
                              {credential.credentialType ?? "usage"} · {credential.status}
                              {credential.expiresAt && isTimestampStillValid(credential.expiresAt)
                                ? ` · valid until ${credential.expiresAt instanceof Date ? credential.expiresAt.toLocaleString() : credential.expiresAt.toDate?.().toLocaleString()}`
                                : ""}
                            </p>
                            {credential.status === "active" ? (
                              <div className="mt-3 flex gap-2">
                                <button
                                  type="button"
                                  onClick={() => updateCredentialStatus(credential, "revoked")}
                                  className="rounded-md bg-red-600 px-3 py-2 text-xs font-medium text-white hover:bg-red-700"
                                >
                                  Revoke credential
                                </button>
                              </div>
                            ) : null}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </>
              ) : (
                <p className="text-sm text-gray-500">Contract publication and approval actions are available to the owning Data Owner.</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Control buttons */}
      {!isEditing && (
        <div className="mb-4">
          {!authLoading && !user && (
            <div className="mb-4 rounded-md border-l-4 border-amber-500 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              Sign in before starting a query. Consumption attempts are now logged in Firestore for traceability.
            </div>
          )}

          <div className="flex gap-4 items-center">
          <button
            onClick={() => setShowCompliance(true)}
            disabled={isQuerying || !canConsumeAsset || authLoading || !user}
            className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 disabled:opacity-50"
          >
            Start Query
          </button>
          <button
            onClick={() => {
              setIsQuerying(false)
              setToastMsg("Query stopped successfully.")
              setToastError(false)
              setShowToast(true)
            }}
            disabled={!isQuerying}
            className="bg-gray-400 text-white px-4 py-2 rounded-md hover:bg-gray-500 disabled:opacity-50"
          >
            Stop Query
          </button>
          {showBrokerUrl && (
            <div className="ml-4 flex flex-col gap-2 text-sm">
              <span className="bg-gray-100 px-3 py-2 rounded border border-gray-300 text-gray-700 select-all">
                <b>Broker API:</b> {brokerUrl}
              </span>
              {currentAccessToken?.token ? (
                <span className="bg-blue-50 px-3 py-2 rounded border border-blue-200 text-blue-900 select-all">
                  <b>Access Token:</b> {currentAccessToken.token}
                </span>
              ) : null}
            </div>
          )}
          </div>
          {!canConsumeAsset ? (
            <p className="mt-3 text-sm text-amber-700">
              Consumption is blocked until the consumer has an active connector connection, an active federation membership, a finalized contract agreement, and an active usage credential.
            </p>
          ) : null}
        </div>
      )}

      {/* Real-Time Data */}
      <div className="bg-white rounded-lg shadow-sm border p-6">
        <h2 className="text-xl font-semibold mb-4">Real-Time Readings</h2>
        {dynamicRows.length === 0 && (
          <p className="text-gray-500 italic">No dynamic readings yet. Click Start Query.</p>
        )}
        {dynamicRows.length > 0 && dynamicColumns.length > 0 && (
          <>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm border">
                <thead>
                  <tr>
                    {dynamicColumns.map((key) => (
                      <th key={key} className="py-2 px-3 border-b bg-gray-50 text-gray-700 capitalize">{key.replace(/_/g, ' ')}</th>
    
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {pagedRows.map((row, idx) => (
                    <tr key={idx} className="border-b last:border-b-0">
                      {dynamicColumns.map((key) => (
                        <td key={key} className="py-2 px-3">{row[key] !== undefined ? String(row[key]) : "-"}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {/* Pagination controls */}
            <div className="flex justify-end gap-2 mt-2">
              <button
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0}
                className="px-3 py-1 rounded bg-gray-200 text-gray-700 hover:bg-gray-300 disabled:opacity-50"
              >
                Previous
              </button>
              <span className="px-2 py-1 text-gray-600">
                Page {page + 1} of {totalPages || 1}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                disabled={page >= totalPages - 1}
                className="px-3 py-1 rounded bg-gray-200 text-gray-700 hover:bg-gray-300 disabled:opacity-50"
              >
                Next
              </button>
            </div>
          </>
        )}
      </div>
    </div>
    </>
  )
}
