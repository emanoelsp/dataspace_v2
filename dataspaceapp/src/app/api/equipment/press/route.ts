/**
 * Sidecar simulado — Prensa Hidráulica de Conformação
 *
 * Equipamento: Prensa hidráulica de conformação a frio (similar Schuler MSP 160)
 * Setor: Manufatura metal-mecânica — estampagem e conformação de chapas
 * ECLASS: 27-01-05-01 (Hydraulic Press) | IRDI: 0173-1#01-ADN573#001
 * AAS: IDTA-01001-3-0 (Nameplate + TechnicalData + OperationalData)
 *
 * Dados em "tempo real": pressão hidráulica, força, posição do curso, temperatura do óleo,
 * contagem de ciclos, estado da máquina, sensores de segurança.
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

const ASSET_ID = "urn:dataspace:plant1:equipment:press:hydraulic:001"
const GLOBAL_ASSET_ID = "urn:dataspace:plant1:asset:press:001"

// ─── Technical Data submodel ──────────────────────────────────────────────────

function buildTechnicalDataSubmodel(): Submodel {
  return {
    id: `${ASSET_ID}:TechnicalData`,
    idShort: "TechnicalData",
    modelType: "Submodel",
    kind: "Instance",
    semanticId: extRef("https://admin-shell.io/ZVEI/TechnicalData/Submodel/1/2"),
    description: [
      { language: "pt", text: "Dados técnicos da prensa hidráulica" },
      { language: "en", text: "Technical data of the hydraulic press" },
    ],
    submodelElements: [
      collection("GeneralInformation", [
        prop("ManufacturerName", "xs:string", "Schuler AG", "0173-1#02-AAO677#002", "Fabricante"),
        prop("ManufacturerProductFamily", "xs:string", "MSP Series — Multi-station Press", "0173-1#02-AAU731#001", "Família do produto"),
        prop("ManufacturerArticleNumber", "xs:string", "MSP160-4000-CNC", "0173-1#02-AAO227#002", "Número de artigo"),
        prop("EclassClassification", "xs:string", "27-01-05-01", "0173-1#02-AAO041#003", "Classificação ECLASS"),
        prop("EclassIrdi", "xs:string", "0173-1#01-ADN573#001", undefined, "ECLASS IRDI do equipamento"),
        prop("PressType", "xs:string", "Hydraulic cold-forming press", undefined, "Tipo de prensa"),
        prop("Application", "xs:string", "Sheet metal forming and stamping", undefined, "Aplicação"),
      ]),
      collection("ForceCapabilities", [
        prop("NominalForce_kN", "xs:float", 1600, "0173-1#02-BAD093#005", "Força nominal (kN)"),
        prop("MaxForce_kN", "xs:float", 1760, "0173-1#02-BAD093#005", "Força máxima (kN)"),
        prop("ReturnForce_kN", "xs:float", 400, undefined, "Força de retorno (kN)"),
        prop("HoldingForce_kN", "xs:float", 1600, undefined, "Força de fechamento de ferramental (kN)"),
      ]),
      collection("StrokeGeometry", [
        prop("StrokeLength_mm", "xs:float", 400, "0173-1#02-BAD094#005", "Curso total (mm)"),
        prop("DieHeight_mm", "xs:string", "200–350", undefined, "Altura de ferramental ajustável (mm)"),
        prop("SlideArea_mm", "xs:string", "2000×1800", undefined, "Área do carro (mm)"),
        prop("BolsterArea_mm", "xs:string", "2000×1800", undefined, "Área da mesa (mm)"),
        prop("SlideAdjustment_mm", "xs:float", 100, undefined, "Ajuste de altura do carro (mm)"),
      ]),
      collection("StrokePerformance", [
        prop("StrokesPerMin_max", "xs:int", 12, undefined, "Número máximo de golpes/min"),
        prop("ApproachSpeed_mm_s", "xs:float", 400, "0173-1#02-BAD884#005", "Velocidade de aproximação (mm/s)"),
        prop("PressSpeed_mm_s", "xs:float", 30, "0173-1#02-BAD884#005", "Velocidade de prensagem (mm/s)"),
        prop("ReturnSpeed_mm_s", "xs:float", 350, "0173-1#02-BAD884#005", "Velocidade de retorno (mm/s)"),
      ]),
      collection("HydraulicSystem", [
        prop("SystemPressureMax_bar", "xs:float", 315, "0173-1#02-BAC063#007", "Pressão máxima do sistema (bar)"),
        prop("OilTankCapacity_L", "xs:float", 1200, undefined, "Capacidade do tanque de óleo (L)"),
        prop("PumpCount", "xs:int", 2, undefined, "Número de bombas hidráulicas"),
        prop("PumpMotorPower_kW", "xs:float", 90, "0173-1#02-AAV216#001", "Potência total dos motores de bomba (kW)"),
        prop("OilType", "xs:string", "HLP 46 hydraulic oil", undefined, "Tipo de fluido hidráulico"),
        prop("FilteringDegree_micron", "xs:int", 10, undefined, "Grau de filtragem do óleo (μm)"),
      ]),
    ],
  }
}

// ─── Operational Data submodel (real-time) ───────────────────────────────────

function buildOperationalDataSubmodel(): Submodel {
  const t = Date.now()

  // Press cycle: approach → press → hold → return
  // One full cycle: ~8 seconds at current settings
  const cyclePeriodMs = 8000
  const cyclePhase = ((t % cyclePeriodMs) / cyclePeriodMs) * 2 * Math.PI

  // State machine based on cycle phase
  // 0–15% = approach (slide moving down fast)
  // 15–35% = pressing (force increasing)
  // 35–50% = hold (max force)
  // 50–70% = return (slide moving up)
  // 70–100% = idle/part exchange
  const phasePct = (t % cyclePeriodMs) / cyclePeriodMs

  // Machine state based on higher-level cycle (includes idle periods)
  const machineCycle = (Math.sin(t / 180000) + 1) / 2
  const isRunning = machineCycle > 0.25

  let machineState: string
  let strokePosition_mm: number
  let pressForce_kN: number
  let hydraulicPressure_bar: number
  let strokeSpeed_mm_s: number

  if (!isRunning) {
    machineState = phasePct < 0.05 ? "maintenance" : "idle"
    strokePosition_mm = round(noisyValue(2, 0.5), 1)
    pressForce_kN = 0
    hydraulicPressure_bar = round(noisyValue(25, 2), 1) // idle line pressure
    strokeSpeed_mm_s = 0
  } else if (phasePct < 0.15) {
    machineState = "approach"
    strokePosition_mm = round(clamp(phasePct / 0.15 * 340, 0, 340), 1)
    pressForce_kN = round(noisyValue(20, 5), 1)
    hydraulicPressure_bar = round(clamp(noisyValue(180, 10), 150, 210), 1)
    strokeSpeed_mm_s = round(clamp(noisyValue(380, 20), 300, 420), 0)
  } else if (phasePct < 0.35) {
    const progress = (phasePct - 0.15) / 0.20
    machineState = "pressing"
    strokePosition_mm = round(clamp(340 + progress * 58, 340, 398), 1)
    pressForce_kN = round(clamp(20 + progress * 1560, 0, 1600), 0)
    hydraulicPressure_bar = round(clamp(180 + progress * 130, 180, 312), 1)
    strokeSpeed_mm_s = round(clamp(30 - progress * 28, 2, 30), 1)
  } else if (phasePct < 0.5) {
    machineState = "hold"
    strokePosition_mm = round(clamp(noisyValue(398, 0.3), 395, 400), 2)
    pressForce_kN = round(clamp(noisyValue(1580, 20), 1500, 1620), 0)
    hydraulicPressure_bar = round(clamp(noisyValue(308, 4), 295, 315), 1)
    strokeSpeed_mm_s = 0
  } else if (phasePct < 0.7) {
    const progress = (phasePct - 0.5) / 0.20
    machineState = "return"
    strokePosition_mm = round(clamp(398 - progress * 396, 2, 398), 1)
    pressForce_kN = round(clamp(noisyValue(200, 30), 100, 400), 0)
    hydraulicPressure_bar = round(clamp(noisyValue(100, 15), 60, 140), 1)
    strokeSpeed_mm_s = -round(clamp(noisyValue(340, 20), 280, 380), 0)
  } else {
    machineState = "part-exchange"
    strokePosition_mm = round(noisyValue(2, 0.5), 1)
    pressForce_kN = 0
    hydraulicPressure_bar = round(noisyValue(28, 3), 1)
    strokeSpeed_mm_s = 0
  }

  const oilTemperature = round(clamp(sineOscillation(48, 8, 3600000, 0) + noisyValue(0, 1), 35, 70), 1)
  const pump1Speed = isRunning ? round(clamp(noisyValue(1445, 10), 1400, 1460), 0) : 0
  const pump2Speed = isRunning && machineState === "pressing" ? round(clamp(noisyValue(1445, 10), 1400, 1460), 0) : 0
  const cycleCount = Math.floor(t / 1000 / 8) % 1000000
  const partsPresentSensor = machineState === "part-exchange" || machineState === "idle"
  const safetyDoorOpen = machineState === "maintenance"
  const lightCurtainOk = !safetyDoorOpen
  const dieHeight = round(clamp(noisyValue(285, 2), 200, 350), 1)

  const filterDp_bar = round(clamp(sineOscillation(1.8, 0.8, 7200000, 0) + noisyValue(0, 0.1), 0, 8), 2)
  const filterAlarm = filterDp_bar > 5

  const programs = ["BRACKET_DEEP_DRAW_T1", "PANEL_SIDE_FORM_T2", "COVER_STAMP_TRIM_T3"]
  const progIdx = Math.floor(((Math.sin(t / 600000) + 1) / 2) * programs.length)
  const currentProgram = isRunning ? programs[progIdx] : "NONE"

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
      collection("PressStatus", [
        prop("MachineState", "xs:string", machineState, undefined, "Estado atual da prensa"),
        prop("Timestamp", "xs:dateTime", nowIso(), undefined, "Timestamp da leitura"),
        prop("ActiveProgram", "xs:string", currentProgram, undefined, "Programa ativo"),
        prop("CycleCount", "xs:long", cycleCount, undefined, "Contador de ciclos acumulado"),
        prop("SafetyDoorOpen", "xs:boolean", safetyDoorOpen, undefined, "Porta de segurança aberta"),
        prop("LightCurtainOk", "xs:boolean", lightCurtainOk, undefined, "Cortina de luz OK"),
        prop("PartPresent", "xs:boolean", partsPresentSensor, undefined, "Peça presente na ferramenta"),
      ]),
      collection("SlideData", [
        prop("StrokePosition_mm", "xs:float", strokePosition_mm, "0173-1#02-BAD094#005", "Posição atual do carro (mm)"),
        prop("StrokeSpeed_mm_s", "xs:float", strokeSpeed_mm_s, "0173-1#02-BAD884#005", "Velocidade do carro (mm/s)"),
        prop("DieHeight_mm", "xs:float", dieHeight, undefined, "Altura de ferramental ajustada (mm)"),
        prop("PressForce_kN", "xs:float", pressForce_kN, "0173-1#02-BAD093#005", "Força de prensagem atual (kN)"),
        prop("PhaseAngle_deg", "xs:float", round(cyclePhase * (180 / Math.PI), 1), undefined, "Ângulo de fase do ciclo (°)"),
      ]),
      collection("HydraulicSystem", [
        prop("MainPressure_bar", "xs:float", hydraulicPressure_bar, "0173-1#02-BAC063#007", "Pressão principal (bar)"),
        prop("HoldPressure_bar", "xs:float", round(clamp(noisyValue(195, 8), 160, 220), 1), "0173-1#02-BAC063#007", "Pressão de fechamento de ferramental (bar)"),
        prop("Pump1Speed_rpm", "xs:int", pump1Speed, undefined, "Rotação bomba 1 (rpm)"),
        prop("Pump2Speed_rpm", "xs:int", pump2Speed, undefined, "Rotação bomba 2 (rpm) — somente prensagem"),
        prop("OilTemperature_C", "xs:float", oilTemperature, "0173-1#02-BAC120#008", "Temperatura do óleo hidráulico (°C)"),
        prop("FilterDifferentialPressure_bar", "xs:float", filterDp_bar, "0173-1#02-BAC063#007", "Pressão diferencial do filtro (bar)"),
        prop("FilterAlarm", "xs:boolean", filterAlarm, undefined, "Alarme de filtro saturado"),
      ]),
      collection("ProductionMetrics", [
        prop("StrokesPerMinActual", "xs:float", isRunning ? round(60 / (cyclePeriodMs / 1000), 1) : 0, undefined, "Golpes/min efetivos"),
        prop("UpTime_pct", "xs:float", round(clamp(noisyValue(87, 3), 70, 99), 1), undefined, "Disponibilidade no turno (%)"),
        prop("ScrapCount", "xs:int", Math.floor(cycleCount * 0.005), undefined, "Contagem de refugos no turno"),
        prop("LastMaintenanceDate", "xs:dateTime", "2025-04-10T06:00:00Z", undefined, "Última manutenção"),
        prop("NextMaintenanceCycles", "xs:long", clamp(50000 - (cycleCount % 50000), 0, 50000), undefined, "Ciclos até próxima manutenção"),
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
    manufacturerName: "Schuler AG",
    manufacturerProductDesignation: "MSP 160 — Multi-station Hydraulic Press",
    serialNumber: "SCH-MSP160-2024-BRA-0007",
    yearOfConstruction: "2024",
    orderCode: "MSP160-4000-CNC-HYD315",
    assetId: ASSET_ID,
    countryOfOrigin: "DE",
  })

  const technicalData = buildTechnicalDataSubmodel()
  const operationalData = buildOperationalDataSubmodel()

  const shell: AASEnvironment = {
    assetAdministrationShells: [
      {
        id: ASSET_ID,
        idShort: "Press_Hydraulic_001",
        modelType: "AssetAdministrationShell",
        description: [
          { language: "pt", text: "Prensa hidráulica de conformação — Linha de estampagem de chapas" },
          { language: "en", text: "Hydraulic forming press — Sheet metal stamping line" },
        ],
        assetInformation: {
          assetKind: "Instance",
          globalAssetId: GLOBAL_ASSET_ID,
          specificAssetIds: [
            { name: "SerialNumber", value: "SCH-MSP160-2024-BRA-0007" },
            { name: "PlantSection", value: "Estampagem-Linha2" },
            { name: "EclassIrdi", value: "0173-1#01-ADN573#001" },
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
      "X-Eclass-Irdi": "0173-1#01-ADN573#001",
    },
  })
}
