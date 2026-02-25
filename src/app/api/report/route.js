import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';

// GET: Reportes con Filtros
export async function GET(request) {
    try {
        const { searchParams } = new URL(request.url);

        // Filters
        const date = searchParams.get('date'); // YYYY-MM-DD
        const month = searchParams.get('month'); // YYYY-MM
        const company = searchParams.get('company');
        const worker_rut = searchParams.get('worker_rut');
        const mode = searchParams.get('mode'); // 'all' for historical, 'week', 'range'
        const startDate = searchParams.get('startDate');
        const endDate = searchParams.get('endDate');

        // Constructing dynamic SQL with template literals is tricky with @vercel/postgres safety.
        // We will take a slightly verbose but safe approach.

        let orders = [];

        // Base query always selects fields
        // We handle logic blocks 

        if (mode === 'all') {
            if (worker_rut) {
                const { rows } = await sql`
                    SELECT o.*, w.cost_center 
                    FROM orders o
                    LEFT JOIN workers w ON o.worker_rut = w.rut
                    WHERE o.worker_rut = ${worker_rut} ORDER BY o.created_at DESC
                `;
                orders = rows;
            }
            else if (company && company !== 'TODAS') {
                const { rows } = await sql`
                    SELECT o.*, w.cost_center 
                    FROM orders o
                    LEFT JOIN workers w ON o.worker_rut = w.rut
                    WHERE o.company = ${company} ORDER BY o.created_at DESC
                `;
                orders = rows;
            } else {
                const { rows } = await sql`
                    SELECT o.*, w.cost_center 
                    FROM orders o
                    LEFT JOIN workers w ON o.worker_rut = w.rut
                    ORDER BY o.created_at DESC
                `;
                orders = rows;
            }
        }
        else if (mode === 'week') {
            const sevenDaysAgo = new Date();
            sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
            const dateStr = sevenDaysAgo.toLocaleDateString('en-CA', { timeZone: 'America/Santiago' });

            if (company && company !== 'TODAS') {
                const { rows } = await sql`
                    SELECT o.*, w.cost_center 
                    FROM orders o
                    LEFT JOIN workers w ON o.worker_rut = w.rut
                    WHERE o.date_str >= ${dateStr} AND o.company = ${company} ORDER BY o.created_at DESC
                `;
                orders = rows;
            } else {
                const { rows } = await sql`
                    SELECT o.*, w.cost_center 
                    FROM orders o
                    LEFT JOIN workers w ON o.worker_rut = w.rut
                    WHERE o.date_str >= ${dateStr} ORDER BY o.created_at DESC
                `;
                orders = rows;
            }
        }
        else if (mode === 'range') {
            if (startDate && endDate) {
                if (company && company !== 'TODAS') {
                    const { rows } = await sql`
                        SELECT o.*, w.cost_center 
                        FROM orders o
                        LEFT JOIN workers w ON o.worker_rut = w.rut
                        WHERE o.date_str >= ${startDate} AND o.date_str <= ${endDate} AND o.company = ${company} 
                        ORDER BY o.date_str DESC, o.created_at DESC
                    `;
                    orders = rows;
                } else {
                    const { rows } = await sql`
                        SELECT o.*, w.cost_center 
                        FROM orders o
                        LEFT JOIN workers w ON o.worker_rut = w.rut
                        WHERE o.date_str >= ${startDate} AND o.date_str <= ${endDate} 
                        ORDER BY o.date_str DESC, o.created_at DESC
                    `;
                    orders = rows;
                }
            } else {
                // Fallback if dates missing
                orders = [];
            }
        }
        else if (date) {
            if (company && company !== 'TODAS') {
                const { rows } = await sql`
                    SELECT o.*, w.cost_center 
                    FROM orders o
                    LEFT JOIN workers w ON o.worker_rut = w.rut
                    WHERE o.date_str = ${date} AND o.company = ${company} ORDER BY o.created_at DESC
                `;
                orders = rows;
            } else {
                const { rows } = await sql`
                    SELECT o.*, w.cost_center 
                    FROM orders o
                    LEFT JOIN workers w ON o.worker_rut = w.rut
                    WHERE o.date_str = ${date} ORDER BY o.created_at DESC
                `;
                orders = rows;
            }
        }
        else if (month) {
            // LIKE query for month
            const monthPattern = `${month}%`;
            if (company && company !== 'TODAS') {
                const { rows } = await sql`
                    SELECT o.*, w.cost_center 
                    FROM orders o
                    LEFT JOIN workers w ON o.worker_rut = w.rut
                    WHERE o.date_str LIKE ${monthPattern} AND o.company = ${company} ORDER BY o.created_at DESC
                `;
                orders = rows;
            } else {
                const { rows } = await sql`
                    SELECT o.*, w.cost_center 
                    FROM orders o
                    LEFT JOIN workers w ON o.worker_rut = w.rut
                    WHERE o.date_str LIKE ${monthPattern} ORDER BY o.created_at DESC
                `;
                orders = rows;
            }
        }
        else {
            // Default today
            const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Santiago' });
            if (company && company !== 'TODAS') {
                const { rows } = await sql`
                    SELECT o.*, w.cost_center 
                    FROM orders o
                    LEFT JOIN workers w ON o.worker_rut = w.rut
                    WHERE o.date_str = ${today} AND o.company = ${company} ORDER BY o.created_at DESC
                `;
                orders = rows;
            } else {
                const { rows } = await sql`
                    SELECT o.*, w.cost_center 
                    FROM orders o
                    LEFT JOIN workers w ON o.worker_rut = w.rut
                    WHERE o.date_str = ${today} ORDER BY o.created_at DESC
                `;
                orders = rows;
            }
        }

        // Agrupación por empresa (para resumen)
        const summary = { TOTAL: 0 };
        // Agrupación por Centro de Costo (para resumen detallado)
        const ccSummary = {};

        orders.forEach(o => {
            if (!summary[o.company]) summary[o.company] = 0;
            const qty = o.quantity || 1;
            summary[o.company] += qty;
            summary.TOTAL += qty;

            // Cost Center Cost
            const cc = o.cost_center ? o.cost_center.trim().toUpperCase() : 'SIN CENTRO DE COSTO';
            if (!ccSummary[cc]) ccSummary[cc] = 0;
            ccSummary[cc] += qty;
        });

        return NextResponse.json({
            filters: { date, month, company },
            summary,
            ccSummary,
            orders
        });

    } catch (e) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
