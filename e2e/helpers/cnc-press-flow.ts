/**
 * Helpers for the CNC → Press P2P flow test.
 *
 * Owner (CNC plant, 192.168.0.70:3001) creates an open federation and publishes
 * its machining-center data asset. Press (192.168.0.168:3002) joins the
 * federation, negotiates a contract, and consumes data through the sidecar.
 */
import type { Page } from "@playwright/test"

type ExpectFn = typeof import("@playwright/test").expect

export type CncPressContext = {
  runId: string
  /** CNC plant — data owner */
  ownerEmail: string
  /** Hydraulic press — data client */
  clientEmail: string
  password: string
  federationName: string
  assetName: string
  /** Live sidecar running at localhost:3100 */
  sidecarUrl: string
  /** CNC equipment API endpoint */
  cncApiUrl: string
  /** Press equipment API endpoint */
  pressApiUrl: string
  /** Token TTL in minutes */
  tokenTtlMinutes: number
  assetId?: string
}

export function buildCncPressContext(overrides?: Partial<CncPressContext>): CncPressContext {
  const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
  return {
    runId,
    ownerEmail: `e2e.cnc.${runId}@dataspace-e2e.test`,
    clientEmail: `e2e.press.${runId}@dataspace-e2e.test`,
    password: `E2eP2P!${runId.slice(-6)}`,
    federationName: `Manufacturing Cell ${runId}`,
    assetName: `CNC Machining Center ${runId}`,
    sidecarUrl: process.env.SIDECAR_PUBLIC_URL ?? "http://localhost:3100",
    cncApiUrl: "http://192.168.0.70:3001",
    pressApiUrl: "http://192.168.0.168:3002",
    tokenTtlMinutes: 5,
    ...overrides,
  }
}

// ─── Auth helpers ──────────────────────────────────────────────────────────────

async function waitForUnauthenticated(page: Page) {
  await page.waitForFunction(
    () => !document.body.textContent?.includes("Checking session..."),
    { timeout: 30_000 },
  )
  const logoutBtn = page.getByRole("button", { name: "Logout" })
  if (await logoutBtn.isVisible({ timeout: 1_500 }).catch(() => false)) {
    await logoutBtn.click()
    await page.getByRole("button", { name: "Login" }).waitFor({ state: "visible", timeout: 20_000 })
  }
}

export async function signupUser(
  page: Page,
  expect: ExpectFn,
  input: { name: string; email: string; password: string; role: "datasource" | "dataclient" },
) {
  await page.goto("/")
  await waitForUnauthenticated(page)
  await page.getByRole("button", { name: "Signup" }).click()

  const modal = page.locator("div.fixed.inset-0").filter({ hasText: "Full Name" })
  await modal.waitFor({ state: "visible", timeout: 20_000 })

  await modal.locator("#signup-fullname").fill(input.name)
  await modal.locator("#signup-email").fill(input.email)
  await modal.locator("#signup-password").fill(input.password)

  if (input.role === "datasource") {
    await modal.getByText("Data Owner (provider)").click()
  } else {
    await modal.getByText("Data Client (consumer)").click()
  }

  await modal.getByRole("button", { name: "Register" }).click()
  await modal.waitFor({ state: "hidden", timeout: 90_000 })
  await page.getByRole("button", { name: "Logout" }).waitFor({ state: "visible", timeout: 30_000 })
}

export async function loginUser(page: Page, email: string, password: string) {
  await page.goto("/")
  await waitForUnauthenticated(page)
  await page.getByRole("button", { name: "Login" }).first().click()

  const modal = page.locator("div.fixed.inset-0").filter({ hasText: "Login" })
  await modal.waitFor({ state: "visible", timeout: 20_000 })
  await modal.locator("#signin-email").fill(email)
  await modal.locator("#signin-password").fill(password)
  await modal.getByRole("button", { name: "Login" }).click()
  await page.getByRole("button", { name: "Logout" }).waitFor({ state: "visible", timeout: 60_000 })
}

