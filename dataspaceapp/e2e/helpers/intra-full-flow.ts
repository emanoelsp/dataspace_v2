import type { Page } from "@playwright/test"

type ExpectFn = typeof import("@playwright/test").expect

export type FlowContext = {
  ownerEmail: string
  clientEmail: string
  password: string
  federationName: string
  assetName: string
  runId: string
}

export function buildFlowContext(): FlowContext {
  const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  return {
    runId,
    ownerEmail: `e2e.owner.${runId}@dataspace-e2e.test`,
    clientEmail: `e2e.client.${runId}@dataspace-e2e.test`,
    password: `E2eFlow!${runId.slice(-6)}`,
    federationName: `E2E Federation ${runId}`,
    assetName: `E2E Asset ${runId}`,
  }
}

export async function signupUser(
  page: Page,
  expect: ExpectFn,
  input: { name: string; email: string; password: string; role: "datasource" | "dataclient" },
) {
  await page.goto("/")
  // Aguarda a sessão Firebase resolver e garante que ninguém está logado
  await page.waitForFunction(
    () => !document.body.textContent?.includes("Checking session..."),
    { timeout: 30_000 },
  )
  const logoutBtn = page.getByRole("button", { name: "Logout" })
  if (await logoutBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
    await logoutBtn.click()
    await page.getByRole("button", { name: "Login" }).waitFor({ state: "visible", timeout: 15_000 })
  }

  await page.getByRole("button", { name: "Signup" }).click()
  const modal = page.locator("div.fixed.inset-0").filter({ hasText: "Full Name" })
  await modal.waitFor({ state: "visible", timeout: 15_000 })

  await modal.locator("#signup-fullname").fill(input.name)
  await modal.locator("#signup-email").fill(input.email)
  await modal.locator("#signup-password").fill(input.password)
  if (input.role === "datasource") {
    await modal.getByText("Data Owner (provider)").click()
  } else {
    await modal.getByText("Data Client (consumer)").click()
  }
  await modal.getByRole("button", { name: "Register" }).click()
  // Aguarda o modal fechar — só acontece depois que setDoc (Firestore) completa via onClose()
  await modal.waitFor({ state: "hidden", timeout: 60_000 })
  await page.getByRole("button", { name: "Logout" }).waitFor({ state: "visible", timeout: 30_000 })
}

export async function loginUser(page: Page, email: string, password: string) {
  await page.goto("/")
  await page.waitForFunction(
    () => !document.body.textContent?.includes("Checking session..."),
    { timeout: 30_000 },
  )
  await page.getByRole("button", { name: "Login" }).first().click()
  const modal = page.locator("div.fixed.inset-0").filter({ hasText: "Login" })
  await modal.waitFor({ state: "visible", timeout: 15_000 })
  await modal.locator("#signin-email").fill(email)
  await modal.locator("#signin-password").fill(password)
  await modal.getByRole("button", { name: "Login" }).click()
  await page.getByRole("button", { name: "Logout" }).waitFor({ state: "visible", timeout: 60_000 })
}

export async function logout(page: Page) {
  await page.getByRole("button", { name: "Logout" }).click()
  await page.getByRole("button", { name: "Login" }).waitFor({ state: "visible", timeout: 30_000 })
}

export async function saveConnectorProfile(
  page: Page,
  input: { org: string; participantId: string; dspUrl: string; connectorName?: string },
) {
  await page.goto("/profile/connector/configure")
  await page.locator("#connector-name").waitFor({ state: "visible", timeout: 30_000 })
  await page.locator("#connector-name").fill(input.connectorName ?? `Connector ${input.participantId}`)
  await page.locator("#connector-org").fill(input.org)
  await page.locator("#connector-participant-id").fill(input.participantId)
  await page.locator("#connector-scope-label").fill("E2E test scope")
  await page.locator("#connector-dsp-url").fill(input.dspUrl)
  await page.getByRole("button", { name: /Create connector|Save connector/i }).click()
  await page.waitForURL("**/profile/connector", { timeout: 60_000 })
  await page.getByText(input.participantId).first().waitFor({ state: "visible", timeout: 60_000 })
}

export async function createPrivateFederation(page: Page, expect: ExpectFn, ctx: FlowContext) {
  await page.goto("/federations/create")
  await page.locator("#fed-name").waitFor({ state: "visible", timeout: 30_000 })

  await page.locator("#fed-name").fill(ctx.federationName)
  await page.locator("#fed-description").fill("E2E intra dataspace flow.")
  await page.locator("#fed-org").fill("E2E Org")
  await page.getByRole("button", { name: "Next: Federation Structure" }).click()

  await page.locator("#fed-type").waitFor({ state: "visible", timeout: 15_000 })
  await page.locator("#fed-type").selectOption("Private")
  await page.locator("#fed-domains").fill("Energy, Manufacturing")
  await page.locator("#fed-main-domain").fill("Energy")
  await page.getByRole("button", { name: "Next: Contact Info" }).click()

  await page.locator("#fed-contact-email").waitFor({ state: "visible", timeout: 15_000 })
  await page.locator("#fed-contact-email").fill(ctx.ownerEmail)
  await page.getByRole("button", { name: "Next: Review & Submit" }).click()

  await page.getByRole("button", { name: "Register Federation" }).click()
  await expect(page.getByRole("heading", { name: /Federation Created/i })).toBeVisible({ timeout: 120_000 })
}

