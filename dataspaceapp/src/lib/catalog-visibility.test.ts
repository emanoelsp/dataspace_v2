import { describe, expect, it } from "vitest"
import { isPublishedInCatalog } from "./catalog-visibility"

describe("isPublishedInCatalog", () => {
  it("treats only explicit false as hidden", () => {
    expect(isPublishedInCatalog(true)).toBe(true)
    expect(isPublishedInCatalog(undefined)).toBe(true)
    expect(isPublishedInCatalog(null)).toBe(true)
    expect(isPublishedInCatalog(false)).toBe(false)
  })
})
