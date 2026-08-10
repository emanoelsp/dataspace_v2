export type DataspaceRole = "datasource" | "dataclient"

export type RouteAccessLevel = "public" | "authenticated" | DataspaceRole

type RoutePolicy = {
  access: RouteAccessLevel
  exact?: string[]
  prefixes?: string[]
}

const ROUTE_POLICIES: RoutePolicy[] = [
  {
    access: "datasource",
    exact: [
      "/federations",
      "/federations/browse",
      "/federations/create",
      "/accordance",
      "/accordance/compliance",
      "/accordance/compliance/browse",
      "/accordance/compliance/create",
      "/accordance/governance",
      "/accordance/governance/browse",
      "/accordance/governance/create",
    ],
    prefixes: ["/accordance/compliance/", "/accordance/governance/"],
  },
  {
    access: "dataclient",
    exact: ["/access", "/access/my-requests"],
  },
  {
    access: "authenticated",
    exact: [
      "/assets",
      "/assets/browse",
      "/assets/create",
      "/dashboard",
      "/dashboard/sidecar",
      "/profile",
      "/profile/connector",
      "/profile/connector/configure",
      "/search",
    ],
    prefixes: ["/assets/", "/federations/", "/search/"],
  },
]

function normalizePath(pathname: string) {
  if (!pathname) {
    return "/"
  }

  if (pathname.length > 1 && pathname.endsWith("/")) {
    return pathname.slice(0, -1)
  }

  return pathname
}

export function getRouteAccess(pathname: string): RouteAccessLevel {
  const normalized = normalizePath(pathname)

  for (const policy of ROUTE_POLICIES) {
    if (policy.exact?.includes(normalized)) {
      return policy.access
    }
  }

  for (const policy of ROUTE_POLICIES) {
    if (policy.prefixes?.some((prefix) => normalized.startsWith(prefix))) {
      return policy.access
    }
  }

  return "public"
}

export function canAccessRoute(pathname: string, role?: DataspaceRole | null) {
  const access = getRouteAccess(pathname)

  if (access === "public") {
    return true
  }

  if (access === "authenticated") {
    return Boolean(role)
  }

  return access === role
}
