/**
 * Registro de equipamentos simulados — Plant Asset Registry
 *
 * Retorna o catálogo de equipamentos disponíveis na planta, com seus AAS IDs,
 * ECLASS IRDIs e endpoints de sidecar. Não requer autenticação (catálogo público de planta).
 *
 * Este endpoint não é o catálogo federado do Dataspace (que será um KnowledgeGraph).
 * É o registro local de ativos físicos disponíveis na planta.
 */

import { NextResponse } from "next/server"
import { nowIso } from "@/lib/equipment-aas"

const PLANT_ID = "urn:dataspace:plant1:metalmecanica:001"

export interface EquipmentRegistryEntry {
  assetId: string
  globalAssetId: string
  idShort: string
  displayName: string
  description: { language: string; text: string }[]
  eclassClassification: string
  eclassIrdi: string
  eclassClassDescription: string
  manufacturer: string
  productFamily: string
  serialNumber: string
  plantSection: string
  sidecarEndpoint: string
  submodelsAvailable: string[]
  status: "online" | "offline" | "maintenance"
}

function getEquipmentStatus(seed: number): "online" | "offline" | "maintenance" {
  const v = (Math.sin(Date.now() / 120000 + seed) + 1) / 2
  return v > 0.15 ? "online" : v > 0.05 ? "maintenance" : "offline"
}

export async function GET() {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000"

  const equipment: EquipmentRegistryEntry[] = [
    {
      assetId: "urn:dataspace:plant1:equipment:cnc:machiningcenter:001",
      globalAssetId: "urn:dataspace:plant1:asset:cnc:001",
      idShort: "CNC_MachiningCentre_001",
      displayName: "Centro de Usinagem CNC — Linha 1",
      description: [
        { language: "pt", text: "Centro de usinagem horizontal CNC para usinagem de precisão de componentes metálicos" },
        { language: "en", text: "CNC horizontal machining centre for precision machining of metal components" },
      ],
      eclassClassification: "27-01-02-16",
      eclassIrdi: "0173-1#01-ACJ843#001",
      eclassClassDescription: "Machining Centre (horizontal)",
      manufacturer: "DMG MORI AG",
      productFamily: "NHX 4000 2nd Generation",
      serialNumber: "NH4G-2024-BRA-0042",
      plantSection: "Usinagem-Linha1",
      sidecarEndpoint: `${baseUrl}/api/equipment/cnc`,
      submodelsAvailable: ["Nameplate", "TechnicalData", "OperationalData"],
      status: getEquipmentStatus(1),
    },
    {
      assetId: "urn:dataspace:plant1:equipment:robot:welding:001",
      globalAssetId: "urn:dataspace:plant1:asset:robot:001",
      idShort: "Robot_SpotWelding_001",
      displayName: "Robô Industrial — Soldagem a Ponto Célula 1",
      description: [
        { language: "pt", text: "Robô articulado 6 eixos para soldagem a ponto e manuseio de peças de carroceria" },
        { language: "en", text: "6-axis articulated robot for spot welding and body panel handling" },
      ],
      eclassClassification: "27-01-04-01",
      eclassIrdi: "0173-1#01-AKJ975#001",
      eclassClassDescription: "Industrial Robot (articulated, 6-axis)",
      manufacturer: "KUKA AG",
      productFamily: "KR QUANTEC — KR 210 R2700 prime",
      serialNumber: "KUKR-2024-BRA-0018",
      plantSection: "Soldagem-CelulaCar1",
      sidecarEndpoint: `${baseUrl}/api/equipment/robot`,
      submodelsAvailable: ["Nameplate", "TechnicalData", "OperationalData"],
      status: getEquipmentStatus(2),
    },
    {
      assetId: "urn:dataspace:plant1:equipment:press:hydraulic:001",
      globalAssetId: "urn:dataspace:plant1:asset:press:001",
      idShort: "Press_Hydraulic_001",
      displayName: "Prensa Hidráulica — Linha de Estampagem 2",
      description: [
        { language: "pt", text: "Prensa hidráulica multi-estação para conformação e estampagem de chapas metálicas" },
        { language: "en", text: "Multi-station hydraulic press for sheet metal forming and stamping" },
      ],
      eclassClassification: "27-01-05-01",
      eclassIrdi: "0173-1#01-ADN573#001",
      eclassClassDescription: "Hydraulic Press (cold forming)",
      manufacturer: "Schuler AG",
      productFamily: "MSP Series — MSP 160",
      serialNumber: "SCH-MSP160-2024-BRA-0007",
      plantSection: "Estampagem-Linha2",
      sidecarEndpoint: `${baseUrl}/api/equipment/press`,
      submodelsAvailable: ["Nameplate", "TechnicalData", "OperationalData"],
      status: getEquipmentStatus(3),
    },
  ]

  return NextResponse.json(
    {
      plantId: PLANT_ID,
      plantName: "Planta Metal-Mecânica — Unidade Brasil",
      description: "Registro local de ativos físicos industriais com AAS/ECLASS. Endpoints sidecar para consumo P2P via INTRA Dataspace.",
      timestamp: nowIso(),
      totalEquipment: equipment.length,
      equipment,
    },
    {
      headers: {
        "Cache-Control": "max-age=30",
        "X-Plant-Id": PLANT_ID,
      },
    },
  )
}
