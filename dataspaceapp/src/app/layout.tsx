import type React from "react"
import type { Metadata } from "next"
import { Suspense } from "react"
import "./globals.css"
import Header from "../components/header"
import Nav from "../components/nav"
import RouteGuard from "@/components/route-guard"

export const metadata: Metadata = {
  title: "Dataspace - Advanced Manufacturing",
  description: "Seamlessly share, discover, and control industrial data across federated networks for advanced manufacturing.",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
      <body className="bg-gray-50 text-gray-800 antialiased">
        {/* Container fixo para Header e Nav */}
        <div className="sticky top-0 z-50 w-full">
          <Suspense fallback={<div className="h-12 bg-gradient-to-br from-blue-50 to-indigo-100" aria-hidden />}>
            <Header />
          </Suspense>
          <Nav />
        </div>
        
        {/* Conteúdo principal com padding para compensar a altura dos elementos fixos */}
        <main>
          <RouteGuard>{children}</RouteGuard>
        </main>
      </body>
    </html>
  )
}
