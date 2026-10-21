// Which sign-in methods the login dialog may offer.
export const dynamic = 'force-dynamic';

export function GET() {
  return Response.json({ google: Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) }, { headers: { 'Cache-Control': 'public, max-age=300' } });
}
