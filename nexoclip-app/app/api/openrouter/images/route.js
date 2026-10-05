// Retired: this route generated on the platform OpenRouter key without
// reserving or capturing any credits. Generation goes through the credited
// /api/generations pipeline.
export async function POST() {
  return Response.json(
    { error: { code: 'ENDPOINT_RETIRED', message: 'This endpoint has been retired. Use /api/generations.' } },
    { status: 410 },
  );
}
