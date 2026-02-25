require('dotenv').config({ path: '.env.local' });
const { Client } = require('pg');

async function migrate() {
    const client = new Client({
        host: process.env.DATABASE_PGHOST,
        port: process.env.DATABASE_PGPORT,
        user: process.env.DATABASE_PGUSER,
        password: process.env.DATABASE_PGPASSWORD,
        database: process.env.DATABASE_PGDATABASE,
        ssl: { rejectUnauthorized: false } // Required for Supabase connection pooling sometimes
    });

    try {
        await client.connect();
        console.log('Conectado a la base de datos.');

        console.log('Iniciando migración: Agregar columna is_plus a workers...');

        await client.query(`
            ALTER TABLE workers 
            ADD COLUMN IF NOT EXISTS is_plus INTEGER DEFAULT 0;
        `);

        console.log('✅ Migración exitosa: Columna is_plus agregada.');

    } catch (error) {
        console.error('❌ Error en la migración:', error);
    } finally {
        await client.end();
    }
}

migrate();
