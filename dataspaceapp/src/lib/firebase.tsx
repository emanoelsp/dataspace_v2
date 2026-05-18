import { getApp, getApps, initializeApp } from "firebase/app"
import { getAuth } from "firebase/auth"
import { getFirestore } from "firebase/firestore"
import { getStorage } from "firebase/storage"

const firebaseEnvConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
}

const firebaseConfig = {
  apiKey: firebaseEnvConfig.apiKey || "demo-api-key",
  authDomain: firebaseEnvConfig.authDomain || "demo-project.firebaseapp.com",
  projectId: firebaseEnvConfig.projectId || "demo-project",
  storageBucket: firebaseEnvConfig.storageBucket || "demo-project.appspot.com",
  messagingSenderId: firebaseEnvConfig.messagingSenderId || "1234567890",
  appId: firebaseEnvConfig.appId || "1:1234567890:web:demo1234567890",
}

const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig)
const db = getFirestore(app)
const auth = getAuth(app)
const storage = getStorage(app)

export const isFirebaseConfigured = Object.values(firebaseEnvConfig).every(Boolean)

export function getFirebaseErrorMessage(error: unknown) {
  if (typeof error !== "object" || error === null || !("code" in error)) {
    return "Unexpected Firebase error."
  }

  const code = String(error.code)

  switch (code) {
    case "auth/email-already-in-use":
      return "This email is already registered."
    case "auth/invalid-credential":
    case "auth/wrong-password":
    case "auth/user-not-found":
      return "Invalid email or password."
    case "auth/invalid-email":
      return "Enter a valid email address."
    case "auth/weak-password":
      return "Use a password with at least 6 characters."
    case "auth/too-many-requests":
      return "Too many attempts. Please try again in a few minutes."
    default:
      return "Unexpected Firebase error."
  }
}

export { app, auth, db, storage }
