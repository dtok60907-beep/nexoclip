// Retired: the Workflow builder proxied to MuAPI with no app session, no tenant
// isolation and no credit metering. Every method now answers 410 and makes no
// upstream call. Rebuild on OpenRouter / the metered /api/generations pipeline
// before re-enabling.
function retired() {
    return Response.json(
        {
            error: {
                code: 'ENDPOINT_RETIRED',
                message: 'The Workflow builder is temporarily unavailable.',
            },
        },
        { status: 410 },
    );
}

export async function GET() {
    return retired();
}

export async function POST() {
    return retired();
}

export async function PUT() {
    return retired();
}

export async function PATCH() {
    return retired();
}

export async function DELETE() {
    return retired();
}
