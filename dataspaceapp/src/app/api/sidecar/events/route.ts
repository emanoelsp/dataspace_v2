import { NextResponse } from "next/server"
import { FieldValue, getFirestore } from "firebase-admin/firestore"
import { getAdminApp } from "@/lib/firebase-admin"

export const runtime = "nodejs"

const SIDECAR_ADMIN_SECRET = process.env.SIDECAR_ADMIN_SECRET ?? "admin"

type SidecarEvent = {
  tokenId?: string
  token?: string
  federationId?: string
  assetId?: string
  assetName?: string
  equipmentType?: string
  dataClientId?: string
  dataClientName?: string
  dataOwnerId?: string
  dataOwnerName?: string
  endpoint?: string
  method?: string
  statusCode?: number
  responseTimeMs?: number
  success?: boolean
  error?: string
  timestamp?: string
}

function validateSidecarSecret(authHeader: string | null): boolean {
  const secret = authHeader?.replace(/^Bearer\s+/i, "").trim()
  return secret === SIDECAR_ADMIN_SECRET
}

export async function POST(request: Request) {
  if (!validateSidecarSecret(request.headers.get("authorization"))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const app = getAdminApp()
  if (!app) {
    return NextResponse.json({ ok: true, stored: false })
  }

  let event: SidecarEvent
  try {
    event = (await request.json()) as SidecarEvent
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  try {
    const db = getFirestore(app)
    await db.collection("accessLogs").add({
      source: "sidecar-proxy",
      tokenId: event.tokenId ?? "",
      federationId: event.federationId ?? "",
      assetId: event.assetId ?? "",
      assetName: event.assetName ?? "",
      equipmentType: event.equipmentType ?? "",
      dataClientId: event.dataClientId ?? "",
      dataClientName: event.dataClientName ?? "",
      dataOwnerId: event.dataOwnerId ?? "",
      dataOwnerName: event.dataOwnerName ?? "",
      endpoint: event.endpoint ?? "",
      method: event.method ?? "GET",
      statusCode: event.statusCode ?? 0,
      responseTimeMs: event.responseTimeMs ?? 0,
      success: event.success ?? false,
      error: event.error ?? null,
      proxyTimestamp: event.timestamp ?? new Date().toISOString(),
      createdAt: FieldValue.serverTimestamp(),
    })
    return NextResponse.json({ ok: true, stored: true })
  } catch {
    return NextResponse.json({ ok: true, stored: false })
  }
}
