"use client"

import { useEffect, useState } from "react"
import {
  Factory,
  ChevronDown,
  ExternalLink,
  ShieldCheck,
  Globe,
  Home,
  LayoutDashboard,
  Activity,
} from "lucide-react"
import Link from "next/link"
import { useUserProfile } from "@/lib/use-user-profile"

type MenuOption = { label: string; href: string }
type MenuSubsection = {
  title: string
  href: string
  options: MenuOption[]
}
type MenuSection =
  | {
    label: string
    description: string
    basePath: string
    options: MenuOption[]
    subsections?: undefined
  }
  | {
    label: string
    description: string
    basePath: string
    subsections: MenuSubsection[]
    options?: undefined
  }

type MenuType = {
  title: string
  icon: React.ReactNode
  sections: MenuSection[]
}

const MENUS: Record<string, MenuType> = {
  "data-owner": {
    title: "Data Owner",
    icon: <ShieldCheck className="w-5 h-5 mr-2" />,
    sections: [
      {
        label: "Connector",
        description: "Create and manage confined connectors for projects, departments, and plants",
        basePath: "/profile/connector",
        options: [
          { label: "Configure Connector", href: "/profile/connector/configure" },
          { label: "Connector Profile", href: "/profile/connector" },
        ],
      },
      {
        label: "Federations",
        description: "Manage data federations",
        basePath: "/federations",
        options: [
          { label: "Create Federation", href: "/federations/create" },
          { label: "Browse Federations", href: "/federations/browse" },
        ],
      },
      {
        label: "Accordance Compliance",
        description: "Compliance documents and contracts",
        basePath: "/accordance/compliance",
        options: [
          { label: "Create Compliance", href: "/accordance/compliance/create" },
          { label: "Browse Compliance", href: "/accordance/compliance/browse" },
        ],
      },
      {
        label: "Assets",
        description: "Control your data assets",
        basePath: "/assets",
        options: [
          { label: "Create Asset", href: "/assets/create" },
          { label: "Browse Assets", href: "/assets/browse" },
        ],
      },
      {
        label: "Accordance Governance",
        description: "Governance policies and rules",
        basePath: "/accordance/governance",
        options: [
          { label: "Create Governance", href: "/accordance/governance/create" },
          { label: "Browse Governance", href: "/accordance/governance/browse" },
        ],
      },
      {
        label: "Discovery",
        description: "Discover and explore data",
        basePath: "/search",
        options: [
          { label: "By federation (domains & type)", href: "/search/federation" },
          { label: "By asset (metadata & format)", href: "/search/assets" },
          { label: "By type & capability (function)", href: "/search/type" },
          { label: "By data (signals & semantics)", href: "/search/data" },
        ],
      },
      {
        label: "Access Control",
        description: "Review pending access requests for your assets",
        basePath: "/access",
        options: [
          { label: "Review access requests", href: "/access/review" },
        ],
      },
      {
        label: "Access Monitor",
        description: "Live sidecar dashboard — active tokens, access log, and blocked requests",
        basePath: "/dashboard/sidecar",
        options: [
          { label: "Open Access Monitor", href: "/dashboard/sidecar" },
        ],
      },
    ],
  },
  "data-client": {
    title: "Data Client",
    icon: <Globe className="w-5 h-5 mr-2" />,
    sections: [
      {
        label: "Connector",
        description: "Create and manage consumer connectors for internal scopes",
        basePath: "/profile/connector",
        options: [
          { label: "Configure Connector", href: "/profile/connector/configure" },
          { label: "Connector Profile", href: "/profile/connector" },
        ],
      },
      {
        label: "Discovery",
        description: "Discover and explore data",
        basePath: "/search",
        options: [
          { label: "By federation (domains & type)", href: "/search/federation" },
          { label: "By asset (metadata & format)", href: "/search/assets" },
          { label: "By type & capability (function)", href: "/search/type" },
          { label: "By data (signals & semantics)", href: "/search/data" },
        ],
      },
      {
        label: "Access Control",
        description: "Track connector connections, federation memberships, and asset requests",
        basePath: "/access",
        options: [
          { label: "Access workspace", href: "/access" },
          { label: "My requests", href: "/access/my-requests" },
        ],
      },
      {
        label: "Access Monitor",
        description: "Track your active tokens, expiry, and complete data access history",
        basePath: "/dashboard/sidecar",
        options: [
          { label: "Open Access Monitor", href: "/dashboard/sidecar" },
        ],
      },
    ],
  },
}

