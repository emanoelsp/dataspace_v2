"use client"

import { useEffect, useState } from "react"
import { doc, onSnapshot } from "firebase/firestore"
import { db } from "@/lib/firebase"
import { useAuthUser } from "@/lib/use-auth-user"

export type DataspaceUserProfile = {
  uid: string
  name: string
  email: string
  userType: "datasource" | "dataclient"
  organizationLegalName?: string
  participantId?: string
  connectorDspBaseUrl?: string
  connectorManagementBaseUrl?: string
  federatedCatalogUrl?: string
}

export function useUserProfile() {
  const { user, loading: authLoading } = useAuthUser()
  const [profile, setProfile] = useState<DataspaceUserProfile | null>(null)
  const [profileLoading, setProfileLoading] = useState(true)

  useEffect(() => {
    if (!user) {
      setProfile(null)
      setProfileLoading(false)
      return
    }

    setProfileLoading(true)
    const ref = doc(db, "users", user.uid)
    const unsubscribe = onSnapshot(
      ref,
      (snapshot) => {
        if (!snapshot.exists()) {
          setProfile(null)
        } else {
          setProfile(snapshot.data() as DataspaceUserProfile)
        }
        setProfileLoading(false)
      },
      () => {
        setProfile(null)
        setProfileLoading(false)
      },
    )

    return unsubscribe
  }, [user])

  return {
    user,
    profile,
    loading: authLoading || (Boolean(user) && profileLoading),
  }
}
