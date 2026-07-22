/**
 * Sidecar simulado — Robô Industrial de Soldagem a Ponto
 *
 * Equipamento: Robô articulado 6 eixos para soldagem a ponto e manuseio
 *              (similar KUKA KR 210 R2700 prime)
 * Setor: Manufatura metal-mecânica — soldagem e montagem de carroceria
 * ECLASS: 27-01-04-01 (Industrial Robot, articulated) | IRDI: 0173-1#01-AKJ975#001
 * AAS: IDTA-01001-3-0 (Nameplate + TechnicalData + OperationalData)
 *
 * Dados em "tempo real": posições das juntas, TCP, velocidade, ciclos, estado.
 * Token: Authorization: Bearer <acc_*> ou Bearer demo (desenvolvimento).
 */

import { NextRequest, NextResponse } from "next/server"
import {
  validateAccessToken,
  buildNameplateSubmodel,
  sineOscillation,
  noisyValue,
  round,
  clamp,
  nowIso,
  prop,
  collection,
  extRef,
  type AASEnvironment,
  type Submodel,
} from "@/lib/equipment-aas"

const ASSET_ID = "urn:dataspace:plant1:equipment:robot:welding:001"
const GLOBAL_ASSET_ID = "urn:dataspace:plant1:asset:robot:001"

// ─── Technical Data submodel ──────────────────────────────────────────────────

function buildTechnicalDataSubmodel(): Submodel {
  return {
    id: `${ASSET_ID}:TechnicalData`,
    idShort: "TechnicalData",
    modelType: "Submodel",
    kind: "Instance",
    semanticId: extRef("https://admin-shell.io/ZVEI/TechnicalData/Submodel/1/2"),
    description: [
      { language: "pt", text: "Dados técnicos do robô industrial" },
      { language: "en", text: "Technical data of the industrial robot" },
    ],
    submodelElements: [
      collection("GeneralInformation", [
        prop("ManufacturerName", "xs:string", "KUKA AG", "0173-1#02-AAO677#002", "Fabricante"),
        prop("ManufacturerProductFamily", "xs:string", "KR QUANTEC Series", "0173-1#02-AAU731#001", "Família do produto"),
        prop("ManufacturerArticleNumber", "xs:string", "KR210-R2700-PRIME", "0173-1#02-AAO227#002", "Número de artigo"),
        prop("EclassClassification", "xs:string", "27-01-04-01", "0173-1#02-AAO041#003", "Classificação ECLASS"),
        prop("EclassIrdi", "xs:string", "0173-1#01-AKJ975#001", undefined, "ECLASS IRDI do equipamento"),
        prop("RobotType", "xs:string", "Articulated (6-axis)", undefined, "Tipo de robô"),
        prop("Application", "xs:string", "Spot welding / Part handling", undefined, "Aplicação"),
      ]),
      collection("KinematicsCapabilities", [
        prop("NumberOfAxes", "xs:int", 6, undefined, "Número de eixos"),
        prop("PayloadMax_kg", "xs:float", 210, "0173-1#02-AAV212#001", "Carga máxima (kg)"),
        prop("Reach_mm", "xs:int", 2700, "0173-1#02-BAD884#005", "Alcance máximo (mm)"),
        prop("RepeatabilityPosition_mm", "xs:float", 0.05, undefined, "Repetibilidade de posição (mm)"),
        prop("Axis1Range_deg", "xs:string", "±185", undefined, "Faixa eixo A1 (°)"),
        prop("Axis2Range_deg", "xs:string", "+45/−130", undefined, "Faixa eixo A2 (°)"),
        prop("Axis3Range_deg", "xs:string", "+156/−120", undefined, "Faixa eixo A3 (°)"),
        prop("Axis4Range_deg", "xs:string", "±350", undefined, "Faixa eixo A4 (°)"),
        prop("Axis5Range_deg", "xs:string", "±125", undefined, "Faixa eixo A5 (°)"),
        prop("Axis6Range_deg", "xs:string", "±350", undefined, "Faixa eixo A6 (°)"),
      ]),
      collection("PerformanceData", [
        prop("MaxTCPSpeed_m_s", "xs:float", 2.0, "0173-1#02-BAD884#005", "Velocidade máxima TCP (m/s)"),
        prop("MaxTCPForce_N", "xs:float", 2100, "0173-1#02-BAD093#005", "Força máxima TCP (N)"),
        prop("Footprint_mm", "xs:string", "830×830", undefined, "Área de instalação (mm)"),
        prop("MountingOptions", "xs:string", "Floor / Ceiling / Wall", undefined, "Opções de montagem"),
      ]),
      collection("WeldingToolData", [
        prop("WeldingGunType", "xs:string", "X-type servo gun", undefined, "Tipo de pinça de soldagem"),
        prop("WeldingForceMax_kN", "xs:float", 6.0, "0173-1#02-BAD093#005", "Força de soldagem máxima (kN)"),
        prop("WeldingCurrentMax_kA", "xs:float", 20.0, undefined, "Corrente de soldagem máxima (kA)"),
        prop("ElectrodeType", "xs:string", "Cu-Cr-Zr cap electrode", undefined, "Tipo de eletrodo"),
      ]),
    ],
  }
}

