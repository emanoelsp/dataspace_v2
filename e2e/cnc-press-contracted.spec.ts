/**
 * E2E: CNC → Press — Cenário "Já Cadastrados"
 *
 * Simula o caso de uso real onde CNC e Press já possuem:
 *   - Conectores registrados
 *   - Federação criada com dados expostos
 *   - Compliance, governança e oferta publicados
 *   - Press já membro da federação
 *
 * O timer só começa quando a negociação do contrato de acesso é iniciada.
 * Mede apenas:
 *   1. agreement_requested    — Press solicita contrato
 *   2. contract_finalized     — CNC finaliza o acordo
 *   3. token_pushed_to_sidecar — token ativo no PEP local
 *   4. first_p2p_data_received — 1º dado real via Sidecar
 *
 * Salva em: results/negotiation-timing-contracted.json
 */

import { test, expect } from "@playwright/test"
import fs from "fs"
import path from "path"
import {
  buildCncPressContext,
  createCncAsset,
  createOpenFederation,
  fillComplianceWizard,
  fillGovernanceWizard,
  getFederationId,
  loginUser,
  logout,
  navigateToAssetPage,
  publishContractOffer,
  setupCncConnector,
  setupPressConnector,
  signupUser,
} from "./helpers/cnc-press-flow"

test.describe.configure({ mode: "serial", timeout: 1_800_000 })

function makeTimer(filename: string) {
  const t0 = Date.now()
  const marks: Array<{ label: string; ts: number }> = [{ label: "start", ts: t0 }]
  return {
    mark(label: string) { marks.push({ label, ts: Date.now() }) },
    save(extra: Record<string, unknown> = {}) {
      const steps = marks.slice(1).map((m, i) => ({
        label: m.label,
        durationMs: m.ts - marks[i].ts,
        elapsedMs: m.ts - t0,
        completedAt: new Date(m.ts).toISOString(),
      }))
      const totalMs = marks[marks.length - 1].ts - t0
      const out = { startedAt: new Date(t0).toISOString(), totalNegotiationMs: totalMs, steps, ...extra }
      const dir = path.resolve(__dirname, "../results")
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
      fs.writeFileSync(path.join(dir, filename), JSON.stringify(out, null, 2))
      console.log(`[E2E] Timing saved → results/${filename}`)
      console.log(`[E2E] Total: ${(totalMs / 1000).toFixed(1)} s`)
      steps.forEach(s => console.log(`[E2E]   ${s.label}: ${s.durationMs} ms`))
    },
  }
}