export async function logout(page: Page) {
  await page.getByRole("button", { name: "Logout" }).click()
  await page.getByRole("button", { name: "Login" }).waitFor({ state: "visible", timeout: 30_000 })
}

// ─── Owner setup ───────────────────────────────────────────────────────────────

export async function setupCncConnector(page: Page, ctx: CncPressContext) {
  await page.goto("/profile/connector/configure")
  await page.locator("#connector-name").waitFor({ state: "visible", timeout: 30_000 })

  await page.locator("#connector-name").fill(`CNC Plant Connector ${ctx.runId}`)
  await page.locator("#connector-org").fill("Metal-Mechanical Plant")
  await page.locator("#connector-participant-id").fill(`urn:plant:cnc:${ctx.runId}`)
  await page.locator("#connector-scope-label").fill("Shop-floor CNC cell")
  await page.locator("#connector-dsp-url").fill(`https://cnc-${ctx.runId}.plant.local/dsp`)
  await page.locator("#connector-sidecar-endpoint").fill(ctx.sidecarUrl)
  await page.getByRole("button", { name: /Create connector|Save connector/i }).click()
  await page.waitForURL("**/profile/connector", { timeout: 60_000 })
}

export async function createOpenFederation(page: Page, expect: ExpectFn, ctx: CncPressContext) {
  await page.goto("/federations/create")
  await page.locator("#fed-name").waitFor({ state: "visible", timeout: 30_000 })

  await page.locator("#fed-name").fill(ctx.federationName)
  await page.locator("#fed-description").fill(
    "Open manufacturing federation for CNC machining data sharing.",
  )
  await page.locator("#fed-org").fill("Metal-Mechanical Plant")
  await page.getByRole("button", { name: "Next: Federation Structure" }).click()

  await page.locator("#fed-type").waitFor({ state: "visible", timeout: 15_000 })
  await page.locator("#fed-type").selectOption("Open")
  await page.locator("#fed-domains").fill("Manufacturing, CNC, Metal-Mechanical")
  await page.locator("#fed-main-domain").fill("Manufacturing")
  await page.getByRole("button", { name: "Next: Contact Info" }).click()

  await page.locator("#fed-contact-email").waitFor({ state: "visible", timeout: 15_000 })
  await page.locator("#fed-contact-email").fill(ctx.ownerEmail)
  await page.getByRole("button", { name: "Next: Review & Submit" }).click()

  await page.getByRole("button", { name: "Register Federation" }).click()
  await expect(
    page.getByRole("heading", { name: /Federation Created/i }),
  ).toBeVisible({ timeout: 120_000 })
}

export async function getFederationId(page: Page, federationName: string): Promise<string> {
  await page.goto("/federations/browse")
  await page.getByPlaceholder(/Search federations/i).fill(federationName)
  const link = page.getByRole("link", { name: /View Federation/i }).first()
  await link.waitFor({ state: "visible", timeout: 60_000 })
  const href = await link.getAttribute("href")
  if (!href) throw new Error("Federation link not found")
  return href.replace("/federations/", "").split("?")[0]
}