// ─── Operational Data submodel (real-time) ───────────────────────────────────

function buildOperationalDataSubmodel(): Submodel {
  const t = Date.now()

  // State cycle: running 65%, idle 25%, t1-manual 8%, error 2%
  const stateRnd = (Math.sin(t / 150000) + 1) / 2
  const operationMode =
    stateRnd > 0.35
      ? "automatic"
      : stateRnd > 0.1
        ? "idle"
        : stateRnd > 0.02
          ? "t1"
          : "error"

  const isRunning = operationMode === "automatic"

  const speedOverride = isRunning
    ? round(clamp(noisyValue(85, 5), 60, 100), 0)
    : 0

  // Joint angles: realistic oscillation for a spot-welding robot
  const j1 = isRunning ? round(sineOscillation(45, 80, 12000, 0.0), 2) : round(noisyValue(0, 0.5), 2)
  const j2 = isRunning ? round(sineOscillation(-30, 40, 14000, 0.8), 2) : round(noisyValue(-20, 0.5), 2)
  const j3 = isRunning ? round(sineOscillation(90, 30, 11000, 1.6), 2) : round(noisyValue(90, 0.5), 2)
  const j4 = isRunning ? round(sineOscillation(0, 60, 9000, 2.4), 2) : round(noisyValue(0, 0.5), 2)
  const j5 = isRunning ? round(sineOscillation(-45, 35, 10000, 3.1), 2) : round(noisyValue(-10, 0.3), 2)
  const j6 = isRunning ? round(sineOscillation(120, 90, 8000, 0.5), 2) : round(noisyValue(0, 0.5), 2)

  // TCP position derived from joints (simplified, not actual kinematics)
  const tcpX = isRunning ? round(sineOscillation(1200, 450, 12000, 0.0) + noisyValue(0, 5), 1) : 0
  const tcpY = isRunning ? round(sineOscillation(300, 200, 14000, 1.5) + noisyValue(0, 5), 1) : 0
  const tcpZ = isRunning ? round(sineOscillation(800, 350, 11000, 0.7) + noisyValue(0, 5), 1) : 1200
  const tcpRx = isRunning ? round(sineOscillation(0, 30, 12000, 2.1) + noisyValue(0, 1), 2) : 0
  const tcpRy = isRunning ? round(sineOscillation(90, 20, 10000, 1.0) + noisyValue(0, 1), 2) : 0
  const tcpRz = isRunning ? round(sineOscillation(45, 40, 8000, 3.0) + noisyValue(0, 1), 2) : 0

  const currentPayload = isRunning ? round(noisyValue(180, 8), 1) : 0
  const cycleTime = isRunning ? round(clamp(noisyValue(18, 2), 12, 35), 1) : 0
  const totalCycles = Math.floor(t / 1000 / 20) % 100000

  const weldSpotsCycle = isRunning ? clamp(Math.floor(noisyValue(24, 2)), 18, 32) : 0
  const currentInWeld = isRunning ? round(clamp(noisyValue(14.5, 1.5), 10, 20), 1) : 0
  const forceInWeld = isRunning ? round(clamp(noisyValue(4.8, 0.4), 3.0, 6.0), 2) : 0

  const motorTemps = [
    round(clamp(sineOscillation(68, 8, 120000, 0.0) + noisyValue(0, 1), 40, 90), 1),
    round(clamp(sineOscillation(72, 6, 110000, 1.0) + noisyValue(0, 1), 40, 90), 1),
  ]

  const programs = ["SPOT_WELD_SIDE_PANEL_L", "SPOT_WELD_SIDE_PANEL_R", "HANDLING_DOOR_INNER", "SPOT_WELD_ROOF_RAIL"]
  const progIdx = Math.floor(((Math.sin(t / 720000) + 1) / 2) * programs.length)
  const currentProgram = isRunning ? programs[progIdx] : "NONE"

  const errorCode = operationMode === "error" ? 4120 : 0
  const errorMessage = operationMode === "error" ? "Electrode cap wear limit exceeded" : ""

  return {
    id: `${ASSET_ID}:OperationalData`,
    idShort: "OperationalData",
    modelType: "Submodel",
    kind: "Instance",
    semanticId: extRef("urn:dataspace:submodel:OperationalData:1:0"),
    description: [
      { language: "pt", text: "Dados operacionais em tempo real" },
      { language: "en", text: "Real-time operational data" },
    ],
    submodelElements: [
      collection("RobotStatus", [
        prop("OperationMode", "xs:string", operationMode, undefined, "Modo de operação"),
        prop("Timestamp", "xs:dateTime", nowIso(), undefined, "Timestamp da leitura"),
        prop("ActiveProgram", "xs:string", currentProgram, undefined, "Programa ativo"),
        prop("SpeedOverride_pct", "xs:int", speedOverride, "0173-1#02-BAD884#005", "Override de velocidade (%)"),
        prop("CycleTime_s", "xs:float", cycleTime, "0173-1#02-AAV469#001", "Tempo de ciclo atual (s)"),
        prop("TotalCycles", "xs:long", totalCycles, undefined, "Total de ciclos produzidos"),
        prop("ErrorCode", "xs:int", errorCode, undefined, "Código de erro ativo"),
        prop("ErrorMessage", "xs:string", errorMessage, undefined, "Mensagem de erro"),
      ]),
      collection("JointAngles_deg", [
        prop("J1_deg", "xs:double", j1, undefined, "Ângulo junta 1 (°)"),
        prop("J2_deg", "xs:double", j2, undefined, "Ângulo junta 2 (°)"),
        prop("J3_deg", "xs:double", j3, undefined, "Ângulo junta 3 (°)"),
        prop("J4_deg", "xs:double", j4, undefined, "Ângulo junta 4 (°)"),
        prop("J5_deg", "xs:double", j5, undefined, "Ângulo junta 5 (°)"),
        prop("J6_deg", "xs:double", j6, undefined, "Ângulo junta 6 (°)"),
      ]),
      collection("TCPPosition", [
        prop("X_mm", "xs:double", tcpX, "0173-1#02-AAN034#001", "TCP posição X (mm)"),
        prop("Y_mm", "xs:double", tcpY, "0173-1#02-AAN034#001", "TCP posição Y (mm)"),
        prop("Z_mm", "xs:double", tcpZ, "0173-1#02-AAN034#001", "TCP posição Z (mm)"),
        prop("Rx_deg", "xs:double", tcpRx, undefined, "TCP rotação X (°)"),
        prop("Ry_deg", "xs:double", tcpRy, undefined, "TCP rotação Y (°)"),
        prop("Rz_deg", "xs:double", tcpRz, undefined, "TCP rotação Z (°)"),
        prop("Payload_kg", "xs:float", currentPayload, "0173-1#02-AAV212#001", "Carga atual no TCP (kg)"),
      ]),
      collection("WeldingProcess", [
        prop("WeldSpotsThisCycle", "xs:int", weldSpotsCycle, undefined, "Pontos de solda no ciclo"),
        prop("WeldCurrent_kA", "xs:float", currentInWeld, undefined, "Corrente de soldagem atual (kA)"),
        prop("WeldForce_kN", "xs:float", forceInWeld, "0173-1#02-BAD093#005", "Força de soldagem atual (kN)"),
      ]),
      collection("Diagnostics", [
        prop("Motor1Temp_C", "xs:float", motorTemps[0], "0173-1#02-BAC120#008", "Temperatura motor eixo 1 (°C)"),
        prop("Motor2Temp_C", "xs:float", motorTemps[1], "0173-1#02-BAC120#008", "Temperatura motor eixo 2 (°C)"),
        prop("ElectrodeWear_pct", "xs:float", round(clamp(noisyValue(42, 5), 0, 100), 0), undefined, "Desgaste do eletrodo (%)"),
        prop("LastMaintenanceDate", "xs:dateTime", "2025-03-15T08:00:00Z", undefined, "Última manutenção"),
      ]),
    ],
  }
}

