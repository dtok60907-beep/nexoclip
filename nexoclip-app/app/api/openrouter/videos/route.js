// Retired: this route called paid video providers without reserving credits.
// All video generation goes through the credited POST /api/generations.
// Polling of already-submitted jobs stays in ./[id]/route.js.
export function createVideoSubmitHandler() {
  return async function POST() {
    return Response.json(
      { error: 'This endpoint has been retired. Use /api/generations.', code: 'ENDPOINT_RETIRED' },
      { status: 410 },
    );
  };
}

export const POST = createVideoSubmitHandler();
