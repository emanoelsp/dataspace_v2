import { NextRequest, NextResponse } from "next/server"

// Server-side connectivity probe — avoids browser CORS restrictions.
// Called by the asset-create form to test equipment health endpoints.
export async function GET(request: NextRequest) {
  const url = request.nextUrl.searchParams.get("url")
  if (!url) {
    return NextResponse.json({ error: "Missing url parameter" }, { status: 400 })
  }

  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return NextResponse.json({ error: "Invalid URL" }, { status: 400 })
  }

  // Only allow http/https to private/local addresses for safety
  if (!["http:", "https:"].includes(parsed.protocol)) {
    return NextResponse.json({ error: "Only http/https URLs allowed" }, { status: 400 })
  }

  const start = Date.now()
  try {
    const res = await fetch(url, {
      headers: { Authorization: "Bearer demo", Accept: "application/json" },
      signal: AbortSignal.timeout(5000),
    })
    const responseTimeMs = Date.now() - start
    let body: unknown = null
    try { body = await res.json() } catch { body = null }

    return NextResponse.json({
      ok: res.ok,
      status: res.status,
      statusText: res.statusText,
      responseTimeMs,
      body,
    })
  } catch (err) {
    return NextResponse.json({
      ok: false,
      status: 0,
      responseTimeMs: Date.now() - start,
      error: err instanceof Error ? err.message : String(err),
    })
  }
}
