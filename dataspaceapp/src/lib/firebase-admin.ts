import { App, applicationDefault, cert, getApps, initializeApp } from "firebase-admin/app"

/**
 * Firebase Admin for server routes (token verification, privileged writes).
 * Set `FIREBASE_SERVICE_ACCOUNT_JSON` to a JSON string of the service account key,
 * or use Application Default Credentials (e.g. GOOGLE_APPLICATION_CREDENTIALS).
 */
export function getAdminApp(): App | null {
  if (getApps().length > 0) {
    return getApps()[0]!
  }
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as Record<string, unknown>
      return initializeApp({
        credential: cert(parsed as Parameters<typeof cert>[0]),
      })
    } catch {
      return null
    }
  }
  try {
    return initializeApp({ credential: applicationDefault() })
  } catch {
    return null
  }
}
