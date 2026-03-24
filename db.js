const { Pool, neonConfig } = require('@neondatabase/serverless');
const ws = require('ws');
require('dotenv').config();

neonConfig.webSocketConstructor = ws;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function initDb() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS shelters (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        lat REAL NOT NULL,
        lng REAL NOT NULL,
        capacity INTEGER NOT NULL DEFAULT 0,
        currentOccupancy INTEGER NOT NULL DEFAULT 0,
        facilities TEXT NOT NULL DEFAULT '[]',
        contactPerson TEXT,
        phone TEXT,
        address TEXT,
        city TEXT,
        createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS incidents (
        id SERIAL PRIMARY KEY,
        type TEXT NOT NULL,
        location TEXT NOT NULL,
        description TEXT NOT NULL,
        severity TEXT NOT NULL DEFAULT 'low',
        contactNumber TEXT,
        status TEXT NOT NULL DEFAULT 'reported',
        createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS alerts (
        id SERIAL PRIMARY KEY,
        type TEXT NOT NULL DEFAULT 'info',
        title TEXT NOT NULL,
        description TEXT NOT NULL,
        location TEXT,
        isActive INTEGER NOT NULL DEFAULT 1,
        createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    const result = await client.query("SELECT COUNT(*) FROM shelters");
    const count = parseInt(result.rows[0].count, 10);
    
    if (count === 0) {
      console.log('🌱 Seeding database with initial shelter data...');
      const shelters = [
        ['Indira Gandhi Indoor Stadium', 28.6295, 77.2407, 5000, 450, '["Medical Aid","Food","Water","Electricity","Blankets"]', 'NDMA Delhi', '011-2343809', 'I.P. Estate, New Delhi', 'Delhi'],
        ['Jawaharlal Nehru Stadium', 28.5828, 77.2344, 4000, 200, '["Medical Aid","Food","Water","Electricity"]', 'Delhi Disaster Relief', '011-2436952', 'Pragati Vihar, New Delhi', 'Delhi'],
        ['Bombay Exhibition Centre', 19.1466, 72.8541, 6000, 800, '["Medical Aid","Emergency Care","Food","Water","Electricity"]', 'BMC Emergency Cell', '022-2269472', 'Goregaon East, Mumbai', 'Mumbai'],
        ['BIEC Relief Center', 13.0645, 77.4725, 8000, 1500, '["Medical Aid","Emergency Care","Food","Water","Blankets","Generator"]', 'State Disaster Authority', '080-2234067', 'Tumkur Road, Bangalore', 'Bangalore'],
        ['Jawaharlal Nehru Stadium Chennai', 13.0827, 80.2707, 4500, 300, '["Medical Aid","Food","Water","Electricity"]', 'Chennai Relief Center', '044-2561920', 'Periamet, Chennai', 'Chennai'],
        ['Salt Lake Stadium Relief Camp', 22.5645, 88.4093, 7000, 1200, '["Medical Aid","Food","Water","Beds","Generator"]', 'State Authority', '033-2214352', 'Bidhannagar, Kolkata', 'Kolkata'],
      ];

      const insertSql = `INSERT INTO shelters (name, lat, lng, capacity, currentOccupancy, facilities, contactPerson, phone, address, city)
                          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`;
      for (const s of shelters) {
        await client.query(insertSql, s);
      }
      console.log(`   ✅ Seeded ${shelters.length} shelters`);
    }
  } finally {
    client.release();
  }
  return pool;
}

function getDb() { return pool; }
function saveDb() { /* no-op for postgres */ }

// Auto-replace ? with $1, $2, etc. for backward compatibility with existing routes
function prepareSql(sql, params) {
  let pgSql = sql;
  let counter = 1;
  // Replace ? that are not inside strings? In this simple app, just replace all ?
  pgSql = pgSql.replace(/\?/g, () => `$${counter++}`);
  
  // Also fix datetime('now') -> CURRENT_TIMESTAMP and datetime('now', '-7 days') -> CURRENT_TIMESTAMP - INTERVAL '7 days'
  pgSql = pgSql.replace(/datetime\('now', '-7 days'\)/g, "CURRENT_TIMESTAMP - INTERVAL '7 days'");
  pgSql = pgSql.replace(/datetime\('now', '-30 days'\)/g, "CURRENT_TIMESTAMP - INTERVAL '30 days'");
  pgSql = pgSql.replace(/datetime\('now'\)/g, "CURRENT_TIMESTAMP");

  return pgSql;
}

async function queryAll(sql, params = []) {
  try {
    const pgSql = prepareSql(sql, params);
    const res = await pool.query(pgSql, params);
    return res.rows;
  } catch(err) {
    console.error('queryAll Error:', err, sql, params);
    throw err;
  }
}

async function queryOne(sql, params = []) {
  const rows = await queryAll(sql, params);
  return rows.length > 0 ? rows[0] : null;
}

async function execute(sql, params = []) {
  const pgSql = prepareSql(sql, params);
  await pool.query(pgSql, params);
}

async function insert(sql, params = []) {
  let pgSql = prepareSql(sql, params);
  if (!pgSql.trim().toUpperCase().includes('RETURNING ID')) {
     pgSql = pgSql + ' RETURNING id';
  }
  const res = await pool.query(pgSql, params);
  return res.rows[0]?.id;
}

module.exports = { initDb, getDb, saveDb, queryAll, queryOne, execute, insert };
