const Database = require('better-sqlite3');
const path = require('path');
const db = new Database('dona_bella.db');
const worker = db.prepare('SELECT * FROM workers LIMIT 1').get();
if (worker) {
    console.log(`RUT: ${worker.rut}`);
    console.log(`Name: ${worker.name}`);
    console.log(`Premium: ${worker.is_premium}`);
} else {
    console.log('No workers found. Creating one...');
    db.prepare('INSERT INTO workers (rut, name, company, is_premium) VALUES (?, ?, ?, ?)').run('11111111-1', 'Test Worker', 'ORSOCOM', 1);
    console.log('Created Test Worker: 11111111-1');
}
