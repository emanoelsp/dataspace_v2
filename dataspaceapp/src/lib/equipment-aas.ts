/**
 * AAS (Asset Administration Shell) utilities aligned with IDTA-01001-3-0 and ECLASS standard.
 * Used by the equipment simulation sidecar routes.
 */

// ─── Core AAS types ──────────────────────────────────────────────────────────

export type ModelingKind = "Instance" | "Template"
export type AssetKind = "Instance" | "Type"
export type ValueType =
  | "xs:string"
  | "xs:int"
  | "xs:float"
  | "xs:double"
  | "xs:boolean"
  | "xs:dateTime"
  | "xs:long"

export interface LangStringSet {
  language: string
  text: string
}

export interface Reference {
  type: "ExternalReference" | "ModelReference"
  keys: Array<{ type: string; value: string }>
}

export interface Extension {
  name: string
  value?: string
  valueType?: ValueType
}

export interface SubmodelElement {
  idShort: string
  modelType: string
  semanticId?: Reference
  description?: LangStringSet[]
  category?: string
  kind?: ModelingKind
  extensions?: Extension[]
  // Property
  valueType?: ValueType
  value?: unknown
  // SubmodelElementCollection / SubmodelElementList
  submodelElements?: SubmodelElement[]
  value_?: SubmodelElement[] // for SubmodelElementList
  // RangeType
  min?: unknown
  max?: unknown
}

export interface Submodel {
  id: string
  idShort: string
  modelType: "Submodel"
  kind: ModelingKind
  semanticId?: Reference
  description?: LangStringSet[]
  submodelElements: SubmodelElement[]
}

export interface AssetAdministrationShell {
  id: string
  idShort: string
  modelType: "AssetAdministrationShell"
  description?: LangStringSet[]
  assetInformation: {
    assetKind: AssetKind
    globalAssetId: string
    specificAssetIds?: Array<{ name: string; value: string; semanticId?: Reference }>
  }
  submodels: Reference[]
}

export interface AASEnvironment {
  assetAdministrationShells: AssetAdministrationShell[]
  submodels: Submodel[]
}

// ─── Reference builders ───────────────────────────────────────────────────────

export function extRef(value: string): Reference {
  return { type: "ExternalReference", keys: [{ type: "GlobalReference", value }] }
}

export function modelRef(type: string, value: string): Reference {
  return { type: "ModelReference", keys: [{ type, value }] }
}

// ─── SubmodelElement builders ─────────────────────────────────────────────────

export function prop(
  idShort: string,
  valueType: ValueType,
  value: unknown,
  semanticIrdi?: string,
  descPt?: string,
): SubmodelElement {
  return {
    idShort,
    modelType: "Property",
    valueType,
    value,
    ...(semanticIrdi ? { semanticId: extRef(semanticIrdi) } : {}),
    ...(descPt
      ? { description: [{ language: "pt", text: descPt }, { language: "en", text: descPt }] }
      : {}),
  }
}

export function collection(
  idShort: string,
  elements: SubmodelElement[],
  semanticIrdi?: string,
): SubmodelElement {
  return {
    idShort,
    modelType: "SubmodelElementCollection",
    ...(semanticIrdi ? { semanticId: extRef(semanticIrdi) } : {}),
    submodelElements: elements,
  }
}

export function mlProp(
  idShort: string,
  values: LangStringSet[],
  semanticIrdi?: string,
): SubmodelElement {
  return {
    idShort,
    modelType: "MultiLanguageProperty",
    value: values,
    ...(semanticIrdi ? { semanticId: extRef(semanticIrdi) } : {}),
  }
}

// ─── Realistic simulation helpers ─────────────────────────────────────────────

/** Sine-based oscillation around a base value — simulates cyclic process data */
export function sineOscillation(
  base: number,
  amplitude: number,
  periodMs: number,
  phaseRad: number = 0,
): number {
  return base + amplitude * Math.sin((2 * Math.PI * Date.now()) / periodMs + phaseRad)
}

/** Small random walk from a center value — simulates sensor noise */
export function noisyValue(center: number, noiseRange: number): number {
  return center + (Math.random() - 0.5) * 2 * noiseRange
}

