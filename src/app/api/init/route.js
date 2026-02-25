import { NextResponse } from 'next/server';
import { initDb } from '@/lib/db';

export async function GET() {
    try {
        await initDb();
        return NextResponse.json({ success: true, message: 'Database initialized successfully' });
    } catch (e) {
        return NextResponse.json({ success: false, error: e.message }, { status: 500 });
    }
}
