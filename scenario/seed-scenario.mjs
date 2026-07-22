#!/usr/bin/env node
/**
 * Seed do CENÁRIO plant1 — cria as 3 federações, os ativos dos 10 CPS e as
 * políticas de governança no Firestore, conforme a tabela do cenário
 * (api-equipment/fleet/README.md).
 *
 * Requisitos:
 *   - FIREBASE_SERVICE_ACCOUNT_JSON no ambiente (o mesmo do dataspaceapp)
 *   - executar de dentro de dataspaceapp/ (usa firebase-admin de lá):
 *       cd dataspaceapp && node ../scenario/seed-scenario.mjs --owner-uid <UID>
 *
 * Flags:
 *   --owner-uid <uid>      (obrigatório) dono dos ativos/federações
 *   --cps-host <host>      host dos CPS (default: localhost — trocar pelo IP
 *                          de cada máquina editando PORTS abaixo, ou usar
 *                          --map "oven=http://192.168.0.21:3004,cnc=...")
 *   --sidecar <url>        sidecar dos ativos (default http://localhost:3100)
 *   --dry                  só mostra o que faria
 */

import { createRequire } from "module"
import path from "path"
import { fileURLToPath } from "url"

const require = createRequire(
  path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "dataspaceapp", "package.json"),
)
const { initializeApp, cert } = require("firebase-admin/app")
const { getFirestore, FieldValue } = require("firebase-admin/firestore")

const args = process.argv.slice(2)
const argValue = (f, d) => { const i = args.indexOf(f); return i >= 0 && args[i + 1] ? args[i + 1] : d }
const OWNER = argValue("--owner-uid", "")
const HOST = argValue("--cps-host", "localhost")
const SIDECAR = argValue("--sidecar", "http://localhost:3100")
const DRY = args.includes("--dry")
const MAP = Object.fromEntries((argValue("--map", "") || "").split(",").filter(Boolean).map(kv => kv.split("=")))

if (!OWNER) { console.error("Uso: node seed-scenario.mjs --owner-uid <UID> [--cps-host IP] [--map oven=http://ip:3004,...]"); process.exit(1) }

const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON
if (!raw) { console.error("Defina FIREBASE_SERVICE_ACCOUNT_JSON"); process.exit(1) }
initializeApp({ credential: cert(JSON.parse(raw)) })
const db = getFirestore()

// ── definição do cenário ────────────────────────────────────────────────────
const PORTS = { cnc: 3001, press: 3002, robot: 3003, oven: 3004, conveyor: 3005, agv: 3006, paint: 3007, quality: 3008, compressor: 3009, warehouse: 3010 }
const baseUrlOf = id => MAP[id] ?? `http://${HOST}:${PORTS[id]}`

const FEDERATIONS = [
  { key: "plant1-utilities",    name: "plant1 — Utilities (Aberta)",        federationType: "Open",       catalogVisibility: "public",  admissionMode: "self-service",
    description: "Utilidades da planta: qualquer participante assina o contrato e consome." },
  { key: "plant1-forming-cell", name: "plant1 — Forming Cell (Consórcio)",  federationType: "Consortium", catalogVisibility: "members", admissionMode: "invite-only",
    description: "Célula de conformação: entrada somente por convite do dono." },
  { key: "plant1-process-data", name: "plant1 — Process Data (Privada)",    federationType: "Private",    catalogVisibility: "public",  admissionMode: "approval",
    description: "Dados sensíveis de processo: solicitação + aprovação do dono." },
]

// ativo → federação (conforme a tabela das 5 trocas)
const ASSETS = [
  { slug: "oven",       name: "Heat Treatment Furnace",         type: "Furnace",          fed: "plant1-process-data" },
  { slug: "quality",    name: "Dimensional Inspection Station", type: "InspectionStation",fed: "plant1-process-data" },
  { slug: "press",      name: "Hydraulic Press",                type: "Press",            fed: "plant1-forming-cell" },
  { slug: "cnc",        name: "CNC Machining Center",           type: "CNC",              fed: "plant1-forming-cell" },
  { slug: "compressor", name: "Central Air Compressor",         type: "Compressor",       fed: "plant1-utilities" },
  { slug: "warehouse",  name: "Automated Storage (AS/RS)",      type: "ASRS",             fed: "plant1-utilities" },
  { slug: "agv",        name: "AGV Material Handler",           type: "AGV",              fed: "plant1-utilities" },
  { slug: "conveyor",   name: "Central Conveyor Line",          type: "Conveyor",         fed: "plant1-utilities" },
  { slug: "paint",      name: "Paint Booth Line",               type: "PaintBooth",       fed: "plant1-utilities" },
  { slug: "robot",      name: "Industrial Welding Robot",       type: "Robot",            fed: "plant1-forming-cell" },
]