export function round(value: number, decimals: number = 2): number {
  const factor = Math.pow(10, decimals)
  return Math.round(value * factor) / factor
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

/** ISO 8601 timestamp for current moment */
export function nowIso(): string {
  return new Date().toISOString()
}

// ─── Token validation helper (used by sidecar routes) ─────────────────────────

export interface TokenValidationResult {
  valid: boolean
  reason?: string
  tokenDoc?: Record<string, unknown>
}

/**
 * Validates an accessToken against Firestore.
 * Returns valid=true only when status=active and not expired.
 * Pass token="demo" to skip validation (development only).
 */
export async function validateAccessToken(
  rawToken: string | null,
): Promise<TokenValidationResult> {
  if (!rawToken) {
    return { valid: false, reason: "Missing Authorization header. Use Bearer <token>." }
  }

  const token = rawToken.replace(/^Bearer\s+/i, "").trim()

  // Demo mode — bypass auth for development/demo purposes
  if (token === "demo") {
    return { valid: true }
  }

  if (!token.startsWith("acc_")) {
    return { valid: false, reason: "Invalid token format." }
  }

  try {
    const { getAdminApp } = await import("@/lib/firebase-admin")
    const adminApp = getAdminApp()
    if (!adminApp) {
      // Admin not configured — allow access with a warning (dev mode)
      console.warn("[equipment-sidecar] Firebase Admin not configured, skipping token validation.")
      return { valid: true, reason: "admin-not-configured" }
    }

    const { getFirestore } = await import("firebase-admin/firestore")
    const db = getFirestore(adminApp)
    const snap = await db
      .collection("accessTokens")
      .where("token", "==", token)
      .limit(1)
      .get()

    if (snap.empty) {
      return { valid: false, reason: "Token not found." }
    }

    const doc = snap.docs[0].data() as Record<string, unknown>

    if (doc.status !== "active") {
      return { valid: false, reason: `Token is ${doc.status}.` }
    }

    if (doc.expiresAt) {
      const expiresAt =
        doc.expiresAt instanceof Date
          ? doc.expiresAt
          : new Date((doc.expiresAt as { toDate?: () => Date }).toDate?.() ?? doc.expiresAt as string)

      if (expiresAt < new Date()) {
        return { valid: false, reason: "Token has expired." }
      }
    }

    return { valid: true, tokenDoc: doc }
  } catch (err) {
    console.error("[equipment-sidecar] Token validation error:", err)
    return { valid: false, reason: "Token validation failed." }
  }
}

// ─── Nameplate submodel (IDTA 02006-2-0) — shared across all equipment ────────

export function buildNameplateSubmodel(id: string, data: {
  manufacturerName: string
  manufacturerProductDesignation: string
  serialNumber: string
  yearOfConstruction: string
  orderCode: string
  assetId: string
  countryOfOrigin?: string
}): Submodel {
  return {
    id: `${id}:Nameplate`,
    idShort: "Nameplate",
    modelType: "Submodel",
    kind: "Instance",
    semanticId: extRef("https://admin-shell.io/zvei/nameplate/2/0/Nameplate"),
    description: [
      { language: "pt", text: "Placa de identificação do ativo" },
      { language: "en", text: "Asset nameplate" },
    ],
    submodelElements: [
      mlProp(
        "ManufacturerName",
        [{ language: "pt", text: data.manufacturerName }, { language: "en", text: data.manufacturerName }],
        "0173-1#02-AAO677#002",
      ),
      mlProp(
        "ManufacturerProductDesignation",
        [{ language: "pt", text: data.manufacturerProductDesignation }, { language: "en", text: data.manufacturerProductDesignation }],
        "0173-1#02-AAW338#001",
      ),
      prop("SerialNumber", "xs:string", data.serialNumber, "0173-1#02-AAM556#002", "Número de série"),
      prop("YearOfConstruction", "xs:string", data.yearOfConstruction, "0173-1#02-AAP906#001", "Ano de fabricação"),
      prop("OrderCodeOfManufacturer", "xs:string", data.orderCode, "0173-1#02-AAO227#002", "Código de pedido"),
      prop("CountryOfOrigin", "xs:string", data.countryOfOrigin ?? "BR", "0173-1#02-AAO259#004", "País de origem"),
    ],
  }
}
