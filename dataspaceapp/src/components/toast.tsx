// components/toast.tsx
"use client"

import * as Toast from "@radix-ui/react-toast"
import { useState } from "react"

export function ToastSuccess({ message }: { message: string }) {
  const [open, setOpen] = useState(true)

  return (
    <Toast.Provider swipeDirection="right">
      <Toast.Root
        open={open}
        onOpenChange={setOpen}
        className="bg-white border shadow-lg rounded-md p-4 flex items-start space-x-4 w-full max-w-sm"
      >
        <div className="text-green-600 mt-1"> ✅ </div>
        <div className="text-sm text-gray-900">{message}</div>
      </Toast.Root>
      <Toast.Viewport className="fixed bottom-4 right-4 z-50" />
    </Toast.Provider>
  )
}

export function ToastFail({ message }: { message: string }) {
  const [open, setOpen] = useState(true)

  return (
    <Toast.Provider swipeDirection="right">
      <Toast.Root
        open={open}
        onOpenChange={setOpen}
        className="bg-white border shadow-lg rounded-md p-4 flex items-start space-x-4 w-full max-w-sm"
      >
        <div className="text-red-600 mt-1"> ❌  </div>
        <div className="text-sm text-gray-900">{message}</div>
      </Toast.Root>
      <Toast.Viewport className="fixed bottom-4 right-4 z-50" />
    </Toast.Provider>
  )
}
