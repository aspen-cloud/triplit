import { NextResponse } from 'next/server';

export function middleware(request) {
  const { pathname } = request.nextUrl;

  // Set content type to text/plain for .md and llms.txt routes
  if (pathname.endsWith('.md') || pathname === '/docs/llms.txt') {
    const response = NextResponse.next();
    response.headers.set('Content-Type', 'text/plain; charset=utf-8');
    return response;
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/docs/:path*.md', '/docs/llms.txt'],
};
