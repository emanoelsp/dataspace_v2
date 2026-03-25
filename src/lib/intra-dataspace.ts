export const INTRA_COLLECTIONS = [
  "users",
  "federations",
  "assets",
  "compliance",
  "governance",
  "accessRequests",
  "accessLogs",
  "connectorConnections",
  "federationMemberships",
  "federationInvites",
  "contractOffers",
  "contractAgreements",
  "credentialGrants",
  "accessTokens",
  "catalogPublications",
] as const

export type IntraCollectionName = (typeof INTRA_COLLECTIONS)[number]

export const LEGACY_FEDERATION_TYPES = ["Open", "Consortium", "Private"] as const

export type LegacyFederationType = (typeof LEGACY_FEDERATION_TYPES)[number]

export const CATALOG_VISIBILITIES = ["public", "members", "hidden"] as const

export type CatalogVisibility = (typeof CATALOG_VISIBILITIES)[number]

export const ADMISSION_MODES = ["self-service", "approval", "invite-only"] as const

export type AdmissionMode = (typeof ADMISSION_MODES)[number]

export const ASSET_KINDS = ["data", "model", "service"] as const

export type AssetKind = (typeof ASSET_KINDS)[number]

export const EXCHANGE_MODES = ["batch", "stream", "hybrid"] as const

export type ExchangeMode = (typeof EXCHANGE_MODES)[number]

export const MEMBERSHIP_STATUSES = [
  "draft",
  "requested",
  "invited",
  "pending-signature",
  "pending-approval",
  "active",
  "rejected",
  "revoked",
] as const

export type MembershipStatus = (typeof MEMBERSHIP_STATUSES)[number]

export const CONNECTOR_CONNECTION_STATUSES = [
  "requested",
  "active",
  "rejected",
  "revoked",
] as const

export type ConnectorConnectionStatus = (typeof CONNECTOR_CONNECTION_STATUSES)[number]

export const INVITE_STATUSES = [
  "issued",
  "sent",
  "accepted",
  "declined",
  "expired",
  "cancelled",
] as const

export type InviteStatus = (typeof INVITE_STATUSES)[number]

export const CONTRACT_SCOPES = ["federation", "asset"] as const

export type ContractScope = (typeof CONTRACT_SCOPES)[number]

export const CONTRACT_OFFER_STATUSES = ["draft", "published", "suspended", "retired"] as const

export type ContractOfferStatus = (typeof CONTRACT_OFFER_STATUSES)[number]

export const CONTRACT_AGREEMENT_STATUSES = [
  "requested",
  "negotiating",
  "pending-provider-signature",
  "pending-consumer-signature",
  "finalized",
  "rejected",
  "revoked",
  "expired",
] as const

export type ContractAgreementStatus = (typeof CONTRACT_AGREEMENT_STATUSES)[number]

export const CREDENTIAL_GRANT_STATUSES = ["pending", "active", "revoked", "expired"] as const

export type CredentialGrantStatus = (typeof CREDENTIAL_GRANT_STATUSES)[number]

export const ACCESS_TOKEN_STATUSES = ["active", "revoked", "expired"] as const

export type AccessTokenStatus = (typeof ACCESS_TOKEN_STATUSES)[number]

export type FederationAccessModel = {
  catalogVisibility: CatalogVisibility
  admissionMode: AdmissionMode
}

export function mapLegacyFederationType(type?: string | null): FederationAccessModel {
  switch (type) {
    case "Open":
      return { catalogVisibility: "public", admissionMode: "self-service" }
    case "Consortium":
      return { catalogVisibility: "members", admissionMode: "approval" }
    case "Private":
      return { catalogVisibility: "hidden", admissionMode: "invite-only" }
    default:
      return { catalogVisibility: "members", admissionMode: "approval" }
  }
}

export function isMembershipActive(status?: MembershipStatus | null) {
  return status === "active"
}

export function isAgreementUsable(status?: ContractAgreementStatus | null) {
  return status === "finalized"
}

export function isConnectorConnectionActive(status?: ConnectorConnectionStatus | null) {
  return status === "active"
}

export interface ConnectorConnectionRecord {
  ownerId: string
  ownerName?: string
  ownerEmail?: string
  providerParticipantId: string
  providerConnectorDspBaseUrl: string
  providerConnectorManagementBaseUrl?: string
  providerCatalogUrl?: string
  requesterId: string
  requesterName?: string
  requesterEmail?: string
  consumerParticipantId: string
  consumerConnectorDspBaseUrl: string
  consumerConnectorManagementBaseUrl?: string
  consumerCatalogUrl?: string
  status: ConnectorConnectionStatus
  approvedAt?: unknown
  rejectedAt?: unknown
  revokedAt?: unknown
}

export interface FederationMembershipRecord {
  federationId: string
  federationName?: string
  participantId: string
  requesterId: string
  requesterEmail?: string
  membershipType: AdmissionMode
  status: MembershipStatus
  agreementId?: string
  inviteId?: string
  credentialId?: string
  purpose?: string
  requestedAt?: unknown
  approvedAt?: unknown
  revokedAt?: unknown
  ownerId: string
}

export interface FederationInviteRecord {
  federationId: string
  federationName?: string
  inviteeEmail: string
  inviteeParticipantId?: string
  invitedById: string
  status: InviteStatus
  agreementId?: string
  signatureRequested: boolean
  expiresAt?: unknown
  ownerId: string
}

export interface ContractOfferRecord {
  scope: ContractScope
  scopeId: string
  federationId?: string
  assetId?: string
  governancePolicyId?: string
  ownerId: string
  policyType: "access" | "contract" | "usage"
  policyPayload: Record<string, unknown>
  visibility: CatalogVisibility
  status: ContractOfferStatus
  version: number
}

export interface ContractAgreementRecord {
  offerId: string
  federationId?: string
  assetId?: string
  governancePolicyId?: string
  providerParticipantId: string
  consumerParticipantId: string
  negotiationId?: string
  agreementType: ContractScope
  status: ContractAgreementStatus
  signedByProviderAt?: unknown
  signedByConsumerAt?: unknown
  validFrom?: unknown
  validUntil?: unknown
  revokedAt?: unknown
  ownerId: string
}

export interface CredentialGrantRecord {
  participantId: string
  federationId?: string
  agreementId?: string
  credentialType: "membership" | "usage" | "processing-level"
  status: CredentialGrantStatus
  issuedAt?: unknown
  expiresAt?: unknown
  revokedAt?: unknown
  ownerId: string
}

export interface CatalogPublicationRecord {
  scope: ContractScope | "root-catalog"
  scopeId: string
  connectorParticipantId: string
  dspEndpoint: string
  catalogEndpoint?: string
  published: boolean
  lastPublishedAt?: unknown
  ownerId: string
}

export interface AccessTokenRecord {
  token: string
  scope: string
  assetId: string
  federationId?: string
  agreementId?: string
  credentialGrantId?: string
  connectorConnectionId?: string
  governancePolicyId?: string
  requesterId: string
  requesterEmail?: string
  ownerId: string
  status: AccessTokenStatus
  issuedAt?: unknown
  expiresAt?: unknown
  revokedAt?: unknown
}
