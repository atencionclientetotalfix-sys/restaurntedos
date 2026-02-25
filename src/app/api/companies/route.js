
import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { supabase } from '@/lib/supabase';

// GET: List companies
export async function GET() {
    try {
        const { rows } = await sql`SELECT * FROM companies ORDER BY name ASC`;
        return NextResponse.json(rows);
    } catch (error) {
        return NextResponse.json({ error: 'Error fetching companies' }, { status: 500 });
    }
}

// Helper to sanitize filename
const sanitizeFilename = (name) => {
    return name.replace(/[^a-z0-9.]/gi, '_').toLowerCase();
};

// POST: Create/Update company with optional Logo
export async function POST(request) {
    try {
        const formData = await request.formData();
        const name = formData.get('name');
        const rut = formData.get('rut') || '';
        const address = formData.get('address') || '';
        const contact_name = formData.get('contact_name') || '';
        const contact_email = formData.get('contact_email') || '';
        const contact_phone = formData.get('contact_phone') || '';

        const file = formData.get('logo'); // File object
        const id = formData.get('id'); // Optional, for update

        if (!name) {
            return NextResponse.json({ error: 'Nombre es requerido' }, { status: 400 });
        }

        let logoPath = null;

        if (file && file.size > 0) {
            const bytes = await file.arrayBuffer();
            const buffer = Buffer.from(bytes);

            const safeName = sanitizeFilename(file.name);
            const filename = `${Date.now()}_${safeName}`;

            // Upload to Supabase Storage (Bucket: 'logos')
            const { data, error } = await supabase.storage
                .from('logos')
                .upload(filename, buffer, {
                    contentType: file.type,
                    upsert: true
                });

            if (error) {
                console.error("Supabase Storage Error:", error);
                // If bucket doesn't exist, we might get an error. 
                // In a real app, you'd ensure bucket exists via dashboard.
                throw new Error("Error al subir imagen a Supabase Storage: " + error.message);
            }

            // Get Public URL
            const { data: { publicUrl } } = supabase.storage
                .from('logos')
                .getPublicUrl(filename);

            logoPath = publicUrl;
        }

        if (id) {
            // Update
            if (logoPath) {
                await sql`
                    UPDATE companies 
                    SET name = ${name.trim()}, rut = ${rut}, address = ${address}, 
                        contact_name = ${contact_name}, contact_email = ${contact_email}, 
                        contact_phone = ${contact_phone}, logo_path = ${logoPath} 
                    WHERE id = ${id}
                `;
            } else {
                await sql`
                    UPDATE companies 
                    SET name = ${name.trim()}, rut = ${rut}, address = ${address}, 
                        contact_name = ${contact_name}, contact_email = ${contact_email}, 
                        contact_phone = ${contact_phone}
                    WHERE id = ${id}
                `;
            }
        } else {
            // Create
            await sql`
                INSERT INTO companies (name, rut, address, contact_name, contact_email, contact_phone, logo_path) 
                VALUES (${name.trim()}, ${rut}, ${address}, ${contact_name}, ${contact_email}, ${contact_phone}, ${logoPath})
            `;
        }

        return NextResponse.json({ success: true });

    } catch (e) {
        console.error("POST Company Error:", e);
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}

// DELETE: Eliminar empresa y sus trabajadores (Cascada)
export async function DELETE(request) {
    try {
        const { searchParams } = new URL(request.url);
        const id = searchParams.get('id');
        if (!id) return NextResponse.json({ error: 'ID required' }, { status: 400 });

        // 1. Obtener nombre de la empresa
        const { rows: companyRows } = await sql`SELECT name FROM companies WHERE id = ${id}`;

        if (companyRows.length > 0) {
            const companyName = companyRows[0].name;

            // 2. Eliminar trabajadores asociados (CASCADA MANUAL)
            // Dado que no hay FK constraint on delete cascade, lo hacemos manual
            await sql`DELETE FROM workers WHERE company = ${companyName}`;
        }

        // 3. Eliminar empresa
        const { rowCount } = await sql`DELETE FROM companies WHERE id = ${id}`;

        if (rowCount === 0) {
            return NextResponse.json({ error: 'Empresa no encontrada' }, { status: 404 });
        }

        return NextResponse.json({ success: true });
    } catch (e) {
        console.error(e);
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}

