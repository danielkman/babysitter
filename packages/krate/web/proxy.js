import { NextResponse } from 'next/server.js';

const PUBLIC_PAGE_PATHS = new Set(['/login']);
const PUBLIC_PATH_PREFIXES = ['/api/auth', '/_next'];
const PUBLIC_FILE_PATTERN = /\.(?:css|js|map|png|jpg|jpeg|gif|svg|ico|webp|avif|txt|xml|json|woff2?)$/;

function applySecurityHeaders(response) {
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  return response;
}

export function proxy(request) {
  const { pathname, search } = request.nextUrl;
  if (isPublicPath(pathname)) {
    return applySecurityHeaders(NextResponse.next());
  }

  const cookieName = process.env.KRATE_AUTH_COOKIE_NAME || 'krate_session';
  if (request.cookies.has(cookieName)) {
    return applySecurityHeaders(NextResponse.next());
  }

  const loginUrl = new URL('/login', request.url);
  if (pathname !== '/') loginUrl.searchParams.set('next', `${pathname}${search}`);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)']
};

function isPublicPath(pathname) {
  if (PUBLIC_PAGE_PATHS.has(pathname)) return true;
  if (PUBLIC_PATH_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))) return true;
  return PUBLIC_FILE_PATTERN.test(pathname);
}