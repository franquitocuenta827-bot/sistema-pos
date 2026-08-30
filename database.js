const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const DATA_DIR = process.env.DATA_DIR || process.env.APPDATA || __dirname;
const DB_PATH = process.env.DB_PATH || path.join(DATA_DIR, 'SistemaPOS', 'sistema_pos.db');
let db = null;

async function initDatabase() {
  const SQL = await initSqlJs();
  if (fs.existsSync(DB_PATH)) {
    const buffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(buffer);
  } else {
    db = new SQL.Database();
  }

  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    full_name TEXT NOT NULL DEFAULT '',
    role TEXT NOT NULL DEFAULT 'vendedor',
    active INTEGER NOT NULL DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,
    description TEXT DEFAULT ''
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS suppliers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    contact TEXT DEFAULT '',
    phone TEXT DEFAULT '',
    email TEXT DEFAULT '',
    address TEXT DEFAULT '',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT DEFAULT '',
    description1 TEXT DEFAULT '',
    description2 TEXT DEFAULT '',
    barcode TEXT UNIQUE DEFAULT '',
    price REAL NOT NULL DEFAULT 0,
    cost REAL NOT NULL DEFAULT 0,
    stock INTEGER NOT NULL DEFAULT 0,
    min_stock INTEGER NOT NULL DEFAULT 0,
    max_stock INTEGER NOT NULL DEFAULT 0,
    category_id INTEGER,
    supplier_id INTEGER,
    active INTEGER NOT NULL DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (category_id) REFERENCES categories(id),
    FOREIGN KEY (supplier_id) REFERENCES suppliers(id)
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS clients (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT DEFAULT '',
    name TEXT NOT NULL,
    business_name TEXT DEFAULT '',
    nickname TEXT DEFAULT '',
    phone TEXT DEFAULT '',
    email TEXT DEFAULT '',
    address TEXT DEFAULT '',
    locality TEXT DEFAULT '',
    whatsapp TEXT DEFAULT '',
    cuit TEXT DEFAULT '',
    iva TEXT DEFAULT 'Consumidor Final',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  try { db.run("ALTER TABLE clients ADD COLUMN code TEXT DEFAULT ''"); } catch (e) {}
  try { db.run("ALTER TABLE clients ADD COLUMN business_name TEXT DEFAULT ''"); } catch (e) {}
  try { db.run("ALTER TABLE clients ADD COLUMN nickname TEXT DEFAULT ''"); } catch (e) {}
  try { db.run("ALTER TABLE clients ADD COLUMN locality TEXT DEFAULT ''"); } catch (e) {}
  try { db.run("ALTER TABLE clients ADD COLUMN whatsapp TEXT DEFAULT ''"); } catch (e) {}
  try { db.run("ALTER TABLE clients ADD COLUMN cuit TEXT DEFAULT ''"); } catch (e) {}
  try { db.run("ALTER TABLE clients ADD COLUMN iva TEXT DEFAULT 'Consumidor Final'"); } catch (e) {}
  try { db.run("ALTER TABLE products ADD COLUMN max_stock INTEGER NOT NULL DEFAULT 0"); } catch (e) {}
  try { db.run("ALTER TABLE products ADD COLUMN description1 TEXT DEFAULT ''"); } catch (e) {}
  try { db.run("ALTER TABLE products ADD COLUMN description2 TEXT DEFAULT ''"); } catch (e) {}
  try { db.run("ALTER TABLE purchases ADD COLUMN invoice_number TEXT DEFAULT ''"); } catch (e) {}
  try { db.run("ALTER TABLE purchases ADD COLUMN invoice_type TEXT DEFAULT 'No Oficial'"); } catch (e) {}

  db.run(`CREATE TABLE IF NOT EXISTS sales (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    client_id INTEGER,
    total REAL NOT NULL DEFAULT 0,
    discount REAL NOT NULL DEFAULT 0,
    payment_method TEXT DEFAULT 'efectivo',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (client_id) REFERENCES clients(id)
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS sale_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sale_id INTEGER NOT NULL,
    product_id INTEGER,
    product_name TEXT NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 1,
    price REAL NOT NULL DEFAULT 0,
    subtotal REAL NOT NULL DEFAULT 0,
    description TEXT DEFAULT '',
    FOREIGN KEY (sale_id) REFERENCES sales(id) ON DELETE CASCADE,
    FOREIGN KEY (product_id) REFERENCES products(id)
  )`);
  try { db.run("ALTER TABLE sale_items ADD COLUMN description TEXT DEFAULT ''"); } catch (e) {}

  db.run(`CREATE TABLE IF NOT EXISTS purchases (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    supplier_id INTEGER,
    user_id INTEGER,
    total REAL NOT NULL DEFAULT 0,
    invoice_number TEXT DEFAULT '',
    invoice_type TEXT DEFAULT 'No Oficial',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (supplier_id) REFERENCES suppliers(id),
    FOREIGN KEY (user_id) REFERENCES users(id)
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS purchase_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    purchase_id INTEGER NOT NULL,
    product_id INTEGER,
    product_name TEXT NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 1,
    cost REAL NOT NULL DEFAULT 0,
    subtotal REAL NOT NULL DEFAULT 0,
    FOREIGN KEY (purchase_id) REFERENCES purchases(id) ON DELETE CASCADE,
    FOREIGN KEY (product_id) REFERENCES products(id)
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS quotes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    client_id INTEGER,
    user_id INTEGER,
    total REAL NOT NULL DEFAULT 0,
    status TEXT DEFAULT 'pendiente',
    notes TEXT DEFAULT '',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (client_id) REFERENCES clients(id),
    FOREIGN KEY (user_id) REFERENCES users(id)
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS quote_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    quote_id INTEGER NOT NULL,
    product_id INTEGER,
    product_name TEXT NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 1,
    price REAL NOT NULL DEFAULT 0,
    subtotal REAL NOT NULL DEFAULT 0,
    description TEXT DEFAULT '',
    FOREIGN KEY (quote_id) REFERENCES quotes(id) ON DELETE CASCADE,
    FOREIGN KEY (product_id) REFERENCES products(id)
  )`);
  try { db.run("ALTER TABLE quote_items ADD COLUMN description TEXT DEFAULT ''"); } catch (e) {}

  db.run(`CREATE TABLE IF NOT EXISTS payments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    client_id INTEGER,
    sale_id INTEGER,
    amount REAL NOT NULL DEFAULT 0,
    payment_method TEXT DEFAULT 'efectivo',
    notes TEXT DEFAULT '',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (client_id) REFERENCES clients(id),
    FOREIGN KEY (sale_id) REFERENCES sales(id)
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS expenses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL,
    detail TEXT NOT NULL,
    amount REAL NOT NULL DEFAULT 0,
    payment_method TEXT DEFAULT 'efectivo',
    category TEXT NOT NULL,
    custom_category TEXT DEFAULT '',
    user_id INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
  )`);

  try { db.run("ALTER TABLE expenses ADD COLUMN user_id INTEGER"); } catch (e) {}

  db.run(`CREATE TABLE IF NOT EXISTS fiscal_config (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    cuit TEXT NOT NULL DEFAULT '',
    business_name TEXT NOT NULL DEFAULT '',
    address TEXT DEFAULT '',
    iva_condition TEXT DEFAULT 'Responsable Inscripto',
    ingresos_brutos TEXT DEFAULT '',
    inicio_actividades TEXT DEFAULT '',
    pos_number INTEGER DEFAULT 1,
    cert_crt TEXT DEFAULT '',
    cert_key TEXT DEFAULT '',
    cert_password TEXT DEFAULT '',
    env_mode TEXT DEFAULT 'homologacion',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS invoices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sale_id INTEGER,
    invoice_type TEXT NOT NULL,
    invoice_letter TEXT DEFAULT '',
    invoice_number TEXT NOT NULL,
    cae TEXT DEFAULT '',
    cae_vto TEXT DEFAULT '',
    result TEXT DEFAULT '',
    client_id INTEGER,
    client_name TEXT NOT NULL,
    client_cuit TEXT DEFAULT '',
    client_iva TEXT DEFAULT '',
    total REAL NOT NULL DEFAULT 0,
    iva_total REAL NOT NULL DEFAULT 0,
    subtotal REAL NOT NULL DEFAULT 0,
    payment_method TEXT DEFAULT '',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (sale_id) REFERENCES sales(id),
    FOREIGN KEY (client_id) REFERENCES clients(id)
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS invoice_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    invoice_id INTEGER NOT NULL,
    product_name TEXT NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 1,
    price REAL NOT NULL DEFAULT 0,
    subtotal REAL NOT NULL DEFAULT 0,
    description TEXT DEFAULT '',
    iva_aliquot REAL DEFAULT 21,
    iva_amount REAL DEFAULT 0,
    FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE CASCADE
  )`);
  try { db.run("ALTER TABLE invoice_items ADD COLUMN description TEXT DEFAULT ''"); } catch (e) {}

  try { db.run("ALTER TABLE fiscal_config ADD COLUMN cert_crt TEXT DEFAULT ''"); } catch (e) {}
  try { db.run("ALTER TABLE fiscal_config ADD COLUMN cert_key TEXT DEFAULT ''"); } catch (e) {}
  try { db.run("ALTER TABLE fiscal_config ADD COLUMN cert_password TEXT DEFAULT ''"); } catch (e) {}
  try { db.run("ALTER TABLE fiscal_config ADD COLUMN env_mode TEXT DEFAULT 'homologacion'"); } catch (e) {}
  try { db.run("ALTER TABLE invoices ADD COLUMN invoice_letter TEXT DEFAULT ''"); } catch (e) {}
  try { db.run("ALTER TABLE invoices ADD COLUMN payment_method TEXT DEFAULT ''"); } catch (e) {}
  try { db.run("ALTER TABLE invoices ADD COLUMN subtotal REAL NOT NULL DEFAULT 0"); } catch (e) {}

  db.run(`CREATE TABLE IF NOT EXISTS backups (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    filename TEXT NOT NULL,
    size INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  const r = db.exec("SELECT COUNT(*) as c FROM users");
  if (!r.length || !r[0].values.length || r[0].values[0][0] === 0) {
    const hash = bcrypt.hashSync('admin', 10);
    db.run("INSERT INTO users (username, password, full_name, role) VALUES (?, ?, ?, ?)", ['admin', hash, 'Administrador', 'admin']);
  }
  var existing = queryAll("SELECT username FROM users");
  var usernames = existing.map(function(u) { return u.username; });
  if (usernames.indexOf('ruben') === -1) {
    db.run("INSERT INTO users (username, password, full_name, role) VALUES (?, ?, ?, ?)", ['ruben', bcrypt.hashSync('ruben123', 10), 'Ruben', 'admin']);
  }
  if (usernames.indexOf('jorge') === -1) {
    db.run("INSERT INTO users (username, password, full_name, role) VALUES (?, ?, ?, ?)", ['jorge', bcrypt.hashSync('jorge123', 10), 'Jorge', 'operator']);
  }

  saveDb();
  console.log('Base de datos inicializada correctamente');
  return db;
}

function getDb() {
  return db;
}

function saveDb() {
  if (!db) return;
  try {
    const dir = path.dirname(DB_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const data = db.export();
    fs.writeFileSync(DB_PATH, Buffer.from(data));
  } catch (e) {
    console.error('ERROR al guardar DB:', e.message);
  }
}

function queryAll(sql, params) {
  if (!db) return [];
  if (params) {
    const stmt = db.prepare(sql);
    stmt.bind(params);
    const rows = [];
    while (stmt.step()) {
      rows.push(stmt.getAsObject());
    }
    stmt.free();
    return rows;
  }
  const r = db.exec(sql);
  if (!r.length || !r[0].values.length) return [];
  const cols = r[0].columns;
  return r[0].values.map(row => {
    const o = {};
    cols.forEach((c, i) => o[c] = row[i]);
    return o;
  });
}

function queryOne(sql, params) {
  const rows = queryAll(sql, params);
  return rows.length ? rows[0] : null;
}

function lastId() {
  const r = db.exec("SELECT last_insert_rowid() as id");
  return r[0]?.values[0][0];
}

module.exports = { getDb, saveDb, initDatabase, queryAll, queryOne, lastId, DB_PATH };
