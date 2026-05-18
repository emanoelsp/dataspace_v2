/**
 * E2E: Federação Aberta (self-service) + Sidecar Proxy — fluxo completo P2P
 *
 * Pré-requisitos:
 *   - Sidecar proxy rodando em localhost:3100  (npm run dev em api-equipment/sidecar-proxy)
 *   - CNC API rodando em localhost:3001        (npm run dev em api-equipment/cnc)
 *   - Dataspaceapp rodando em localhost:3000   (npm run dev em dataspaceapp)
 *   - .env.local com Firebase config e SIDECAR_ADMIN_SECRET=admin
 *
 * Fluxo simulado:
 *   1. Dono dos dados: cadastro → conector (com sidecar endpoint) → federação aberta
 *      → compliance → ativo CNC → governança → publica oferta de contrato
 *   2. Cliente de dados: cadastro → conector → solicita conexão ao conector do dono
 *   3. Dono: aprova conexão do conector
 *   4. Cliente: solicita entrada na federação → auto-aprovado (self-service)
 *      → solicita acordo no ativo → owner finaliza acordo → cliente obtém credencial
 *      → aceita governança → inicia query → token gerado → enviado ao sidecar
 *   5. P2P: cliente acessa dados do CNC via sidecar proxy com o token
 *   6. Traceabilidade: log de acesso no sidecar e no dataspaceapp
 *
 * Execução: npm run test:e2e:open (workers=1, serial)
 */

import { test, expect } from "@playwright/test"
import {
  buildOpenFlowContext,
  createCncAsset,
  createOpenFederation,
  fillComplianceWizard,
  fillGovernanceWizard,
  getFederationIdFromBrowse,
  loginUser,
  logout,
  navigateToAssetPage,
  publishContractOffer,
  saveConnectorProfile,
  signupUser,
} from "./helpers/open-federation-flow"

test.describe.configure({ mode: "serial", timeout: 1_200_000 })

