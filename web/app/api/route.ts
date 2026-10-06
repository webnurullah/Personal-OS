// Health check: open /api in a browser to see that the API is running.
export const dynamic = "force-dynamic";

export function GET() {
  return Response.json({ ok: true, name: "POS API", time: new Date().toISOString() });
}
