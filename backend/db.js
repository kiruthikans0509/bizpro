require('dotenv').config();
const { DatabaseSync } = require('node:sqlite');
const path = require('path');

const dbFile = process.env.DB_FILE || path.join(__dirname, 'data', 'bizspot.db');
const db = new DatabaseSync(dbFile);
db.exec('PRAGMA journal_mode = WAL');

// Thin shim: expose better-sqlite3 style .all/.get/.run API
const _prepare = db.prepare.bind(db);
db.prepare = (sql) => {
  const stmt = _prepare(sql);
  return {
    all(...a) { return stmt.all(...a); },
    get(...a)  { return stmt.get(...a); },
    run(...a)  { return stmt.run(...a); },
  };
};

module.exports = db;
