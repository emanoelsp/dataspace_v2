import type React from "react"
import type { Metadata } from "next"
import "./globals.css"
import Header from "../components/header"
import Nav from "../components/nav";

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
          <Header />
          <Nav />
        </div>
        
        {/* Conteúdo principal com padding para compensar a altura dos elementos fixos */}
        <main>
          {children}
        </main>
      </body>
    </html>
  )
}