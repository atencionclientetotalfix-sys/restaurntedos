
import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';

export async function GET() {
    try {
        const { rows } = await sql`SELECT key, value FROM settings`;
        const settings = rows.reduce((acc, row) => {
            acc[row.key] = row.value;
            return acc;
        }, {});
        return NextResponse.json(settings);
    } catch (error) {
        console.error('Error fetching settings:', error);
        return NextResponse.json({ error: 'Error fetching settings' }, { status: 500 });
    }
}

export async function POST(request) {
    try {
        const body = await request.json();
        const { restaurant_name, restaurant_logo } = body;

        if (restaurant_name) {
            await sql`INSERT INTO settings (key, value) VALUES ('restaurant_name', ${restaurant_name}) ON CONFLICT (key) DO UPDATE SET value = ${restaurant_name}, updated_at = NOW()`;
        }
        if (restaurant_logo) {
            await sql`INSERT INTO settings (key, value) VALUES ('restaurant_logo', ${restaurant_logo}) ON CONFLICT (key) DO UPDATE SET value = ${restaurant_logo}, updated_at = NOW()`;
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error updating settings:', error);
        return NextResponse.json({ error: 'Error updating settings' }, { status: 500 });
    }
}
