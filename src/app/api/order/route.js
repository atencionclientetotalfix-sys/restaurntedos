import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { v4 as uuidv4 } from 'uuid';
import { verifySession } from '@/lib/auth';

// GET: Fetch Single Order for Ticket (Client Side)
export async function GET(request) {
    try {
        const { searchParams } = new URL(request.url);
        const id = searchParams.get('id');

        if (!id) return NextResponse.json({ error: 'ID required' }, { status: 400 });

        // Join with companies to get logo
        const { rows } = await sql`
            SELECT o.*, c.logo_path as company_logo 
            FROM orders o 
            LEFT JOIN companies c ON o.company = c.name 
            WHERE o.id = ${id}
        `;
        const order = rows[0];

        if (!order) return NextResponse.json({ error: 'Orden no encontrada' }, { status: 404 });

        return NextResponse.json(order);

    } catch (e) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}

export async function POST(request) {
    try {
        const { rut, type, quantity, pickup_time, pickup_name, signature, meal_type, guest_names, order_detail } = await request.json();

        if (!rut || !type) {
            return NextResponse.json({ error: 'Faltan datos (RUT, Tipo)' }, { status: 400 });
        }

        const cleanRut = rut.trim().replace(/\./g, '').replace(/\s/g, '').toUpperCase();

        // 1. Verify Worker exists
        const { rows: workers } = await sql`SELECT * FROM workers WHERE rut = ${cleanRut}`;
        const worker = workers[0];

        if (!worker) {
            return NextResponse.json({ success: false, error: 'Trabajador no encontrado en la lista oficial.' }, { status: 404 });
        }

        const now = new Date();
        // Use Chile timezone for date (fixes late night orders appearing on next day)
        const dateStr = now.toLocaleDateString('en-CA', { timeZone: 'America/Santiago' });

        // 3. Verify Daily Limits
        const { rows: existingOrders } = await sql`
            SELECT SUM(quantity) as total_qty FROM orders 
            WHERE worker_rut = ${cleanRut} AND date_str = ${dateStr}
        `;
        const totalOrdered = parseInt(existingOrders[0].total_qty || 0);

        let maxDaily = 1;
        if (worker.is_premium) maxDaily = 999;
        else if (worker.is_plus) maxDaily = 2;

        // Determine Final Requested Quantity
        let finalQty = 1;
        if (worker.is_premium) {
            finalQty = (parseInt(quantity) > 0 && parseInt(quantity) <= 50) ? parseInt(quantity) : 1;
        } else if (worker.is_plus) {
            finalQty = (parseInt(quantity) > 0 && parseInt(quantity) <= 2) ? parseInt(quantity) : 1;
        }

        // Check Limit
        if (totalOrdered + finalQty > maxDaily) {
            return NextResponse.json({ error: `Límite diario excedido (${maxDaily}). Ya has pedido ${totalOrdered} hoy.` }, { status: 409 });
        }
        const finalPickupName = pickup_name ? pickup_name.trim().toUpperCase() : worker.name;
        // Default meal_type to 'ALMUERZO' if missing
        const finalMealType = meal_type || 'ALMUERZO';
        const finalOrderDetail = order_detail ? order_detail.trim() : null;

        // 4. Create Order
        const id = uuidv4().slice(0, 8).toUpperCase(); // Short ID for ticket

        await sql`
            INSERT INTO orders (id, worker_rut, worker_name, company, type, quantity, date_str, pickup_time, pickup_name, signature, meal_type, guest_names, order_detail)
            VALUES (${id}, ${cleanRut}, ${worker.name}, ${worker.company}, ${type}, ${finalQty}, ${dateStr}, ${pickup_time || null}, ${finalPickupName}, ${signature || null}, ${finalMealType}, ${guest_names || null}, ${finalOrderDetail})
        `;

        return NextResponse.json({
            success: true,
            ticket: {
                id,
                worker_name: worker.name,
                company: worker.company,
                type,
                quantity: finalQty,
                date: dateStr,
                time: now.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Santiago' }),
                is_premium: !!worker.is_premium
            }
        });

    } catch (e) {
        console.error(e);
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}

// DELETE: Delete an order (Admin only)
export async function DELETE(request) {
    if (!await verifySession()) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const { searchParams } = new URL(request.url);
        const id = searchParams.get('id');

        if (!id) return NextResponse.json({ error: 'ID required' }, { status: 400 });

        const { rowCount } = await sql`DELETE FROM orders WHERE id = ${id}`;

        if (rowCount === 0) {
            return NextResponse.json({ error: 'Order not found' }, { status: 404 });
        }

        return NextResponse.json({ success: true });

    } catch (e) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}

// PATCH: Update order status (e.g. mark as printed)
export async function PATCH(request) {
    if (!await verifySession()) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const { searchParams } = new URL(request.url);
        const id = searchParams.get('id');
        const { printed } = await request.json();

        if (!id) return NextResponse.json({ error: 'ID required' }, { status: 400 });

        if (printed !== undefined) {
            await sql`UPDATE orders SET printed = ${printed} WHERE id = ${id}`;
        }

        return NextResponse.json({ success: true });

    } catch (e) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
