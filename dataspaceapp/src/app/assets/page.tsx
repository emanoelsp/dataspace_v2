"use client"

import Link from "next/link"
import { BookUp2 } from 'lucide-react';

export default function AssetsHomePage() {
  return (
    <div className="max-w-4xl mx-auto p-8">
      <div className="mt-1 p-4 bg-yellow-50 border-l-4 border-yellow-500 text-yellow-700 text-sm rounded-md">
        <strong>Note:</strong> To enable trusted, secure, and governed data sharing across ecosystems, federated data and dataspace assets are essential.
        Ensure robust metadata and governance policies are in place to support discoverability and interoperability.
      </div>
      <div className="text-center mt-4">
        <BookUp2 className="inline-block" size={36} /> {/* Add the Handshake icon here */}

        <h1 className="text-4xl font-bold text-gray-800 mb-4 "> Asset Management</h1>
        <p className="text-lg text-gray-600 mb-8">
          Manage your dataspace assets with ease. Create, browse, and configure federated data assets to enable trusted data
          sharing across your ecosystem.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-12">

          <Link href="/assets/create" className="hover:shadow-lg transition-shadow">
            <div className="p-6 border rounded-lg shadow-sm bg-white hover:shadow-md transition-shadow cursor-pointer bg-blue-100">
              <h2 className="text-xl font-semibold mb-2">Create Dataspace Asset</h2>
              <p className="text-gray-600">Set up and configure a new asset for federated data sharing</p>
            </div>
          </Link>


          <Link href="/assets/browse" className="hover:shadow-lg transition-shadow">
            <div className="p-6 border rounded-lg shadow-sm bg-white hover:shadow-md transition-shadow cursor-pointer bg-blue-100">
              <h2 className="text-xl font-semibold mb-2">Browse Dataspace Assets</h2>
              <p className="text-gray-600">View and search through existing federated data assets</p>
            </div>
          </Link>


        </div>
      </div>
    </div>
  )
}