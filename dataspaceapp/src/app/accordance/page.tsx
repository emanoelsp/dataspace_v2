"use client"

import Link from "next/link"
import { ShieldCheck } from "lucide-react"

export default function ConformidadeHomePage() {
  return (
    <div className="max-w-4xl mx-auto p-8">
      <div className="mt-1 p-4 bg-yellow-50 border-l-4 border-yellow-500 text-yellow-700 text-sm rounded-md">
        <strong>Note:</strong> Accordance is the starting point to ensure responsible, secure, and auditable data usage across the ecosystem.
        Choose below whether you want to manage consents (compliance) or policies and roles (governance).
      </div>
      <div className="text-center mt-4">
        <ShieldCheck className="inline-block" size={36} />
        <h1 className="text-4xl font-bold text-gray-800 mb-4">Accordance Management</h1>
        <p className="text-lg text-gray-600 mb-8">
          Manage consents, legal bases, roles, and access policies to ensure compliance and data governance.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-12">

          <Link href="/accordance/compliance" className="hover:shadow-lg transition-shadow">
            <div className="p-6 border rounded-lg shadow-sm bg-white hover:shadow-md cursor-pointer bg-blue-100">
              <h2 className="text-xl font-semibold mb-2">Compliance</h2>
              <p className="text-gray-600">Manage consents, terms acceptance, and legal bases (LGPD, GDPR)</p>
            </div>
          </Link>

          <Link href="/accordance/governance" className="hover:shadow-lg transition-shadow">
            <div className="p-6 border rounded-lg shadow-sm bg-white hover:shadow-md cursor-pointer bg-blue-100">
              <h2 className="text-xl font-semibold mb-2">Governance</h2>
              <p className="text-gray-600">Define roles, permissions, access policies, and auditing</p>
            </div>
          </Link>

        </div>
      </div>
    </div>
  )
}