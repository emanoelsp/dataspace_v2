"use client"

import { useEffect, useState } from "react"
import type { User } from "firebase/auth"
import { onAuthStateChanged } from "firebase/auth"
import { auth } from "@/lib/firebase"

export function useAuthUser() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (nextUser) => {
      setUser(nextUser)
      setLoading(false)
    })

    return unsubscribe
  }, [])

  return { user, loading }
}
