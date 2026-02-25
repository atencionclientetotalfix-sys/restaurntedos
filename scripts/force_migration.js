
const { Client } = require('pg');

const client = new Client({
    host: 'aws-1-us-east-1.pooler.supabase.com',
    port: 6543,
    user: 'postgres.kgfnyngrrqeaocthmfxn',
    password: 'kjC2ki6x79mNLYj8',
    database: 'postgres',
    ssl: { rejectUnauthorized: false }
});

const run = async () => {
    try {
        await client.connect();
        console.log('Connected to Supabase...');

        console.log('Adding meal_type...');
        await client.query(`
            DO $$ 
            BEGIN 
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='orders' AND column_name='meal_type') THEN 
                    ALTER TABLE orders ADD COLUMN meal_type VARCHAR(50); 
                END IF;
            END $$;
        `);

        console.log('Adding guest_names...');
        await client.query(`
            DO $$ 
            BEGIN 
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='orders' AND column_name='guest_names') THEN 
                    ALTER TABLE orders ADD COLUMN guest_names TEXT; 
                END IF;
            END $$;
        `);

        console.log('Migration completed successfully!');
        process.exit(0);
    } catch (e) {
        console.error('Error:', e);
        process.exit(1);
    } finally {
        await client.end();
    }
};

run();
