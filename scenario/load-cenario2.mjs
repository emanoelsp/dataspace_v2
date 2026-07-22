#!/usr/bin/env node
/**
 * Gerador de carga do CENÁRIO 2 — 5 trocas de dados SIMULTÂNEAS via Sidecar PEP.
 *
 * Reproduz a carga descrita no cenário (10 CPS, 5 consumos concorrentes):
 * cada troca roda em um laço próprio e concorrente; mede latência por
 * requisição e agrega mín/mediana/média/p95/máx por troca e no total.
 *
 * Uso:
 *   node provision-tokens.mjs                       # antes, gera os tokens
 *   node load-cenario2.mjs [--loops 50] [--warmup 3] [--endpoint data]
 *
 * Saída: console + scenario/results-cenario2-<timestamp>.json e .csv
 * (Reproduzível também no JMeter: 5 Thread Groups, 1 thread cada, HTTP GET
 *  {sidecar}/api/proxy/{provider}/data com header Authorization por troca.)
 */

import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"

const HERE = path.dirname(fileURLToPath(import.meta.url))
const args = process.argv.slice(2)
const argValue = (f, d) => { const i = args.indexOf(f); return i >= 0 && args[i + 1] ? args[i + 1] : d }
const LOOPS = Number(argValue("--loops", "50"))
const WARMUP = Number(argValue("--warmup", "3"))
const ENDPOINT = argValue("--endpoint", "data")

const cfgFile = path.join(HERE, "tokens-cenario2.json")
if (!fs.existsSync(cfgFile)) { console.error("Rode antes: node provision-tokens.mjs"); process.exit(1) }
const cfg = JSON.parse(fs.readFileSync(cfgFile, "utf-8"))

function stats(arr) {
  const a = [...arr].sort((x, y) => x - y)
  const q = p => a[Math.min(a.length - 1, Math.floor(p * a.length))]
  const mean = a.reduce((s, v) => s + v, 0) / a.length
  return { n: a.length, min: a[0], median: q(0.5), mean: Math.round(mean * 10) / 10, p95: q(0.95), max: a[a.length - 1] }
}

async function runExchange(ex) {
  const url = `${cfg.sidecar}/api/proxy/${ex.provider}/${ENDPOINT}`
  const headers = { Authorization: `Bearer ${ex.token}` }
  const samples = []
  let errors = 0

  for (let i = 0; i < WARMUP; i++) { try { await fetch(url, { headers }) } catch { /* warmup */ } }

  for (let i = 0; i < LOOPS; i++) {
    const t0 = performance.now()
    try {
      const res = await fetch(url, { headers })
      await res.arrayBuffer()
      const ms = performance.now() - t0
      if (res.ok) samples.push(ms)
      else errors++
    } catch { errors++ }
  }
  return { ...ex, url, samples, errors }
}

console.log(`[cenário 2] 5 trocas concorrentes × ${LOOPS} req (warmup ${WARMUP}) → ${cfg.sidecar}`)
const t0 = performance.now()
const results = await Promise.all(cfg.exchanges.map(runExchange))
const wallMs = Math.round(performance.now() - t0)

const all = results.flatMap(r => r.samples)
const rows = []
console.log("\ntroca                       n    min   mediana  média   p95    máx   erros")
for (const r of results) {
  const s = stats(r.samples.length ? r.samples : [0])
  console.log(`${(r.consumer + " ← " + r.provider).padEnd(26)} ${String(s.n).padStart(3)}  ${String(Math.round(s.min)).padStart(5)} ${String(Math.round(s.median)).padStart(8)} ${String(Math.round(s.mean)).padStart(7)} ${String(Math.round(s.p95)).padStart(6)} ${String(Math.round(s.max)).padStart(6)}   ${r.errors}`)
  for (let i = 0; i < r.samples.length; i++) rows.push(`${r.consumer},${r.provider},${i + 1},${r.samples[i].toFixed(1)}`)
}
const total = stats(all)
console.log(`${"TOTAL (5 trocas)".padEnd(26)} ${String(total.n).padStart(3)}  ${String(Math.round(total.min)).padStart(5)} ${String(Math.round(total.median)).padStart(8)} ${String(Math.round(total.mean)).padStart(7)} ${String(Math.round(total.p95)).padStart(6)} ${String(Math.round(total.max)).padStart(6)}`)
console.log(`\nvazão agregada: ${(all.length / (wallMs / 1000)).toFixed(1)} req/s | tempo de parede: ${(wallMs / 1000).toFixed(1)} s`)

const ts = new Date().toISOString().replace(/[:.]/g, "-")
const jsonOut = path.join(HERE, `results-cenario2-${ts}.json`)
fs.writeFileSync(jsonOut, JSON.stringify({
  config: { sidecar: cfg.sidecar, loops: LOOPS, warmup: WARMUP, endpoint: ENDPOINT },
  wallMs,
  throughputRps: all.length / (wallMs / 1000),
  total,
  perExchange: results.map(r => ({ consumer: r.consumer, provider: r.provider, errors: r.errors, ...stats(r.samples.length ? r.samples : [0]) })),
}, null, 2))
fs.writeFileSync(path.join(HERE, `results-cenario2-${ts}.csv`), "consumer,provider,sample,latency_ms\n" + rows.join("\n"))
console.log(`resultados: ${jsonOut} (+ .csv)`)