const GOVERNANCE = [
  { fedKey: "plant1-process-data", assetSlugs: ["oven", "quality"],
    accessTokenTtlMinutes: 15, agreementTtlHours: 8,  requiresManualApproval: true,  purposeBinding: true,  revocationMode: "owner-manual",
    policies: "Dados de processo sensíveis; uso vinculado à finalidade declarada no contrato." },
  { fedKey: "plant1-utilities", assetSlugs: ["compressor", "warehouse", "agv", "conveyor", "paint"],
    accessTokenTtlMinutes: 60, agreementTtlHours: 24, requiresManualApproval: false, purposeBinding: false, revocationMode: "ttl-expiry",
    policies: "" },
  { fedKey: "plant1-forming-cell", assetSlugs: ["press", "cnc", "robot"],
    accessTokenTtlMinutes: 30, agreementTtlHours: 12, requiresManualApproval: false, purposeBinding: true,  revocationMode: "owner-or-admin",
    policies: "Célula de conformação: membros por convite; finalidade vinculada." },
]

// ── util: colheita de capacidades direto do CPS (mesma lógica da UI) ────────
async function harvest(baseUrl) {
  const out = { capabilities: [], capabilitySemantics: [], aasId: "", irdi: "" }
  try {
    const h = { headers: { Authorization: "Bearer demo" } }
    const [dRes, aRes] = await Promise.all([
      fetch(`${baseUrl}/api/data`, h), fetch(`${baseUrl}/api/aas?submodel=OperationalData`, h),
    ])
    if (dRes.ok) {
      const d = await dRes.json()
      out.capabilities = Object.keys(d?.metrics ?? {}).slice(0, 64)
      if (typeof d?.eclassIrdi === "string") out.irdi = d.eclassIrdi
    }
    if (aRes.ok) {
      const env = await aRes.json()
      out.aasId = env?.assetAdministrationShells?.[0]?.id ?? ""
      const sems = []
      const walk = els => { for (const el of els ?? []) { const v = el?.semanticId?.keys?.[0]?.value; if (v) sems.push(v); walk(el?.submodelElements) } }
      for (const sm of env?.submodels ?? []) walk(sm?.submodelElements)
      out.capabilitySemantics = [...new Set(sems)].slice(0, 96)
    }
  } catch { /* CPS offline: segue sem capacidades */ }
  return out
}

// ── execução ────────────────────────────────────────────────────────────────
const connectorSnap = await db.collection("connectorProfiles")
  .where("ownerId", "==", OWNER).get()
const connector = connectorSnap.docs.map(d => ({ id: d.id, ...d.data() }))
  .sort((a, b) => Number(b.isDefault) - Number(a.isDefault))[0]
if (!connector) { console.error("Nenhum connectorProfile para esse uid — crie o conector primeiro (com sidecarEndpoint)."); process.exit(1) }
const sidecarEndpoint = connector.sidecarEndpoint || SIDECAR
console.log(`Conector: ${connector.connectorName ?? connector.id} | sidecar: ${sidecarEndpoint}`)

