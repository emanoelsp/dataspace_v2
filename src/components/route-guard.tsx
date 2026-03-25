"use client"

import type { ReactNode } from "react"
import Link from "next/link"
import { LockKeyhole, ShieldAlert } from "lucide-react"
import { usePathname } from "next/navigation"
import { canAccessRoute, getRouteAccess } from "@/lib/route-access"
import { useUserProfile } from "@/lib/use-user-profile"

function GuardMessage({
  title,
  description,
  primaryHref,
  primaryLabel,
  secondaryHref,
  secondaryLabel,
  icon,
}: {
  title: string
  description: string
  primaryHref: string
  primaryLabel: string
  secondaryHref?: string
  secondaryLabel?: string
  icon: ReactNode
}) {
  return (
    <div className="max-w-2xl mx-auto px-4 py-16">
      <div className="rounded-2xl border border-gray-200 bg-white p-8 shadow-sm">
        <div className="flex items-start gap-4">
          <div className="rounded-full bg-blue-50 p-3 text-blue-700">{icon}</div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{title}</h1>
            <p className="mt-3 text-sm text-gray-600">{description}</p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link
                href={primaryHref}
                className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
              >
                {primaryLabel}
              </Link>
              {secondaryHref && secondaryLabel ? (
                <Link
                  href={secondaryHref}
                  className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  {secondaryLabel}
                </Link>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function RouteGuard({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? "/"
  const { user, profile, loading } = useUserProfile()
  const role = profile?.userType ?? null
  const access = getRouteAccess(pathname)

  if (access === "public") {
    return <>{children}</>
  }

  if (loading) {
    return (
      <div className="min-h-[40vh] flex items-center justify-center text-gray-600">
        Checking access...
      </div>
    )
  }

  if (!user || !role) {
    return (
      <GuardMessage
        title="Protected route"
        description="This area requires an authenticated participant. Sign in using the header and open the route again."
        primaryHref="/"
        primaryLabel="Back to home"
        secondaryHref="/search"
        secondaryLabel="Open discovery"
        icon={<LockKeyhole size={24} />}
      />
    )
  }

  if (!canAccessRoute(pathname, role)) {
    const target =
      role === "datasource"
        ? { href: "/federations", label: "Open Data Owner area" }
        : { href: "/access", label: "Open Data Client area" }

    return (
      <GuardMessage
        title="Role-restricted route"
        description={`This route is reserved for ${
          access === "datasource" ? "Data Owner" : "Data Client"
        } accounts. Your current session does not have access to this area.`}
        primaryHref={target.href}
        primaryLabel={target.label}
        secondaryHref="/dashboard"
        secondaryLabel="Open dashboard"
        icon={<ShieldAlert size={24} />}
      />
    )
  }

  return <>{children}</>
}
