"use client"

import { useState } from "react"
import {
  Factory,
  ChevronDown,
  ExternalLink,
  ShieldCheck,
  Globe,
  Home,
  LayoutDashboard,
  // BarChart3 removido pois não é utilizado
} from "lucide-react"
import Link from "next/link"

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
        label: "Access Control",
        description: "Federation broker, access requests and logs",
        basePath: "/access",
        options: [
          { label: "Publish Federation to Broker", href: "/access/broker" },
          { label: "Review Access Requests", href: "/access/requests" },
          { label: "View Access Logs", href: "/access/logs" },
        ],
      },
      {
        label: "Discovery",
        description: "Discover and explore data",
        basePath: "/search",
        options: [
          { label: "Search Federation", href: "/search/federation" },
          { label: "Search Assets", href: "/search/assets" },
          { label: "Search by Type", href: "/search/type" },
          { label: "Search Data", href: "/search/data" },
        ],
      },
    ],
  },
  "data-client": {
    title: "Data Client",
    icon: <Globe className="w-5 h-5 mr-2" />,
    sections: [
      {
        label: "Discovery",
        description: "Discover and explore data",
        basePath: "/search",
        options: [
          { label: "Search Federation", href: "/search/federation" },
          { label: "Search Assets", href: "/search/assets" },
          { label: "Search by Type", href: "/search/type" },
          { label: "Search Data", href: "/search/data" },
        ],
      },
      {
        label: "Access Control",
        description: "Access control and permissions",
        basePath: "/access",
        options: [
          { label: "Invitations", href: "/access/invitations" },
          { label: "Traceability", href: "/access/rastrability" },
        ],
      },
      {
        label: "Analytics",
        description: "View usage reports and metrics",
        basePath: "/analytics",
        options: [
          { label: "Usage Reports", href: "/analytics/reports" },
          { label: "Metrics Dashboard", href: "/analytics/metrics" },
        ],
      },
    ],
  },
}

export default function DataspaceMenu() {
  const [activeMenu, setActiveMenu] = useState<string | null>(null)

  // Fecha o menu ao clicar em qualquer link
  const handleLinkClick = () => setActiveMenu(null)

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
          <div className="flex space-x-2">
            {/* Home */}
            <Link
              href="/"
              className="flex items-center px-6 py-2 text-sm font-medium rounded-lg transition-all duration-200 text-gray-700 hover:bg-blue-50 hover:text-blue-600"
            >
              <Home className="w-5 h-5 mr-2" />
              Home
            </Link>
            {/* Dashboard */}
            <Link
              href="/dashboard"
              className="flex items-center px-6 py-2 text-sm font-medium rounded-lg transition-all duration-200 text-gray-700 hover:bg-blue-50 hover:text-blue-600"
            >
              <LayoutDashboard className="w-5 h-5 mr-2" />
              Dashboard
            </Link>
            {/* Data Owner / Data Client */}
            {Object.entries(MENUS).map(([key, menu]) => (
              <div key={key} className="relative">
                <button
                  onClick={() => setActiveMenu(activeMenu === key ? null : key)}
                  className={`flex items-center px-6 py-2 text-sm font-medium rounded-lg transition-all duration-200 ${activeMenu === key
                      ? "bg-blue-600 text-white shadow-md"
                      : "text-gray-700 hover:bg-blue-50 hover:text-blue-600"
                    }`}
                >
                  {menu.icon}
                  {menu.title}
                  <ChevronDown
                    className={`ml-2 h-4 w-4 transition-transform duration-200 ${activeMenu === key ? "rotate-180" : ""
                      }`}
                  />
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Mega Menu */}
        {activeMenu && (
          <div className="border-t border-gray-200 bg-white">
            <div className="py-8">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                {MENUS[activeMenu as keyof typeof MENUS].sections.map((section, idx) => (
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
                  {activeMenu === "data-owner" && (
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
                  {activeMenu === "data-client" && (
                    <>
                      <Link href="/search/federation" className="text-sm text-blue-600 hover:text-blue-700 font-medium" onClick={handleLinkClick}>
                        🔍 Search Federations
                      </Link>
                      <Link href="/search/data" className="text-sm text-blue-600 hover:text-blue-700 font-medium" onClick={handleLinkClick}>
                        🔍 Search Data
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