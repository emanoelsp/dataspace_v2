import { NextRequest, NextResponse } from "next/server"
import { getFirestore } from "firebase-admin/firestore"
import { getAdminApp } from "@/lib/firebase-admin"

export const runtime = "nodejs"

/**
 * GATEWAY INTERORGANIZACIONAL — ponte da camada Intra para a camada Inter.
 *
 * Expõe SELETIVAMENTE o catálogo interno para ecossistemas externos (B2B):
 *  - somente federações publicadas com catalogVisibility "public";
 *  - somente metadados e descrições semânticas (AAS id, ECLASS, capacidades);
 *  - NUNCA os endpoints de dados crus nem o sidecar — a soberania permanece
 *    na origem: o acesso externo exige negociação de contrato no Dataspace.
 *
 * Formato inspirado em DCAT/Gaia-X Self-Description (versão mínima da PoC).
 * Proteção: header X-Gateway-Key quando GATEWAY_API_KEY estiver definido.
 */

const GATEWAY_API_KEY = process.env.GATEWAY_API_KEY ?? ""

export async function GET(request: NextRequest) {
  if (GATEWAY_API_KEY) {
    const key = request.headers.get("x-gateway-key") ?? ""
    if (key !== GATEWAY_API_KEY) {
      return NextResponse.json({ error: "Invalid gateway key" }, { status: 401 })
    }
  }

  const app = getAdminApp()
  if (!app) {
    return NextResponse.json({ error: "Server credentials not configured" }, { status: 503 })
  }
  const db = getFirestore(app)

  type Doc = { id: string } & Record<string, unknown>
  const fedSnap = await db.collection("federations").get()
  const publicFederations: Doc[] = fedSnap.docs
    .map((d): Doc => ({ id: d.id, ...(d.data() as Record<string, unknown>) }))
    .filter(f =>
      f.publishedInCatalog !== false &&
      String(f.catalogVisibility ?? "public") === "public",
    )

  const fedIds = new Set(publicFederations.map(f => f.id))

  const assetSnap = await db.collection("assets").get()
  const datasets = assetSnap.docs
    .map((d): Doc => ({ id: d.id, ...(d.data() as Record<string, unknown>) }))
    .filter(a => a.publishedInCatalog !== false && fedIds.has(String(a.federationId ?? "")))
    .map(a => ({
      "@type": "dcat:Dataset",
      identifier: a.id,
      title: a.name ?? "",
      description: a.description ?? "",
      theme: {
        equipmentType: a.assetType ?? "",
        eclassIrdi: a.irdi ?? "",
        aasId: a.aasId ?? "",
        semanticModel: a.semanticModel ?? "AAS / IEC 63278",
      },
      capabilities: Array.isArray(a.capabilities) ? a.capabilities : [],
      federation: {
        id: a.federationId ?? "",
        name: a.federationName ?? "",
        admissionMode: publicFederations.find(f => f.id === a.federationId)?.admissionMode ?? "approval",
      },
      // Soberania: sem endpoint de dados. O consumo externo exige negociação.
      distribution: {
        "@type": "dcat:Distribution",
        accessService: "negotiation-required",
        negotiationEntrypoint: "/assets/" + a.id,
        note: "Data plane remains inside the factory perimeter (Sidecar PEP). Access requires federation admission and contract agreement.",
      },
    }))

  return NextResponse.json({
    "@context": { dcat: "http://www.w3.org/ns/dcat#" },
    "@type": "dcat:Catalog",
    title: "Intraorganizational Dataspace — selective external catalog",
    publisher: {
      role: "IntraDataspace Gateway",
      layer: "inter",
      trust: GATEWAY_API_KEY ? "shared-key (PoC); DAPS/SSI no roadmap" : "open (dev)",
    },
    generatedAt: new Date().toISOString(),
    federationsExposed: publicFederations.map(f => ({
      id: f.id,
      name: f.name ?? "",
      admissionMode: f.admissionMode ?? "approval",
      organization: f.organization ?? "",
    })),
    datasetCount: datasets.length,
    datasets,
  }, { headers: { "Cache-Control": "no-store" } })
}
