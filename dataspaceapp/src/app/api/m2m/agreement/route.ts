/**
 * GET /api/m2m/agreement — validação de um contrato negociado.
 *
 * Devolve o estado do acordo (assinaturas, validade, finalidade, recursos
 * liberados), a credencial de uso e os tokens emitidos — sem o valor dos
 * tokens. `effectiveStatus` resume se o contrato está utilizável agora.
 *
 * Query: ?contractRef=<contractAgreements id>   (o `contractRef` do negotiate)
 */

import { NextRequest, NextResponse } from "next/server"
import { getDb, apiKeyError } from "@/lib/m2m"

export const runtime = "nodejs"

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-M2M-Key",
}

function iso(value: unknown): string | null {
  if (value instanceof Date) return value.toISOString()
  const toDate = (value as { toDate?: () => Date } | null)?.toDate
  return typeof toDate === "function" ? toDate.call(value).toISOString() : null
}

export async function GET(request: NextRequest) {
  const keyErr = apiKeyError(request)
  if (keyErr) return NextResponse.json({ error: keyErr }, { status: 401, headers: CORS })

  const contractRef = (request.nextUrl.searchParams.get("contractRef") ?? "").trim()
  if (!contractRef) return NextResponse.json({ error: "Required: contractRef" }, { status: 400, headers: CORS })

  const db = getDb()
  if (!db) return NextResponse.json({ error: "Server credentials not configured" }, { status: 503, headers: CORS })

  const agreementDoc = await db.collection("contractAgreements").doc(contractRef).get()
  if (!agreementDoc.exists) return NextResponse.json({ error: "Agreement not found" }, { status: 404, headers: CORS })
  const a = agreementDoc.data()!

  const [credSnap, tokenSnap] = await Promise.all([
    db.collection("credentialGrants").where("agreementId", "==", contractRef).get(),
    db.collection("accessTokens").where("contractAgreementId", "==", contractRef).get(),
  ])

  const now = Date.now()
  const validUntil = iso(a.validUntil)
  const tokens = tokenSnap.docs.map(d => {
    const t = d.data()!
    const expiresAt = iso(t.expiresAt)
    const expired = expiresAt ? Date.parse(expiresAt) < now : false
    return {
      id: d.id,
      status: t.status === "active" && expired ? "expired" : String(t.status ?? ""),
      expiresAt,
      permissions: (t.permissions as string[] | undefined) ?? [],
      sidecarTokenId: t.sidecarTokenId ?? "",
      deliveredToSidecar: Boolean(t.sidecarTokenId),
    }
  })
  const credential = credSnap.docs[0]
  const agreementUsable = a.status === "finalized" && (!validUntil || Date.parse(validUntil) > now)

  return NextResponse.json({
    contractRef,
    effectiveStatus: !agreementUsable
      ? (a.status === "finalized" ? "expired" : String(a.status ?? ""))
      : tokens.some(t => t.status === "active") ? "active" : "agreement-valid-no-active-token",
    agreement: {
      status: a.status ?? "",
      offerId: a.offerId ?? "",
      assetId: a.assetId ?? "", assetName: a.assetName ?? "",
      provider: a.providerParticipantId ?? a.providerId ?? "",
      consumer: a.consumerParticipantId ?? a.consumerId ?? "",
      federationId: a.federationId ?? "",
      governancePolicyId: a.governancePolicyId ?? "",
      purpose: a.purpose ?? "",
      resources: (a.resources as string[] | undefined) ?? [],
      signedByConsumerAt: iso(a.signedByConsumerAt),
      signedByProviderAt: iso(a.signedByProviderAt),
      validFrom: iso(a.validFrom),
      validUntil,
    },
    credential: credential
      ? { id: credential.id, status: credential.data()?.status ?? "", expiresAt: iso(credential.data()?.expiresAt) }
      : null,
    tokens,
  }, { headers: CORS })
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS })
}
