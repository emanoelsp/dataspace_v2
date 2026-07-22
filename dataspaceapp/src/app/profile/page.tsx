"use client"

import Link from "next/link"
import { ChevronLeft, Plug, User } from "lucide-react"
import { useUserProfile } from "@/lib/use-user-profile"

export default function ProfilePage() {
  const { user, profile, loading } = useUserProfile()

  if (loading) {
    return (
      <div className="min-h-[40vh] flex items-center justify-center text-gray-600">
        Loading profile…
      </div>
    )
  }

  if (!user) {
    return (
      <div className="max-w-lg mx-auto py-16 px-4 text-center">
        <p className="text-gray-700 mb-4">Sign in to view your profile.</p>
        <p className="text-sm text-gray-500 mb-6">Use Login or Signup in the header.</p>
        <Link href="/" className="text-blue-600 font-medium hover:underline">
          Back to home
        </Link>
      </div>
    )
  }

  const connectorRoleLabel =
    profile?.userType === "datasource"
      ? "provider"
      : profile?.userType === "dataclient"
        ? "consumer"
        : null

  return (
    <div className="max-w-2xl mx-auto py-8 px-4">
      <Link
        href="/"
        className="inline-flex items-center gap-1 text-sm text-blue-700 hover:text-blue-900 mb-6"
      >
        <ChevronLeft size={18} />
        Home
      </Link>

      <div className="flex items-center gap-3 mb-2">
        <User className="text-indigo-600" size={28} />
        <h1 className="text-2xl font-bold text-gray-900">Profile</h1>
      </div>
      <p className="text-gray-600 text-sm mb-8">Your account in this dataspace control plane.</p>

      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm space-y-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Display name</p>
          <p className="text-gray-900">{user.displayName || "—"}</p>
        </div>
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Email</p>
          <p className="text-gray-900">{user.email}</p>
        </div>
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Role</p>
          <p className="text-gray-900">
            {profile?.userType === "datasource"
              ? "Data Owner (provider)"
              : profile?.userType === "dataclient"
                ? "Data Client (consumer)"
                : "—"}
          </p>
        </div>
        {profile?.organizationLegalName ? (
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Organization</p>
            <p className="text-gray-900">{profile.organizationLegalName}</p>
          </div>
        ) : null}
      </div>

      {connectorRoleLabel && (
        <div className="mt-6 rounded-xl border border-indigo-100 bg-indigo-50/50 p-5">
          <div className="flex items-start gap-3">
            <Plug className="text-indigo-600 shrink-0 mt-0.5" size={22} />
            <div>
              <h2 className="font-semibold text-indigo-950">Connector</h2>
              <p className="text-sm text-indigo-900/80 mt-1 mb-3">
                Create and manage one or more {connectorRoleLabel} connectors for projects, departments, plants, and isolated intraorganizational scopes.
              </p>
              <div className="flex flex-wrap gap-3">
                <Link
                  href="/profile/connector/configure"
                  className="inline-flex text-sm font-medium text-indigo-700 hover:text-indigo-900 underline"
                >
                  Configure connector →
                </Link>
                <Link
                  href="/profile/connector"
                  className="inline-flex text-sm font-medium text-indigo-700 hover:text-indigo-900 underline"
                >
                  Open connector profile →
                </Link>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
