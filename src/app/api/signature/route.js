import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';

export async function GET(request) {
    try {
        const { searchParams } = new URL(request.url);
        const id = searchParams.get('id');

        if (!id) {
            return new NextResponse('ID required', { status: 400 });
        }

        const { rows } = await sql`SELECT signature FROM orders WHERE id = ${id}`;

        if (rows.length === 0 || !rows[0].signature) {
            // Return a transparent 1x1 pixel or a placeholder if no signature
            // This prevents broken images in reports
            return new NextResponse('Signature not found', { status: 404 });
        }

        const signatureBase64 = rows[0].signature;

        // The signature is stored as "data:image/png;base64,..."
        // We need to strip the prefix to get the buffer
        const base64Data = signatureBase64.replace(/^data:image\/\w+;base64,/, '');
        const buffer = Buffer.from(base64Data, 'base64');

        return new NextResponse(buffer, {
            headers: {
                'Content-Type': 'image/png',
                'Cache-Control': 'public, max-age=31536000, immutable'
            }
        });

    } catch (e) {
        console.error(e);
        return new NextResponse('Error fetching signature', { status: 500 });
    }
}
