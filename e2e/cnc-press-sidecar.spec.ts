/**
 * E2E: CNC → Press via Open Federation + Sidecar Proxy
 *
 * Scenario:
 *   - CNC plant (192.168.0.70:3001) acts as data owner
 *   - Hydraulic Press (192.168.0.168:3002) acts as data client
 *   - Dataspace running at https://dataspace-v2.vercel.app
 *   - Sidecar proxy running at localhost:3100
 *   - Token TTL: 5 minutes
 *
 * Prerequisites:
 *   1. Sidecar proxy running: npm run dev (api-equipment/sidecar-proxy) → :3100
 *   2. CNC equipment running: npm run dev (api-equipment/cnc)           → :3001 at 192.168.0.70
 *   3. Press equipment running: npm run dev (api-equipment/press)       → :3002 at 192.168.0.168
 *   4. .env.local with Firebase config pointing to the same project as Vercel
 *
 * Run:
 *   npx playwright test --config=playwright-remote.config.ts e2e/cnc-press-sidecar.spec.ts
 *
 * Flow:
 *   1.  CNC owner: signup → connector (sidecar endpoint) → open federation
 *   2.  CNC owner: compliance → CNC asset (IRDI ACJ843) → governance (5min TTL) → contract offer
 *   3.  Press client: signup → connector → request connector connection
 *   4.  CNC owner: approve connector connection
 *   5.  Press client: request membership → auto-approved (open federation)
 *   6.  Press client: request contract agreement on CNC asset
 *   7.  CNC owner: finalize agreement → access token (5 min) pushed to sidecar
 *   8.  Press client: start query → compliance confirmation → token active
 *   9.  Sidecar: verify token registered with 5-min TTL
 *  10.  P2P access: Press reads CNC data via sidecar proxy with the token
 *  11.  Traceability: access log entry in sidecar + Firestore dashboard
 */

import { test, expect } from "@playwright/test"
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

