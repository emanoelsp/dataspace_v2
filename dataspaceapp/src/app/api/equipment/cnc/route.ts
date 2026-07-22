/**
 * Sidecar simulado — Centro de Usinagem CNC
 *
 * Equipamento: Centro de usinagem horizontal CNC (similar DMG MORI NHX 4000)
 * Setor: Manufatura metal-mecânica — usinagem de precisão
 * ECLASS: 27-01-02-16 (Machining Centre) | IRDI: 0173-1#01-ACJ843#001
 * AAS: IDTA-01001-3-0 (Nameplate + TechnicalData + OperationalData)
 *
 * Dados em "tempo real": valores simulados com oscilação senoidal e ruído realístico.
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

const ASSET_ID = "urn:dataspace:plant1:equipment:cnc:machiningcenter:001"
const GLOBAL_ASSET_ID = "urn:dataspace:plant1:asset:cnc:001"

// ─── Technical Data submodel (IDTA 02003-1-2) ────────────────────────────────

function buildTechnicalDataSubmodel(): Submodel {
  return {
    id: `${ASSET_ID}:TechnicalData`,
    idShort: "TechnicalData",
    modelType: "Submodel",
    kind: "Instance",
    semanticId: extRef("https://admin-shell.io/ZVEI/TechnicalData/Submodel/1/2"),
    description: [
      { language: "pt", text: "Dados técnicos do centro de usinagem" },
      { language: "en", text: "Technical data of the machining centre" },
    ],
    submodelElements: [
      collection("GeneralInformation", [
        prop("ManufacturerName", "xs:string", "DMG MORI", "0173-1#02-AAO677#002", "Fabricante"),
        prop("ManufacturerProductFamily", "xs:string", "NHX Series", "0173-1#02-AAU731#001", "Família do produto"),
        prop("ManufacturerArticleNumber", "xs:string", "NHX4000-2ND-II", "0173-1#02-AAO227#002", "Número de artigo"),
        prop("EclassClassification", "xs:string", "27-01-02-16", "0173-1#02-AAO041#003", "Classificação ECLASS"),
        prop("EclassIrdi", "xs:string", "0173-1#01-ACJ843#001", undefined, "ECLASS IRDI do equipamento"),
      ]),
      collection("MachineGeometry", [
        prop("WorkpieceMaxDiameter_mm", "xs:float", 630, "0173-1#02-BAC019#008", "Diâmetro máximo da peça (mm)"),
        prop("WorkpieceMaxLength_mm", "xs:float", 1000, "0173-1#02-BAC018#008", "Comprimento máximo da peça (mm)"),
        prop("WorkpieceMaxWeight_kg", "xs:float", 400, "0173-1#02-AAV212#001", "Peso máximo da peça (kg)"),
        prop("NumberOfPallets", "xs:int", 2, undefined, "Número de paletes"),
        prop("PalletSize_mm", "xs:string", "400x400", undefined, "Tamanho do palete (mm)"),
      ]),
      collection("SpindleCapabilities", [
        prop("SpindleMaxSpeed_rpm", "xs:int", 12000, "0173-1#02-AAV232#001", "Velocidade máxima do spindle (rpm)"),
        prop("SpindleMotorPower_kW", "xs:float", 22, "0173-1#02-AAV216#001", "Potência do motor do spindle (kW)"),
        prop("SpindleTorqueMax_Nm", "xs:float", 281, "0173-1#02-AAV217#001", "Torque máximo do spindle (Nm)"),
        prop("SpindleTaper", "xs:string", "HSK-A63", undefined, "Interface do spindle"),
      ]),
      collection("AxesCapabilities", [
        prop("AxisX_TravelRange_mm", "xs:float", 560, undefined, "Curso eixo X (mm)"),
        prop("AxisY_TravelRange_mm", "xs:float", 560, undefined, "Curso eixo Y (mm)"),
        prop("AxisZ_TravelRange_mm", "xs:float", 560, undefined, "Curso eixo Z (mm)"),
        prop("MaxFeedRate_mm_min", "xs:int", 50000, "0173-1#02-AAV233#001", "Avanço rápido máximo (mm/min)"),
        prop("Axes", "xs:string", "X, Y, Z, B (table rotation)", undefined, "Eixos disponíveis"),
      ]),
      collection("ToolMagazine", [
        prop("ToolCapacity", "xs:int", 40, "0173-1#02-ABF612#001", "Capacidade do magazine (ferramentas)"),
        prop("MaxToolDiameter_mm", "xs:float", 125, undefined, "Diâmetro máximo de ferramenta (mm)"),
        prop("MaxToolLength_mm", "xs:float", 300, undefined, "Comprimento máximo de ferramenta (mm)"),
        prop("MaxToolWeight_kg", "xs:float", 8, undefined, "Peso máximo de ferramenta (kg)"),
        prop("ChipToChipTime_s", "xs:float", 3.8, "0173-1#02-AAV469#001", "Tempo de troca de ferramenta (s)"),
      ]),
      collection("CoolantSystem", [
        prop("CoolantType", "xs:string", "Emulsão 5%", undefined, "Tipo de fluido de corte"),
        prop("CoolantPressureMax_bar", "xs:float", 80, "0173-1#02-BAC063#007", "Pressão máxima de refrigerante (bar)"),
        prop("CoolantTankCapacity_L", "xs:float", 560, undefined, "Volume do tanque de refrigerante (L)"),
      ]),
    ],
  }
}

// ─── Operational Data submodel (real-time) ───────────────────────────────────

function buildOperationalDataSubmodel(): Submodel {
  const t = Date.now()

  // Machine state cycle: running 70%, idle 20%, maintenance 8%, alarm 2%
  const stateRnd = (Math.sin(t / 120000) + 1) / 2
  const machineState =
    stateRnd > 0.3
      ? "running"
      : stateRnd > 0.1
        ? "idle"
        : stateRnd > 0.02
          ? "maintenance"
          : "alarm"

  const isRunning = machineState === "running"

  const spindleSpeed = isRunning
    ? round(clamp(sineOscillation(7800, 600, 45000, 0.3) + noisyValue(0, 80), 0, 12000), 0)
    : 0

  const feedRate = isRunning
    ? round(clamp(sineOscillation(1800, 400, 30000, 1.1) + noisyValue(0, 50), 0, 5000), 0)
    : 0

  const spindleLoad = isRunning
    ? round(clamp(sineOscillation(55, 18, 35000, 0.7) + noisyValue(0, 3), 0, 100), 1)
    : 0

  const toolNumber = isRunning
    ? clamp(Math.floor(((Math.sin(t / 600000) + 1) / 2) * 40) + 1, 1, 40)
    : 0

  const axisX = isRunning
    ? round(sineOscillation(-280, 250, 55000, 0), 3)
    : round(noisyValue(-10, 0.5), 3)
  const axisY = isRunning
    ? round(sineOscillation(-180, 170, 42000, 1.0), 3)
    : round(noisyValue(-5, 0.3), 3)
  const axisZ = isRunning
    ? round(sineOscillation(-100, 90, 38000, 2.1), 3)
    : round(noisyValue(-2, 0.2), 3)

  const cuttingTemp = isRunning
    ? round(clamp(sineOscillation(65, 20, 25000, 0.5) + noisyValue(0, 2), 20, 150), 1)
    : round(noisyValue(22, 1), 1)

  const coolantPressure = isRunning
    ? round(clamp(noisyValue(65, 4), 50, 80), 1)
    : 0

  const cycleTime = isRunning
    ? round(clamp(noisyValue(82, 5), 45, 180), 1)
    : 0

  const programs = ["HOUSING_BODY_V4.NC", "BRACKET_REAR_V2.NC", "SHAFT_FLANGE_V7.NC", "COVER_PLATE_V1.NC"]
  const programIndex = Math.floor(((Math.sin(t / 900000) + 1) / 2) * programs.length)
  const currentProgram = isRunning ? programs[programIndex] : "NONE"

  const partsProduced = Math.floor((t / 1000 / 90) % 1000)

  const errorCode = machineState === "alarm" ? 2071 : 0
  const errorMessage =
    machineState === "alarm" ? "Thermal overload protection triggered" : ""

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
      collection("MachineStatus", [
        prop("MachineState", "xs:string", machineState, undefined, "Estado atual da máquina"),
        prop("Timestamp", "xs:dateTime", nowIso(), undefined, "Timestamp da leitura"),
        prop("ActiveProgram", "xs:string", currentProgram, undefined, "Programa NC ativo"),
        prop("ActiveToolNumber", "xs:int", toolNumber, "0173-1#02-ABF612#001", "Número da ferramenta ativa"),
        prop("CycleTime_s", "xs:float", cycleTime, "0173-1#02-AAV469#001", "Tempo de ciclo atual (s)"),
        prop("PartsProducedShift", "xs:long", partsProduced, undefined, "Peças produzidas no turno"),
        prop("ErrorCode", "xs:int", errorCode, undefined, "Código de erro ativo"),
        prop("ErrorMessage", "xs:string", errorMessage, undefined, "Mensagem de erro"),
      ]),
      collection("SpindleData", [
        prop("SpindleSpeed_rpm", "xs:int", spindleSpeed, "0173-1#02-AAV232#001", "Rotação atual do spindle (rpm)"),
        prop("SpindleLoad_pct", "xs:float", spindleLoad, "0173-1#02-AAV216#001", "Carga do spindle (%)"),
        prop("CuttingTemperature_C", "xs:float", cuttingTemp, "0173-1#02-BAC120#008", "Temperatura de corte (°C)"),
      ]),
      collection("AxesPosition", [
        prop("AxisX_mm", "xs:double", axisX, undefined, "Posição eixo X (mm)"),
        prop("AxisY_mm", "xs:double", axisY, undefined, "Posição eixo Y (mm)"),
        prop("AxisZ_mm", "xs:double", axisZ, undefined, "Posição eixo Z (mm)"),
        prop("FeedRate_mm_min", "xs:int", feedRate, "0173-1#02-AAV233#001", "Avanço programado (mm/min)"),
      ]),
      collection("CoolantSystem", [
        prop("CoolantPressure_bar", "xs:float", coolantPressure, "0173-1#02-BAC063#007", "Pressão do refrigerante (bar)"),
        prop("CoolantActive", "xs:boolean", isRunning, undefined, "Refrigerante ativo"),
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
        hint: 'Use Authorization: Bearer <acc_token> or Authorization: Bearer demo for testing.',
      },
      { status: 401 },
    )
  }

  const { searchParams } = request.nextUrl
  const submodel = searchParams.get("submodel")

  const nameplate = buildNameplateSubmodel(ASSET_ID, {
    manufacturerName: "DMG MORI AG",
    manufacturerProductDesignation: "NHX 4000 2nd Generation — Horizontal Machining Centre",
    serialNumber: "NH4G-2024-BRA-0042",
    yearOfConstruction: "2023",
    orderCode: "NHX4000-2ND-II-HSK63-40T",
    assetId: ASSET_ID,
    countryOfOrigin: "JP",
  })

  const technicalData = buildTechnicalDataSubmodel()
  const operationalData = buildOperationalDataSubmodel()

  const shell: AASEnvironment = {
    assetAdministrationShells: [
      {
        id: ASSET_ID,
        idShort: "CNC_MachiningCentre_001",
        modelType: "AssetAdministrationShell",
        description: [
          { language: "pt", text: "Centro de usinagem CNC horizontal — Linha de usinagem de precisão" },
          { language: "en", text: "CNC Horizontal Machining Centre — Precision machining line" },
        ],
        assetInformation: {
          assetKind: "Instance",
          globalAssetId: GLOBAL_ASSET_ID,
          specificAssetIds: [
            { name: "SerialNumber", value: "NH4G-2024-BRA-0042" },
            { name: "PlantSection", value: "Usinagem-Linha1" },
            { name: "EclassIrdi", value: "0173-1#01-ACJ843#001" },
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
      "X-Eclass-Irdi": "0173-1#01-ACJ843#001",
    },
  })
}