const fedIds = {}
for (const f of FEDERATIONS) {
  const existing = await db.collection("federations").where("name", "==", f.name).limit(1).get()
  if (!existing.empty) { fedIds[f.key] = existing.docs[0].id; console.log(`= federação existente: ${f.name}`); continue }
  if (DRY) { console.log(`+ federação: ${f.name}`); fedIds[f.key] = `dry-${f.key}`; continue }
  const ref = await db.collection("federations").add({
    name: f.name, description: f.description, organization: connector.organizationLegalName ?? "",
    connectorProfileId: connector.id, connectorName: connector.connectorName ?? "",
    participantId: connector.participantId ?? "", sidecarEndpoint,
    sidecarProtocol: "http", connectorDspBaseUrl: "", connectorManagementBaseUrl: "",
    federatedCatalogUrl: "", connectorScopeType: "", connectorScopeLabel: "",
    federationType: f.federationType, catalogVisibility: f.catalogVisibility, admissionMode: f.admissionMode,
    dataDomains: "", mainDomain: "", contactEmail: "", website: "",
    publishedInCatalog: true, status: "active",
    createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
    ownerId: OWNER, ownerName: connector.organizationLegalName ?? "",
  })
  fedIds[f.key] = ref.id
  console.log(`+ federação criada: ${f.name} (${ref.id})`)
}

const assetIds = {}
for (const a of ASSETS) {
  const existing = await db.collection("assets").where("equipmentSlug", "==", a.slug).limit(1).get()
  if (!existing.empty) { assetIds[a.slug] = existing.docs[0].id; console.log(`= ativo existente: ${a.slug}`); continue }
  const baseUrl = baseUrlOf(a.slug)
  const caps = DRY ? { capabilities: [], capabilitySemantics: [], aasId: "", irdi: "" } : await harvest(baseUrl)
  if (DRY) { console.log(`+ ativo: ${a.slug} → ${baseUrl}`); continue }
  const ref = await db.collection("assets").add({
    name: a.name, equipmentSlug: a.slug, description: `${a.name} — plant1 (${a.type})`,
    federationId: fedIds[a.fed], federationName: FEDERATIONS.find(f => f.key === a.fed).name,
    connectorProfileId: connector.id, connectorName: connector.connectorName ?? "",
    connectorParticipantId: connector.participantId ?? "",
    connectorDspBaseUrl: "", connectorManagementBaseUrl: "", federatedCatalogUrl: "",
    connectorScopeType: "", connectorScopeLabel: "", sidecarProtocol: "http", sidecarEndpoint,
    assetType: a.type, assetKind: "data", purpose: "", semanticId: "",
    aasId: caps.aasId, irdi: caps.irdi, semanticModel: "AAS / IEC 63278",
    apiEndpoint: `${baseUrl}/api/data`, dataFormat: "JSON", exchangeMode: "stream", accessType: "Federation",
    capabilities: caps.capabilities, capabilitySemantics: caps.capabilitySemantics,
    publishedInCatalog: true, status: "active",
    createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
    ownerId: OWNER, ownerName: connector.organizationLegalName ?? "",
  })
  assetIds[a.slug] = ref.id
  console.log(`+ ativo criado: ${a.slug} (${ref.id}) caps=${caps.capabilities.length}`)

  // registra o CPS no sidecar (mesmo efeito do fluxo da UI)
  try {
    const res = await fetch(`${sidecarEndpoint}/api/equipment`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.SIDECAR_ADMIN_SECRET ?? "admin"}` },
      body: JSON.stringify({ id: a.slug, name: a.name, baseUrl, eclassIrdi: caps.irdi || undefined, dataOwnerId: OWNER }),
    })
    console.log(`  sidecar: ${res.ok ? "registrado" : `HTTP ${res.status}`}`)
  } catch { console.log("  sidecar: inacessível (registre depois)") }
}

for (const g of GOVERNANCE) {
  const ids = g.assetSlugs.map(sl => assetIds[sl]).filter(Boolean)
  if (ids.length === 0 || DRY) { console.log(`~ governança ${g.fedKey}: ${DRY ? "dry" : "sem ativos novos"}`); continue }
  await db.collection("governance").add({
    federation: fedIds[g.fedKey], assets: ids,
    roles: "", policies: g.policies, purposeBinding: g.purposeBinding,
    requiresManualApproval: g.requiresManualApproval,
    audit: "auto: sidecar accessLogs + accessTokens", usagePeriods: "",
    agreementTtlHours: g.agreementTtlHours, accessTokenTtlMinutes: g.accessTokenTtlMinutes,
    revocation: "", revocationMode: g.revocationMode,
    createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
    ownerId: OWNER,
  })
  console.log(`+ governança: ${g.fedKey} (${ids.length} ativos, TTL ${g.accessTokenTtlMinutes}min)`)
}

console.log("\nSeed concluído.")