// ─── Route handler ────────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization")
  const validation = await validateAccessToken(authHeader)

  if (!validation.valid) {
    return NextResponse.json(
      {
        error: "Unauthorized",
        message: validation.reason,
        hint: "Use Authorization: Bearer <acc_token> or Authorization: Bearer demo for testing.",
      },
      { status: 401 },
    )
  }

  const { searchParams } = request.nextUrl
  const submodel = searchParams.get("submodel")

  const nameplate = buildNameplateSubmodel(ASSET_ID, {
    manufacturerName: "KUKA AG",
    manufacturerProductDesignation: "KR 210 R2700 prime — 6-axis Articulated Robot",
    serialNumber: "KUKR-2024-BRA-0018",
    yearOfConstruction: "2023",
    orderCode: "KR210-R2700-PRIME-SW-49",
    assetId: ASSET_ID,
    countryOfOrigin: "DE",
  })

  const technicalData = buildTechnicalDataSubmodel()
  const operationalData = buildOperationalDataSubmodel()

  const shell: AASEnvironment = {
    assetAdministrationShells: [
      {
        id: ASSET_ID,
        idShort: "Robot_SpotWelding_001",
        modelType: "AssetAdministrationShell",
        description: [
          { language: "pt", text: "Robô industrial 6 eixos — Soldagem a ponto e manuseio de peças" },
          { language: "en", text: "6-axis industrial robot — Spot welding and part handling" },
        ],
        assetInformation: {
          assetKind: "Instance",
          globalAssetId: GLOBAL_ASSET_ID,
          specificAssetIds: [
            { name: "SerialNumber", value: "KUKR-2024-BRA-0018" },
            { name: "PlantSection", value: "Soldagem-CelulaCar1" },
            { name: "EclassIrdi", value: "0173-1#01-AKJ975#001" },
          ],
        },
        submodels: [
          { type: "ModelReference", keys: [{ type: "Submodel", value: `${ASSET_ID}:Nameplate` }] },
          { type: "ModelReference", keys: [{ type: "Submodel", value: `${ASSET_ID}:TechnicalData` }] },
          { type: "ModelReference", keys: [{ type: "Submodel", value: `${ASSET_ID}:OperationalData` }] },
        ],
      },
    ],
    submodels:
      submodel === "Nameplate"
        ? [nameplate]
        : submodel === "TechnicalData"
          ? [technicalData]
          : submodel === "OperationalData"
            ? [operationalData]
            : [nameplate, technicalData, operationalData],
  }

  return NextResponse.json(shell, {
    headers: {
      "Cache-Control": "no-store",
      "X-Asset-Id": ASSET_ID,
      "X-Sidecar-Protocol": "http",
      "X-Eclass-Irdi": "0173-1#01-AKJ975#001",
    },
  })
}
