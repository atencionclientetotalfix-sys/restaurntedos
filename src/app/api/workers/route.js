import { NextResponse } from 'next/server';
import { verifySession } from '@/lib/auth';
import { sql } from '@/lib/db';

// GET: Listar trabajadores
export async function GET(request) {
    try {
        const { rows: workers } = await sql`SELECT * FROM workers ORDER BY name ASC`;
        return NextResponse.json(workers);
    } catch (e) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}

// POST: Crear trabajador
export async function POST(request) {
    if (!await verifySession()) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    try {
        const { rut, name, company, cost_center, is_premium, is_plus } = await request.json();

        // Basic validation
        if (!rut || !name || !company) {
            return NextResponse.json({ error: 'Faltan datos requeridos (RUT, Nombre, Empresa)' }, { status: 400 });
        }

        // Clean Inputs
        // Consistent cleaning with Bulk Upload: Preserve hyphen, strip dots/spaces
        const cleanRut = rut.trim().replace(/[^0-9kK-]/g, '').toUpperCase();
        const cleanName = name.trim();
        const cleanCompany = company.trim();
        const premiumVal = is_premium ? 1 : 0;

        // Check uniqueness manually before insert to handle error cleanly
        // Or catch error. Let's try direct insert and catch.

        try {
            const { rows } = await sql`
                INSERT INTO workers (rut, name, company, cost_center, is_premium, is_plus)
                VALUES (${cleanRut}, ${cleanName}, ${cleanCompany}, ${cost_center?.trim() || null}, ${premiumVal}, ${is_plus ? 1 : 0})
                RETURNING id
            `;

            return NextResponse.json({
                id: rows[0].id,
                rut: cleanRut,
                name: cleanName,
                company: cleanCompany,
                is_premium: premiumVal
            }, { status: 201 });

        } catch (dbError) {
            if (dbError.code === '23505') { // Postgres unique constraint error code
                return NextResponse.json({ error: 'El RUT ya está registrado.' }, { status: 409 });
            }
            throw dbError;
        }

    } catch (e) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}

// PUT: Actualizar trabajador
export async function PUT(request) {
    if (!await verifySession()) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    try {
        const { id, is_premium, is_plus, name, company, cost_center } = await request.json();

        // Dynamic update is annoying with template tags safely. 
        // We will do conditionals.

        let result;

        // Construct query parts - @vercel/postgres allows variable subst but strict.
        // It's easier to just write separate queries or ONE big query with COALESCE if we pass all fields.
        // But we might only pass some.
        // Let's do a simplified approach: First get existing, then update.
        // OR just handle specific cases since we don't have many fields.

        // Actually, for simplicity and safety against SQL injection, we can use the `sql` tag for each variation 
        // or update all fields (frontend usually sends full object).
        // Let's assume frontend sends only changed fields?
        // Let's fetch current first, merge, update. Safe and easy.

        const { rows } = await sql`SELECT * FROM workers WHERE id = ${id}`;
        if (rows.length === 0) {
            return NextResponse.json({ error: 'Trabajador no encontrado' }, { status: 404 });
        }
        const current = rows[0];

        const newName = name !== undefined ? name.trim() : current.name;
        const newCompany = company !== undefined ? company.trim() : current.company;
        const newPremium = is_premium !== undefined ? (is_premium ? 1 : 0) : current.is_premium;
        const newPlus = is_plus !== undefined ? (is_plus ? 1 : 0) : current.is_plus;

        const newCostCenter = cost_center !== undefined ? cost_center.trim() : current.cost_center;

        await sql`
            UPDATE workers 
            SET name = ${newName}, company = ${newCompany}, cost_center = ${newCostCenter}, is_premium = ${newPremium}, is_plus = ${newPlus}
            WHERE id = ${id}
        `;

        return NextResponse.json({ success: true });

    } catch (e) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}

// DELETE: Eliminar trabajador (soporte para múltiples IDs separados por coma)
export async function DELETE(request) {
    if (!await verifySession()) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    try {
        const { searchParams } = new URL(request.url);
        const idParam = searchParams.get('id');

        if (!idParam) return NextResponse.json({ error: 'ID is required' }, { status: 400 });

        // Split by comma to handle bulk delete
        const ids = idParam.split(',').map(id => id.trim()).filter(id => id);

        if (ids.length === 0) {
            return NextResponse.json({ error: 'No valid IDs provided' }, { status: 400 });
        }

        // Use parameterized query with ANY for security
        // Note: verify strictly that these are numeric if ID is int, or just text if ID is text.
        // Workers ID is SERIAL (int).

        // Vercel Postgres / pg 'ANY' syntax:
        await sql`DELETE FROM workers WHERE id = ANY(${ids}::int[])`;

        return NextResponse.json({ success: true, count: ids.length });
    } catch (e) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}

