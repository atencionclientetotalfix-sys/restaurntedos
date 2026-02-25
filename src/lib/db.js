import { sql as vercelSql } from '@vercel/postgres';
import { Pool } from 'pg';
import { Signer } from '@aws-sdk/rds-signer';

// Configuración para entorno local con IAM Auth (cuando falta contraseña estática)
let pool;

const getLocalPool = () => {
    if (pool) return pool;

    const poolConfig = {
        host: process.env.DATABASE_PGHOST,
        port: Number(process.env.DATABASE_PGPORT),
        user: process.env.DATABASE_PGUSER,
        database: process.env.DATABASE_PGDATABASE,
        ssl: {
            rejectUnauthorized: false,
        },
    };

    // Prioritize static password if available
    if (process.env.DATABASE_PGPASSWORD && !process.env.DATABASE_PGPASSWORD.includes("PEGAR_")) {
        poolConfig.password = process.env.DATABASE_PGPASSWORD;
    } else {
        // Fallback to IAM Auth (AWS RDS Signer) - ONLY if AWS keys are present
        // Otherwise, warn the user they forgot the password.
        if (!process.env.AWS_ACCESS_KEY_ID && !process.env.AWS_PROFILE) {
            throw new Error("Falta la contraseña de Base de Datos. Por favor agrega la variable de entorno 'DATABASE_PGPASSWORD' en Vercel (o .env.local) con la contraseña real.");
        }

        const signer = new Signer({
            hostname: process.env.DATABASE_PGHOST,
            port: Number(process.env.DATABASE_PGPORT),
            username: process.env.DATABASE_PGUSER,
            region: process.env.DATABASE_AWS_REGION,
        });

        poolConfig.password = async () => {
            return await signer.getAuthToken();
        };
    }

    pool = new Pool(poolConfig);
    return pool;
};

// Wrapper compatible con la sintaxis sql`...`
export const sql = async (strings, ...values) => {
    // 1. Prioritize Standard Pool (Supabase / AWS / Local)
    // If DATABASE_PGHOST is defined, we assume we want to use the standard 'pg' driver.
    if (process.env.DATABASE_PGHOST) {
        try {
            const localPool = getLocalPool();

            // Reconstruir query parametrizada
            let text = strings[0];
            for (let i = 1; i < strings.length; i++) {
                text += '$' + i + strings[i];
            }

            const res = await localPool.query(text, values);
            return res;

        } catch (error) {
            console.error("DB Connection Error (Standard Pool):", error);
            throw error;
        }
    }

    // 2. Fallback: Vercel Postgres (Neon)
    if (process.env.POSTGRES_URL &&
        !process.env.POSTGRES_URL.includes('undefined') &&
        !process.env.POSTGRES_URL.includes('PEGAR_')) {
        return vercelSql(strings, ...values);
    }

    // 3. Last resort if nothing matched (Should have been caught by 1)
    try {
        // Force retry with getLocalPool if somehow DATABASE_PGHOST was missed or needed default
        const localPool = getLocalPool();
        let text = strings[0];
        for (let i = 1; i < strings.length; i++) {
            text += '$' + i + strings[i];
        }
        return await localPool.query(text, values);
    } catch (error) {
        console.error("DB Connection Error (Fallback):", error);
        throw error;
    }
};