export async function fillComplianceWizard(page: Page, expect: ExpectFn, federationId: string) {
  await page.goto("/accordance/compliance/create")
  await page.locator("#comp-federation").waitFor({ state: "visible", timeout: 30_000 })

  await page.locator("#comp-federation").selectOption(federationId)
  await page.getByRole("button", { name: "Next: Legal Basis" }).click()

  await page.getByRole("checkbox", { name: /LGPD/i }).check()
  await page.getByRole("button", { name: "Next: Terms & Conditions" }).click()

  await page.locator("#comp-terms").waitFor({ state: "visible", timeout: 15_000 })
  await page.locator("#comp-terms").fill(
    "CNC machining data shared via authenticated sidecar proxy. 5-minute token TTL enforced.",
  )
  await page.getByRole("checkbox", { name: /I accept the Terms/i }).check()
  await page.getByRole("button", { name: "Next: Consent Logs" }).click()

  await page.locator("#comp-consent-log").waitFor({ state: "visible", timeout: 15_000 })
  await page.locator("#comp-consent-log").fill("All access logged by sidecar proxy and Firestore.")
  await page.getByRole("button", { name: "Next: Digital Signature" }).click()

  await page.locator("#comp-signature").waitFor({ state: "visible", timeout: 15_000 })
  await page.locator("#comp-signature").fill("Metal-Mechanical Plant E2E")
  await page.getByRole("button", { name: "Next: Review & Register" }).click()

  await page.getByRole("button", { name: "Register Compliance" }).click()
  await expect(
    page.getByText(/Compliance registered successfully/i),
  ).toBeVisible({ timeout: 120_000 })
}

export async function createCncAsset(
  page: Page,
  expect: ExpectFn,
  ctx: CncPressContext,
  federationId: string,
) {
  await page.goto(
    `/assets/create?federationId=${encodeURIComponent(federationId)}&federationName=${encodeURIComponent(ctx.federationName)}`,
  )
  await page.getByRole("button", { name: "Next: Asset Details" }).click()
  await page.locator("#asset-name").waitFor({ state: "visible", timeout: 30_000 })

  await page.locator("#asset-name").fill(ctx.assetName)
  await page.locator("#asset-description").fill(
    "Live telemetry from CNC machining center — spindle speed, load, axis positions.",
  )
  await page.locator("#asset-type").selectOption("CPS")
  await page.locator("#asset-kind").selectOption("data")
  await page.locator("#asset-purpose").fill("Real-time CNC monitoring and predictive maintenance")
  // ECLASS IRDI for CNC machining center — sidecar uses this to resolve equipment type
  await page.locator("#asset-irdi").fill("0173-1#01-ACJ843#001")
  await page.getByRole("button", { name: "Next: Technical Info" }).click()

  await page.locator("#asset-api-endpoint").waitFor({ state: "visible", timeout: 15_000 })
  await page.locator("#asset-api-endpoint").fill(`${ctx.cncApiUrl}/api/data`)
  await page.locator("#asset-data-format").selectOption("JSON")
  await page.locator("#asset-exchange-mode").selectOption("stream")
  await page.getByRole("button", { name: "Next: Review & Register" }).click()

  await page.getByRole("button", { name: "Register Asset" }).click()
  await expect(
    page.getByText(/Asset registered successfully/i),
  ).toBeVisible({ timeout: 120_000 })

  // Capture asset ID for later navigation
  await page.goto("/search/assets")
  const input = page.locator('input[placeholder*="Search across asset metadata"]')
  await input.waitFor({ state: "visible", timeout: 30_000 })
  await input.fill(ctx.assetName)
  const assetLink = page.getByRole("link", { name: /Open asset/i }).first()
  await assetLink.waitFor({ state: "visible", timeout: 60_000 })
  const href = await assetLink.getAttribute("href")
  if (href) {
    ctx.assetId = href.replace("/assets/", "").split("?")[0]
  }
}

