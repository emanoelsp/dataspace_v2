/**
 * Returns pathname-only internal paths for post-login redirects.
 * Rejects protocol-relative and external URLs.
 */
export function safeNextPath(raw: string | null): string | null {
  if (!raw || typeof raw !== "string") {
    return null
  }
  const trimmed = raw.trim()
  if (!trimmed.startsWith("/") || trimmed.startsWith("//")) {
    return null
  }
  return trimmed
}
