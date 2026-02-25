import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { v4 as uuidv4 } from 'uuid';

export async function POST(request) {
    try {
        const { pin } = await request.json();

        // 1. Check if PIN matches environment variable (Secure Source of Truth)
        if (pin === process.env.ADMIN_PASSWORD) {
            const token = uuidv4();
            const expiresAt = Date.now() + (24 * 60 * 60 * 1000); // 24 hours

            try {
                // Insert session into DB
                await sql`
                    INSERT INTO sessions (token, expires_at) 
                    VALUES (${token}, ${expiresAt})
                `;

                // Set HttpOnly Cookie
                const response = NextResponse.json({ success: true });
                response.cookies.set('admin_session', token, {
                    httpOnly: true,
                    secure: process.env.NODE_ENV === 'production',
                    sameSite: 'strict',
                    maxAge: 60 * 60 * 24, // 24 hours
                    path: '/',
                });

                return response;
            } catch (dbError) {
                console.error('Session DB Error:', dbError);
                return NextResponse.json({ success: false, error: `Database error: ${dbError.message}` }, { status: 500 });
            }
        }

        return NextResponse.json({ success: false, error: 'Contraseña incorrecta' }, { status: 401 });

    } catch (error) {
        console.error('Login error:', error);
        return NextResponse.json({ success: false, error: 'Server error' }, { status: 500 });
    }
}
