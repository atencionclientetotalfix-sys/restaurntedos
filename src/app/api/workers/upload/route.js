
import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import * as XLSX from 'xlsx';

export async function POST(request) {
    try {
        const formData = await request.formData();
        const file = formData.get('file');

        if (!file) {
            return NextResponse.json({ error: 'No se subió ningún archivo' }, { status: 400 });
        }

        const bytes = await file.arrayBuffer();
        const buffer = Buffer.from(bytes);

        const workbook = XLSX.read(buffer, { type: 'buffer' });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const data = XLSX.utils.sheet_to_json(sheet);

        let count = 0;
        let errors = 0;

        if (!Array.isArray(data) || data.length === 0) {
            return NextResponse.json({ error: 'El Excel está vacío o no tiene formato correcto' }, { status: 400 });
        }

        // Helper to normalize keys
        const normalizeKey = (key) => String(key).trim().toLowerCase();

        // 1. Extract Unique Companies
        const uniqueCompanies = new Set();
        for (const row of data) {
            // Find company key
            const keys = Object.keys(row);
            const companyKey = keys.find(k => normalizeKey(k) === 'empresa');

            if (companyKey && row[companyKey]) {
                uniqueCompanies.add(String(row[companyKey]).trim().toUpperCase());
            }
        }

        // 2. Insert Companies (Batch)
        for (const companyName of uniqueCompanies) {
            try {
                await sql`
                    INSERT INTO companies (name) VALUES (${companyName})
                    ON CONFLICT (name) DO NOTHING
                `;
            } catch (e) {
                console.error(`Error inserting company ${companyName}`, e);
            }
        }

        // Processing row by row
        for (const row of data) {
            // Visualize row for debugging
            // console.log('Processing row:', row);

            const keys = Object.keys(row);

            // Find keys dynamically
            const rutKey = keys.find(k => { const n = normalizeKey(k); return n === 'rut'; });
            const nameKey = keys.find(k => { const n = normalizeKey(k); return n === 'nombre'; });
            const companyKey = keys.find(k => { const n = normalizeKey(k); return n === 'empresa'; });
            const premiumKey = keys.find(k => { const n = normalizeKey(k); return n === 'premium' || n === 'premiun'; }); // Handle both spellings
            const plusKey = keys.find(k => { const n = normalizeKey(k); return n === 'plus'; });
            const normalKey = keys.find(k => { const n = normalizeKey(k); return n === 'normal'; });

            // Cost center variations
            const ccKey = keys.find(k => {
                const n = normalizeKey(k);
                return n === 'centro de costo' || n === 'centro costo' || n === 'cc' || n === 'cost center';
            });

            const rut = rutKey ? row[rutKey] : null;
            const name = nameKey ? row[nameKey] : null;
            const company = companyKey ? row[companyKey] : null;
            const costCenter = ccKey ? row[ccKey] : null;
            const premiumRaw = premiumKey ? row[premiumKey] : null;
            const plusRaw = plusKey ? row[plusKey] : null;
            const normalRaw = normalKey ? row[normalKey] : null;

            if (rut && name && company) {
                // Safer RUT cleaning: Remove anything that is not a number, 'K'/'k', or hyphen '-'
                // This preserves the hyphen if it exists in the Excel.
                const cleanRut = String(rut).trim().replace(/[^0-9kK-]/g, '').toUpperCase();

                // Format nicely with hyphen for storage (optional, but keep consistent with user input usually 12345678-9)
                // Actually, let's store standard format or raw clean?
                // The current app seems to use inputs with dots/hyphens. 
                // Let's stick to the previous clean logic effectively but stronger:
                // const cleanRut = String(rut).trim().replace(/\./g, '').replace(/\s/g, '').toUpperCase();
                // If we want to ensure uniqueness robustly, stripping everything is best.
                // But let's keep the existing format: 12345678-K. 
                // The user's excel has "13848699-0". 
                // If we strip hyphen, "138486990".
                // Let's just strip DOTS and SPACES, keep HYPHEN if exists, or re-format?
                // Safest to match 'login' logic: cleanRut = rut.trim().replace(/\./g, '').replace(/\s/g, '').toUpperCase();

                // Let's stick to exactly what worked but ensure no accidental chars:
                // Removing ONLY dots and spaces allows "12345678-9". 
                // If I use regex /[^0-9kK-]/g it keeps hyphen.

                // const cleanRut = String(rut).trim().replace(/\./g, '').replace(/\s/g, '').toUpperCase();
                const cleanName = String(name).trim();
                const cleanCompany = String(company).trim().toUpperCase();
                const cleanCostCenter = costCenter ? String(costCenter).trim() : null;

                // Logic: One classification per worker. Priority: Premium > Plus > Normal (Default)
                let isPremium = 0;
                let isPlus = 0;

                const pVal = String(premiumRaw).toUpperCase().trim();
                const plusVal = String(plusRaw).toUpperCase().trim();
                // const nVal = String(normalRaw).toUpperCase().trim(); // Logic implies if not Premium/Plus, it is Normal

                if (pVal === 'SI' || pVal === '1') {
                    isPremium = 1;
                    isPlus = 0;
                } else if (plusVal === 'SI' || plusVal === '1') {
                    isPremium = 0;
                    isPlus = 1;
                } else {
                    // Normal or explicitly 'NO' in others
                    isPremium = 0;
                    isPlus = 0;
                }

                try {
                    await sql`
                    INSERT INTO workers (rut, name, company, cost_center, is_premium, is_plus)
                    VALUES (${cleanRut}, ${cleanName}, ${cleanCompany}, ${cleanCostCenter}, ${isPremium}, ${isPlus})
                    ON CONFLICT (rut) DO UPDATE SET
                    name = EXCLUDED.name,
                    company = EXCLUDED.company,
                    cost_center = EXCLUDED.cost_center,
                    is_premium = EXCLUDED.is_premium,
                    is_plus = EXCLUDED.is_plus
                `;
                    count++;
                } catch (e) {
                    console.error(`Error inserting ${cleanRut}`, e);
                    errors++;
                }
            } else {
                // console.log('Skipping row due to missing required fields:', row);
                errors++;
            }
        }

        return NextResponse.json({ success: true, imported: count, errors, newCompanies: uniqueCompanies.size });

    } catch (e) {
        console.error(e);
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}

