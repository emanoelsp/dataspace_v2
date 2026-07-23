/**
 * GET /api/edc — saúde e índice do adaptador EDC (camada inter-org).
 */

import { NextResponse } from "next/server"
import { getDb, EDC_MANAGEMENT_URL, EDC_DATA_SECRET } from "@/lib/edc"

export const runtime = "nodejs"

const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, OPTIONS", "Access-Control-Allow-Headers": "Content-Type" }

export async function GET() {
  const db = getDb()
  const health: Record<string, unknown> = {
    dataspace: "online",
    firestore: Boolean(db),
    edcManagementConfigured: Boolean(EDC_MANAGEMENT_URL),
    edcManagementUrl: EDC_MANAGEMENT_URL || null,
    dataBridgeProtected: Boolean(EDC_DATA_SECRET),
  }

  return NextResponse.json({
    service: "Dataspace ↔ EDC adapter (inter-organizational)",
    version: "1.0.0",
    model: "o dataspace intra registra-se como fonte de dados no EDC; enforcement de uso fica no Sidecar PEP intra",
    trust: "delegada ao EDC (DSP + DCP/DAPS)",
    health,
    flow: ["register (gera/empurra Asset+Policy+ContractDefinition ao EDC) → EDC expõe no catálogo DSP → consumidor externo negocia no EDC → transfer puxa a ponte /api/edc/data/{id} → PEP intra serve o dado"],
    interfaces: [
      {
        name: "register",
        method: "POST", path: "/api/edc/register",
        description: "Gera os artefatos do EDC Management API v3 para ativos intra e (se EDC configurado) os registra.",
        body: { assetId: "<id> | assetIds:[...] | federationId:<id>", push: "opcional (default: auto se EDC configurado)" },
        returns: { mode: "pushed|export", bundles: "[{ asset, policy, contractDefinition }]" },
      },
      {
        name: "data bridge",
        method: "GET", path: "/api/edc/data/{assetId}",
        description: "dataAddress.baseUrl que o data plane do EDC puxa; serve o dado através do Sidecar PEP intra (auditável).",
        headers: { "X-EDC-Data-Secret": "obrigatório se EDC_DATA_SECRET estiver definido" },
      },
    ],
    envVars: {
      EDC_MANAGEMENT_URL: "URL do Management API do EDC (ex.: http://host:19193/management) — habilita o push",
      EDC_MANAGEMENT_API_KEY: "X-Api-Key do EDC",
      EDC_DATA_SECRET: "segredo que o data plane do EDC apresenta à ponte (recomendado)",
      EDC_PUBLIC_BASE_URL: "URL pública deste dataspace (para o dataAddress); se ausente, usa a origem da requisição",
    },
  }, { headers: CORS })
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS })
}