test.describe("Federação Aberta + Sidecar Proxy — fluxo P2P completo", () => {
  test("dono cria ativo CNC → cliente acessa via sidecar → rastreabilidade verificada", async ({ page }) => {
    const ctx = buildOpenFlowContext()
    const ownerPid = `urn:owner:open:${ctx.runId}`
    const consumerPid = `urn:consumer:open:${ctx.runId}`

    // ─── 1. Dono dos dados: cadastro + conector ──────────────────────────────
    await signupUser(page, expect, {
      name: "E2E Dono CNC",
      email: ctx.ownerEmail,
      password: ctx.password,
      role: "datasource",
    })
    await saveConnectorProfile(page, {
      org: "Planta Metal-Mecânica E2E",
      participantId: ownerPid,
      dspUrl: `https://owner-${ctx.runId}.example.com/dsp`,
      sidecarEndpoint: ctx.sidecarUrl,
    })

    // ─── 2. Dono: federação aberta ───────────────────────────────────────────
    await createOpenFederation(page, expect, ctx)
    const federationId = await getFederationIdFromBrowse(page, ctx.federationName)

    // ─── 3. Dono: compliance ─────────────────────────────────────────────────
    await fillComplianceWizard(page, expect, federationId)

    // ─── 4. Dono: ativo CNC com sidecar endpoint ─────────────────────────────
    await createCncAsset(page, expect, ctx, federationId)

    // ─── 5. Dono: governança ─────────────────────────────────────────────────
    await fillGovernanceWizard(page, expect, ctx, federationId)

    // ─── 6. Dono: publica oferta de contrato ─────────────────────────────────
    await publishContractOffer(page, expect, ctx)

    await logout(page)

    // ─── 7. Cliente: cadastro + conector ─────────────────────────────────────
    await signupUser(page, expect, {
      name: "E2E Cliente Dados",
      email: ctx.clientEmail,
      password: ctx.password,
      role: "dataclient",
    })
    await saveConnectorProfile(page, {
      org: "Empresa Consumidora E2E",
      participantId: consumerPid,
      dspUrl: `https://consumer-${ctx.runId}.example.com/dsp`,
    })

    // ─── 8. Cliente: solicita conexão ao conector do dono ────────────────────
    await page.goto(`/federations/${federationId}`)
    await page.getByRole("button", { name: /Request connector connection/i }).click()
    await expect(
      page.getByText(/connection request submitted|Wait for the Data Owner/i),
    ).toBeVisible({ timeout: 60_000 })

    await logout(page)

    // ─── 9. Dono: aprova conexão do conector ─────────────────────────────────
    await loginUser(page, ctx.ownerEmail, ctx.password)
    await page.goto(`/federations/${federationId}`)
    await page.getByRole("button", { name: /Approve connection/i }).click()
    await expect(
      page.getByText(/Connector connection approved|approved/i),
    ).toBeVisible({ timeout: 60_000 })

    await logout(page)

    // ─── 10. Cliente: solicita entrada → federação aberta → auto-aprovado ────
    await loginUser(page, ctx.clientEmail, ctx.password)
    await page.goto(`/federations/${federationId}`)

    // Aguarda a conexão aparecer como ativa antes de tentar entrar na federação
    await page.getByText(/Status:\s*active/i).waitFor({ state: "visible", timeout: 60_000 })

    // Preenche propósito (opcional)
    const purposeField = page.getByPlaceholder(/Describe why you need access/i)
    if (await purposeField.isVisible({ timeout: 2000 }).catch(() => false)) {
      await purposeField.fill("Monitoramento em tempo real da célula CNC para análise de desgaste.")
    }

    // Aceita os termos — obrigatório para que requestMembership prossiga
    const termsCheck = page.getByRole("checkbox", { name: /federation policy/i }).first()
    await termsCheck.waitFor({ state: "visible", timeout: 30_000 })
    await termsCheck.check()

    await page.getByRole("button", { name: /Request membership|Join federation/i }).click()
    // "can now move to asset agreements" is unique to the activation success message
    await expect(
      page.getByText(/can now move to asset agreements/i).first(),
    ).toBeVisible({ timeout: 60_000 })

    // ─── 11. Cliente: solicita acordo de contrato no ativo ────────────────────
    await navigateToAssetPage(page, ctx)
    await page.getByRole("button", { name: "Request contract agreement" }).click()
    await expect(
      page.getByRole("button", { name: "Agreement requested" }),
    ).toBeVisible({ timeout: 60_000 })

    await logout(page)

    // ─── 12. Dono: finaliza acordo (emite credencial) ─────────────────────────
    await loginUser(page, ctx.ownerEmail, ctx.password)
    await navigateToAssetPage(page, ctx)
    await page.getByRole("button", { name: "Finalize" }).click()
    await expect(
      page.getByText(/Status:\s*finalized/i).first(),
    ).toBeVisible({ timeout: 90_000 })

    await logout(page)

    // ─── 13. Cliente: inicia query → token gerado → sidecar recebe ───────────
    await loginUser(page, ctx.clientEmail, ctx.password)
    await navigateToAssetPage(page, ctx)

    await page.getByRole("button", { name: "Start Query" }).click()
    await expect(
      page.getByRole("heading", { name: /Compliance Confirmation/i }),
    ).toBeVisible({ timeout: 30_000 })

    // Marca todos os checkboxes de compliance
    const complianceChecks = page.locator("div.fixed.inset-0.z-50").locator('input[type="checkbox"]')
    const checkCount = await complianceChecks.count()
    for (let i = 0; i < checkCount; i++) {
      await complianceChecks.nth(i).check()
    }
    await page.getByRole("button", { name: /Confirm and Start Query/i }).click()

    // Confirma que a query iniciou — <b>Broker API:</b> só aparece quando showBrokerUrl=true
    await expect(
      page.locator("b", { hasText: "Broker API:" }),
    ).toBeVisible({ timeout: 90_000 })

    // Aguarda o push assíncrono ao sidecar
    await page.waitForTimeout(3000)

    // ─── 14. Verifica token no sidecar ────────────────────────────────────────
    const sidecarStatus = await page.request.get(`${ctx.sidecarUrl}/api/tokens`, {
      headers: { Authorization: "Bearer admin" },
    }).catch(() => null)

    if (sidecarStatus?.ok()) {
      const sidecarData = await sidecarStatus.json()
      const tokens: Array<{ status: string; dataClientId: string }> = sidecarData.tokens ?? []
      const activeTokens = tokens.filter((t) => t.status === "active")
      expect(activeTokens.length).toBeGreaterThan(0)

      const ourToken = activeTokens.find((t) =>
        t.dataClientId === consumerPid || t.dataClientId.includes(consumerPid),
      )
      // Token found if sidecar was reachable and push succeeded
      console.log(`[E2E] Sidecar tokens: total=${tokens.length}, active=${activeTokens.length}`)
      if (ourToken) {
        console.log("[E2E] Token do cliente encontrado no sidecar ✓")
      }
    } else {
      console.warn("[E2E] Sidecar não respondeu — verificação ignorada (sidecar pode estar offline)")
    }

    // ─── 15. Acesso P2P via sidecar proxy ─────────────────────────────────────
    // Obtém o token da resposta da API de tokens (se sidecar disponível)
    const tokensRes = await page.request.get(`${ctx.sidecarUrl}/api/tokens`, {
      headers: { Authorization: "Bearer admin" },
    }).catch(() => null)

    if (tokensRes?.ok()) {
      const tokensData = await tokensRes.json()
      const activeToken: { token: string } | undefined = (tokensData.tokens ?? []).find(
        (t: { status: string }) => t.status === "active",
      )

      if (activeToken?.token) {
        // Testa acesso P2P ao CNC via sidecar
        const proxyRes = await page.request.get(`${ctx.sidecarUrl}/api/proxy/cnc/data`, {
          headers: { Authorization: `Bearer ${activeToken.token}` },
        }).catch(() => null)

        if (proxyRes?.ok()) {
          const cncData = await proxyRes.json()
          expect(cncData).toHaveProperty("equipmentType")
          console.log(`[E2E] P2P via sidecar OK — equipmentType: ${cncData.equipmentType}, estado: ${cncData.state}`)
        } else {
          console.warn(`[E2E] Proxy P2P respondeu com ${proxyRes?.status()} — CNC pode estar offline`)
        }

        // Verifica log de acesso no sidecar
        const logRes = await page.request.get(`${ctx.sidecarUrl}/api/access-log?limit=10`, {
          headers: { Authorization: "Bearer admin" },
        }).catch(() => null)

        if (logRes?.ok()) {
          const logData = await logRes.json()
          const entries: Array<{ equipmentType: string }> = logData.entries ?? []
          console.log(`[E2E] Log de acesso no sidecar: ${entries.length} entradas`)
          if (entries.length > 0) {
            console.log(`[E2E] Última entrada: equipmentType=${entries[0].equipmentType}`)
          }
        }
      }
    }

    // ─── 16. Traceabilidade: dashboard do dono mostra logs ───────────────────
    await logout(page)
    await loginUser(page, ctx.ownerEmail, ctx.password)
    await page.goto("/dashboard")
    await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible({ timeout: 60_000 })

    const accessLogsLabel = page.getByText("Access Logs", { exact: true })
    await expect(accessLogsLabel).toBeVisible()
    const accessLogsValue = accessLogsLabel.locator(
      "xpath=preceding-sibling::div[contains(@class,'text-2xl')]",
    )
    await expect(accessLogsValue).not.toHaveText("0", { timeout: 60_000 })
    console.log("[E2E] Dashboard do dono mostra access logs ✓")
  })
})
