import type { Page } from "@playwright/test"

type ExpectFn = typeof import("@playwright/test").expect

export type OpenFlowContext = {
  ownerEmail: string
  clientEmail: string
  password: string
  federationName: string
  assetName: string
  runId: string
  sidecarUrl: string
  equipmentApiUrl: string
  assetId?: string
}

export function buildOpenFlowContext(overrides?: Partial<OpenFlowContext>): OpenFlowContext {
  const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  return {
    runId,
    ownerEmail: `e2e.owner.open.${runId}@dataspace-e2e.test`,
    clientEmail: `e2e.client.open.${runId}@dataspace-e2e.test`,
    password: `E2eOpen!${runId.slice(-6)}`,
    federationName: `Open Federation ${runId}`,
    assetName: `CNC Asset ${runId}`,
    sidecarUrl: "http://localhost:3100",
    equipmentApiUrl: "http://localhost:3001",
    ...overrides,
  }
}

/** Aguarda a sessão Firebase resolver e garante que nenhum usuário está logado. */
async function waitForUnauthenticated(page: Page) {
  // Aguarda o header sair do estado "Checking session..."
  await page.waitForFunction(
    () => !document.body.textContent?.includes("Checking session..."),
    { timeout: 30_000 },
  )
  // Se houver Logout visível, faz logout antes de continuar
  const logoutBtn = page.getByRole("button", { name: "Logout" })
  if (await logoutBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
    await logoutBtn.click()
    await page.getByRole("button", { name: "Login" }).waitFor({ state: "visible", timeout: 15_000 })
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

  // Aguarda o modal de cadastro abrir
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
  // Isso garante que o documento do usuário existe antes de navegar para páginas protegidas
  await modal.waitFor({ state: "hidden", timeout: 60_000 })
  await page.getByRole("button", { name: "Logout" }).waitFor({ state: "visible", timeout: 30_000 })
}

export async function loginUser(page: Page, email: string, password: string) {
  await page.goto("/")
  await waitForUnauthenticated(page)

  await page.getByRole("button", { name: "Login" }).first().click()

  // Aguarda o modal de login abrir
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
  input: {
    org: string
    participantId: string
    dspUrl: string
    connectorName?: string
    sidecarEndpoint?: string
  },
) {
  await page.goto("/profile/connector/configure")
  // Aguarda o formulário aparecer
  await page.locator("#connector-name").waitFor({ state: "visible", timeout: 30_000 })

  await page.locator("#connector-name").fill(input.connectorName ?? `Connector ${input.participantId}`)
  await page.locator("#connector-org").fill(input.org)
  await page.locator("#connector-participant-id").fill(input.participantId)
  await page.locator("#connector-scope-label").fill("E2E test scope")
  await page.locator("#connector-dsp-url").fill(input.dspUrl)
  if (input.sidecarEndpoint) {
    await page.locator("#connector-sidecar-endpoint").fill(input.sidecarEndpoint)
  }
  await page.getByRole("button", { name: /Create connector|Save connector/i }).click()
  await page.waitForURL("**/profile/connector", { timeout: 60_000 })
  await page.getByText(input.participantId).first().waitFor({ state: "visible", timeout: 60_000 })
}

export async function createOpenFederation(page: Page, expect: ExpectFn, ctx: OpenFlowContext) {
  await page.goto("/federations/create")
  await page.locator("#fed-name").waitFor({ state: "visible", timeout: 30_000 })

  await page.locator("#fed-name").fill(ctx.federationName)
  await page.locator("#fed-description").fill("E2E open federation for sidecar integration test.")
  await page.locator("#fed-org").fill("E2E Owner Org")
  await page.getByRole("button", { name: "Next: Federation Structure" }).click()

  await page.locator("#fed-type").waitFor({ state: "visible", timeout: 15_000 })
  await page.locator("#fed-type").selectOption("Open")
  await page.locator("#fed-domains").fill("Manufacturing, CNC, Industrial")
  await page.locator("#fed-main-domain").fill("Manufacturing")
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
  await page.locator("#comp-terms").fill("E2E terms for CNC data access via sidecar proxy.")
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

export async function createCncAsset(
  page: Page,
  expect: ExpectFn,
  ctx: OpenFlowContext,
  federationId: string,
) {
  await page.goto(
    `/assets/create?federationId=${encodeURIComponent(federationId)}&federationName=${encodeURIComponent(ctx.federationName)}`,
  )
  await page.getByRole("button", { name: "Next: Asset Details" }).click()
  await page.locator("#asset-name").waitFor({ state: "visible", timeout: 30_000 })

  await page.locator("#asset-name").fill(ctx.assetName)
  await page.locator("#asset-description").fill("CNC machining center data via sidecar proxy.")
  // Asset Type: "CPS" (Cyber-Physical System) — equipmentType inferido pelo IRDI
  await page.locator("#asset-type").selectOption("CPS")
  await page.locator("#asset-kind").selectOption("data")
  await page.locator("#asset-purpose").fill("Real-time CNC monitoring")
  // IRDI ECLASS para CNC — sidecar usa isso para identificar o equipamento (campo fica no passo 2)
  await page.locator("#asset-irdi").fill("0173-1#01-ACJ843#001")
  await page.getByRole("button", { name: "Next: Technical Info" }).click()

  await page.locator("#asset-api-endpoint").waitFor({ state: "visible", timeout: 15_000 })
  await page.locator("#asset-api-endpoint").fill(`${ctx.equipmentApiUrl}/api/data`)
  await page.locator("#asset-data-format").selectOption("JSON")
  await page.locator("#asset-exchange-mode").selectOption("stream")

  await page.getByRole("button", { name: "Next: Review & Register" }).click()
  await page.getByRole("button", { name: "Register Asset" }).click()
  await expect(page.getByText(/Asset registered successfully/i)).toBeVisible({ timeout: 120_000 })

  // Capture asset ID via search so navigateToAssetPage works for dataclient role too
  await page.goto("/search/assets")
  const metaSearchInput = page.locator('input[placeholder*="Search across asset metadata"]')
  await metaSearchInput.waitFor({ state: "visible", timeout: 30_000 })
  await metaSearchInput.fill(ctx.assetName)
  const assetLink = page.getByRole("link", { name: /Open asset/i }).first()
  await assetLink.waitFor({ state: "visible", timeout: 60_000 })
  const href = await assetLink.getAttribute("href")
  if (href) {
    ctx.assetId = href.replace("/assets/", "").split("?")[0]
  }
}

export async function fillGovernanceWizard(page: Page, expect: ExpectFn, ctx: OpenFlowContext, federationId: string) {
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
  await page.locator("#gov-policies").fill("Access via sidecar token only.")
  await page.getByRole("button", { name: "Next: Audit & Traceability" }).click()

  await page.locator("#gov-audit").waitFor({ state: "visible", timeout: 15_000 })
  await page.locator("#gov-audit").fill("All sidecar proxy accesses logged.")
  await page.getByRole("button", { name: "Next: Usage Periods" }).click()

  await page.locator("#gov-usage").waitFor({ state: "visible", timeout: 15_000 })
  await page.locator("#gov-usage").fill("Business hours only.")
  await page.getByRole("button", { name: "Next: Revocation & Supervision" }).click()

  await page.locator("#gov-revocation").waitFor({ state: "visible", timeout: 15_000 })
  await page.locator("#gov-revocation").fill("Owner may revoke token via sidecar dashboard.")
  await page.getByRole("button", { name: "Next: Review & Submit" }).click()

  await page.getByRole("button", { name: "Register Governance Policy" }).click()
  await expect(page.getByText(/Governance policy registered successfully/i)).toBeVisible({ timeout: 120_000 })
}

export async function publishContractOffer(page: Page, expect: ExpectFn, ctx: OpenFlowContext) {
  if (ctx.assetId) {
    // Navegação direta — evita os 3 passos browse → federação → ativo
    await page.goto(`/assets/${ctx.assetId}`)
  } else {
    await page.goto("/assets/browse")
    await page.getByPlaceholder(/Search federations, assets, data/i).fill(ctx.federationName)
    await page.getByRole("button", { name: /View details/i }).first().click()
    await page.locator("tr", { hasText: ctx.assetName }).getByRole("link", { name: /Access/i }).click()
  }
  // Aguarda loadAccessModel completar — governancePolicy precisa estar attached antes do clique
  await page.getByText(/Governance policy:.*attached/i).waitFor({ state: "visible", timeout: 60_000 })
  await page.getByRole("button", { name: "Publish standard contract offer" }).click()
  // Após o clique: addDoc → setAccessVersion → loadAccessModel (fica loading) → botão reaparece com novo texto
  // 90s para cobrir o ciclo completo mesmo com trace overhead
  await expect(page.getByRole("button", { name: "Standard offer published" })).toBeVisible({ timeout: 90_000 })
}

export async function navigateToAssetPage(page: Page, ctx: OpenFlowContext) {
  if (ctx.assetId) {
    // Direct navigation works for both datasource and dataclient (/assets/ prefix → authenticated)
    await page.goto(`/assets/${ctx.assetId}`)
    await page.getByText(/Governance policy:/i).waitFor({ state: "visible", timeout: 60_000 })
    return
  }
  // Fallback (datasource only): browse
  await page.goto("/assets/browse")
  await page.getByPlaceholder(/Search federations, assets, data/i).fill(ctx.federationName)
  await page.getByRole("button", { name: /View details/i }).first().click()
  await page.locator("tr", { hasText: ctx.assetName }).getByRole("link", { name: /Access/i }).click()
  await page.getByText(/Governance policy:/i).waitFor({ state: "visible", timeout: 60_000 })
}
