require('dotenv').config();
const { DatabaseSync } = require('node:sqlite');
const fs   = require('fs');
const path = require('path');

const DB  = process.env.DB_FILE || path.join(__dirname, 'data', 'bizspot.db');
const CSV = path.join(__dirname, 'data', 'coimbatore_business_potential.csv');

const db = new DatabaseSync(DB);
db.exec('PRAGMA journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS locations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    location_name TEXT NOT NULL, latitude REAL NOT NULL, longitude REAL NOT NULL,
    avg_rent_per_sqft INTEGER, avg_income INTEGER, population_density INTEGER,
    business_type TEXT, existing_businesses INTEGER, avg_rating REAL,
    competition_index REAL, success_rate REAL, foot_traffic INTEGER,
    parking_availability TEXT,
    nearby_schools INTEGER DEFAULT 0, nearby_colleges INTEGER DEFAULT 0,
    nearby_universities INTEGER DEFAULT 0, nearby_hospitals INTEGER DEFAULT 0,
    nearby_clinics INTEGER DEFAULT 0, nearby_malls INTEGER DEFAULT 0,
    nearby_supermarkets INTEGER DEFAULT 0, nearby_offices INTEGER DEFAULT 0,
    nearby_corporates INTEGER DEFAULT 0, nearby_banks INTEGER DEFAULT 0,
    nearby_courts INTEGER DEFAULT 0, nearby_govt_offices INTEGER DEFAULT 0,
    nearby_police INTEGER DEFAULT 0, nearby_parks INTEGER DEFAULT 0,
    nearby_bus_stops INTEGER DEFAULT 0,
    recommended_business TEXT, safety_index REAL
  );
  CREATE TABLE IF NOT EXISTS search_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    query TEXT, lat REAL, lng REAL, radius_km REAL, results INTEGER, searched_at TEXT
  );
  CREATE TABLE IF NOT EXISTS poi_cache (
    cache_key TEXT PRIMARY KEY, data TEXT NOT NULL, fetched_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_lat   ON locations(latitude);
  CREATE INDEX IF NOT EXISTS idx_lng   ON locations(longitude);
  CREATE INDEX IF NOT EXISTS idx_btype ON locations(business_type);
  CREATE INDEX IF NOT EXISTS idx_name  ON locations(location_name);
`);

const { c } = db.prepare('SELECT COUNT(*) AS c FROM locations').get();
if (c > 0) { console.log(`ℹ️  Already seeded (${c} rows). Delete bizspot.db to reseed.`); process.exit(0); }

const lines   = fs.readFileSync(CSV,'utf8').replace(/^\uFEFF/,'').trim().split(/\r?\n/);
const headers = lines[0].split(',').map(h=>h.trim());
const insert  = db.prepare(`INSERT INTO locations (${headers.join(',')}) VALUES (${headers.map(()=>'?').join(',')})`);
const n = v => { const x=parseFloat(v); return isNaN(x)?null:x; };
const i = v => { const x=parseInt(v);   return isNaN(x)?0:x; };

let ok=0, skip=0;
db.exec('BEGIN');
try {
  for (let row=1; row<lines.length; row++) {
    const cols = lines[row].split(',');
    const r    = Object.fromEntries(headers.map((h,j)=>[h,(cols[j]||'').trim()]));
    try {
      insert.run(...headers.map(h => {
        const v = r[h];
        if (['latitude','longitude','avg_rating','competition_index','success_rate','safety_index'].includes(h)) return n(v);
        if (['avg_rent_per_sqft','avg_income','population_density','existing_businesses','foot_traffic',
             'nearby_schools','nearby_colleges','nearby_universities','nearby_hospitals','nearby_clinics',
             'nearby_malls','nearby_supermarkets','nearby_offices','nearby_corporates','nearby_banks',
             'nearby_courts','nearby_govt_offices','nearby_police','nearby_parks','nearby_bus_stops'].includes(h)) return i(v);
        return v || null;
      }));
      ok++;
    } catch(e) { console.warn(`Row ${row}: ${e.message}`); skip++; }
  }
  db.exec('COMMIT');
} catch(e) { db.exec('ROLLBACK'); throw e; }

console.log(`\n✅  Seeded ${ok} rows (${skip} skipped)\n`);
db.close();
