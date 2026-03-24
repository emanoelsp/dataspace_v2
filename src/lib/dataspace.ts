import type { User } from "firebase/auth"

function collapseWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim()
}

export function sanitizeText(value: string) {
  return collapseWhitespace(value)
}

export function sanitizeOptionalText(value: string) {
  return collapseWhitespace(value)
}

export function sanitizeMultilineText(value: string) {
  return value
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n")
    .trim()
}

export function sanitizeCsvText(value: string) {
  return value
    .split(",")
    .map((item) => collapseWhitespace(item))
    .filter(Boolean)
    .join(", ")
}

export function sanitizeUrl(value: string) {
  const normalized = value.trim()

  if (!normalized) {
    return ""
  }

  try {
    return new URL(normalized).toString()
  } catch {
    return ""
  }
}

/** Optional HTTPS URL: empty input stays empty; invalid URLs become empty. */
export function sanitizeOptionalUrl(value: string) {
  const normalized = value.trim()
  if (!normalized) {
    return ""
  }
  return sanitizeUrl(normalized)
}

/**
 * Metadata captured at registration for a Data Owner (provider), aligned with
 * common dataspace stacks (e.g. EDC participant + DSP + Management API + Federated Catalog).
 */
export function buildDataOwnerConnectorFields(input: {
  organizationLegalName: string
  participantId: string
  connectorDspBaseUrl: string
  connectorManagementBaseUrl: string
  federatedCatalogUrl: string
}) {
  return {
    organizationLegalName: sanitizeText(input.organizationLegalName),
    participantId: sanitizeText(input.participantId),
    connectorDspBaseUrl: sanitizeUrl(input.connectorDspBaseUrl),
    connectorManagementBaseUrl: sanitizeOptionalUrl(input.connectorManagementBaseUrl),
    federatedCatalogUrl: sanitizeOptionalUrl(input.federatedCatalogUrl),
  }
}

export function emptyConsumerParticipantFields() {
  return {
    organizationLegalName: "",
    participantId: "",
    connectorDspBaseUrl: "",
    connectorManagementBaseUrl: "",
    federatedCatalogUrl: "",
  }
}

export function buildOwnershipFields(user: User) {
  const ownerName = user.displayName ?? user.email ?? user.uid

  return {
    ownerId: user.uid,
    ownerEmail: user.email ?? "",
    ownerName,
    updatedById: user.uid,
    updatedByEmail: user.email ?? "",
    updatedByName: ownerName,
  }
}

export function buildRequesterFields(user: User) {
  return {
    requesterId: user.uid,
    requesterEmail: user.email ?? "",
    requesterName: user.displayName ?? user.email ?? user.uid,
  }
}
