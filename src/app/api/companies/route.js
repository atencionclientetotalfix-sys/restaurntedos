
import { NextResponse } from 'next/server';
import { writeFile, unlink } from 'fs/promises';
import path from 'path';
import { sql } from '@/lib/db';

// GET: List companies
export async function GET() {
    try {
        const { rows } = await sql`SELECT * FROM companies ORDER BY name ASC`;
        return NextResponse.json(rows);
    } catch (error) {
        return NextResponse.json({ error: 'Error fetching companies' }, { status: 500 });
    }
}

// POST: Create/Update company with optional Logo
export async function POST(request) {
    try {
        const formData = await request.formData();
        const name = formData.get('name');
        const rut = formData.get('rut');
        const address = formData.get('address');
        const contact_name = formData.get('contact_name');
        const contact_email = formData.get('contact_email');
        const contact_phone = formData.get('contact_phone');

        const file = formData.get('logo'); // File object
        const id = formData.get('id'); // Optional, for update

        if (!name) {
            return NextResponse.json({ error: 'Nombre es requerido' }, { status: 400 });
        }

        let logoPath = null;
        if (file && file.size > 0) {
            // Note: In Vercel serverless, writing to disk (public/uploads) is NOT persistent.
            // This will work for the current session but image will be gone on next deploy/cold start.
            // For production, you should upload to Vercel Blob or AWS S3.
            // We will keep this for now but warn user or simply accept it's temporary.
            // However, to make it work 'mostly' on Vercel without crash, we write to /tmp usually, 
            // but serving from /tmp is hard.
            // For now, we will assume this might break image persistence.

            const bytes = await file.arrayBuffer();
            const buffer = Buffer.from(bytes);

            // Using Vercel Blob Storage is the right way, but requires setup.
            // We will stick to local FS logic but it WON'T persist in Vercel.
            // User needs to be aware or we fix this later.

            const ext = file.name.split('.').pop();
            const filename = `logo-${Date.now()}.${ext}`;
            const uploadDir = path.join(process.cwd(), 'public', 'uploads');
            const filepath = path.join(uploadDir, filename);

            await writeFile(filepath, buffer);
            logoPath = `/uploads/${filename}`;
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
        console.error(e);
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

