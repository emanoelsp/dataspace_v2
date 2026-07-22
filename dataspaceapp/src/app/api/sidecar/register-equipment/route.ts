import { NextResponse } from "next/server"
import { getAdminApp } from "@/lib/firebase-admin"
import { getAuth } from "firebase-admin/auth"
import { getFirestore } from "firebase-admin/firestore"

export const runtime = "nodejs"

const SIDECAR_ADMIN_SECRET = process.env.SIDECAR_ADMIN_SECRET ?? "admin"
const FIREBASE_API_KEY = process.env.NEXT_PUBLIC_FIREBASE_API_KEY ?? ""

type RegisterEquipmentBody = {
  idToken?: string
  sidecarUrl?: string
  id?: string
  name?: string
  baseUrl?: string
  eclassIrdi?: string
  connectorId?: string
  dataOwnerId?: string
  dataOwnerName?: string
}

/** Resolve o uid do chamador: admin SDK quando disponível, senão REST lookup. */
async function resolveUid(idToken: string): Promise<string | null> {
  const app = getAdminApp()
  if (app) {
    try {
      const decoded = await getAuth(app).verifyIdToken(idToken)
      return decoded.uid
    } catch {
      return null
    }
  }
  if (!FIREBASE_API_KEY) return null
  try {
    const res = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${FIREBASE_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken }),
        signal: AbortSignal.timeout(5000),
      },
    )
    if (!res.ok) return null
    const data = (await res.json()) as { users?: Array<{ localId?: string }> }
    return data.users?.[0]?.localId ?? null
  } catch {
    return null
  }
}

function normalizeSidecarUrl(value: string): string {
  try {
    const u = new URL(value.trim())
    return `${u.protocol}//${u.host}${u.pathname.replace(/\/+$/, "")}`.toLowerCase()
  } catch {
    return ""
  }
}

/**
 * Isolamento multi-tenant: o registro de um CPS só pode ser enviado a um
 * sidecar declarado em um conector DO PRÓPRIO usuário. Cada organização
 * aponta seu conector para o seu sidecar local; a nuvem nunca registra
 * equipamentos no sidecar de outra organização, e não há fallback global.
 */
async function allowedSidecarsFor(uid: string): Promise<string[]> {
  const app = getAdminApp()
  if (!app) return []
  const db = getFirestore(app)
  const snap = await db.collection("connectorProfiles").where("ownerId", "==", uid).get()
  return snap.docs
    .map(d => normalizeSidecarUrl((d.data().sidecarEndpoint as string | undefined) ?? ""))
    .filter(Boolean)
}

export async function POST(request: Request) {
  let body: RegisterEquipmentBody
  try {
    body = (await request.json()) as RegisterEquipmentBody
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const { idToken, sidecarUrl, ...equipment } = body

  if (!idToken) {
    return NextResponse.json({ error: "idToken is required" }, { status: 400 })
  }

  const uid = await resolveUid(idToken)
  if (!uid) {
    return NextResponse.json({ error: "Invalid or expired id token" }, { status: 401 })
  }

  if (!equipment.id || !equipment.name || !equipment.baseUrl) {
    return NextResponse.json({ error: "Required fields: id, name, baseUrl" }, { status: 400 })
  }

  const allowed = await allowedSidecarsFor(uid)
  if (allowed.length === 0) {
    return NextResponse.json(
      { error: "No sidecar endpoint configured. Set the Sidecar Endpoint in your connector profile before registering assets." },
      { status: 400 },
    )
  }

  const requested = sidecarUrl ? normalizeSidecarUrl(sidecarUrl) : ""
  const target = requested || allowed[0]

  if (!allowed.includes(target)) {
    return NextResponse.json(
      { error: "Sidecar not owned by caller. Assets can only be registered at a sidecar declared in your own connector profile." },
      { status: 403 },
    )
  }

  try {
    const res = await fetch(`${target}/api/equipment`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${SIDECAR_ADMIN_SECRET}`,
      },
      body: JSON.stringify({ ...equipment, dataOwnerId: equipment.dataOwnerId ?? uid }),
      signal: AbortSignal.timeout(5000),
    })

    if (!res.ok) {
      const text = await res.text()
      return NextResponse.json({ error: `Sidecar error: ${text}` }, { status: res.status })
    }

    const data = await res.json()
    return NextResponse.json({ ok: true, sidecarEquipment: data.equipment })
  } catch {
    return NextResponse.json({ error: "Sidecar unreachable", sidecarUrl: target }, { status: 502 })
  }
}