// Función auxiliar para inicializar la DB (Idéntica a la original pero usando el wrapper)
export const initDb = async () => {
    try {
        // Table Workers
        await sql`
            CREATE TABLE IF NOT EXISTS workers (
                id SERIAL PRIMARY KEY,
                rut TEXT UNIQUE NOT NULL,
                name TEXT NOT NULL,
                company TEXT NOT NULL,
                cost_center TEXT,
                is_premium INTEGER DEFAULT 0,
                is_plus INTEGER DEFAULT 0,
                created_at TIMESTAMP DEFAULT NOW()
            );
        `;

        // Migration for existing tables: Add cost_center if not exists
        await sql`
            DO $$ 
            BEGIN 
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='workers' AND column_name='cost_center') THEN 
                    ALTER TABLE workers ADD COLUMN cost_center TEXT; 
                END IF;
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='workers' AND column_name='is_plus') THEN 
                    ALTER TABLE workers ADD COLUMN is_plus INTEGER DEFAULT 0; 
                END IF; 
            END $$;
        `;

        // Migration for Orders: Add signature if not exists
        await sql`
            DO $$ 
            BEGIN 
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='orders' AND column_name='signature') THEN 
                    ALTER TABLE orders ADD COLUMN signature TEXT; 
                END IF; 
            END $$;
        `;

        // Migration for Orders: Add meal_type and guest_names
        await sql`
            DO $$ 
            BEGIN 
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='orders' AND column_name='meal_type') THEN 
                    ALTER TABLE orders ADD COLUMN meal_type VARCHAR(50); 
                END IF;
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='orders' AND column_name='guest_names') THEN 
                    ALTER TABLE orders ADD COLUMN guest_names TEXT; 
                END IF;
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='orders' AND column_name='printed') THEN 
                    ALTER TABLE orders ADD COLUMN printed BOOLEAN DEFAULT FALSE; 
                END IF;
            END $$;
        `;
        // Additional logging to confirm DB update
        console.log("DB checks complete: printed column verified.");

        // Table Companies
        await sql`
            CREATE TABLE IF NOT EXISTS companies(
            id SERIAL PRIMARY KEY,
            name TEXT UNIQUE NOT NULL,
            rut TEXT,
            address TEXT,
            contact_name TEXT,
            contact_email TEXT,
            contact_phone TEXT,
            logo_path TEXT,
            created_at TIMESTAMP DEFAULT NOW()
        );
        `;

        // Table Sessions
        await sql`
            CREATE TABLE IF NOT EXISTS sessions(
            token TEXT PRIMARY KEY,
            created_at TIMESTAMP DEFAULT NOW(),
            expires_at BIGINT
        );
        `;

        // Table Settings
        await sql`
            CREATE TABLE IF NOT EXISTS settings(
                key TEXT PRIMARY KEY,
                value TEXT,
                created_at TIMESTAMP DEFAULT NOW(),
                updated_at TIMESTAMP DEFAULT NOW()
            );
        `;

        // Seed Initial Settings if Empty
        const { rows: settingsRows } = await sql`SELECT count(*) as count FROM settings`;
        if (parseInt(settingsRows[0].count) === 0) {
            await sql`INSERT INTO settings(key, value) VALUES('restaurant_name', 'RESTAUTANTE DOS')`;
            await sql`INSERT INTO settings(key, value) VALUES('restaurant_logo', 'https://vjaervaikhizqsniyshg.supabase.co/storage/v1/object/public/system/logo.png')`;
            console.log('Seeded initial settings.');
        }

        // Table Orders
        await sql`
            CREATE TABLE IF NOT EXISTS orders(
            id TEXT PRIMARY KEY,
            worker_rut TEXT NOT NULL,
            worker_name TEXT NOT NULL,
            company TEXT NOT NULL,
            type TEXT NOT NULL,
            quantity INTEGER DEFAULT 1,
            date_str TEXT NOT NULL,
            pickup_time TEXT,
            pickup_name TEXT,
            created_at TIMESTAMP DEFAULT NOW()
        );
        `;

        console.log('Database initialized: tables checked/created.');

        // Seed Initial Companies if Empty
        const { rows } = await sql`SELECT count(*) as count FROM companies`;
        if (parseInt(rows[0].count) === 0) {
            await sql`INSERT INTO companies(name) VALUES('ORSOCOM')`;
            await sql`INSERT INTO companies(name) VALUES('COER')`;
            await sql`INSERT INTO companies(name) VALUES('PASMAD')`;
            await sql`INSERT INTO companies(name) VALUES('INGELEC')`;
            console.log('Seeded initial companies.');
        }

        // Enable Row Level Security (RLS) on all tables to fix Supabase warnings
        // Since the app connects via the 'postgres' user (Server-side), it bypasses RLS, so this is safe.
        // This blocks public access via the Supabase API (anon key), which is the intended security measure.
        await sql`ALTER TABLE workers ENABLE ROW LEVEL SECURITY`;
        await sql`ALTER TABLE companies ENABLE ROW LEVEL SECURITY`;
        await sql`ALTER TABLE sessions ENABLE ROW LEVEL SECURITY`;
        await sql`ALTER TABLE orders ENABLE ROW LEVEL SECURITY`;


    } catch (error) {
        console.error('Error initializing database:', error);
    }
};

