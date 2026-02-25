
import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { supabase } from '@/lib/supabase';

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

const sanitizeFilename = (name) => {
    return name.replace(/[^a-z0-9.]/gi, '_').toLowerCase();
};

export async function POST(request) {
    try {
        const formData = await request.formData();
        const restaurant_name = formData.get('restaurant_name');
        const file = formData.get('logo'); // File object
        let restaurant_logo = formData.get('restaurant_logo'); // URL if not uploading file

        if (restaurant_name) {
            await sql`INSERT INTO settings (key, value) VALUES ('restaurant_name', ${restaurant_name}) ON CONFLICT (key) DO UPDATE SET value = ${restaurant_name}, updated_at = NOW()`;
        }

        if (file && typeof file !== 'string' && file.size > 0) {
            const bytes = await file.arrayBuffer();
            const buffer = Buffer.from(bytes);
            const safeName = sanitizeFilename(file.name);
            const filename = `res_logo_${Date.now()}_${safeName}`;

            const { data, error } = await supabase.storage
                .from('system')
                .upload(filename, buffer, {
                    contentType: file.type,
                    upsert: true
                });

            if (error) {
                console.error("Supabase Storage Error (System):", error);
                throw new Error("Error al subir logo del sistema: " + error.message);
            }

            const { data: { publicUrl } } = supabase.storage
                .from('system')
                .getPublicUrl(filename);

            restaurant_logo = publicUrl;
        }

        if (restaurant_logo) {
            await sql`INSERT INTO settings (key, value) VALUES ('restaurant_logo', ${restaurant_logo}) ON CONFLICT (key) DO UPDATE SET value = ${restaurant_logo}, updated_at = NOW()`;
        }

        return NextResponse.json({ success: true, restaurant_logo });
    } catch (error) {
        console.error('Error updating settings:', error);
        return NextResponse.json({ error: error.message || 'Error updating settings' }, { status: 500 });
    }
}