export async function getFederationIdFromBrowse(page: Page, federationName: string): Promise<string> {
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
  await page.locator("#comp-terms").fill("E2E terms for data access.")
  await page.getByRole("checkbox", { name: /I accept the Terms/i }).check()
  await page.getByRole("button", { name: "Next: Consent Logs" }).click()

  await page.locator("#comp-consent-log").waitFor({ state: "visible", timeout: 15_000 })
  await page.locator("#comp-consent-log").fill("E2E consent log entry.")
  await page.getByRole("button", { name: "Next: Digital Signature" }).click()

  await page.locator("#comp-signature").waitFor({ state: "visible", timeout: 15_000 })
  await page.locator("#comp-signature").fill("E2E Signer")
  await page.getByRole("button", { name: "Next: Review & Register" }).click()

  await page.getByRole("button", { name: "Register Compliance" }).click()
  await expect(page.getByText(/Compliance registered successfully/i)).toBeVisible({ timeout: 120_000 })
}

export async function createAssetWizard(page: Page, expect: ExpectFn, ctx: FlowContext, federationId: string) {
  await page.goto(
    `/assets/create?federationId=${encodeURIComponent(federationId)}&federationName=${encodeURIComponent(ctx.federationName)}`,
  )
  await page.getByRole("button", { name: "Next: Asset Details" }).click()

  await page.locator("#asset-name").waitFor({ state: "visible", timeout: 30_000 })
  await page.locator("#asset-name").fill(ctx.assetName)
  await page.locator("#asset-description").fill("E2E asset for full flow.")
  await page.locator("#asset-type").selectOption("API")
  await page.locator("#asset-kind").selectOption("data")
  await page.locator("#asset-purpose").fill("Monitoring")
  await page.getByRole("button", { name: "Next: Technical Info" }).click()

  await page.locator("#asset-api-endpoint").waitFor({ state: "visible", timeout: 15_000 })
  await page.locator("#asset-api-endpoint").fill("https://jsonplaceholder.typicode.com/posts/1")
  await page.locator("#asset-data-format").selectOption("JSON")
  await page.locator("#asset-exchange-mode").selectOption("batch")
  await page.getByRole("button", { name: "Next: Review & Register" }).click()

  await page.getByRole("button", { name: "Register Asset" }).click()
  await expect(page.getByText(/Asset registered successfully/i)).toBeVisible({ timeout: 120_000 })
}

export async function fillGovernanceWizard(page: Page, expect: ExpectFn, ctx: FlowContext, federationId: string) {
  await page.goto("/accordance/governance/create")
  await page.locator("#gov-federation").waitFor({ state: "visible", timeout: 30_000 })

  await page.locator("#gov-federation").selectOption(federationId)
  await page.getByRole("button", { name: "Next: Asset Selection" }).click()

  await page.getByRole("checkbox", { name: ctx.assetName }).waitFor({ state: "visible", timeout: 120_000 })
  await page.getByRole("checkbox", { name: ctx.assetName }).check()
  await page.getByRole("button", { name: "Next: Roles & Permissions" }).click()

  await page.locator("#gov-roles").waitFor({ state: "visible", timeout: 15_000 })
  await page.locator("#gov-roles").fill("Consumer: read; Owner: full.")
  await page.getByRole("button", { name: "Next: Access Policies" }).click()

  await page.locator("#gov-policies").waitFor({ state: "visible", timeout: 15_000 })
  await page.locator("#gov-policies").fill("Access only with agreement.")
  await page.getByRole("button", { name: "Next: Audit & Traceability" }).click()

  await page.locator("#gov-audit").waitFor({ state: "visible", timeout: 15_000 })
  await page.locator("#gov-audit").fill("All access logged.")
  await page.getByRole("button", { name: "Next: Usage Periods" }).click()

  await page.locator("#gov-usage").waitFor({ state: "visible", timeout: 15_000 })
  await page.locator("#gov-usage").fill("Business hours.")
  await page.getByRole("button", { name: "Next: Revocation & Supervision" }).click()

  await page.locator("#gov-revocation").waitFor({ state: "visible", timeout: 15_000 })
  await page.locator("#gov-revocation").fill("Owner may revoke anytime.")
  await page.getByRole("button", { name: "Next: Review & Submit" }).click()

  await page.getByRole("button", { name: "Register Governance Policy" }).click()
  await expect(page.getByText(/Governance policy registered successfully/i)).toBeVisible({ timeout: 120_000 })
}

export async function ownerPublishOffer(page: Page, expect: ExpectFn, ctx: FlowContext) {
  await page.goto("/assets/browse")
  await page.getByPlaceholder(/Search federations, assets, data/i).fill(ctx.federationName)
  await page.getByRole("button", { name: /View details/i }).first().click()
  await page.locator("tr", { hasText: ctx.assetName }).getByRole("link", { name: /Access/i }).click()
  // Aguarda loadAccessModel completar antes de clicar — evita race onde governancePolicy ainda é null
  await page.getByText(/Governance policy:.*attached/i).waitFor({ state: "visible", timeout: 60_000 })
  await page.getByRole("button", { name: "Publish standard contract offer" }).click()
  await expect(page.getByRole("button", { name: "Standard offer published" })).toBeVisible({ timeout: 60_000 })
}
