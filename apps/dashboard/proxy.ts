import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { SESSION_COOKIE, readToken } from '@/lib/token';

const publicPaths = ['/login', '/signup'];

// Sends visitors without a valid session to /login. The pages check the session again,
// because this redirect alone should not be the only protection.
export async function proxy(request: NextRequest) {
    const path = request.nextUrl.pathname;
    const session = await readToken(request.cookies.get(SESSION_COOKIE)?.value);
    const isPublic = publicPaths.includes(path);

    if (!session && !isPublic) {
        return NextResponse.redirect(new URL('/login', request.nextUrl));
    }
    if (session && isPublic) {
        return NextResponse.redirect(new URL('/', request.nextUrl));
    }
    return NextResponse.next();
}

export const config = {
    matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
};
