/**
 * GET /api/m2m/discover — UDDI: descoberta de ativos por serviço/capacidade.
 *
 * Um CPS registrado busca outro por capacidade, tipo, slug, federação ou texto.
 * Retorna SOMENTE metadados (nunca dados crus): o que existe, onde negociar e
 * como é a admissão. O consumo de dados exige negociar em /api/m2m/negotiate.
 *
 * Query params (todos opcionais, combináveis com AND):
 *   ?capability=temperature       casa capacidades / semânticas / chaves de métrica
 *   ?equipmentType=Furnace        casa assetType
 *   ?slug=oven                    equipmentSlug exato
 *   ?federationId=<id>            filtra por federação
 *   ?q=texto                      texto livre (nome, descrição, semântica)
 *   ?status=available             default: available; use "any" para todos
 *   ?exclude=<participantId|slug>  ignora o próprio solicitante
 *   ?limit=50
 */

import { NextRequest, NextResponse } from "next/server"
import { getDb } from "@/lib/m2m"

export const runtime = "nodejs"

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
}

export async function GET(request: NextRequest) {
  const db = getDb()
  if (!db) return NextResponse.json({ error: "Server credentials not configured" }, { status: 503, headers: CORS })

  const p = request.nextUrl.searchParams
  const capability = (p.get("capability") ?? "").toLowerCase().trim()
  const equipmentType = (p.get("equipmentType") ?? "").toLowerCase().trim()
  const slug = (p.get("slug") ?? "").trim()
  const federationId = (p.get("federationId") ?? "").trim()
  const q = (p.get("q") ?? "").toLowerCase().trim()
  const status = (p.get("status") ?? "available").toLowerCase().trim()
  const exclude = (p.get("exclude") ?? "").trim()
  const limit = Math.min(Number(p.get("limit") ?? "50") || 50, 200)

  const snap = await db.collection("assets").where("publishedInCatalog", "==", true).get()

  // mapa federação → admissionMode (para o consumidor saber como negociar)
  const fedSnap = await db.collection("federations").get()
  const fedInfo = new Map(fedSnap.docs.map(d => [d.id, {
    name: (d.data().name as string) ?? "",
    admissionMode: (d.data().admissionMode as string) ?? "self-service",
    catalogVisibility: (d.data().catalogVisibility as string) ?? "public",
  }]))

  type Doc = { id: string } & Record<string, unknown>
  const results = snap.docs
    .map((d): Doc => ({ id: d.id, ...(d.data() as Record<string, unknown>) }))
    .filter(a => {
      if (status !== "any" && String(a.status ?? "available").toLowerCase() !== status) return false
      if (slug && String(a.equipmentSlug ?? "") !== slug) return false
      if (federationId && String(a.federationId ?? "") !== federationId) return false
      if (equipmentType && !String(a.assetType ?? "").toLowerCase().includes(equipmentType)) return false
      if (exclude && (String(a.equipmentSlug ?? "") === exclude || String(a.ownerId ?? "") === exclude)) return false

      const caps = (a.capabilities as string[] | undefined) ?? []
      const sems = (a.capabilitySemantics as string[] | undefined) ?? []
      const blob = `${a.name ?? ""} ${a.description ?? ""} ${a.assetType ?? ""} ${a.irdi ?? ""} ${caps.join(" ")} ${sems.join(" ")}`.toLowerCase()

      if (capability && !blob.includes(capability)) return false
      if (q && !blob.includes(q)) return false

      // consórcio: catálogo restrito a membros — na descoberta M2M aberta,
      // ocultamos federações de catálogo "members" (só aparecem por convite).
      const fed = fedInfo.get(String(a.federationId ?? ""))
      if (fed && fed.catalogVisibility === "members" && !federationId) return false

      return true
    })
    .slice(0, limit)
    .map(a => {
      const fed = fedInfo.get(String(a.federationId ?? ""))
      return {
        assetId: a.id,
        name: a.name ?? "",
        equipmentSlug: a.equipmentSlug ?? "",
        equipmentType: a.assetType ?? "",
        description: a.description ?? "",
        capabilities: (a.capabilities as string[] | undefined) ?? [],
        irdi: a.irdi ?? "",
        aasId: a.aasId ?? "",
        status: a.status ?? "available",
        federation: {
          id: a.federationId ?? "",
          name: fed?.name ?? a.federationName ?? "",
          admissionMode: fed?.admissionMode ?? "self-service",
        },
        owner: a.ownerId ?? "",
        // plano de dados (só acessível APÓS negociar um token):
        sidecarEndpoint: a.sidecarEndpoint ?? "",
        dataUrl: a.sidecarEndpoint ? `${String(a.sidecarEndpoint).replace(/\/+$/, "")}/api/proxy/${a.equipmentSlug}/data` : "",
      }
    })

  return NextResponse.json({ count: results.length, query: { capability, equipmentType, slug, federationId, q, status }, results }, { headers: CORS })
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS })
}
