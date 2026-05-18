/**
 * End-to-end: full INTRA control-plane flow (live Firebase Auth + Firestore).
 *
 * Prerequisites:
 * - `.env.local` with valid Firebase client config (same as `npm run dev`)
 * - Email/password sign-in enabled; test emails do not require verification
 * - Firestore rules deployed as in the repo
 *
 * Run: `npm run test:e2e:full`
 * (long-running: ~10–20 minutes; uses one worker)
 */

import { test, expect } from "@playwright/test"
import {
  buildFlowContext,
  createAssetWizard,
  createPrivateFederation,
  fillComplianceWizard,
  fillGovernanceWizard,
  getFederationIdFromBrowse,
  loginUser,
  logout,
  ownerPublishOffer,
  saveConnectorProfile,
  signupUser,
} from "./helpers/intra-full-flow"

test.describe.configure({ mode: "serial", timeout: 900_000 })

test.describe("INTRA dataspace full flow (owner + client)", () => {
  test("cadastro → conector → federação privada → compliance → asset → governance → convite → acesso → consumo → métricas", async ({
    page,
  }) => {
    const ctx = buildFlowContext()
    const ownerPid = `urn:owner:${ctx.runId}`
    const consumerPid = `urn:consumer:${ctx.runId}`

    // --- Data Owner: register & setup ---
    await signupUser(page, expect, {
      name: "E2E Data Owner",
      email: ctx.ownerEmail,
      password: ctx.password,
      role: "datasource",
    })
    await saveConnectorProfile(page, {
      org: "E2E Owner Org",
      participantId: ownerPid,
      dspUrl: `https://owner-${ctx.runId}.example.com/dsp`,
    })

    await createPrivateFederation(page, expect, ctx)
    const federationId = await getFederationIdFromBrowse(page, ctx.federationName)

    await fillComplianceWizard(page, expect, federationId)
    await createAssetWizard(page, expect, ctx, federationId)
    await fillGovernanceWizard(page, expect, ctx, federationId)
    await ownerPublishOffer(page, expect, ctx)

    await logout(page)

    // --- Data Client: register & connector ---
    await signupUser(page, expect, {
      name: "E2E Data Client",
      email: ctx.clientEmail,
      password: ctx.password,
      role: "dataclient",
    })
    await saveConnectorProfile(page, {
      org: "E2E Consumer Org",
      participantId: consumerPid,
      dspUrl: `https://consumer-${ctx.runId}.example.com/dsp`,
    })

    await page.goto(`/federations/${federationId}`)
    await page.getByRole("button", { name: /Request connector connection/i }).click()
    await expect(page.getByText(/connection request submitted|Wait for the Data Owner/i)).toBeVisible({
      timeout: 60_000,
    })

    await logout(page)

    // --- Owner: approve connection + issue federation invite ---
    await loginUser(page, ctx.ownerEmail, ctx.password)
    await page.goto(`/federations/${federationId}`)
    await page.getByRole("button", { name: /Approve connection/i }).click()
    await expect(page.getByText(/Connector connection approved|approved/i)).toBeVisible({ timeout: 60_000 })

    await page.getByPlaceholder("invitee@company.com").fill(ctx.clientEmail)
    await page.getByRole("button", { name: /Issue invite/i }).click()
    await expect(page.getByText(/Invitation issued|issued/i)).toBeVisible({ timeout: 60_000 })

    await logout(page)

    // --- Client: accept invite ---
    await loginUser(page, ctx.clientEmail, ctx.password)
    await page.goto(`/federations/${federationId}`)
    await page.getByRole("button", { name: /Accept signed invite/i }).click()
    await expect(
      page.getByText(/Invitation accepted\. Federation membership is now active/i),
    ).toBeVisible({ timeout: 120_000 })

    await page.goto("/assets/browse")
    await page.getByPlaceholder(/Search federations, assets, data/i).fill(ctx.federationName)
    await page.getByRole("button", { name: /View details/i }).first().click()
    await page.locator("tr", { hasText: ctx.assetName }).getByRole("link", { name: /Access/i }).click()
    await page.getByRole("button", { name: "Request contract agreement" }).click()
    await expect(page.getByText(/Agreement requested|requested/i)).toBeVisible({ timeout: 60_000 })

    await logout(page)

    // --- Owner: finalize agreement (issues credential) ---
    await loginUser(page, ctx.ownerEmail, ctx.password)
    await page.goto("/assets/browse")
    await page.getByPlaceholder(/Search federations, assets, data/i).fill(ctx.federationName)
    await page.getByRole("button", { name: /View details/i }).first().click()
    await page.locator("tr", { hasText: ctx.assetName }).getByRole("link", { name: /Access/i }).click()
    await page.getByRole("button", { name: "Finalize" }).click()
    await expect(page.getByText(/Status:\s*finalized/i).first()).toBeVisible({ timeout: 90_000 })

    await logout(page)

    // --- Client: access workspace request ---
    await loginUser(page, ctx.clientEmail, ctx.password)
    await page.goto("/access")
    await page.getByLabel("Asset").selectOption({ label: new RegExp(ctx.assetName) })
    await page.getByLabel(/Purpose of use/i).fill("E2E consumption test purpose.")
    await page.getByRole("checkbox", { name: /I confirm that this request respects/i }).check()
    await page.getByRole("button", { name: /Submit access request/i }).click()
    await expect(page.getByText(/Access request submitted and registered for audit/i)).toBeVisible({
      timeout: 60_000,
    })

    await logout(page)

    // --- Owner: approve access request ---
    await loginUser(page, ctx.ownerEmail, ctx.password)
    await page.goto("/access/review")
    await page.getByRole("button", { name: "Approve" }).click()
    await expect(page.getByText(/approved/i).first()).toBeVisible({ timeout: 120_000 })

    await logout(page)

    // --- Client: consume data (creates access log) ---
    await loginUser(page, ctx.clientEmail, ctx.password)
    await page.goto("/assets/browse")
    await page.getByPlaceholder(/Search federations, assets, data/i).fill(ctx.federationName)
    await page.getByRole("button", { name: /View details/i }).first().click()
    await page.locator("tr", { hasText: ctx.assetName }).getByRole("link", { name: /Access/i }).click()

    await page.getByRole("button", { name: "Start Query" }).click()
    await expect(page.getByRole("heading", { name: /Compliance Confirmation/i })).toBeVisible({ timeout: 30_000 })
    const complianceChecks = page.locator("div.fixed.inset-0.z-50").locator('input[type="checkbox"]')
    const n = await complianceChecks.count()
    for (let i = 0; i < n; i++) {
      await complianceChecks.nth(i).check()
    }
    await page.getByRole("button", { name: /Confirm and Start Query/i }).click()
    await expect(page.getByText(/Broker API|Real-Time Readings/i)).toBeVisible({ timeout: 90_000 })

    await logout(page)

    // --- Owner: dashboard shows access logs (traceability) ---
    await loginUser(page, ctx.ownerEmail, ctx.password)
    await page.goto("/dashboard")
    await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible({ timeout: 60_000 })
    const accessLogsLabel = page.getByText("Access Logs", { exact: true })
    await expect(accessLogsLabel).toBeVisible()
    const accessLogsValue = accessLogsLabel.locator(
      "xpath=preceding-sibling::div[contains(@class,'text-2xl')]",
    )
    await expect(accessLogsValue).not.toHaveText("0", { timeout: 60_000 })
  })
})
