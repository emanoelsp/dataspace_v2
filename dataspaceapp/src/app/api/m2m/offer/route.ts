/**
 * GET /api/m2m/offer — oferta de contrato de um ativo, ANTES de negociar.
 *
 * Mostra as diretrizes que o consumidor aceita ao chamar /api/m2m/negotiate:
 * finalidade, aprovação, TTL do acordo e do token, revogação, condições e os
 * recursos disponíveis. Só metadados — nenhum dado do CPS.
 *
 * Query: ?assetId=<id>  ou  ?slug=<equipmentSlug>
 */

import { NextRequest, NextResponse } from "next/server"
import { getDb, governanceSnapshotForAsset, contractOfferPayload, resourceUrls, type M2MResource } from "@/lib/m2m"

export const runtime = "nodejs"

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
}

export async function GET(request: NextRequest) {
  const assetIdParam = (request.nextUrl.searchParams.get("assetId") ?? "").trim()
  const slugParam = (request.nextUrl.searchParams.get("slug") ?? "").trim()
  if (!assetIdParam && !slugParam) {
    return NextResponse.json({ error: "Required: assetId or slug" }, { status: 400, headers: CORS })
  }

  const db = getDb()
  if (!db) return NextResponse.json({ error: "Server credentials not configured" }, { status: 503, headers: CORS })

  let assetDoc
  if (assetIdParam) {
    const d = await db.collection("assets").doc(assetIdParam).get()
    assetDoc = d.exists ? d : null
  } else {
    const q = await db.collection("assets").where("equipmentSlug", "==", slugParam).limit(1).get()
    assetDoc = q.empty ? null : q.docs[0]
  }
  if (!assetDoc) return NextResponse.json({ error: "Asset not found" }, { status: 404, headers: CORS })

  const asset = assetDoc.data()!
  const assetId = assetDoc.id
  const slug = String(asset.equipmentSlug ?? "")
  const sidecarEndpoint = String(asset.sidecarEndpoint ?? "")
  const resources = (asset.resources as M2MResource[] | undefined) ?? []

  const [gov, offerSnap, fedDoc] = await Promise.all([
    governanceSnapshotForAsset(db, assetId),
    db.collection("contractOffers").where("assetId", "==", assetId).where("status", "==", "published").limit(1).get(),
    asset.federationId ? db.collection("federations").doc(String(asset.federationId)).get() : Promise.resolve(null),
  ])
  const offer = offerSnap.empty ? null : offerSnap.docs[0]
  const urls = sidecarEndpoint ? resourceUrls(sidecarEndpoint, slug, resources) : {}

  return NextResponse.json({
    asset: {
      assetId, name: asset.name ?? "", equipmentSlug: slug,
      equipmentType: asset.assetType ?? "", owner: asset.ownerId ?? "", ownerName: asset.ownerName ?? "",
    },
    federation: {
      id: asset.federationId ?? "",
      name: fedDoc?.data()?.name ?? asset.federationName ?? "",
      admissionMode: fedDoc?.data()?.admissionMode ?? "self-service",
    },
    offer: offer
      ? { id: offer.id, version: offer.data()?.version ?? 1, status: "published" }
      : null,
    directives: (offer?.data()?.policyPayload as Record<string, unknown> | undefined) ?? contractOfferPayload(asset, gov),
    resources: resources.map(r => ({ id: r.id, name: r.name, description: r.description ?? "", url: urls[r.id] ?? "" })),
    negotiation: gov?.requiresManualApproval ? "manual-approval" : "automatic",
    howToSign: {
      method: "POST", path: "/api/m2m/negotiate",
      body: {
        consumerParticipantId: "<your participantId>",
        targetAssetId: assetId,
        ...(gov?.purposeBinding ? { purpose: "<required by purpose binding>" } : {}),
        ...(resources.length ? { resources: resources.map(r => r.id) } : {}),
      },
    },
  }, { headers: CORS })
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS })
}
