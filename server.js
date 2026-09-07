const express = require('express');
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const fs = require('fs');
const { initDatabase, getDb, saveDb, queryAll, queryOne, lastId } = require('./database');
const { emitirFactura, emitirFacturaDePago, testArcaConnection } = require('./arca');

const app = express();
const PORT = process.env.PORT || 3000;
const SECRET = 'sistema-pos-secret-key-2024';

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

function auth(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1] || req.query.token;
  if (!token) return res.status(401).json({ error: 'Token requerido' });
  try {
    req.user = jwt.verify(token, SECRET);
    if (req.user.role === 'operator') {
      var allowedPaths = ['/api/products','/api/expenses','/api/categories','/api/suppliers','/api/clients','/api/purchases','/api/sales','/api/quotes','/api/payments','/api/invoices','/api/backups','/api/sync','/api/me','/api/dashboard','/api/version'];
      if (!allowedPaths.some(function(p) { return req.path.startsWith(p); })) {
        return res.status(403).json({ error: 'Acceso denegado para este usuario' });
      }
    }
    next();
  } catch {
    res.status(401).json({ error: 'Token inválido' });
  }
}

function adminOnly(req, res, next) {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Acceso denegado' });
  next();
}

// ==================== AUTH ====================
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  const user = queryOne("SELECT * FROM users WHERE username = ? AND active = 1", [username]);
  if (!user) return res.status(401).json({ error: 'Usuario o contraseña incorrectos' });
  if (!bcrypt.compareSync(password, user.password)) return res.status(401).json({ error: 'Usuario o contraseña incorrectos' });
  const token = jwt.sign({ id: user.id, username: user.username, role: user.role, full_name: user.full_name }, SECRET, { expiresIn: '24h' });
  res.json({ token, user: { id: user.id, username: user.username, role: user.role, full_name: user.full_name } });
});

app.get('/api/me', auth, (req, res) => res.json(req.user));

// ==================== USERS ====================
app.get('/api/users', auth, adminOnly, (req, res) => {
  res.json(queryAll("SELECT id, username, full_name, role, active, created_at FROM users ORDER BY id"));
});

app.post('/api/users', auth, adminOnly, (req, res) => {
  const { username, password, full_name, role } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Usuario y contraseña requeridos' });
  const db = getDb();
  try {
    const hash = bcrypt.hashSync(password, 10);
    db.run("INSERT INTO users (username, password, full_name, role) VALUES (?, ?, ?, ?)", [username, hash, full_name || '', role || 'vendedor']);
    saveDb();
    res.json({ success: true });
  } catch {
    res.status(400).json({ error: 'El usuario ya existe' });
  }
});

app.put('/api/users/:id', auth, adminOnly, (req, res) => {
  const { username, full_name, role, active, password } = req.body;
  const db = getDb();
  try {
    let sql = "UPDATE users SET username=?, full_name=?, role=?, active=?";
    const params = [username, full_name, role, active ?? 1];
    if (password) {
      const hash = bcrypt.hashSync(password, 10);
      sql += ", password=?";
      params.push(hash);
    }
    sql += " WHERE id=?";
    params.push(req.params.id);
    db.run(sql, params);
    saveDb();
    res.json({ success: true });
  } catch {
    res.status(400).json({ error: 'El nombre de usuario ya existe' });
  }
});

// ==================== CATEGORIES ====================
app.get('/api/categories', auth, (req, res) => {
  res.json(queryAll("SELECT * FROM categories ORDER BY name"));
});

app.post('/api/categories', auth, (req, res) => {
  const { name, description } = req.body;
  if (!name) return res.status(400).json({ error: 'Nombre requerido' });
  const db = getDb();
  try {
    db.run("INSERT INTO categories (name, description) VALUES (?, ?)", [name, description || '']);
    saveDb();
    res.json({ success: true });
  } catch {
    res.status(400).json({ error: 'La categoría ya existe' });
  }
});

app.put('/api/categories/:id', auth, (req, res) => {
  const { name, description } = req.body;
  const db = getDb();
  db.run("UPDATE categories SET name=?, description=? WHERE id=?", [name, description || '', req.params.id]);
  saveDb();
  res.json({ success: true });
});

app.delete('/api/categories/:id', auth, (req, res) => {
  const db = getDb();
  db.run("DELETE FROM categories WHERE id=?", [req.params.id]);
  saveDb();
  res.json({ success: true });
});

// ==================== SUPPLIERS ====================
app.get('/api/suppliers', auth, (req, res) => {
  const items = queryAll("SELECT s.*, (SELECT COUNT(*) FROM products WHERE supplier_id = s.id) as product_count FROM suppliers s ORDER BY s.name");
  res.json(items);
});

app.get('/api/suppliers/:id', auth, (req, res) => {
  const s = queryOne("SELECT * FROM suppliers WHERE id = ?", [req.params.id]);
  if (!s) return res.status(404).json({ error: 'No encontrado' });
  res.json(s);
});

app.post('/api/suppliers', auth, (req, res) => {
  const { name, contact, phone, email, address } = req.body;
  if (!name) return res.status(400).json({ error: 'Nombre requerido' });
  const db = getDb();
  db.run("INSERT INTO suppliers (name, contact, phone, email, address) VALUES (?, ?, ?, ?, ?)", [name, contact || '', phone || '', email || '', address || '']);
  saveDb();
  res.json({ success: true, id: lastId() });
});

app.put('/api/suppliers/:id', auth, (req, res) => {
  const { name, contact, phone, email, address } = req.body;
  const db = getDb();
  db.run("UPDATE suppliers SET name=?, contact=?, phone=?, email=?, address=? WHERE id=?", [name, contact || '', phone || '', email || '', address || '', req.params.id]);
  saveDb();
  res.json({ success: true });
});

