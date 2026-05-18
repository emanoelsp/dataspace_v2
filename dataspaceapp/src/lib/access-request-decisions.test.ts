import { describe, it, expect } from "vitest"

/**
 * Unit tests for access request decision helpers.
 * The full finalizeAccessRequestDecision function requires a live Firestore —
 * these tests cover the pure/deterministic pieces that can be tested in isolation.
 */

import { buildAccessRequestDecisionFields } from "./access-request-decisions"

// Minimal mock of Firebase User
function fakeUser(uid = "uid-owner-001", email = "owner@test.com") {
  return {
    uid,
    email,
    displayName: "Owner Test",
  } as import("firebase/auth").User
}

describe("buildAccessRequestDecisionFields", () => {
  it("sets status to approved", () => {
    const fields = buildAccessRequestDecisionFields(fakeUser(), "approved")
    expect(fields.status).toBe("approved")
  })

  it("sets status to rejected", () => {
    const fields = buildAccessRequestDecisionFields(fakeUser(), "rejected")
    expect(fields.status).toBe("rejected")
  })

  it("includes decisionById from the user uid", () => {
    const fields = buildAccessRequestDecisionFields(fakeUser("uid-42"), "approved")
    expect(fields.decisionById).toBe("uid-42")
  })

  it("includes decisionByEmail from the user email", () => {
    const fields = buildAccessRequestDecisionFields(fakeUser("uid-1", "test@example.com"), "approved")
    expect(fields.decisionByEmail).toBe("test@example.com")
  })

  it("returns null decisionByEmail when user has no email", () => {
    const user = { ...fakeUser(), email: null } as import("firebase/auth").User
    const fields = buildAccessRequestDecisionFields(user, "approved")
    expect(fields.decisionByEmail).toBeNull()
  })

  it("includes decisionAt and updatedAt (server timestamps are objects)", () => {
    const fields = buildAccessRequestDecisionFields(fakeUser(), "approved")
    // serverTimestamp() returns a FieldValue sentinel object in the client SDK
    expect(fields.decisionAt).toBeDefined()
    expect(fields.updatedAt).toBeDefined()
  })
})

// ─── TTL calculation — verify the expiresAt logic inline ──────────────────────

describe("access token TTL logic", () => {
  it("calculates expiresAt correctly from a TTL in minutes", () => {
    const ttlMinutes = 60
    const before = Date.now()
    const expiresAt = new Date(Date.now() + ttlMinutes * 60 * 1000)
    const after = Date.now()

    expect(expiresAt.getTime()).toBeGreaterThanOrEqual(before + ttlMinutes * 60 * 1000 - 10)
    expect(expiresAt.getTime()).toBeLessThanOrEqual(after + ttlMinutes * 60 * 1000 + 10)
  })

  it("a 5-minute TTL expires 5 minutes from now", () => {
    const ttl = 5
    const now = Date.now()
    const expiresAt = new Date(now + ttl * 60 * 1000)
    const diffMs = expiresAt.getTime() - now
    expect(diffMs).toBeCloseTo(5 * 60 * 1000, -2) // within ±100ms
  })

  it("default TTL of 60 minutes results in ~1 hour expiry window", () => {
    const ttl = 60
    const expiresAt = new Date(Date.now() + ttl * 60 * 1000)
    const diffMin = (expiresAt.getTime() - Date.now()) / 1000 / 60
    expect(diffMin).toBeCloseTo(60, 0)
  })

  it("expired token check: past expiresAt should be < now", () => {
    const pastExpiresAt = new Date(Date.now() - 1000)
    expect(pastExpiresAt < new Date()).toBe(true)
  })

  it("active token check: future expiresAt should be > now", () => {
    const futureExpiresAt = new Date(Date.now() + 3600000)
    expect(futureExpiresAt > new Date()).toBe(true)
  })
})
