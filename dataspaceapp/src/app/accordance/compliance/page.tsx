"use client"

import Link from "next/link"
import { ChevronLeft, FileCheck } from "lucide-react";

export default function ComplianceHomePage() {
    return (
        <>
            <div className="flex justify-between items-center mb-6 mt-4 container mx-auto">
                <Link href="/accordance/" className="text-blue-600 hover:underline mb-4 inline-flex items-center">
                    <ChevronLeft size={20} className="mr-1" /> Back to Accordance
                </Link>
                <Link href="/accordance/compliance/browse">
                    <button className="bg-blue-600 text-white px-5 py-2 rounded-md hover:bg-blue-700">Browse Compliance</button>
                </Link>
            </div>
            <div className="max-w-4xl mx-auto p-8">
                <div className="mt-1 p-4 bg-yellow-50 border-l-4 border-yellow-500 text-yellow-700 text-sm rounded-md">
                    <strong>Note:</strong> Compliance is essential to ensure responsible, secure, and auditable data usage across your ecosystem.
                    Manage consents, legal bases, and terms acceptance to meet regulatory requirements.
                </div>
                <div className="text-center mt-4">
                    <FileCheck className="inline-block" size={36} />
                    <h1 className="text-4xl font-bold text-gray-800 mb-4">Compliance Management</h1>
                    <p className="text-lg text-gray-600 mb-8">
                        Manage your compliance processes with ease. Create, browse, and audit compliance records to ensure your organization meets all legal and regulatory standards.
                    </p>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-12">

                        <Link href="/accordance/compliance/create" className="hover:shadow-lg transition-shadow">
                            <div className="p-6 border rounded-lg shadow-sm bg-white hover:shadow-md transition-shadow cursor-pointer bg-blue-100">
                                <h2 className="text-xl font-semibold mb-2">Create Compliance</h2>
                                <p className="text-gray-600">Register new compliance, consents, or legal bases</p>
                            </div>
                        </Link>

                        <Link href="/accordance/compliance/browse" className="hover:shadow-lg transition-shadow">
                            <div className="p-6 border rounded-lg shadow-sm bg-white hover:shadow-md transition-shadow cursor-pointer bg-blue-100">
                                <h2 className="text-xl font-semibold mb-2">Browse Compliance</h2>
                                <p className="text-gray-600">View and search through existing compliance records</p>
                            </div>
                        </Link>

                    </div>
                </div>
            </div>
        </>
    )
}