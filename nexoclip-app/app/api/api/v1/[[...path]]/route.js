// Retired: this proxy injected the platform MUAPI_API_KEY for any caller with no
// session or workspace auth. Generation goes through the credited /api/generations.
function retired() {
    return Response.json(
        { error: { code: 'ENDPOINT_RETIRED', message: 'This endpoint has been retired. Use /api/generations.' } },
        { status: 410 },
    );
}

export async function GET() {
    return retired();
}

export async function POST() {
    return retired();
}
