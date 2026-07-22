#!/usr/bin/env node
/**
 * Provisiona no Sidecar PEP os 5 tokens das trocas do cenário plant1,
 * cada um com a GOVERNANÇA HERDADA da sua federação.
 *
 * Atalho para os testes de carga (Cenário 2). A medição do custo de
 * NEGOCIAÇÃO (Cenário A/B) deve usar o fluxo real via UI/Playwright.
 *
 * Uso:  node provision-tokens.mjs [--sidecar http://localhost:3100] [--secret admin] [--ttl-min 60]
 * Saída: scenario/tokens-cenario2.json (consumido pelo load-cenario2.mjs)
 */

import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"

const HERE = path.dirname(fileURLToPath(import.meta.url))
const args = process.argv.slice(2)
const argValue = (f, d) => { const i = args.indexOf(f); return i >= 0 && args[i + 1] ? args[i + 1] : d }
const SIDECAR = argValue("--sidecar", process.env.SIDECAR_URL ?? "http://localhost:3100")
const SECRET = argValue("--secret", process.env.SIDECAR_ADMIN_SECRET ?? "admin")
const TTL_MIN = Number(argValue("--ttl-min", "60"))

// As 5 trocas do cenário (consumidor ← provedor)
const EXCHANGES = [
  { consumer: "cnc",   provider: "oven",       federation: "plant1-process-data",  gov: { accessTokenTtlMinutes: 15, purposeBinding: true,  requiresManualApproval: true,  revocationMode: "owner-manual" },
    purpose: "Compensação térmica dos parâmetros de corte" },
  { consumer: "cnc",   provider: "press",      federation: "plant1-forming-cell",  gov: { accessTokenTtlMinutes: 30, purposeBinding: true,  requiresManualApproval: false, revocationMode: "owner-or-admin" },
    purpose: "Ajuste de fixação/offsets do lote estampado" },
  { consumer: "robot", provider: "quality",    federation: "plant1-process-data",  gov: { accessTokenTtlMinutes: 15, purposeBinding: true,  requiresManualApproval: true,  revocationMode: "owner-manual" },
    purpose: "Liberação do programa de solda" },
  { consumer: "paint", provider: "compressor", federation: "plant1-utilities",     gov: { accessTokenTtlMinutes: 60, purposeBinding: false, requiresManualApproval: false, revocationMode: "ttl-expiry" },
    purpose: "Bloqueio de pintura fora de faixa de ar" },
  { consumer: "agv",   provider: "warehouse",  federation: "plant1-utilities",     gov: { accessTokenTtlMinutes: 60, purposeBinding: false, requiresManualApproval: false, revocationMode: "ttl-expiry" },
    purpose: "Decisão da próxima missão de transporte" },
]

const expiresAt = new Date(Date.now() + TTL_MIN * 60 * 1000).toISOString()
const out = []
console.log(`[provision] 5 tokens → ${SIDECAR} (TTL ${TTL_MIN}min)`)

for (const ex of EXCHANGES) {
  const token = `dsp_scn_${ex.consumer}_${ex.provider}_${Math.random().toString(36).slice(2, 10)}`
  const body = {
    token,
    federationId: ex.federation,
    federationName: ex.federation,
    assetId: `scenario-${ex.provider}`,
    assetName: ex.provider,
    equipmentType: ex.provider,
    dataOwnerId: "scenario-owner",
    dataOwnerName: "plant1 (scenario)",
    dataClientId: `scenario-${ex.consumer}`,
    dataClientName: `${ex.consumer} (consumer)`,
    expiresAt,
    governanceAcceptedAt: new Date().toISOString(),
    contractRef: `scenario-contract-${ex.consumer}-${ex.provider}`,
    permissions: ["data", "aas"],
    governance: { policyId: `scenario-${ex.federation}`, conditions: ex.purpose, ...ex.gov },
  }
  try {
    const res = await fetch(`${SIDECAR}/api/tokens`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${SECRET}` },
      body: JSON.stringify(body),
    })
    if (!res.ok) { console.log(`  ✗ ${ex.consumer}←${ex.provider}: HTTP ${res.status} ${await res.text()}`); continue }
    out.push({ consumer: ex.consumer, provider: ex.provider, token, federation: ex.federation })
    console.log(`  ✓ ${ex.consumer.padEnd(6)} ← ${ex.provider.padEnd(11)} [${ex.federation}]`)
  } catch (err) {
    console.log(`  ✗ ${ex.consumer}←${ex.provider}: ${err.message}`)
  }
}

const file = path.join(HERE, "tokens-cenario2.json")
fs.writeFileSync(file, JSON.stringify({ sidecar: SIDECAR, generatedAt: new Date().toISOString(), expiresAt, exchanges: out }, null, 2))
console.log(`\n${out.length}/5 tokens ativos — salvo em ${file}`)