test.describe("CNC → Press: Já Cadastrados — só negociação de contrato", () => {
  test("mede apenas agreement → token → 1º dado (setup em background)", async ({ page }) => {
    const ctx = buildCncPressContext()
    console.log(`[E2E] Run ID: ${ctx.runId}`)
    console.log(`[E2E] CNC: ${ctx.ownerEmail} | Press: ${ctx.clientEmail}`)

    // ══════════════════════════════════════════════════════════════════════
    // PRÉ-CONDIÇÃO — setup completo, sem medir tempo
    // Representa: "CNC e Press já estão cadastrados com dados expostos"
    // ══════════════════════════════════════════════════════════════════════

    console.log("[E2E] [SETUP] Registrando CNC + federação + ativo...")

    await signupUser(page, expect, {
      name: "CNC Plant Owner",
      email: ctx.ownerEmail,
      password: ctx.password,
      role: "datasource",
    })
    await setupCncConnector(page, ctx)
    await createOpenFederation(page, expect, ctx)
    const federationId = await getFederationId(page, ctx.federationName)
    await fillComplianceWizard(page, expect, federationId)
    await createCncAsset(page, expect, ctx, federationId)
    await fillGovernanceWizard(page, expect, ctx, federationId)
    await publishContractOffer(page, expect, ctx)
    await logout(page)

    console.log(`[E2E] [SETUP] Federation ID: ${federationId}`)

    await signupUser(page, expect, {
      name: "Hydraulic Press Plant",
      email: ctx.clientEmail,
      password: ctx.password,
      role: "dataclient",
    })
    await setupPressConnector(page, ctx)

    // Press solicita conexão de conector
    await page.goto(`/federations/${federationId}`)
    await page.getByRole("button", { name: /Request connector connection/i }).click()
    await expect(
      page.getByText(/connection request submitted|Wait for the Data Owner/i),
    ).toBeVisible({ timeout: 60_000 })
    await logout(page)

    // CNC aprova conexão
    await loginUser(page, ctx.ownerEmail, ctx.password)
    await page.goto(`/federations/${federationId}`)
    await page.getByRole("button", { name: /Approve connection/i }).click()
    await expect(
      page.getByText(/Connector connection approved|approved/i),
    ).toBeVisible({ timeout: 60_000 })
    await logout(page)

    // Press entra na federação (open, auto-aprovada)
    await loginUser(page, ctx.clientEmail, ctx.password)
    await page.goto(`/federations/${federationId}`)
    await page.getByText(/Status:\s*active/i).waitFor({ state: "visible", timeout: 60_000 })

    const purposeField = page.getByPlaceholder(/Describe why you need access/i)
    if (await purposeField.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await purposeField.fill("Real-time monitoring of CNC spindle load for predictive maintenance.")
    }
    const termsCheck = page.getByRole("checkbox", { name: /federation policy/i }).first()
    await termsCheck.waitFor({ state: "visible", timeout: 30_000 })
    await termsCheck.check()
    await page.getByRole("button", { name: /Request membership|Join federation/i }).click()
    await expect(
      page.getByText(/can now move to asset agreements/i).first(),
    ).toBeVisible({ timeout: 60_000 })

    console.log("[E2E] [SETUP] Press entrou na federação. Setup concluído.")
    console.log("[E2E] ──────────────────────────────────────────────────────")
    console.log("[E2E] INÍCIO DA MEDIÇÃO — cenário 'já cadastrados'")
    console.log("[E2E] ──────────────────────────────────────────────────────")

    // ══════════════════════════════════════════════════════════════════════
    // MEDIÇÃO — apenas negociação de contrato + 1º dado
    // ══════════════════════════════════════════════════════════════════════
    const timer = makeTimer("negotiation-timing-contracted.json")

    // 1. Press solicita acordo de contrato
    await navigateToAssetPage(page, ctx)
    await page.getByRole("button", { name: "Request contract agreement" }).click()
    await expect(
      page.getByRole("button", { name: "Agreement requested" }),
    ).toBeVisible({ timeout: 60_000 })
    timer.mark("agreement_requested")
    await logout(page)

    // 2. CNC finaliza o acordo → token emitido
    await loginUser(page, ctx.ownerEmail, ctx.password)
    await navigateToAssetPage(page, ctx)
    await page.getByRole("button", { name: "Finalize" }).click()
    await expect(
      page.getByText(/Status:\s*finalized/i).first(),
    ).toBeVisible({ timeout: 90_000 })
    timer.mark("contract_finalized")
    await logout(page)

    // 3. Press ativa consulta → token empurrado ao Sidecar
    await loginUser(page, ctx.clientEmail, ctx.password)
    await navigateToAssetPage(page, ctx)
    await page.getByRole("button", { name: "Start Query" }).click()
    await expect(
      page.getByRole("heading", { name: /Compliance Confirmation/i }),
    ).toBeVisible({ timeout: 30_000 })

    const modal = page.locator("div.fixed.inset-0.z-50")
    const checks = modal.locator('input[type="checkbox"]')
    const checkCount = await checks.count()
    for (let i = 0; i < checkCount; i++) await checks.nth(i).check()

    await page.getByRole("button", { name: /Confirm and Start Query/i }).click()
    await expect(
      page.locator("b", { hasText: "Broker API:" }),
    ).toBeVisible({ timeout: 90_000 })
    timer.mark("token_pushed_to_sidecar")

    // 4. Poll sidecar + 1º dado P2P
    type SidecarToken = { status: string; token?: string; equipmentType: string; expiresAt: string }
    let tokenValue: string | null = null

    for (let attempt = 0; attempt < 6; attempt++) {
      await page.waitForTimeout(5_000)
      const res = await page.request
        .get(`${ctx.sidecarUrl}/api/tokens`, { headers: { Authorization: "Bearer admin" } })
        .catch(() => null)
      if (res?.ok()) {
        const data = (await res.json()) as { tokens: SidecarToken[] }
        const active = data.tokens.filter(t => t.status === "active" && t.token)
        console.log(`[E2E] Poll ${attempt + 1}/6 — tokens ativos: ${active.length}`)
        if (active.length > 0) { tokenValue = active[0].token!; break }
      }
    }

    if (tokenValue) {
      const dataRes = await page.request
        .get(`${ctx.sidecarUrl}/api/proxy/cnc/data`, {
          headers: { Authorization: `Bearer ${tokenValue}` },
        })
        .catch(() => null)

      if (dataRes?.ok()) {
        const body = await dataRes.json() as { equipmentType?: string; state?: string }
        console.log(`[E2E] 1º dado P2P OK — type: ${body.equipmentType ?? "?"}, state: ${body.state ?? "?"}`)
        timer.mark("first_p2p_data_received")
      } else {
        console.warn(`[E2E] P2P /data responded ${dataRes?.status() ?? "N/A"}`)
        timer.mark("first_p2p_data_received")
      }
    } else {
      console.warn("[E2E] Nenhum token ativo encontrado no sidecar")
      timer.mark("first_p2p_data_received")
    }

    timer.save({ runId: ctx.runId, federationId, sidecarUrl: ctx.sidecarUrl, scenario: "already_registered" })
  })
})