export default function DataspaceMenu() {
  const [activeMenu, setActiveMenu] = useState<string | null>(null)
  const { user, profile, loading } = useUserProfile()

  const roleMenuKey =
    profile?.userType === "datasource"
      ? "data-owner"
      : profile?.userType === "dataclient"
        ? "data-client"
        : null

  useEffect(() => {
    if (!user) {
      setActiveMenu(null)
    }
  }, [user])

  // Fecha o menu ao clicar em qualquer link
  const handleLinkClick = () => setActiveMenu(null)

  const showAuthenticatedNav = Boolean(user) && !loading

  return (
    <div className="bg-white shadow-lg p-4">
      <div className="container mx-auto px-4">
        {/* Main Navigation Bar */}
        <div className="flex items-center justify-between h-16">
          {/* Left side - Logo and title */}
          <div className="flex items-center">
            <Factory className="h-14 w-14 text-blue-600" />
            <div className="ml-3">
              <h1 className="text-xl font-bold text-gray-800">Dataspace API</h1>
              <p className="text-xs text-blue-500">Enabling advanced</p>
              <p className="text-xs text-blue-500">manufacturing data</p>
            </div>
          </div>

          {/* Right side - Menu buttons */}
          <div className="flex flex-wrap items-center justify-end gap-1 sm:gap-2">
            <Link
              href="/"
              className="flex items-center px-4 sm:px-6 py-2 text-sm font-medium rounded-lg transition-all duration-200 text-gray-700 hover:bg-blue-50 hover:text-blue-600"
            >
              <Home className="w-5 h-5 mr-2" />
              Home
            </Link>
            {showAuthenticatedNav && (
              <>
                <Link
                  href="/dashboard"
                  className="flex items-center px-4 sm:px-6 py-2 text-sm font-medium rounded-lg transition-all duration-200 text-gray-700 hover:bg-blue-50 hover:text-blue-600"
                >
                  <LayoutDashboard className="w-5 h-5 mr-2" />
                  Dashboard
                </Link>
                <Link
                  href="/dashboard/sidecar"
                  className="flex items-center px-4 sm:px-6 py-2 text-sm font-medium rounded-lg transition-all duration-200 text-gray-700 hover:bg-blue-50 hover:text-blue-600"
                >
                  <Activity className="w-5 h-5 mr-2" />
                  API Monitor
                </Link>
                {roleMenuKey && (
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setActiveMenu(activeMenu === roleMenuKey ? null : roleMenuKey)}
                      className={`flex items-center px-4 sm:px-6 py-2 text-sm font-medium rounded-lg transition-all duration-200 ${
                        activeMenu === roleMenuKey
                          ? "bg-blue-600 text-white shadow-md"
                          : "text-gray-700 hover:bg-blue-50 hover:text-blue-600"
                      }`}
                    >
                      {MENUS[roleMenuKey].icon}
                      {MENUS[roleMenuKey].title}
                      <ChevronDown
                        className={`ml-2 h-4 w-4 transition-transform duration-200 ${
                          activeMenu === roleMenuKey ? "rotate-180" : ""
                        }`}
                      />
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* Mega Menu (logged-in role menu only) */}
        {activeMenu && roleMenuKey && activeMenu === roleMenuKey && (
          <div className="border-t border-gray-200 bg-white">
            <div className="py-8">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                {MENUS[roleMenuKey].sections.map((section, idx) => (
                  <div
                    key={idx}
                    className="bg-white rounded-lg p-6 shadow-sm border border-gray-100 hover:shadow-md transition-shadow"
                  >
                    {/* Section Header */}
                    <div className="mb-4">
                      <Link href={section.basePath} className="flex items-center group" onClick={handleLinkClick}>
                        <h3 className="text-lg font-semibold text-gray-800 group-hover:text-blue-600 transition-colors">
                          {section.label}
                        </h3>
                        <ExternalLink className="ml-2 h-4 w-4 text-gray-400 group-hover:text-blue-600 transition-colors" />
                      </Link>
                      <p className="text-sm text-gray-500 mt-1">{section.description}</p>
                    </div>

                    {/* Direct Options */}
                    {"options" in section && section.options && (
                      <div className="space-y-2">
                        {section.options.map((option, optIdx) => (
                          <Link
                            key={optIdx}
                            href={option.href}
                            className="block px-3 py-2 text-sm text-gray-600 hover:text-blue-600 hover:bg-blue-50 rounded-md transition-colors"
                            onClick={handleLinkClick}
                          >
                            {option.label}
                          </Link>
                        ))}
                      </div>
                    )}

                    {/* Subsections (for Accordance) */}
                    {"subsections" in section && section.subsections && (
                      <div className="space-y-4">
                        {section.subsections.map((subsection, subIdx) => (
                          <div key={subIdx} className="border-l-2 border-blue-200 pl-4">
                            <Link href={subsection.href} className="flex items-center group mb-2" onClick={handleLinkClick}>
                              <h4 className="font-medium text-gray-700 group-hover:text-blue-600 transition-colors">
                                {subsection.title}
                              </h4>
                              <ExternalLink className="ml-1 h-3 w-3 text-gray-400 group-hover:text-blue-600 transition-colors" />
                            </Link>
                            <div className="space-y-1">
                              {subsection.options.map((option, optIdx) => (
                                <Link
                                  key={optIdx}
                                  href={option.href}
                                  className="block px-2 py-1 text-xs text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                                  onClick={handleLinkClick}
                                >
                                  {option.label}
                                </Link>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* Quick Actions */}
              <div className="mt-8 pt-6 border-t border-gray-200">
                <div className="flex flex-wrap gap-3">
                  <span className="text-sm font-medium text-gray-500">Quick Actions:</span>
                  {roleMenuKey === "data-owner" && (
                    <>
                      <Link
                        href="/federations/create"
                        className="text-sm text-blue-600 hover:text-blue-700 font-medium"
                        onClick={handleLinkClick}
                      >
                        + New Federation
                      </Link>
                      <Link href="/assets/create" className="text-sm text-blue-600 hover:text-blue-700 font-medium" onClick={handleLinkClick}>
                        + New Asset
                      </Link>
                    </>
                  )}
                  {roleMenuKey === "data-client" && (
                    <>
                      <Link href="/search/federation" className="text-sm text-blue-600 hover:text-blue-700 font-medium" onClick={handleLinkClick}>
                        🔍 Search Federations
                      </Link>
                      <Link href="/search/data" className="text-sm text-blue-600 hover:text-blue-700 font-medium" onClick={handleLinkClick}>
                        🔍 Search Data
                      </Link>
                      <Link href="/access/my-requests" className="text-sm text-blue-600 hover:text-blue-700 font-medium" onClick={handleLinkClick}>
                        🔍 My requests
                      </Link>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
