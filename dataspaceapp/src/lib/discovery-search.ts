import { collection, getDocs } from "firebase/firestore"
import { db } from "@/lib/firebase"
import { isPublishedInCatalog } from "@/lib/catalog-visibility"
import { mapLegacyFederationType, type AdmissionMode, type AssetKind, type CatalogVisibility, type ExchangeMode } from "@/lib/intra-dataspace"

/** Federation document fields used for intra-organizational discovery (catalog / domains). */
export type FederationRecord = {
  id: string
  name: string
  description: string
  organization: string
  publishedInCatalog?: boolean
  federationType?: string
  catalogVisibility?: CatalogVisibility
  admissionMode?: AdmissionMode
  dataDomains?: string
  mainDomain?: string
  contactEmail?: string
  website?: string
  dataLaw?: string
  termsAccepted?: boolean
  traceabilityAccepted?: boolean
  createdAt?: Date
}

/** Asset metadata (RF05): type, purpose, endpoint, format, semantic id. */
export type AssetRecord = {
  id: string
  name: string
  description: string
  federationId: string
  federationName?: string
  publishedInCatalog?: boolean
  assetType?: string
  assetKind?: AssetKind
  purpose?: string
  semanticId?: string
  aasId?: string
  irdi?: string
  semanticModel?: string
  apiEndpoint?: string
  dataFormat?: string
  exchangeMode?: ExchangeMode
  accessType?: string
  createdAt?: Date
}

export async function fetchAllFederations(): Promise<FederationRecord[]> {
  const snap = await getDocs(collection(db, "federations"))
  return snap.docs
    .map((d) => {
      const x = d.data()
      const legacyAccessModel = mapLegacyFederationType(x.federationType != null ? String(x.federationType) : undefined)
      return {
        id: d.id,
        name: String(x.name ?? ""),
        description: String(x.description ?? ""),
        organization: String(x.organization ?? ""),
        publishedInCatalog: isPublishedInCatalog(x.publishedInCatalog),
        federationType: x.federationType != null ? String(x.federationType) : undefined,
        catalogVisibility:
          x.catalogVisibility != null ? (String(x.catalogVisibility) as CatalogVisibility) : legacyAccessModel.catalogVisibility,
        admissionMode:
          x.admissionMode != null ? (String(x.admissionMode) as AdmissionMode) : legacyAccessModel.admissionMode,
        dataDomains: x.dataDomains != null ? String(x.dataDomains) : undefined,
        mainDomain: x.mainDomain != null ? String(x.mainDomain) : undefined,
        contactEmail: x.contactEmail != null ? String(x.contactEmail) : undefined,
        website: x.website != null ? String(x.website) : undefined,
        dataLaw: x.dataLaw != null ? String(x.dataLaw) : undefined,
        termsAccepted: typeof x.termsAccepted === "boolean" ? x.termsAccepted : undefined,
        traceabilityAccepted: typeof x.traceabilityAccepted === "boolean" ? x.traceabilityAccepted : undefined,
        createdAt: x.createdAt?.toDate?.(),
      }
    })
    .filter((f) => f.publishedInCatalog)
}

export async function fetchAllAssets(): Promise<AssetRecord[]> {
  const snap = await getDocs(collection(db, "assets"))
  return snap.docs
    .map((d) => {
      const x = d.data()
      return {
        id: d.id,
        name: String(x.name ?? ""),
        description: String(x.description ?? ""),
        federationId: String(x.federationId ?? ""),
        federationName: x.federationName != null ? String(x.federationName) : undefined,
        publishedInCatalog: isPublishedInCatalog(x.publishedInCatalog),
        assetType: x.assetType != null ? String(x.assetType) : undefined,
        assetKind: x.assetKind != null ? (String(x.assetKind) as AssetKind) : undefined,
        purpose: x.purpose != null ? String(x.purpose) : undefined,
        semanticId: x.semanticId != null ? String(x.semanticId) : undefined,
        aasId: x.aasId != null ? String(x.aasId) : undefined,
        irdi: x.irdi != null ? String(x.irdi) : undefined,
        semanticModel: x.semanticModel != null ? String(x.semanticModel) : undefined,
        apiEndpoint: x.apiEndpoint != null ? String(x.apiEndpoint) : undefined,
        dataFormat: x.dataFormat != null ? String(x.dataFormat) : undefined,
        exchangeMode: x.exchangeMode != null ? (String(x.exchangeMode) as ExchangeMode) : undefined,
        accessType: x.accessType != null ? String(x.accessType) : undefined,
        createdAt: x.createdAt?.toDate?.(),
      }
    })
    .filter((a) => a.publishedInCatalog)
}

export function textIncludes(haystack: string, needle: string) {
  if (!needle.trim()) return true
  return haystack.toLowerCase().includes(needle.trim().toLowerCase())
}

/** Typical process / shop-floor variables for “search by data” (intra-organizational brownfield). */
export const PROCESS_DATA_KEYWORDS: { id: string; label: string; synonyms: string[] }[] = [
  { id: "temperature", label: "Temperature", synonyms: ["temperature", "temp", "thermal"] },
  { id: "pressure", label: "Pressure", synonyms: ["pressure", "bar", "psi", "pascal"] },
  { id: "speed", label: "Speed / velocity", synonyms: ["speed", "velocity", "rpm", "feed rate"] },
  { id: "vibration", label: "Vibration", synonyms: ["vibration", "acceleration"] },
  { id: "torque", label: "Torque / force", synonyms: ["torque", "force", "load"] },
  { id: "flow", label: "Flow", synonyms: ["flow", "throughput"] },
  { id: "energy", label: "Energy / power", synonyms: ["energy", "power", "kwh", "consumption"] },
  { id: "humidity", label: "Humidity", synonyms: ["humidity", "moisture"] },
  { id: "position", label: "Position / geometry", synonyms: ["position", "coordinate", "dimension"] },
]

/** Operational functions aligned with asset purpose field (monitoring, maintenance, etc.). */
export const OPERATIONAL_FUNCTIONS = [
  "Monitoring",
  "Predictive maintenance",
  "Quality & SPC",
  "Traceability",
  "Optimization",
  "Scheduling",
  "Safety",
  "Energy efficiency",
] as const
