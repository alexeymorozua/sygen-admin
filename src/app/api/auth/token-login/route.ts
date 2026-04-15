import { NextRequest, NextResponse } from "next/server";

/**
 * Server-side proxy for token-based login.
 *
 * The client sends { token } here. This route forwards the request to
 * Sygen Core's /api/auth/login using the server-only SYGEN_API_URL,
 * keeping the actual API URL topology and any static tokens out of
 * the client bundle.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { token } = body as { token?: string };

    if (!token) {
      return NextResponse.json({ error: "Token is required" }, { status: 400 });
    }

    const apiUrl = process.env.SYGEN_API_URL || process.env.NEXT_PUBLIC_SYGEN_API_URL || "http://localhost:8080";

    const upstream = await fetch(`${apiUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    });

    const data = await upstream.json().catch(() => null);

    if (!upstream.ok) {
      return NextResponse.json(
        { error: data?.error || "Login failed" },
        { status: upstream.status },
      );
    }

    return NextResponse.json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