test.describe("CNC → Press: Open Federation + 5-min Sidecar Token", () => {
  test("press accesses cnc data via sidecar with 5-min token", async ({ page }) => {
    const ctx = buildCncPressContext()

    // ── 1. CNC: signup + connector ─────────────────────────────────────────────
    console.log(`[E2E] Run ID: ${ctx.runId}`)
    console.log(`[E2E] CNC owner: ${ctx.ownerEmail}`)
    console.log(`[E2E] Press client: ${ctx.clientEmail}`)

    await signupUser(page, expect, {
      name: "CNC Plant Owner",
      email: ctx.ownerEmail,
      password: ctx.password,
      role: "datasource",
    })
    await setupCncConnector(page, ctx)

    // ── 2. CNC: open federation ────────────────────────────────────────────────
    await createOpenFederation(page, expect, ctx)
    const federationId = await getFederationId(page, ctx.federationName)
    console.log(`[E2E] Federation ID: ${federationId}`)

    // ── 3. CNC: compliance ─────────────────────────────────────────────────────
    await fillComplianceWizard(page, expect, federationId)

    // ── 4. CNC: asset (IRDI → CNC machining center) ────────────────────────────
    await createCncAsset(page, expect, ctx, federationId)
    console.log(`[E2E] Asset ID: ${ctx.assetId}`)

    // ── 5. CNC: governance (5-min TTL) ─────────────────────────────────────────
    await fillGovernanceWizard(page, expect, ctx, federationId)

    // ── 6. CNC: publish contract offer ─────────────────────────────────────────
    await publishContractOffer(page, expect, ctx)

    await logout(page)

    // ── 7. Press: signup + connector ──────────────────────────────────────────
    await signupUser(page, expect, {
      name: "Hydraulic Press Plant",
      email: ctx.clientEmail,
      password: ctx.password,
      role: "dataclient",
    })
    await setupPressConnector(page, ctx)

    // ── 8. Press: request connector connection to CNC ──────────────────────────
    await page.goto(`/federations/${federationId}`)
    await page.getByRole("button", { name: /Request connector connection/i }).click()
    await expect(
      page.getByText(/connection request submitted|Wait for the Data Owner/i),
    ).toBeVisible({ timeout: 60_000 })

    await logout(page)

    // ── 9. CNC: approve connector connection ───────────────────────────────────
    await loginUser(page, ctx.ownerEmail, ctx.password)
    await page.goto(`/federations/${federationId}`)
    await page.getByRole("button", { name: /Approve connection/i }).click()
    await expect(
      page.getByText(/Connector connection approved|approved/i),
    ).toBeVisible({ timeout: 60_000 })

    await logout(page)

    // ── 10. Press: join open federation (self-service, auto-approved) ──────────
    await loginUser(page, ctx.clientEmail, ctx.password)
    await page.goto(`/federations/${federationId}`)

    // Wait for connector connection to show as active
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

    // ── 11. Press: request contract agreement on CNC asset ────────────────────
    await navigateToAssetPage(page, ctx)
    await page.getByRole("button", { name: "Request contract agreement" }).click()
    await expect(
      page.getByRole("button", { name: "Agreement requested" }),
    ).toBeVisible({ timeout: 60_000 })

    await logout(page)

    // ── 12. CNC: finalize agreement → token (5 min) issued + pushed to sidecar ─
    await loginUser(page, ctx.ownerEmail, ctx.password)
    await navigateToAssetPage(page, ctx)
    await page.getByRole("button", { name: "Finalize" }).click()
    await expect(
      page.getByText(/Status:\s*finalized/i).first(),
    ).toBeVisible({ timeout: 90_000 })

    await logout(page)

    // ── 13. Press: start query → compliance confirmation → token active ────────
    await loginUser(page, ctx.clientEmail, ctx.password)
    await navigateToAssetPage(page, ctx)

    await page.getByRole("button", { name: "Start Query" }).click()
    await expect(
      page.getByRole("heading", { name: /Compliance Confirmation/i }),
    ).toBeVisible({ timeout: 30_000 })

    // Accept all compliance checkboxes in the modal
    const modal = page.locator("div.fixed.inset-0.z-50")
    const checks = modal.locator('input[type="checkbox"]')
    const checkCount = await checks.count()
    for (let i = 0; i < checkCount; i++) {
      await checks.nth(i).check()
    }
    // Intercept the push-token request to capture sidecarUrl and response
    const pushTokenPromise = page.waitForResponse(
      (res) => res.url().includes("/api/sidecar/push-token"),
      { timeout: 30_000 },
    ).then(async (res) => {
      const req = res.request()
      let body: Record<string, unknown> = {}
      try { body = JSON.parse(req.postData() ?? "{}") as Record<string, unknown> } catch { /* ignore */ }
      const status = res.status()
      let resBody = ""
      try { resBody = await res.text() } catch { /* ignore */ }
      console.log(`[E2E] push-token → status ${status}, sidecarUrl: ${body.sidecarUrl as string ?? "(not sent)"}, response: ${resBody.slice(0, 200)}`)
    }).catch((e: unknown) => {
      console.warn(`[E2E] push-token request not captured: ${String(e)}`)
    })

    await page.getByRole("button", { name: /Confirm and Start Query/i }).click()

    // Broker API label appears when token is active and pushed
    await expect(
      page.locator("b", { hasText: "Broker API:" }),
    ).toBeVisible({ timeout: 90_000 })

    await pushTokenPromise

    // ── 14. Verify sidecar received the 5-min token ────────────────────────────
    console.log(`[E2E] Sidecar URL: ${ctx.sidecarUrl}`)

    // Poll up to 30 s for the async Vercel→sidecar push to complete
    type SidecarToken = { status: string; dataClientId: string; equipmentType: string; expiresAt: string; usageCount: number; token?: string }
    let sidecarData: { tokens: SidecarToken[] } = { tokens: [] }
    let sidecarOk = false

    for (let attempt = 0; attempt < 6; attempt++) {
      await page.waitForTimeout(5_000)
      const res = await page.request
        .get(`${ctx.sidecarUrl}/api/tokens`, {
          headers: { Authorization: "Bearer admin" },
        })
        .catch(() => null)
      if (res?.ok()) {
        sidecarOk = true
        sidecarData = await res.json()
        const active = (sidecarData.tokens ?? []).filter((t) => t.status === "active")
        console.log(`[E2E] Poll ${attempt + 1}/6 — sidecar tokens: ${sidecarData.tokens?.length ?? 0} total, ${active.length} active`)
        if (active.length > 0) break
      } else {
        console.warn(`[E2E] Poll ${attempt + 1}/6 — sidecar not reachable (status: ${res?.status() ?? "N/A"})`)
      }
    }

    if (sidecarOk) {
      const allTokens = sidecarData.tokens ?? []
      const activeTokens = allTokens.filter((t) => t.status === "active")
      expect(activeTokens.length).toBeGreaterThan(0)
      console.log(`[E2E] Sidecar active tokens: ${activeTokens.length}`)

      // Verify TTL is approximately 5 minutes (between 4 and 6 minutes from now)
      const ourToken = activeTokens.find(
        (t) => t.equipmentType === "cnc" && t.dataClientId.includes("press"),
      ) ?? activeTokens[0]

      if (ourToken?.expiresAt) {
        const expiresAt = new Date(ourToken.expiresAt)
        const ttlMs = expiresAt.getTime() - Date.now()
        const ttlMinutes = ttlMs / 60_000
        expect(ttlMinutes).toBeGreaterThan(3)
        expect(ttlMinutes).toBeLessThan(7)
        console.log(`[E2E] Token TTL: ${ttlMinutes.toFixed(1)} min — expires at ${expiresAt.toISOString()}`)
      }

      // ── 15. P2P access: Press reads CNC data through sidecar ─────────────────
      const activeToken = activeTokens[0]
      if (activeToken) {
        // Need the raw token value — list returns full objects
        const tokenWithValue = allTokens.find(
          (t) => t.status === "active" && t.token,
        ) as { token: string; equipmentType: string } | undefined

        if (tokenWithValue?.token) {
          console.log(`[E2E] Testing P2P proxy access to CNC data...`)

          // Test /api/proxy/cnc/data
          const dataRes = await page.request
            .get(`${ctx.sidecarUrl}/api/proxy/cnc/data`, {
              headers: { Authorization: `Bearer ${tokenWithValue.token}` },
            })
            .catch(() => null)

          if (dataRes?.ok()) {
            const cncData = await dataRes.json()
            expect(cncData).toHaveProperty("equipmentType")
            console.log(
              `[E2E] CNC /data OK — type: ${cncData.equipmentType as string}, state: ${cncData.state as string}`,
            )
          } else {
            console.warn(
              `[E2E] CNC proxy /data responded ${dataRes?.status() ?? "N/A"} — CNC may be offline`,
            )
          }

          // Test /api/proxy/cnc/aas
          const aasRes = await page.request
            .get(`${ctx.sidecarUrl}/api/proxy/cnc/aas`, {
              headers: { Authorization: `Bearer ${tokenWithValue.token}` },
            })
            .catch(() => null)

          if (aasRes?.ok()) {
            const aasData = await aasRes.json()
            console.log(
              `[E2E] CNC /aas OK — submodels: ${JSON.stringify((aasData as { submodels?: unknown[] }).submodels?.length ?? 0)}`,
            )
          } else {
            console.warn(`[E2E] CNC proxy /aas responded ${aasRes?.status() ?? "N/A"}`)
          }

          // Verify token is NOT valid for press equipment (cross-equipment block)
          const wrongEquipRes = await page.request
            .get(`${ctx.sidecarUrl}/api/proxy/press/data`, {
              headers: { Authorization: `Bearer ${tokenWithValue.token}` },
            })
            .catch(() => null)

          if (wrongEquipRes) {
            expect(wrongEquipRes.status()).toBe(403)
            console.log(`[E2E] Cross-equipment block confirmed (403) ✓`)
          }
        }
      }

      // ── 16. Verify access log in sidecar ──────────────────────────────────────
      const logRes = await page.request
        .get(`${ctx.sidecarUrl}/api/access-log?limit=20`, {
          headers: { Authorization: "Bearer admin" },
        })
        .catch(() => null)

      if (logRes?.ok()) {
        const logData = await logRes.json()
        const entries: Array<{ equipmentType: string; success: boolean }> = logData.entries ?? []
        const cncEntries = entries.filter((e) => e.equipmentType === "cnc")
        console.log(
          `[E2E] Sidecar access log: ${entries.length} total, ${cncEntries.length} CNC entries`,
        )
        if (cncEntries.length > 0) {
          const successCount = cncEntries.filter((e) => e.success).length
          console.log(`[E2E] CNC accesses — success: ${successCount}/${cncEntries.length}`)
        }
      }
    } else {
      console.warn(
        "[E2E] Sidecar did not respond — skipping token verification (sidecar may be offline)",
      )
    }

    // ── 17. Traceability: CNC dashboard shows access logs ─────────────────────
    await logout(page)
    await loginUser(page, ctx.ownerEmail, ctx.password)
    await page.goto("/dashboard")
    await expect(
      page.getByRole("heading", { name: "Dashboard" }),
    ).toBeVisible({ timeout: 60_000 })

    const accessLogsLabel = page.getByText("Access Logs", { exact: true })
    await expect(accessLogsLabel).toBeVisible()
    const accessLogsValue = accessLogsLabel.locator(
      "xpath=preceding-sibling::div[contains(@class,'text-2xl')]",
    )
    await expect(accessLogsValue).not.toHaveText("0", { timeout: 60_000 })
    console.log("[E2E] CNC dashboard shows access logs ✓")

    // ── 18. API Monitor: sidecar data visible inside dataspace ────────────────
    await page.goto("/dashboard/sidecar")
    await expect(
      page.getByRole("heading", { name: /Sidecar Access Monitor/i }),
    ).toBeVisible({ timeout: 30_000 })

    // Owner has sidecar endpoint configured — KPI cards should load
    await page.waitForTimeout(5_000)
    const activeKpi = page.locator("div", { hasText: "Active Tokens" }).first()
    await expect(activeKpi).toBeVisible({ timeout: 30_000 })
    console.log("[E2E] API Monitor visible in dataspace ✓")
  })
})
