import type { ReactNode } from "react"
import Link from "next/link"
import { ChevronLeft, Layers } from "lucide-react"

export function DiscoveryPageShell({
  title,
  subtitle,
  children,
}: {
  title: string
  subtitle: string
  children: ReactNode
}) {
  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <Link
        href="/search"
        className="inline-flex items-center gap-1 text-sm text-blue-700 hover:text-blue-900 mb-4"
      >
        <ChevronLeft size={18} />
        Unified discovery
      </Link>
      <div className="flex items-start gap-3 mb-6">
        <Layers className="text-blue-600 shrink-0 mt-1" size={28} />
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{title}</h1>
          <p className="text-gray-600 text-sm mt-1">{subtitle}</p>
        </div>
      </div>
      {children}
    </div>
  )
}
