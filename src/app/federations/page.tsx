"use client"

import Link from "next/link"
import { Handshake } from 'lucide-react';

export default function FederationsHomePage() {
  return (
    <div className="max-w-4xl mx-auto p-8">
      <div className="mt-1 p-4 bg-yellow-50 border-l-4 border-yellow-500 text-yellow-700 text-sm rounded-md">
        <strong>Note:</strong> Federations are central to enabling trusted, secure, and governed data sharing across ecosystems.
        Ensure metadata and governance policies are well defined to support discoverability and interoperability.
      </div>
      <div className="text-center mt-4">
        <Handshake className="inline-block" size={36} /> {/* Add the Handshake icon here */}
        <h1 className="text-4xl font-bold text-gray-800 mb-4"> Federation Management</h1>
        <p className="text-lg text-gray-600 mb-8">
          Manage your data federations with ease. Create, browse, and configure federations to enable trusted data
          sharing across your ecosystem.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-12">

           <Link href="/federations/create" className="hover:shadow-lg transition-shadow">
            <div className="p-6 border rounded-lg shadow-sm bg-white hover:shadow-md transition-shadow cursor-pointer bg-blue-100">
              <h2 className="text-xl font-semibold mb-2">Create Federation</h2>
              <p className="text-gray-600">Set up and configure a new federation for data sharing</p>
            </div>
          </Link>


          <Link href="/federations/browse" className="hover:shadow-lg transition-shadow">
            <div className="p-6 border rounded-lg shadow-sm bg-white hover:shadow-md transition-shadow cursor-pointer bg-blue-100">
              <h2 className="text-xl font-semibold mb-2">Browse Federations</h2>
              <p className="text-gray-600">View and search through existing federations in ecosystem</p>
            </div>
          </Link>

         
        </div>
      </div>
    </div>
  )
}
