import { cookies } from 'next/headers';
import { sql } from '@/lib/db';
import { v4 as uuidv4 } from 'uuid';

export async function createSession() {
    const token = uuidv4();
    const expiresAt = Math.floor(Date.now() / 1000) + (60 * 60 * 24); // 24 hours

    await sql`
        INSERT INTO sessions (token, expires_at) 
        VALUES (${token}, ${expiresAt})
    `;

    const cookieStore = await cookies();
    cookieStore.set('admin_session', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 60 * 60 * 24,
        path: '/'
    });

    return true;
}

export async function verifySession() {
    const cookieStore = await cookies();
    const token = cookieStore.get('admin_session')?.value;

    if (!token) return false;

    // Clean expired
    const now = Math.floor(Date.now() / 1000);
    // Note: Delete side-effect in GET/verification is ok but async.
    // We don't await the cleanup necessarily to speed up response, 
    // or we can await it. Awaiting is safer.
    try {
        await sql`DELETE FROM sessions WHERE expires_at < ${now}`;

        const { rows } = await sql`SELECT * FROM sessions WHERE token = ${token}`;
        return rows.length > 0;
    } catch (e) {
        console.error("Session verification error", e);
        return false;
    }
}

export async function destroySession() {
    const cookieStore = await cookies();
    const token = cookieStore.get('admin_session')?.value;

    if (token) {
        await sql`DELETE FROM sessions WHERE token = ${token}`;
        cookieStore.delete('admin_session');
    }
}

