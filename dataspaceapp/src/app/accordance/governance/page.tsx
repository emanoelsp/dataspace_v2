"use client"

import Link from "next/link"
import { ChevronLeft, Shield } from 'lucide-react';

export default function GovernanceHomePage() {
    return (
        <>
            <div className="flex justify-between items-center mb-6 mt-4 container mx-auto">
                <Link href="/accordance/" className="text-blue-600 hover:underline mb-4 inline-flex items-center">
                    <ChevronLeft size={20} className="mr-1" /> Back to Accordance
                </Link>
                <Link href="/accordance/compliance/browse">
                    <button className="bg-blue-600 text-white px-5 py-2 rounded-md hover:bg-blue-700">Browse Governance</button>
                </Link>
            </div>
            <div className="max-w-4xl mx-auto p-8">
                <div className="mt-1 p-4 bg-yellow-50 border-l-4 border-yellow-500 text-yellow-700 text-sm rounded-md">
                    <strong>Note:</strong> Governance is crucial to ensure secure, controlled, and transparent data access and usage across your organization.
                    Define roles, permissions, access policies, and audit mechanisms to maintain data integrity and compliance.
                </div>
                <div className="text-center mt-4">
                    <Shield className="inline-block" size={36} />
                    <h1 className="text-4xl font-bold text-gray-800 mb-4">Governance Management</h1>
                    <p className="text-lg text-gray-600 mb-8">
                        Manage your governance processes with confidence. Create, browse, and audit governance policies to ensure proper data access, traceability, and supervision.
                    </p>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-12">

                        <Link href="/accordance/governance/create" className="hover:shadow-lg transition-shadow">
                            <div className="p-6 border rounded-lg shadow-sm bg-white hover:shadow-md transition-shadow cursor-pointer bg-blue-100">
                                <h2 className="text-xl font-semibold mb-2">Create Governance Policy</h2>
                                <p className="text-gray-600">Define new roles, permissions, traceability or access policies</p>
                            </div>
                        </Link>

                        <Link href="/accordance/governance/browse" className="hover:shadow-lg transition-shadow">
                            <div className="p-6 border rounded-lg shadow-sm bg-white hover:shadow-md transition-shadow cursor-pointer bg-blue-100">
                                <h2 className="text-xl font-semibold mb-2">Browse Governance Policies</h2>
                                <p className="text-gray-600">View and search through existing governance policies</p>
                            </div>
                        </Link>

                    </div>
                </div>
            </div>
        </>
    )
}