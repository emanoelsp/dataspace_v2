import type { User } from "firebase/auth"
import {
  buildOwnershipFields,
  sanitizeOptionalText,
  sanitizeOptionalUrl,
  sanitizeText,
} from "@/lib/dataspace"

export const CONNECTOR_ROLES = ["provider", "consumer", "hybrid"] as const
export type ConnectorRole = (typeof CONNECTOR_ROLES)[number]

export const CONNECTOR_SCOPE_TYPES = [
  "department",
  "project",
  "plant",
  "customer",
  "ecosystem",
  "shared-service",
] as const
export type ConnectorScopeType = (typeof CONNECTOR_SCOPE_TYPES)[number]

export const CONNECTOR_ENVIRONMENTS = [
  "shop-floor",
  "operations",
  "lab",
  "staging",
  "production",
] as const
export type ConnectorEnvironment = (typeof CONNECTOR_ENVIRONMENTS)[number]

export const SIDECAR_PROTOCOLS = ["http", "mqtt", "opcua", "hybrid"] as const
export type SidecarProtocol = (typeof SIDECAR_PROTOCOLS)[number]

export type ConnectorProfileRecord = {
  id?: string
  connectorName: string
  organizationLegalName: string
  participantId: string
  connectorRole: ConnectorRole
  scopeType: ConnectorScopeType
  scopeLabel: string
  environment: ConnectorEnvironment
  networkZone: string
  sidecarProtocol: SidecarProtocol
  sidecarEndpoint: string
  certificateRef: string
  connectorDspBaseUrl: string
  connectorManagementBaseUrl: string
  federatedCatalogUrl: string
  isDefault: boolean
  status?: string
  ownerId?: string
}

export function getDefaultConnectorName(role: ConnectorRole, organization?: string | null) {
  const org = sanitizeOptionalText(organization ?? "")
  const suffix = role === "provider" ? "Provider Connector" : role === "consumer" ? "Consumer Connector" : "Hybrid Connector"
  return org ? `${org} ${suffix}` : suffix
}

export function buildConnectorProfileFields(input: ConnectorProfileRecord) {
  return {
    connectorName: sanitizeText(input.connectorName),
    organizationLegalName: sanitizeText(input.organizationLegalName),
    participantId: sanitizeText(input.participantId),
    connectorRole: input.connectorRole,
    scopeType: input.scopeType,
    scopeLabel: sanitizeText(input.scopeLabel),
    environment: input.environment,
    networkZone: sanitizeOptionalText(input.networkZone),
    sidecarProtocol: input.sidecarProtocol,
    sidecarEndpoint: sanitizeOptionalText(input.sidecarEndpoint),
    certificateRef: sanitizeOptionalText(input.certificateRef),
    connectorDspBaseUrl: sanitizeOptionalUrl(input.connectorDspBaseUrl),
    connectorManagementBaseUrl: sanitizeOptionalUrl(input.connectorManagementBaseUrl),
    federatedCatalogUrl: sanitizeOptionalUrl(input.federatedCatalogUrl),
    isDefault: Boolean(input.isDefault),
    status: input.status?.trim() || "active",
  }
}

export function buildDefaultConnectorMirrorFields(
  connector: ReturnType<typeof buildConnectorProfileFields>,
  connectorProfileId: string,
) {
  return {
    defaultConnectorProfileId: connectorProfileId,
    connectorName: connector.connectorName,
    organizationLegalName: connector.organizationLegalName,
    participantId: connector.participantId,
    connectorRole: connector.connectorRole,
    connectorScopeType: connector.scopeType,
    connectorScopeLabel: connector.scopeLabel,
    connectorEnvironment: connector.environment,
    networkZone: connector.networkZone,
    sidecarProtocol: connector.sidecarProtocol,
    sidecarEndpoint: connector.sidecarEndpoint,
    certificateRef: connector.certificateRef,
    connectorDspBaseUrl: connector.connectorDspBaseUrl,
    connectorManagementBaseUrl: connector.connectorManagementBaseUrl,
    federatedCatalogUrl: connector.federatedCatalogUrl,
  }
}

export function buildEmptyConnectorProfile(role: ConnectorRole, organization?: string | null): ConnectorProfileRecord {
  return {
    connectorName: getDefaultConnectorName(role, organization),
    organizationLegalName: sanitizeOptionalText(organization ?? ""),
    participantId: "",
    connectorRole: role,
    scopeType: "project",
    scopeLabel: "",
    environment: "production",
    networkZone: "",
    sidecarProtocol: "http",
    sidecarEndpoint: "",
    certificateRef: "",
    connectorDspBaseUrl: "",
    connectorManagementBaseUrl: "",
    federatedCatalogUrl: "",
    isDefault: true,
    status: "active",
  }
}

export function buildLegacyConnectorProfile(user: User, input: {
  organizationLegalName?: string
  participantId?: string
  connectorDspBaseUrl?: string
  connectorManagementBaseUrl?: string
  federatedCatalogUrl?: string
  connectorName?: string
  connectorRole?: ConnectorRole
  connectorScopeType?: ConnectorScopeType
  connectorScopeLabel?: string
  connectorEnvironment?: ConnectorEnvironment
  networkZone?: string
  sidecarProtocol?: SidecarProtocol
  sidecarEndpoint?: string
  certificateRef?: string
}) {
  const connector = buildConnectorProfileFields({
    connectorName:
      input.connectorName ||
      getDefaultConnectorName(input.connectorRole ?? "provider", input.organizationLegalName ?? ""),
    organizationLegalName: input.organizationLegalName ?? "",
    participantId: input.participantId ?? "",
    connectorRole: input.connectorRole ?? "provider",
    scopeType: input.connectorScopeType ?? "shared-service",
    scopeLabel: input.connectorScopeLabel ?? "Legacy default connector",
    environment: input.connectorEnvironment ?? "production",
    networkZone: input.networkZone ?? "",
    sidecarProtocol: input.sidecarProtocol ?? "http",
    sidecarEndpoint: input.sidecarEndpoint ?? "",
    certificateRef: input.certificateRef ?? "",
    connectorDspBaseUrl: input.connectorDspBaseUrl ?? "",
    connectorManagementBaseUrl: input.connectorManagementBaseUrl ?? "",
    federatedCatalogUrl: input.federatedCatalogUrl ?? "",
    isDefault: true,
    status: "active",
  })

  return {
    ...connector,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...buildOwnershipFields(user),
  }
}

export function clearDefaultConnectorMirrorFields() {
  return {
    defaultConnectorProfileId: "",
    connectorName: "",
    organizationLegalName: "",
    participantId: "",
    connectorRole: "",
    connectorScopeType: "",
    connectorScopeLabel: "",
    connectorEnvironment: "",
    networkZone: "",
    sidecarProtocol: "",
    sidecarEndpoint: "",
    certificateRef: "",
    connectorDspBaseUrl: "",
    connectorManagementBaseUrl: "",
    federatedCatalogUrl: "",
  }
}

export function getConnectorScopeLabel(scopeType?: string, scopeLabel?: string) {
  const typeLabel =
    scopeType === "department"
      ? "Department"
      : scopeType === "project"
        ? "Project"
        : scopeType === "plant"
          ? "Plant"
          : scopeType === "customer"
            ? "Customer"
            : scopeType === "ecosystem"
              ? "Ecosystem"
              : scopeType === "shared-service"
                ? "Shared service"
                : "Scope"

  return scopeLabel ? `${typeLabel}: ${scopeLabel}` : typeLabel
}
