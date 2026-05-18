/**
 * Catalog listing: treat missing or true as visible; only explicit `false` hides.
 * Avoids empty discovery when older documents omit `publishedInCatalog`.
 */
export function isPublishedInCatalog(value: unknown): boolean {
  return value !== false
}
