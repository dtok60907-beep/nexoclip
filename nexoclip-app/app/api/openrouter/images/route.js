// Retired: this route called paid image providers without reserving credits.
// All image generation goes through the credited POST /api/generations.
export function createImageHandler() {
  return async function POST() {
    return Response.json(
      { error: 'This endpoint has been retired. Use /api/generations.', code: 'ENDPOINT_RETIRED' },
      { status: 410 },
    );
  };
}

export const POST = createImageHandler();