export async function fillGovernanceWizard(
  page: Page,
  expect: ExpectFn,
  ctx: CncPressContext,
  federationId: string,
) {
  await page.goto("/accordance/governance/create")
  await page.locator("#gov-federation").waitFor({ state: "visible", timeout: 30_000 })

  await page.locator("#gov-federation").selectOption(federationId)
  await page.getByRole("button", { name: "Next: Asset Selection" }).click()

  await page.getByRole("checkbox", { name: ctx.assetName }).waitFor({ state: "visible", timeout: 120_000 })
  await page.getByRole("checkbox", { name: ctx.assetName }).check()
  await page.getByRole("button", { name: "Next: Roles & Permissions" }).click()

  await page.locator("#gov-roles").waitFor({ state: "visible", timeout: 15_000 })
  await page.locator("#gov-roles").fill("Press plant: read-only data stream.")
  await page.getByRole("button", { name: "Next: Access Policies" }).click()

  await page.locator("#gov-policies").waitFor({ state: "visible", timeout: 15_000 })
  await page.locator("#gov-policies").fill(
    `Access via sidecar token only. Token TTL: ${ctx.tokenTtlMinutes} minutes.`,
  )
  await page.getByRole("button", { name: "Next: Audit & Traceability" }).click()

  await page.locator("#gov-audit").waitFor({ state: "visible", timeout: 15_000 })
  await page.locator("#gov-audit").fill("All sidecar proxy accesses logged in Firestore and local store.")
  await page.getByRole("button", { name: "Next: Usage Periods" }).click()

  await page.locator("#gov-usage").waitFor({ state: "visible", timeout: 15_000 })
  await page.locator("#gov-usage").fill("Continuous — shift hours only.")
  await page.getByRole("button", { name: "Next: Revocation & Supervision" }).click()

  await page.locator("#gov-revocation").waitFor({ state: "visible", timeout: 15_000 })
  await page.locator("#gov-revocation").fill(
    "CNC owner may revoke token via sidecar dashboard or API Monitor.",
  )
  await page.getByRole("button", { name: "Next: Review & Submit" }).click()

  await page.getByRole("button", { name: "Register Governance Policy" }).click()
  await expect(
    page.getByText(/Governance policy registered successfully/i),
  ).toBeVisible({ timeout: 120_000 })
}

export async function publishContractOffer(page: Page, expect: ExpectFn, ctx: CncPressContext) {
  if (ctx.assetId) {
    await page.goto(`/assets/${ctx.assetId}`)
  } else {
    await page.goto("/assets/browse")
    await page.getByPlaceholder(/Search federations, assets, data/i).fill(ctx.federationName)
    await page.getByRole("button", { name: /View details/i }).first().click()
    await page.locator("tr", { hasText: ctx.assetName }).getByRole("link", { name: /Access/i }).click()
  }
  await page.getByText(/Governance policy:.*attached/i).waitFor({ state: "visible", timeout: 60_000 })
  await page.getByRole("button", { name: "Publish standard contract offer" }).click()
  await expect(
    page.getByRole("button", { name: "Standard offer published" }),
  ).toBeVisible({ timeout: 90_000 })
}

// ─── Client setup ──────────────────────────────────────────────────────────────

export async function setupPressConnector(page: Page, ctx: CncPressContext) {
  await page.goto("/profile/connector/configure")
  await page.locator("#connector-name").waitFor({ state: "visible", timeout: 30_000 })

  await page.locator("#connector-name").fill(`Hydraulic Press Connector ${ctx.runId}`)
  await page.locator("#connector-org").fill("Press Manufacturing Plant")
  await page.locator("#connector-participant-id").fill(`urn:plant:press:${ctx.runId}`)
  await page.locator("#connector-scope-label").fill("Press cell — CNC data consumer")
  await page.locator("#connector-dsp-url").fill(`https://press-${ctx.runId}.plant.local/dsp`)
  await page.getByRole("button", { name: /Create connector|Save connector/i }).click()
  await page.waitForURL("**/profile/connector", { timeout: 60_000 })
}

export async function navigateToAssetPage(page: Page, ctx: CncPressContext) {
  if (ctx.assetId) {
    await page.goto(`/assets/${ctx.assetId}`)
    await page.getByText(/Governance policy:/i).waitFor({ state: "visible", timeout: 60_000 })
    return
  }
  await page.goto("/assets/browse")
  await page.getByPlaceholder(/Search federations, assets, data/i).fill(ctx.federationName)
  await page.getByRole("button", { name: /View details/i }).first().click()
  await page.locator("tr", { hasText: ctx.assetName }).getByRole("link", { name: /Access/i }).click()
  await page.getByText(/Governance policy:/i).waitFor({ state: "visible", timeout: 60_000 })
}
