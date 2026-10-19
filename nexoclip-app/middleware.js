import { NextResponse } from 'next/server';
import { IMPERSONATION_COOKIE, allowedWhileReadOnly } from './src/lib/auth/impersonation.js';

function addSecurityHeaders(response) {
    // Prevent MIME type sniffing (CWE-693)
    response.headers.set('X-Content-Type-Options', 'nosniff');
    // Prevent clickjacking (CWE-1021)
    response.headers.set('X-Frame-Options', 'DENY');
    // Enable XSS filter in legacy browsers
    response.headers.set('X-XSS-Protection', '1; mode=block');
    // Referrer policy
    response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
    // Content Security Policy - restricts script sources to prevent XSS (CWE-79).
    // connect-src covers *.muapi.ai (not just api.muapi.ai) because generated
    // media, model thumbnails, and other assets are served from cdn.muapi.ai
    // and other muapi subdomains that the renderer fetches directly.
    response.headers.set(
        'Content-Security-Policy',
        "default-src 'self'; script-src 'self' 'unsafe-eval' 'unsafe-inline' https://embed.tawk.to https://*.tawk.to; style-src 'self' 'unsafe-inline' https://*.tawk.to https://fonts.googleapis.com; img-src 'self' data: blob: https:; media-src 'self' data: blob: https:; connect-src 'self' https://muapi.ai https://*.muapi.ai https://*.tawk.to wss://*.tawk.to; frame-src 'self' https://*.tawk.to; font-src 'self' data: https://*.tawk.to https://fonts.gstatic.com;"
    );
    return response;
}

export function middleware(request) {
    const url = request.nextUrl;

    // An operator impersonating a customer in read-only mode may look but not change
    // anything (generate, top up, edit, delete). Generation and top-up also check the
    // session itself, so removing this cookie does not get around them.
    if (request.cookies.get(IMPERSONATION_COOKIE)?.value === 'read-only'
        && url.pathname.startsWith('/api/') && !allowedWhileReadOnly(request.method, url.pathname)) {
        return addSecurityHeaders(NextResponse.json(
            { error: 'Mode lihat saja: saat impersonate, data akun ini tidak bisa diubah.' },
            { status: 403 },
        ));
    }

    // Catch requests to /api/workflow, /api/app, and /api/v1
    const isMuApi = url.pathname.startsWith('/api/workflow') ||
                    url.pathname.startsWith('/api/app') ||
                    url.pathname.startsWith('/api/v1');

    if (isMuApi) {
        // Exclude paths that have their own dedicated route handlers with custom logic
        const isHandledByRoute = url.pathname.startsWith('/api/v1/creative-agent') ||
                                url.pathname.startsWith('/api/v1/get_upload_url') ||
                                url.pathname.startsWith('/api/v1/upload-binary');

        if (url.pathname.startsWith('/api/v1') && !isHandledByRoute) {
            const targetUrl = new URL(url.pathname + url.search, 'https://api.muapi.ai');
            const rewriteResponse = NextResponse.rewrite(targetUrl);
            return addSecurityHeaders(rewriteResponse);
        }
    }

    // Add security headers to all responses
    return addSecurityHeaders(NextResponse.next());
}

// Match all paths for security headers. Exclude Next.js internal paths, the
// Director's render upload and the file upload (chat attachments, element photos):
// middleware clones request bodies and cuts them off at 10 MB
// (middlewareClientMaxBodySize), which would truncate a rendered MP4 or a video.
export const config = {
    matcher: [
        '/api/((?!internal/director/render-upload|uploads$).*)',
        '/((?!_next/static|_next/image|favicon.ico|__nextjs_original-stack-frame|api/internal/director/render-upload|api/uploads$).*)',
    ],
};