app.delete('/api/suppliers/:id', auth, (req, res) => {
  const db = getDb();
  db.run("DELETE FROM suppliers WHERE id=?", [req.params.id]);
  saveDb();
  res.json({ success: true });
});

// ==================== PRODUCTS ====================
app.get('/api/products', auth, (req, res) => {
  const { search, category_id, low_stock } = req.query;
  let sql = "SELECT p.*, c.name as category_name, s.name as supplier_name FROM products p LEFT JOIN categories c ON p.category_id = c.id LEFT JOIN suppliers s ON p.supplier_id = s.id WHERE p.active = 1";
  const params = [];
  if (search) { sql += " AND (p.name LIKE ? OR p.barcode LIKE ? OR p.description1 LIKE ? OR p.description2 LIKE ?)"; params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`); }
  if (category_id) { sql += " AND p.category_id = ?"; params.push(category_id); }
  if (low_stock) { sql += " AND p.stock <= p.min_stock AND p.min_stock > 0"; }
  sql += " ORDER BY p.name";
  res.json(queryAll(sql, params));
});

app.get('/api/products/:id', auth, (req, res) => {
  const p = queryOne("SELECT p.*, c.name as category_name, s.name as supplier_name FROM products p LEFT JOIN categories c ON p.category_id = c.id LEFT JOIN suppliers s ON p.supplier_id = s.id WHERE p.id = ?", [req.params.id]);
  if (!p) return res.status(404).json({ error: 'No encontrado' });
  res.json(p);
});

app.post('/api/products', auth, (req, res) => {
  const { name, description, description1, description2, barcode, price, cost, stock, min_stock, max_stock, category_id, supplier_id } = req.body;
  if (!name || price === undefined) return res.status(400).json({ error: 'Nombre y precio requeridos' });
  const db = getDb();
  try {
    db.run("INSERT INTO products (name, description, description1, description2, barcode, price, cost, stock, min_stock, max_stock, category_id, supplier_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", [name, description || '', description1 || '', description2 || '', barcode || '', price, cost || 0, stock || 0, min_stock || 0, max_stock || 0, category_id || null, supplier_id || null]);
    saveDb();
    res.json({ success: true, id: lastId() });
  } catch {
    res.status(400).json({ error: 'El código de barras ya existe' });
  }
});

app.put('/api/products/:id', auth, (req, res) => {
  const { name, description, description1, description2, barcode, price, cost, stock, min_stock, max_stock, category_id, supplier_id } = req.body;
  const db = getDb();
  try {
    db.run("UPDATE products SET name=?, description=?, description1=?, description2=?, barcode=?, price=?, cost=?, stock=?, min_stock=?, max_stock=?, category_id=?, supplier_id=?, updated_at=CURRENT_TIMESTAMP WHERE id=?", [name, description || '', description1 || '', description2 || '', barcode || '', price, cost || 0, stock || 0, min_stock || 0, max_stock || 0, category_id || null, supplier_id || null, req.params.id]);
    saveDb();
    res.json({ success: true });
  } catch {
    res.status(400).json({ error: 'El código de barras ya existe' });
  }
});

app.delete('/api/products/:id', auth, (req, res) => {
  const db = getDb();
  db.run("UPDATE products SET active=0 WHERE id=?", [req.params.id]);
  saveDb();
  res.json({ success: true });
});

app.post('/api/import/prices', auth, adminOnly, (req, res) => {
  const { prices } = req.body;
  if (!prices) return res.status(400).json({ error: 'Falta lista de precios' });
  const db = getDb();
  let updated = 0, notFound = [];
  for (const code of Object.keys(prices)) {
    const price = parseFloat(prices[code]);
    if (isNaN(price) || price <= 0) continue;
    const exists = queryOne("SELECT id FROM products WHERE barcode=? AND active=1", [code]);
    if (!exists) { if (code) notFound.push(code); continue; }
    db.run("UPDATE products SET price=?, updated_at=CURRENT_TIMESTAMP WHERE barcode=?", [price, code]);
    updated++;
  }
  saveDb();
  res.json({ success: true, updated, notFound: notFound.length });
});

// ==================== CLIENTS ====================
app.get('/api/clients', auth, (req, res) => {
  const { search } = req.query;
  let sql = "SELECT * FROM clients";
  const params = [];
  if (search) {
    sql += " WHERE name LIKE ? OR code LIKE ? OR phone LIKE ? OR business_name LIKE ? OR nickname LIKE ?";
    params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
  }
  sql += " ORDER BY name";
  const clients = queryAll(sql, params);
  for (const c of clients) {
    const totalSales = queryOne("SELECT COALESCE(SUM(total),0) as s FROM sales WHERE client_id=? AND payment_method='cuenta_corriente'", [c.id]);
    const totalPay = queryOne("SELECT COALESCE(SUM(amount),0) as s FROM payments WHERE client_id=?", [c.id]);
    c.total_sales = totalSales?.s || 0;
    c.total_paid = totalPay?.s || 0;
    c.balance = (c.total_sales || 0) - (c.total_paid || 0);
  }
  res.json(clients);
});

app.get('/api/clients/:id', auth, (req, res) => {
  const c = queryOne("SELECT * FROM clients WHERE id = ?", [req.params.id]);
  if (!c) return res.status(404).json({ error: 'No encontrado' });
  const totalSales = queryOne("SELECT COALESCE(SUM(total),0) as s FROM sales WHERE client_id=? AND payment_method='cuenta_corriente'", [c.id]);
  const totalPay = queryOne("SELECT COALESCE(SUM(amount),0) as s FROM payments WHERE client_id=?", [c.id]);
  c.total_sales = totalSales?.s || 0;
  c.total_paid = totalPay?.s || 0;
  c.balance = (c.total_sales || 0) - (c.total_paid || 0);
  res.json(c);
});

app.post('/api/clients', auth, (req, res) => {
  const { code, name, business_name, nickname, phone, email, address, locality, whatsapp, cuit, iva } = req.body;
  if (!name) return res.status(400).json({ error: 'Nombre requerido' });
  const db = getDb();
  db.run("INSERT INTO clients (code, name, business_name, nickname, phone, email, address, locality, whatsapp, cuit, iva) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    [code || '', name, business_name || '', nickname || '', phone || '', email || '', address || '', locality || '', whatsapp || '', cuit || '', iva || 'Consumidor Final']);
  saveDb();
  res.json({ success: true, id: lastId() });
});

app.put('/api/clients/:id', auth, (req, res) => {
  const { code, name, business_name, nickname, phone, email, address, locality, whatsapp, cuit, iva } = req.body;
  const db = getDb();
  db.run("UPDATE clients SET code=?, name=?, business_name=?, nickname=?, phone=?, email=?, address=?, locality=?, whatsapp=?, cuit=?, iva=? WHERE id=?",
    [code || '', name, business_name || '', nickname || '', phone || '', email || '', address || '', locality || '', whatsapp || '', cuit || '', iva || 'Consumidor Final', req.params.id]);
  saveDb();
  res.json({ success: true });
});

app.delete('/api/clients/:id', auth, (req, res) => {
  const db = getDb();
  db.run("DELETE FROM clients WHERE id=?", [req.params.id]);
  saveDb();
  res.json({ success: true });
});

app.get('/api/clients/:id/sales', auth, (req, res) => {
  const sales = queryAll("SELECT s.*, u.full_name as user_name FROM sales s LEFT JOIN users u ON s.user_id = u.id WHERE s.client_id = ? ORDER BY s.created_at DESC", [req.params.id]);
  for (const s of sales) {
    s.items = queryAll("SELECT * FROM sale_items WHERE sale_id = ?", [s.id]);
  }
  res.json(sales);
});

app.get('/api/clients/:id/quotes', auth, (req, res) => {
  const quotes = queryAll("SELECT q.*, u.full_name as user_name FROM quotes q LEFT JOIN users u ON q.user_id = u.id WHERE q.client_id = ? ORDER BY q.created_at DESC", [req.params.id]);
  for (const q of quotes) {
    q.items = queryAll("SELECT * FROM quote_items WHERE quote_id = ?", [q.id]);
  }
  res.json(quotes);
});

app.get('/api/clients/:id/payments', auth, (req, res) => {
  res.json(queryAll("SELECT * FROM payments WHERE client_id = ? ORDER BY created_at DESC", [req.params.id]));
});

app.get('/api/clients/:id/account', auth, (req, res) => {
  const c = queryOne("SELECT id, name, code FROM clients WHERE id = ?", [req.params.id]);
  if (!c) return res.status(404).json({ error: 'No encontrado' });
  const sales = queryAll("SELECT id, total, created_at FROM sales WHERE client_id = ? ORDER BY created_at", [req.params.id]);
  const payments = queryAll("SELECT * FROM payments WHERE client_id = ? ORDER BY created_at", [req.params.id]);
  let balance = 0;
  const movements = [];
  for (const s of sales) { balance += s.total; movements.push({ type: 'venta', desc: 'Venta #' + s.id, amount: s.total, balance, date: s.created_at }); }
  for (const p of payments) { balance -= p.amount; movements.push({ type: 'pago', desc: p.notes || 'Pago', amount: -p.amount, balance, date: p.created_at }); }
  movements.sort((a, b) => new Date(a.date) - new Date(b.date));
  res.json({ client: c, balance, movements });
});

// ==================== QUOTES ====================
app.get('/api/quotes', auth, (req, res) => {
  const q = queryAll("SELECT q.*, c.name as client_name, u.full_name as user_name, (SELECT GROUP_CONCAT(quote_items.description, ' | ') FROM quote_items WHERE quote_items.quote_id = q.id) as descriptions FROM quotes q LEFT JOIN clients c ON q.client_id = c.id LEFT JOIN users u ON q.user_id = u.id ORDER BY q.created_at DESC");
  res.json(q);
});

app.get('/api/quotes/:id', auth, (req, res) => {
  const q = queryOne("SELECT q.*, c.name as client_name, u.full_name as user_name FROM quotes q LEFT JOIN clients c ON q.client_id = c.id LEFT JOIN users u ON q.user_id = u.id WHERE q.id = ?", [req.params.id]);
  if (!q) return res.status(404).json({ error: 'No encontrado' });
  q.items = queryAll("SELECT * FROM quote_items WHERE quote_id = ?", [req.params.id]);
  res.json(q);
});

app.post('/api/quotes', auth, (req, res) => {
  const { client_id, items, notes } = req.body;
  if (!items || !items.length) return res.status(400).json({ error: 'Debe incluir productos' });
  const db = getDb();
  let total = 0;
  for (const item of items) total += item.quantity * item.price;
  db.run("INSERT INTO quotes (client_id, user_id, total, notes) VALUES (?, ?, ?, ?)", [client_id || null, req.user.id, total, notes || '']);
  const quoteId = lastId();
  for (const item of items) {
    const subtotal = item.quantity * item.price;
    db.run("INSERT INTO quote_items (quote_id, product_id, product_name, quantity, price, subtotal, description) VALUES (?, ?, ?, ?, ?, ?, ?)", [quoteId, item.product_id || null, item.product_name, item.quantity, item.price, subtotal, item.description || '']);
  }
  saveDb();
  res.json({ success: true, id: quoteId });
});

app.put('/api/quotes/:id/status', auth, (req, res) => {
  const { status } = req.body;
  const db = getDb();
  db.run("UPDATE quotes SET status=? WHERE id=?", [status, req.params.id]);
  saveDb();
  res.json({ success: true });
});

app.put('/api/quotes/:id', auth, (req, res) => {
  const { client_id, items, notes } = req.body;
  if (!items || !items.length) return res.status(400).json({ error: 'Debe incluir productos' });
  const db = getDb();
  let total = 0;
  for (const item of items) total += item.quantity * item.price;
  db.run("UPDATE quotes SET client_id=?, total=?, notes=? WHERE id=?", [client_id || null, total, notes || '', req.params.id]);
  db.run("DELETE FROM quote_items WHERE quote_id=?", [req.params.id]);
  for (const item of items) {
    const subtotal = item.quantity * item.price;
    db.run("INSERT INTO quote_items (quote_id, product_id, product_name, quantity, price, subtotal, description) VALUES (?, ?, ?, ?, ?, ?, ?)", [req.params.id, item.product_id || null, item.product_name, item.quantity, item.price, subtotal, item.description || '']);
  }
  saveDb();
  res.json({ success: true });
});

app.delete('/api/quotes/:id', auth, (req, res) => {
  const db = getDb();
  db.run("DELETE FROM quotes WHERE id=?", [req.params.id]);
  saveDb();
  res.json({ success: true });
});

// ==================== PAYMENTS ====================
app.get('/api/payments', auth, (req, res) => {
  const p = queryAll("SELECT p.*, c.name as client_name FROM payments p LEFT JOIN clients c ON p.client_id = c.id ORDER BY p.created_at DESC");
  res.json(p);
});

app.post('/api/payments', auth, async (req, res) => {
  const { client_id, sale_id, amount, payment_method, notes } = req.body;
  if (!client_id || !amount || amount <= 0) return res.status(400).json({ error: 'Cliente y monto requeridos' });
  const db = getDb();
  db.run("INSERT INTO payments (client_id, sale_id, amount, payment_method, notes) VALUES (?, ?, ?, ?, ?)", [client_id, sale_id || null, amount, payment_method || 'efectivo', notes || '']);
  const paymentId = lastId();
  saveDb();
  const resp = { success: true, id: paymentId };
  try {
    const invoiceInfo = await emitirFacturaDePago(paymentId);
    resp.invoice = invoiceInfo;
  } catch (e) {
    console.error('Error emitiendo factura de cobro:', e.message);
  }
  res.json(resp);
});

app.delete('/api/payments/:id', auth, (req, res) => {
  const db = getDb();
  db.run("DELETE FROM payments WHERE id=?", [req.params.id]);
  saveDb();
  res.json({ success: true });
});

// ==================== SALES ====================
app.get('/api/sales', auth, (req, res) => {
  const { from, to, limit } = req.query;
  let sql = "SELECT s.*, u.full_name as user_name, c.name as client_name FROM sales s LEFT JOIN users u ON s.user_id = u.id LEFT JOIN clients c ON s.client_id = c.id WHERE 1=1";
  const params = [];
  if (from) { sql += " AND s.created_at >= ?"; params.push(from); }
  if (to) { sql += " AND s.created_at <= ?"; params.push(to + ' 23:59:59'); }
  sql += " ORDER BY s.created_at DESC";
  if (limit) { sql += " LIMIT ?"; params.push(parseInt(limit)); }
  res.json(queryAll(sql, params));
});

app.get('/api/sales/:id', auth, (req, res) => {
  const sale = queryOne("SELECT s.*, u.full_name as user_name, c.name as client_name FROM sales s LEFT JOIN users u ON s.user_id = u.id LEFT JOIN clients c ON s.client_id = c.id WHERE s.id = ?", [req.params.id]);
  if (!sale) return res.status(404).json({ error: 'No encontrado' });
  sale.items = queryAll("SELECT * FROM sale_items WHERE sale_id = ?", [req.params.id]);
  res.json(sale);
});

app.post('/api/sales', auth, async (req, res) => {
  const { client_id, discount, payment_method, items } = req.body;
  if (!items || !items.length) return res.status(400).json({ error: 'Debe incluir productos' });
  if (!client_id) return res.status(400).json({ error: 'Debe seleccionar un cliente para la venta' });
  const db = getDb();
  let total = 0;
  for (const item of items) total += item.quantity * item.price;
  total -= (discount || 0);
  if (total < 0) total = 0;

  db.run("INSERT INTO sales (user_id, client_id, total, discount, payment_method) VALUES (?, ?, ?, ?, ?)", [req.user.id, client_id || null, total, discount || 0, payment_method || 'efectivo']);
  const saleId = lastId();

  for (const item of items) {
    const subtotal = item.quantity * item.price;
    const desc = item.description || [item.description1, item.description2].filter(Boolean).join(' | ') || '';
    db.run("INSERT INTO sale_items (sale_id, product_id, product_name, quantity, price, subtotal, description) VALUES (?, ?, ?, ?, ?, ?, ?)", [saleId, item.product_id, item.product_name, item.quantity, item.price, subtotal, desc]);
    db.run("UPDATE products SET stock = stock - ? WHERE id = ? AND active = 1", [item.quantity, item.product_id]);
  }
  saveDb();
  // Emitir factura segun metodo de pago
  let invoiceInfo = null;
  try {
    invoiceInfo = await emitirFactura(saleId, payment_method || 'efectivo');
  } catch (e) {
    console.error('Error al emitir factura:', e.message);
  }
  res.json({ success: true, id: saleId, invoice: invoiceInfo });
});

// ==================== PURCHASES ====================
app.get('/api/purchases', auth, (req, res) => {
  const items = queryAll("SELECT p.*, s.name as supplier_name, u.full_name as user_name FROM purchases p LEFT JOIN suppliers s ON p.supplier_id = s.id LEFT JOIN users u ON p.user_id = u.id ORDER BY p.created_at DESC");
  for (const p of items) {
    const prods = queryAll("SELECT DISTINCT product_name FROM purchase_items WHERE purchase_id = ?", [p.id]);
    p.products_list = prods.map(x => x.product_name).join(', ');
  }
  res.json(items);
});

app.post('/api/purchases', auth, (req, res) => {
  const { supplier_id, items, invoice_number, invoice_type } = req.body;
  if (!items || !items.length) return res.status(400).json({ error: 'Debe incluir productos' });
  const db = getDb();
  let total = 0;
  for (const item of items) total += item.quantity * item.cost;
  db.run("INSERT INTO purchases (supplier_id, user_id, total, invoice_number, invoice_type) VALUES (?, ?, ?, ?, ?)", [supplier_id || null, req.user.id, total, invoice_number || '', invoice_type || 'No Oficial']);
  const purchaseId = lastId();
  for (const item of items) {
    const subtotal = item.quantity * item.cost;
    db.run("INSERT INTO purchase_items (purchase_id, product_id, product_name, quantity, cost, subtotal) VALUES (?, ?, ?, ?, ?, ?)", [purchaseId, item.product_id, item.product_name, item.quantity, item.cost, subtotal]);
    db.run("UPDATE products SET stock = stock + ?, cost = ? WHERE id = ?", [item.quantity, item.cost, item.product_id]);
  }
  saveDb();
  res.json({ success: true, id: purchaseId });
});

app.get('/api/purchases/:id', auth, (req, res) => {
  const p = queryOne("SELECT p.*, s.name as supplier_name, u.full_name as user_name FROM purchases p LEFT JOIN suppliers s ON p.supplier_id = s.id LEFT JOIN users u ON p.user_id = u.id WHERE p.id = ?", [req.params.id]);
  if (!p) return res.status(404).json({ error: 'No encontrado' });
  p.items = queryAll("SELECT * FROM purchase_items WHERE purchase_id = ?", [p.id]);
  res.json(p);
});

app.put('/api/purchases/:id', auth, (req, res) => {
  const { supplier_id, items, invoice_number, invoice_type } = req.body;
  if (!items || !items.length) return res.status(400).json({ error: 'Debe incluir productos' });
  const db = getDb();
  // Revertir stock viejo
  const oldItems = queryAll("SELECT * FROM purchase_items WHERE purchase_id = ?", [req.params.id]);
  for (const old of oldItems) {
    db.run("UPDATE products SET stock = stock - ? WHERE id = ?", [old.quantity, old.product_id]);
  }
  // Eliminar items viejos
  db.run("DELETE FROM purchase_items WHERE purchase_id = ?", [req.params.id]);
  // Calcular nuevo total e insertar items nuevos
  let total = 0;
  for (const item of items) total += item.quantity * item.cost;
  db.run("UPDATE purchases SET supplier_id=?, total=?, invoice_number=?, invoice_type=? WHERE id=?", [supplier_id || null, total, invoice_number || '', invoice_type || 'No Oficial', req.params.id]);
  for (const item of items) {
    const subtotal = item.quantity * item.cost;
    db.run("INSERT INTO purchase_items (purchase_id, product_id, product_name, quantity, cost, subtotal) VALUES (?, ?, ?, ?, ?, ?)", [req.params.id, item.product_id, item.product_name, item.quantity, item.cost, subtotal]);
    db.run("UPDATE products SET stock = stock + ?, cost = ? WHERE id = ?", [item.quantity, item.cost, item.product_id]);
  }
  saveDb();
  res.json({ success: true });
});

// ==================== EXPENSES ====================
app.get('/api/expenses', auth, (req, res) => {
  const { from, to, category } = req.query;
  let sql = "SELECT e.*, u.full_name as user_name FROM expenses e LEFT JOIN users u ON e.user_id = u.id";
  const params = [];
  const wheres = [];
  if (from) { wheres.push("e.date >= ?"); params.push(from); }
  if (to) { wheres.push("e.date <= ?"); params.push(to); }
  if (category) { wheres.push("e.category = ?"); params.push(category); }
  if (wheres.length) sql += " WHERE " + wheres.join(" AND ");
  sql += " ORDER BY e.date DESC, e.created_at DESC";
  res.json(queryAll(sql, params));
});

app.post('/api/expenses', auth, (req, res) => {
  const { date, detail, amount, payment_method, category, custom_category } = req.body;
  if (!date || !detail || !amount || !category) return res.status(400).json({ error: 'Complete fecha, detalle, importe y categoria' });
  const db = getDb();
  db.run("INSERT INTO expenses (date, detail, amount, payment_method, category, custom_category, user_id) VALUES (?, ?, ?, ?, ?, ?, ?)",
    [date, detail, amount, payment_method || 'efectivo', category, custom_category || '', req.user.id]);
  saveDb();
  res.json({ success: true, id: lastId() });
});

app.put('/api/expenses/:id', auth, (req, res) => {
  const { date, detail, amount, payment_method, category, custom_category } = req.body;
  if (!date || !detail || !amount || !category) return res.status(400).json({ error: 'Complete fecha, detalle, importe y categoria' });
  const db = getDb();
  db.run("UPDATE expenses SET date=?, detail=?, amount=?, payment_method=?, category=?, custom_category=? WHERE id=?",
    [date, detail, amount, payment_method || 'efectivo', category, custom_category || '', req.params.id]);
  saveDb();
  res.json({ success: true });
});

app.delete('/api/expenses/:id', auth, (req, res) => {
  const db = getDb();
  db.run("DELETE FROM expenses WHERE id=?", [req.params.id]);
  saveDb();
  res.json({ success: true });
});

// ==================== DASHBOARD ====================
app.get('/api/dashboard', auth, (req, res) => {
  const db = getDb();
  const today = new Date().toISOString().split('T')[0];
  const stats = {};

  const r1 = db.exec("SELECT COUNT(*) as c FROM products WHERE active=1");
  stats.total_products = r1[0]?.values[0][0] || 0;

  const r2 = db.exec("SELECT COUNT(*) as c FROM products WHERE active=1 AND stock <= min_stock AND min_stock > 0");
  stats.low_stock = r2[0]?.values[0][0] || 0;

  stats.total_suppliers = queryOne("SELECT COUNT(*) as c FROM suppliers")?.c || 0;
  stats.total_clients = queryOne("SELECT COUNT(*) as c FROM clients")?.c || 0;
  stats.today_sales = queryOne("SELECT COUNT(*) as c FROM sales WHERE DATE(created_at) = ?", [today])?.c || 0;
  stats.today_revenue = queryOne("SELECT COALESCE(SUM(total), 0) as s FROM sales WHERE DATE(created_at) = ?", [today])?.s || 0;
  stats.month_revenue = queryOne("SELECT COALESCE(SUM(total), 0) as s FROM sales WHERE strftime('%Y-%m', created_at) = strftime('%Y-%m', 'now')")?.s || 0;
   stats.sales_chart = queryAll("SELECT DATE(created_at) as day, SUM(total) as total FROM sales WHERE created_at >= DATE('now', '-7 days') GROUP BY DATE(created_at) ORDER BY day");
   stats.top_products = queryAll("SELECT p.name, SUM(si.quantity) as q FROM sale_items si JOIN products p ON si.product_id = p.id GROUP BY si.product_id ORDER BY q DESC LIMIT 5");
   stats.payments_summary = queryAll("SELECT payment_method, COUNT(*) as count, SUM(total) as total FROM sales WHERE created_at >= DATE('now', '-7 days') GROUP BY payment_method ORDER BY total DESC");

  res.json(stats);
});

// ==================== REPORTS ====================
app.get('/api/reports/sales', auth, (req, res) => {
  const { from, to, group } = req.query;
  let groupBy, select;
  if (group === 'month') { groupBy = "strftime('%Y-%m', created_at)"; select = groupBy + " as period"; }
  else if (group === 'day') { groupBy = "DATE(created_at)"; select = groupBy + " as period"; }
  else { groupBy = "strftime('%Y-%m', created_at)"; select = groupBy + " as period"; }

  let sql = `SELECT ${select}, COUNT(*) as count, SUM(total) as total, AVG(total) as avg FROM sales WHERE 1=1`;
  const params = [];
  if (from) { sql += " AND created_at >= ?"; params.push(from); }
  if (to) { sql += " AND created_at <= ?"; params.push(to + ' 23:59:59'); }
  sql += ` GROUP BY ${groupBy} ORDER BY period`;
  res.json(queryAll(sql, params));
});

app.get('/api/reports/products', auth, (req, res) => {
  const items = queryAll("SELECT p.name, p.barcode, p.stock, p.min_stock, p.max_stock, p.price, p.cost, (p.price - p.cost) as margin, c.name as category FROM products p LEFT JOIN categories c ON p.category_id = c.id WHERE p.active = 1 ORDER BY p.name");
  res.json(items);
});

app.get('/api/reports/sales-detailed', auth, (req, res) => {
  const { from, to } = req.query;
  let sql = "SELECT s.*, u.full_name as user_name, c.name as client_name FROM sales s LEFT JOIN users u ON s.user_id = u.id LEFT JOIN clients c ON s.client_id = c.id WHERE 1=1";
  const params = [];
  if (from) { sql += " AND s.created_at >= ?"; params.push(from); }
  if (to) { sql += " AND s.created_at <= ?"; params.push(to + ' 23:59:59'); }
  sql += " ORDER BY s.created_at DESC";
  const sales = queryAll(sql, params);
  for (const s of sales) {
    s.items = queryAll("SELECT * FROM sale_items WHERE sale_id = ?", [s.id]);
  }
  res.json(sales);
});

// ==================== BACKUPS ====================
app.post('/api/backups', auth, adminOnly, (req, res) => {
  const db = getDb();
  const dataDir = process.env.DATA_DIR || __dirname;
  const backupDir = path.join(dataDir, 'backups');
  if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });
  const filename = `backup_${Date.now()}.db`;
  const filepath = path.join(backupDir, filename);
  const data = db.export();
  fs.writeFileSync(filepath, Buffer.from(data));
  const size = fs.statSync(filepath).size;
  db.run("INSERT INTO backups (filename, size) VALUES (?, ?)", [filename, size]);
  saveDb();
  res.json({ success: true, filename, size });
});

app.get('/api/backups', auth, adminOnly, (req, res) => {
  res.json(queryAll("SELECT * FROM backups ORDER BY created_at DESC"));
});

app.post('/api/backups/restore/:id', auth, adminOnly, (req, res) => {
  const backup = queryOne("SELECT * FROM backups WHERE id = ?", [req.params.id]);
  if (!backup) return res.status(404).json({ error: 'Respaldo no encontrado' });
  const backupPath = path.join(process.env.DATA_DIR || __dirname, 'backups', backup.filename);
  if (!fs.existsSync(backupPath)) return res.status(404).json({ error: 'Archivo no encontrado' });
  const buffer = fs.readFileSync(backupPath);
  fs.writeFileSync(require('./database').DB_PATH, buffer);
  res.json({ success: true, message: 'Base de datos restaurada. Reinicie el servidor.' });
});

app.delete('/api/backups/:id', auth, adminOnly, (req, res) => {
  const backup = queryOne("SELECT * FROM backups WHERE id = ?", [req.params.id]);
  if (backup) {
    const p = path.join(process.env.DATA_DIR || __dirname, 'backups', backup.filename);
    if (fs.existsSync(p)) fs.unlinkSync(p);
  }
  const db = getDb();
  db.run("DELETE FROM backups WHERE id = ?", [req.params.id]);
  saveDb();
  res.json({ success: true });
});

// ==================== SYNC ====================
app.get('/api/sync/export', auth, adminOnly, (req, res) => {
  const dbPath = require('./database').DB_PATH;
  if (!fs.existsSync(dbPath)) return res.status(404).json({ error: 'Base de datos no encontrada' });
  const data = fs.readFileSync(dbPath);
  getDb().export();
  res.setHeader('Content-Type', 'application/octet-stream');
  res.setHeader('Content-Disposition', 'attachment; filename=sistema_pos.db');
  res.send(Buffer.from(data));
});

app.post('/api/sync/import', auth, adminOnly, (req, res) => {
  const dbPath = require('./database').DB_PATH;
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: 'URL requerida' });
  const http = require(url.startsWith('https') ? 'https' : 'http');
  http.get(url, (response) => {
    if (response.statusCode !== 200) return res.status(400).json({ error: 'Error al descargar: ' + response.statusCode });
    const chunks = [];
    response.on('data', (chunk) => chunks.push(chunk));
    response.on('end', () => {
      try {
        const buffer = Buffer.concat(chunks);
        fs.writeFileSync(dbPath, buffer);
        res.json({ success: true, message: 'Base de datos sincronizada. Reinicie el servidor para aplicar cambios.' });
      } catch (e) {
        res.status(500).json({ error: 'Error al escribir: ' + e.message });
      }
    });
  }).on('error', (e) => res.status(500).json({ error: 'Error de conexion: ' + e.message }));
});

const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 500 * 1024 * 1024 } });
app.post('/api/sync/import-local', auth, adminOnly, upload.single('db'), (req, res) => {
  const dbPath = require('./database').DB_PATH;
  if (!req.file) return res.status(400).json({ error: 'Archivo no recibido' });
  try {
    fs.writeFileSync(dbPath, req.file.buffer);
    res.json({ success: true, message: 'Base de datos actualizada. Reinicie el servidor.' });
  } catch (e) {
    res.status(500).json({ error: 'Error al escribir: ' + e.message });
  }
});

// ==================== EXPORT ====================
app.get('/api/export/clients', auth, (req, res) => {
  const clients = queryAll("SELECT * FROM clients ORDER BY name");
  const headers = ['Codigo', 'Nombre', 'CUIT', 'IVA', 'Razon Social', 'Apodo', 'Telefono', 'Email', 'Direccion', 'Localidad', 'WhatsApp'];
  const rows = clients.map(c => [c.code||'', c.name||'', c.cuit||'', c.iva||'Consumidor Final', c.business_name||'', c.nickname||'', c.phone||'', c.email||'', c.address||'', c.locality||'', c.whatsapp||'']);
  let csv = '\uFEFF' + headers.join(';') + '\r\n';
  for (const r of rows) {
    csv += r.map(v => '"' + String(v).replace(/"/g, '""') + '"').join(';') + '\r\n';
  }
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename=clientes.csv');
  res.send(csv);
});

app.get('/api/export/products', auth, (req, res) => {
  const products = queryAll("SELECT p.*, c.name as cat FROM products p LEFT JOIN categories c ON p.category_id = c.id WHERE p.active=1 ORDER BY p.name");
  const headers = ['Nombre', 'Codigo', 'Precio Venta', 'Costo Compra', 'Stock', 'Stock Min', 'Stock Max', 'Valor Stock', 'Categoria', 'Observaciones', 'Descripcion 1', 'Descripcion 2'];
  let totalValor = 0;
  const rows = products.map(p => {
    const valor = (p.cost || 0) * (p.stock || 0);
    totalValor += valor;
    return [p.name||'', p.barcode||'', p.price||'', p.cost||'', p.stock||'', p.min_stock||'', p.max_stock||'', valor.toFixed(2), p.cat||'', p.description||'', p.description1||'', p.description2||''];
  });
  let csv = '\uFEFF' + headers.join(';') + '\r\n';
  for (const r of rows) {
    csv += r.map(v => '"' + String(v).replace(/"/g, '""') + '"').join(';') + '\r\n';
  }
  csv += '\r\n"VALOR TOTAL DEL STOCK";"' + totalValor.toFixed(2) + '"\r\n';
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename=inventario.csv');
  res.send(csv);
});

app.get('/api/export/sales', auth, (req, res) => {
  const { from, to } = req.query;
  let sql = "SELECT s.*, c.name as client FROM sales s LEFT JOIN clients c ON s.client_id = c.id WHERE 1=1";
  const params = [];
  if (from) { sql += " AND s.created_at >= ?"; params.push(from); }
  if (to) { sql += " AND s.created_at <= ?"; params.push(to + ' 23:59:59'); }
  sql += " ORDER BY s.created_at DESC";
  const sales = queryAll(sql, params);
  const headers = ['#', 'Cliente', 'Total', 'Descuento', 'Metodo', 'Fecha'];
  const rows = sales.map(s => [s.id, s.client||'General', s.total, s.discount||0, s.payment_method, s.created_at]);
  let csv = '\uFEFF' + headers.join(';') + '\r\n';
  for (const r of rows) {
    csv += r.map(v => '"' + String(v).replace(/"/g, '""') + '"').join(';') + '\r\n';
  }
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename=ventas.csv');
  res.send(csv);
});

app.get('/api/export/expenses', auth, (req, res) => {
  const { from, to, category } = req.query;
  let sql = "SELECT e.*, u.full_name as user_name FROM expenses e LEFT JOIN users u ON e.user_id = u.id";
  const params = [];
  const wheres = [];
  if (from) { wheres.push("e.date >= ?"); params.push(from); }
  if (to) { wheres.push("e.date <= ?"); params.push(to); }
  if (category) { wheres.push("e.category = ?"); params.push(category); }
  if (wheres.length) sql += " WHERE " + wheres.join(" AND ");
  sql += " ORDER BY e.date DESC";
  const items = queryAll(sql, params);
  const headers = ['Fecha', 'Detalle', 'Categoria', 'Forma Pago', 'Importe', 'Usuario'];
  let total = 0;
  const rows = items.map(e => {
    total += e.amount;
    const cat = e.category === 'Otro' && e.custom_category ? e.custom_category : e.category;
    return [e.date||'', e.detail||'', cat||'', e.payment_method||'efectivo', e.amount||0, e.user_name||''];
  });
  let csv = '\uFEFF' + headers.join(';') + '\r\n';
  for (const r of rows) {
    csv += r.map(v => '"' + String(v).replace(/"/g, '""') + '"').join(';') + '\r\n';
  }
  csv += '\r\n"TOTAL GENERAL";"' + total.toFixed(2) + '"\r\n';
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename=gastos.csv');
  res.send(csv);
});

// ==================== FISCAL / ARCA ====================
app.get('/api/fiscal-config', auth, adminOnly, (req, res) => {
  const cfg = queryOne("SELECT * FROM fiscal_config WHERE id = 1");
  res.json(cfg || {});
});

app.put('/api/fiscal-config', auth, adminOnly, (req, res) => {
  const { cuit, business_name, address, iva_condition, ingresos_brutos, inicio_actividades, pos_number, cert_crt, cert_key, cert_password, env_mode } = req.body;
  const db = getDb();
  const existing = queryOne("SELECT id FROM fiscal_config WHERE id = 1");
  if (existing) {
    db.run("UPDATE fiscal_config SET cuit=?, business_name=?, address=?, iva_condition=?, ingresos_brutos=?, inicio_actividades=?, pos_number=?, cert_crt=?, cert_key=?, cert_password=?, env_mode=? WHERE id=1",
      [cuit||'', business_name||'', address||'', iva_condition||'Responsable Inscripto', ingresos_brutos||'', inicio_actividades||'', pos_number||1, cert_crt||'', cert_key||'', cert_password||'', env_mode||'homologacion']);
  } else {
    db.run("INSERT INTO fiscal_config (cuit, business_name, address, iva_condition, ingresos_brutos, inicio_actividades, pos_number, cert_crt, cert_key, cert_password, env_mode) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      [cuit||'', business_name||'', address||'', iva_condition||'Responsable Inscripto', ingresos_brutos||'', inicio_actividades||'', pos_number||1, cert_crt||'', cert_key||'', cert_password||'', env_mode||'homologacion']);
  }
  saveDb();
  res.json({ success: true });
});

app.post('/api/fiscal/test', auth, adminOnly, async (req, res) => {
  try {
    const r = await testArcaConnection();
    res.json(r);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// ==================== INVOICES ====================
app.get('/api/invoices', auth, (req, res) => {
  const { from, to } = req.query;
  let sql = "SELECT i.*, u.full_name as user_name FROM invoices i LEFT JOIN sales s ON i.sale_id = s.id LEFT JOIN users u ON s.user_id = u.id WHERE 1=1";
  const params = [];
  if (from) { sql += " AND i.created_at >= ?"; params.push(from); }
  if (to) { sql += " AND i.created_at <= ?"; params.push(to + ' 23:59:59'); }
  sql += " ORDER BY i.created_at DESC";
  const invoices = queryAll(sql, params);
  for (const inv of invoices) {
    inv.items = queryAll("SELECT * FROM invoice_items WHERE invoice_id = ?", [inv.id]);
    if (inv.client_id) {
      const totalCC = queryOne("SELECT COALESCE(SUM(total),0) as s FROM sales WHERE client_id=? AND payment_method='cuenta_corriente'", [inv.client_id]);
      const totalPay = queryOne("SELECT COALESCE(SUM(amount),0) as s FROM payments WHERE client_id=?", [inv.client_id]);
      inv.client_balance = (totalCC?.s || 0) - (totalPay?.s || 0);
    } else {
      inv.client_balance = 0;
    }
  }
  res.json(invoices);
});

app.get('/api/invoices/:id', auth, (req, res) => {
  const inv = queryOne("SELECT i.*, u.full_name as user_name FROM invoices i LEFT JOIN sales s ON i.sale_id = s.id LEFT JOIN users u ON s.user_id = u.id WHERE i.id = ?", [req.params.id]);
  if (!inv) return res.status(404).json({ error: 'No encontrada' });
  inv.items = queryAll("SELECT * FROM invoice_items WHERE invoice_id = ?", [inv.id]);
  res.json(inv);
});

app.post('/api/invoices/emit/:saleId', auth, async (req, res) => {
  try {
    const sale = queryOne("SELECT payment_method FROM sales WHERE id = ?", [req.params.saleId]);
    if (!sale) return res.status(404).json({ error: 'Venta no encontrada' });
    const result = await emitirFactura(parseInt(req.params.saleId), sale.payment_method);
    res.json(result);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// ==================== VERSION ====================
app.get('/api/version', (req, res) => {
  const p = path.join(__dirname, 'public', 'version.json');
  if (fs.existsSync(p)) {
    res.json(JSON.parse(fs.readFileSync(p, 'utf8')));
  } else {
    res.json({ version: '1.0.0', releaseDate: '2026-07-18', notes: '', url: '' });
  }
});

// ==================== START ====================
async function startServer(port) {
  await initDatabase();
  return new Promise((resolve, reject) => {
    const p = port || PORT;
    const server = app.listen(p, '0.0.0.0', () => {
      console.log(`Software Único De Caños Embalse corriendo en http://localhost:${p}`);
      console.log(`Base de datos: ${require('./database').DB_PATH}`);
      console.log(`Usuario: admin | Contraseña: admin`);
      resolve(server);
    });
    server.on('error', reject);
  });
}

if (require.main === module) {
  startServer().catch(err => { console.error('Error al iniciar:', err); });
}

module.exports = { app, startServer };
