let token = localStorage.getItem('token') || '';
let user = null;
let currentView = 'dashboard';
let modalCallback = null;
let cart = [];

async function api(method, path, body) {
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (token) opts.headers['Authorization'] = 'Bearer ' + token;
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch('/api' + path, opts);
  if (res.status === 401) { doLogout(); return null; }
  return res.json();
}

function showAlert(msg, type) {
  if (!type) type = 'success';
  const a = document.getElementById('alert');
  a.textContent = msg;
  a.className = 'alert alert-' + type;
  a.style.display = 'block';
  setTimeout(function () { a.style.display = 'none'; }, 3000);
}

async function doLogin() {
  const username = document.getElementById('loginUser').value.trim();
  const password = document.getElementById('loginPass').value;
  const err = document.getElementById('loginError');
  if (!username || !password) { err.style.display = 'block'; return; }
  err.style.display = 'none';
  try {
    const r = await fetch('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: username, password: password }) });
    if (!r.ok) { err.style.display = 'block'; return; }
    const d = await r.json();
    token = d.token;
    user = d.user;
    localStorage.setItem('token', token);
    document.getElementById('loginScreen').classList.add('hidden');
    document.getElementById('app').classList.add('active');
    document.getElementById('userName').textContent = user.full_name || user.username;
    document.getElementById('userRole').textContent = user.role === 'admin' ? 'Admin' : user.role === 'operator' ? 'Operador' : 'Vendedor';
    applyRoleVisibility(user.role);
    applyCompactPref();
    watchTables();
    navigate('dashboard');
  } catch (e) { err.style.display = 'block'; }
}

function doLogout() {
  token = '';
  user = null;
  localStorage.removeItem('token');
  document.getElementById('app').classList.remove('active');
  document.getElementById('loginScreen').classList.remove('hidden');
  document.getElementById('loginPass').value = '';
}

function applyRoleVisibility(role) {
  var allowed = [];
  if (role === 'admin') {
    allowed = ['dashboard','pos','products','categories','suppliers','clients','purchases','sales','quotes','payments','expenses','invoices','reports','fiscal','users','backups','sync'];
  } else if (role === 'operator') {
    allowed = ['pos','products','categories','suppliers','clients','purchases','sales','quotes','payments','expenses','invoices','backups'];
  } else {
    allowed = ['dashboard','pos','products','categories','suppliers','clients','purchases','sales','quotes','payments','expenses','invoices','reports'];
  }
  var navs = document.querySelectorAll('.sidebar-nav .nav-item');
  for (var i = 0; i < navs.length; i++) {
    var view = navs[i].getAttribute('data-view');
    if (view && allowed.indexOf(view) === -1) {
      navs[i].classList.add('hidden');
    } else {
      navs[i].classList.remove('hidden');
    }
  }
}

async function checkForUpdates() {
  var current = await api('GET', '/version') || { version: '1.0.0' };
  var updateUrl = localStorage.getItem('update_url') || '';
  var html = '<div class="form-group"><label>URL para buscar actualizaciones</label><input id="updateUrlInput" class="w-full" value="' + escHtml(updateUrl) + '" placeholder="https://ejemplo.com/version.json"></div>' +
    '<div class="form-group"><label>Versión actual</label><p style="color:var(--text-muted);margin:0"><strong>' + escHtml(current.version) + '</strong> (' + (current.releaseDate || '') + ')</p></div>' +
    '<hr style="margin:1rem 0;border:none;border-top:1px solid var(--border)">' +
    '<div id="updateResult">Presione "Buscar" para verificar si hay una nueva versión</div>';
  openModal('Actualizar Sistema',
    html,
    async function() {
      var url = document.getElementById('updateUrlInput').value.trim();
      localStorage.setItem('update_url', url);
      if (!url) { document.getElementById('updateResult').innerHTML = '<span style="color:#f87171">Ingrese una URL válida</span>'; return; }
      document.getElementById('updateResult').innerHTML = '<span style="color:#94a3b8">Buscando actualizaciones...</span>';
      try {
        var r = await fetch(url);
        var remote = await r.json();
        if (remote.version > current.version) {
          document.getElementById('updateResult').innerHTML = '<span style="color:#34d399">¡Nueva versión disponible: <strong>' + escHtml(remote.version) + '</strong></span><br><br>' +
            (remote.notes ? '<p style="color:var(--text-muted);font-size:.85rem">' + escHtml(remote.notes) + '</p>' : '') +
            (remote.url ? '<a href="' + escHtml(remote.url) + '" target="_blank" class="btn btn-primary" style="display:inline-block;text-decoration:none">Descargar actualización</a>' : '') +
            '<p style="color:var(--text-muted);font-size:.8rem;margin-top:.5rem">Descargue el archivo y reemplace el .exe actual</p>';
        } else {
          document.getElementById('updateResult').innerHTML = '<span style="color:#94a3b8">Ya tiene la última versión</span>';
        }
      } catch (e) {
        document.getElementById('updateResult').innerHTML = '<span style="color:#f87171">Error al buscar: no se pudo conectar a la URL</span>';
      }
    },
    '<button class="btn btn-primary" onclick="modalSave()">Buscar</button> <button class="btn btn-outline" onclick="closeModal()">Cerrar</button>');
}

(function () {
  if (token) {
    api('GET', '/me').then(function (d) {
      if (d && d.id) {
        user = d;
        document.getElementById('loginScreen').classList.add('hidden');
        document.getElementById('app').classList.add('active');
        document.getElementById('userName').textContent = user.full_name || user.username;
        document.getElementById('userRole').textContent = user.role === 'admin' ? 'Admin' : user.role === 'operator' ? 'Operador' : 'Vendedor';
        applyRoleVisibility(user.role);
        navigate('dashboard');
      }
    });
  }
})();

document.getElementById('loginPass').addEventListener('keydown', function (e) { if (e.key === 'Enter') doLogin(); });
document.getElementById('loginUser').addEventListener('keydown', function (e) { if (e.key === 'Enter') { document.getElementById('loginPass').focus(); } });

function navigate(view) {
  currentView = view;
  var items = document.querySelectorAll('.nav-item');
  for (var i = 0; i < items.length; i++) items[i].classList.remove('active');
  var item = document.querySelector('.nav-item[data-view="' + view + '"]');
  if (item) item.classList.add('active');
  document.getElementById('sidebar').classList.remove('open');
  renderView(view);
}

function toggleSidebar() { document.getElementById('sidebar').classList.toggle('open'); }

function renderView(view) {
  var c = document.getElementById('content');
  document.getElementById('viewTitle').textContent = {
    dashboard: 'Dashboard',
    pos: 'Registrar Venta',
    products: 'Productos',
    categories: 'Categorias',
    suppliers: 'Proveedores',
    clients: 'Clientes',
    purchases: 'Compras',
    sales: 'Historial de Ventas',
    quotes: 'Cotizaciones',
    payments: 'Recibos',
    expenses: 'Gastos',
    invoices: 'Facturas',
    fiscal: 'Config. ARCA',
    reports: 'Reportes',
    users: 'Usuarios',
    backups: 'Respaldos',
    sync: 'Sincronizar'
  }[view] || view;
  document.getElementById('topbarActions').innerHTML = '';
  if (view === 'pos') { c.innerHTML = viewPOS(); initPOS(); }
  else if (view === 'dashboard') { c.innerHTML = '<div class="text-center" style="padding:2rem">Cargando...</div>'; loadDashboard(); }
  else if (view === 'products') { c.innerHTML = viewProducts(); initProducts(); }
  else if (view === 'categories') { c.innerHTML = viewCategories(); loadCategories(); }
  else if (view === 'suppliers') { c.innerHTML = viewSuppliers(); loadSuppliers(); }
  else if (view === 'clients') { c.innerHTML = viewClients(); loadClients(); }
  else if (view === 'purchases') { c.innerHTML = viewPurchases(); loadPurchases(); }
  else if (view === 'sales') { c.innerHTML = viewSales(); loadSales(); }
  else if (view === 'quotes') { c.innerHTML = viewQuotes(); loadQuotes(); }
  else if (view === 'payments') { c.innerHTML = viewPayments(); loadPayments(); }
  else if (view === 'expenses') { c.innerHTML = viewExpenses(); loadExpenses(); }
  else if (view === 'invoices') { c.innerHTML = viewInvoices(); loadInvoices(); }
  else if (view === 'fiscal') { c.innerHTML = viewFiscalConfig(); initFiscalConfig(); }
  else if (view === 'reports') { c.innerHTML = viewReports(); initReports(); }
  else if (view === 'users') { c.innerHTML = viewUsers(); loadUsers(); }
  else if (view === 'backups') { c.innerHTML = viewBackups(); loadBackups(); }
  else if (view === 'sync') { c.innerHTML = viewSync(); initSync(); }
}

function openModal(title, bodyHtml, saveCallback, footerHtml) {
  document.getElementById('modalTitle').textContent = title;
  document.getElementById('modalBody').innerHTML = bodyHtml;
  document.getElementById('modal').classList.add('active');
  modalCallback = saveCallback || null;
  if (footerHtml) {
    document.getElementById('modalFooter').innerHTML = footerHtml;
  } else {
    document.getElementById('modalFooter').innerHTML = '<button class="btn btn-outline" onclick="closeModal()">Cancelar</button><button class="btn btn-primary" onclick="modalSave()">Guardar</button>';
  }
}

function closeModal() { document.getElementById('modal').classList.remove('active'); modalCallback = null; }
function modalSave() { if (modalCallback) modalCallback(); }

// ==================== COLUMNAS REDIMENSIONABLES ====================
function initColumnResize() {
  var tables = document.querySelectorAll('table');
  for (var t = 0; t < tables.length; t++) {
    var table = tables[t];
    if (table.dataset.resizable === '1') continue;
    table.dataset.resizable = '1';
    table.classList.add('resizable');
    var ths = table.querySelectorAll('thead th');
    if (!ths.length) continue;
    var key = 'colw_' + (table.id || '');
    if (key === 'colw_') key = 'colw_' + Array.prototype.map.call(ths, function (h) { return h.textContent.trim(); }).join('|');
    var saved = {};
    try { saved = JSON.parse(localStorage.getItem(key) || '{}'); } catch (e) { saved = {}; }
    for (var i = 0; i < ths.length; i++) {
      (function (th, idx) {
        if (!th.style.width) {
          var cur = th.getBoundingClientRect().width;
          if (saved[idx]) cur = saved[idx];
          th.style.width = Math.max(60, cur) + 'px';
          th.style.minWidth = Math.max(60, cur) + 'px';
        }
        th.addEventListener('pointerdown', function (e) {
          e.preventDefault();
          e.stopPropagation();
          var startX = e.clientX;
          var startW = th.getBoundingClientRect().width;
          function onMove(ev) {
            var w = Math.max(40, startW + (ev.clientX - startX));
            th.style.width = w + 'px';
            th.style.minWidth = w + 'px';
          }
          function onUp() {
            document.removeEventListener('pointermove', onMove);
            document.removeEventListener('pointerup', onUp);
            document.removeEventListener('pointercancel', onUp);
            th.classList.remove('dragging');
            try {
              var widths = {};
              var ths2 = table.querySelectorAll('thead th');
              for (var j = 0; j < ths2.length; j++) widths[j] = ths2[j].getBoundingClientRect().width;
              localStorage.setItem(key, JSON.stringify(widths));
            } catch (e) {}
          }
          th.classList.add('dragging');
          document.addEventListener('pointermove', onMove);
          document.addEventListener('pointerup', onUp);
          document.addEventListener('pointercancel', onUp);
        });
      })(ths[i], i);
    }
  }
}

function watchTables() {
  if (window._tableObserver) return;
  window._tableObserver = new MutationObserver(function () {
    initColumnResize();
  });
  window._tableObserver.observe(document.body, { childList: true, subtree: true });
  initColumnResize();
}

// ==================== VISTA COMPACTA ====================
function toggleCompact() {
  var b = document.body.classList.toggle('compact');
  localStorage.setItem('compact', b ? '1' : '0');
  var btn = document.getElementById('compactBtn');
  if (btn) btn.textContent = b ? 'Vista Normal' : 'Compactar';
}
function applyCompactPref() {
  if (localStorage.getItem('compact') === '1') {
    document.body.classList.add('compact');
    var btn = document.getElementById('compactBtn');
    if (btn) btn.textContent = 'Vista Normal';
  }
}

// ==================== DASHBOARD ====================
async function loadDashboard() {
  var d = await api('GET', '/dashboard');
  if (!d) return;
  var c = document.getElementById('content');
  var chartHtml = '';
  if (d.sales_chart && d.sales_chart.length) {
    var maxVal = 1;
    for (var i = 0; i < d.sales_chart.length; i++) { if (d.sales_chart[i].total > maxVal) maxVal = d.sales_chart[i].total; }
    for (var i = 0; i < d.sales_chart.length; i++) {
      var pct = (d.sales_chart[i].total / maxVal) * 100;
      chartHtml += '<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:4px"><div style="width:100%;background:var(--primary);border-radius:4px 4px 0 0;height:' + Math.max(pct, 2) + '%;min-height:4px"></div><span style="font-size:.65rem;color:#64748b">' + (d.sales_chart[i].day || '').slice(5) + '</span><span style="font-size:.65rem;font-weight:600">$' + Number(d.sales_chart[i].total).toFixed(0) + '</span></div>';
    }
  } else {
    chartHtml = '<div style="width:100%;text-align:center;color:#94a3b8;padding:2rem">Sin ventas esta semana</div>';
  }
  var topHtml = '';
  if (d.top_products && d.top_products.length) {
    for (var i = 0; i < d.top_products.length; i++) {
      topHtml += '<tr><td>' + d.top_products[i].name + '</td><td class="text-right">' + d.top_products[i].quantity + '</td></tr>';
    }
  } else {
    topHtml = '<tr><td colspan="2" class="text-center" style="color:#94a3b8">Sin datos</td></tr>';
  }
  c.innerHTML = '<div class="stats-grid">' +
    '<div class="stat-card"><div class="label">Productos</div><div class="num">' + d.total_products + '</div></div>' +
    '<div class="stat-card' + (d.low_stock > 0 ? ' style="background:#7f1d1d66;cursor:pointer"' : ' style="cursor:pointer"') + '" onclick="showLowStockList()"><div class="label">Stock Bajo</div><div class="num"' + (d.low_stock > 0 ? ' style="color:var(--danger)"' : '') + '>' + d.low_stock + '</div><div style="font-size:.7rem;color:var(--text-muted)">Ver lista</div></div>' +
    '<div class="stat-card"><div class="label">Proveedores</div><div class="num">' + d.total_suppliers + '</div></div>' +
    '<div class="stat-card"><div class="label">Clientes</div><div class="num">' + d.total_clients + '</div></div>' +
    '<div class="stat-card"><div class="label">Ventas Hoy</div><div class="num">' + d.today_sales + '</div></div>' +
    '<div class="stat-card"><div class="label">Ingresos Hoy</div><div class="num">$' + Number(d.today_revenue).toFixed(2) + '</div></div>' +
    '<div class="stat-card"><div class="label">Ingresos del Mes</div><div class="num">$' + Number(d.month_revenue).toFixed(2) + '</div></div>' +
    '</div><div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem">' +
    '<div class="card"><h3 style="margin-bottom:1rem;font-size:.95rem">Ventas Ultimos 7 Dias</h3><div style="height:200px;display:flex;align-items:flex-end;gap:4px;padding-top:1rem">' + chartHtml + '</div></div>' +
    '<div class="card"><h3 style="margin-bottom:1rem;font-size:.95rem">Productos Mas Vendidos</h3><table><thead><tr><th>Producto</th><th class="text-right">Cantidad</th></tr></thead><tbody>' + topHtml + '</tbody></table></div></div>';
}

async function showLowStockList() {
  var products = await api('GET', '/products?low_stock=1') || [];
  var html = '';
  if (!products.length) {
    html = '<div class="empty-state" style="padding:1rem">No hay productos con stock bajo</div>';
  } else {
    html += '<table><thead><tr><th>Codigo</th><th>Producto</th><th class="text-right">Stock</th><th class="text-right">Minimo</th></tr></thead><tbody>';
    for (var i = 0; i < products.length; i++) {
      var p = products[i];
      html += '<tr class="row-low-stock"><td>' + escHtml(p.barcode || '') + '</td><td>' + escHtml(p.name) + '</td><td class="text-right" style="color:var(--danger);font-weight:700">' + p.stock + '</td><td class="text-right">' + p.min_stock + '</td></tr>';
    }
    html += '</tbody></table>';
  }
  openModal('Stock Bajo (' + products.length + ' productos)', html, null,
    '<button class="btn btn-outline" onclick="closeModal()">Cerrar</button><button class="btn btn-primary" onclick="goToProductsLowStock()">Ir a Productos</button>');
}

var lowStockMode = false;
function goToProductsLowStock() {
  lowStockMode = true;
  closeModal();
  navigate('products');
}

// ==================== PRODUCTS ====================
 function viewProducts() {
   return '<div class="toolbar"><input class="search-input" id="prodSearch" placeholder="Buscar producto..." oninput="searchProducts()"><select id="prodCatFilter" onchange="searchProducts()"><option value="">Todas las categorias</option></select><button class="btn btn-outline" onclick="exportProducts()">Exportar Excel</button><div class="spacer"></div><span id="productsSummary" style="font-weight:600;color:var(--primary-light)"></span><button class="btn btn-primary" onclick="showProductForm()">+ Nuevo Producto</button></div><div class="card"><div class="table-wrap"><table><thead><tr><th>Codigo</th><th>Nombre</th><th>Descripcion 1</th><th>Descripcion 2</th><th>Stock</th><th>Minimo</th><th>Maximo</th><th>Rubro/Familia</th><th>Observaciones</th><th class="text-right">Acciones</th></tr></thead><tbody id="productsTable"></tbody></table></div></div>';
 }

function initProducts() {
  var cats = [];
  applyCompactPref();
  cats = [];
  (function loadCats() {
    api('GET', '/categories').then(function (data) {
      cats = data || [];
      var sel = document.getElementById('prodCatFilter');
      for (var i = 0; i < cats.length; i++) {
        var o = document.createElement('option');
        o.value = cats[i].id;
        o.textContent = cats[i].name;
        sel.appendChild(o);
      }
    }).finally(function () {
      document.getElementById('prodSearch').value = '';
      if (lowStockMode) {
        lowStockMode = false;
        showLowStockOnly();
      } else {
        searchProducts();
      }
    });
  })();
}

function showLowStockOnly() {
  api('GET', '/products?low_stock=1').then(function (products) {
    products = products || [];
    renderProducts(products);
    document.getElementById('productsSummary').textContent = 'Stock bajo: ' + products.length;
    var toolbar = document.querySelector('.toolbar');
    var banner = document.createElement('div');
    banner.setAttribute('id', 'lowStockBanner');
    banner.style.cssText = 'background:#7f1d1d66;border:1px solid var(--danger);border-radius:8px;padding:.6rem .9rem;margin-bottom:.75rem;display:flex;align-items:center;gap:1rem;font-size:.85rem';
    banner.innerHTML = 'Mostrando solo productos con stock bajo (' + products.length + '). <button class="btn btn-sm btn-outline" style="margin-left:auto" onclick="clearLowStockMode()">Ver todos</button>';
    document.getElementById('content').insertBefore(banner, toolbar);
  });
}

function clearLowStockMode() {
  var b = document.getElementById('lowStockBanner');
  if (b) b.parentNode.removeChild(b);
  document.getElementById('prodSearch').value = '';
  searchProducts();
}

function renderProducts(products) {
  var tbody = document.getElementById('productsTable');
  var html = '';
  var totalValor = 0;
  for (var i = 0; i < products.length; i++) {
    var p = products[i];
    var low = p.stock <= p.min_stock && p.min_stock > 0;
    var over = p.max_stock > 0 && p.stock > p.max_stock;
    var valor = (p.cost || 0) * (p.stock || 0);
    totalValor += valor;
    html += '<tr class="' + (low ? 'row-low-stock' : over ? 'row-over-stock' : '') + '">' +
      '<td>' + escHtml(p.barcode || '') + '</td>' +
      '<td>' + escHtml(p.name) + '</td>' +
      '<td>' + escHtml(p.description1 || '') + '</td>' +
      '<td>' + escHtml(p.description2 || '') + '</td>' +
      '<td style="' + (low ? 'color:var(--danger);font-weight:700' : '') + '">' + p.stock + '</td>' +
      '<td>' + p.min_stock + '</td>' +
      '<td>' + p.max_stock + '</td>' +
      '<td>' + escHtml(p.category_name || '') + '</td>' +
      '<td>' + escHtml(p.description || '') + '</td>' +
      '<td class="text-right"><button class="btn btn-sm btn-outline" onclick="showProductForm(' + p.id + ')">Editar</button> <button class="btn btn-sm btn-danger" onclick="deleteProduct(' + p.id + ')">&times;</button></td></tr>';
  }
  if (!html) html = '<tr><td colspan="10" class="empty-state">Sin productos. Use buscar o cree uno nuevo.</td></tr>';
  tbody.innerHTML = html;
  var sum = document.getElementById('productsSummary');
  if (sum) sum.textContent = products.length + ' productos | Valor stock: $' + totalValor.toFixed(2);
  initColumnResize();
}

function searchProducts() {
  var search = document.getElementById('prodSearch').value || '';
  var cat = document.getElementById('prodCatFilter').value || '';
  var path = '/products?search=' + encodeURIComponent(search);
  if (cat) path += '&category_id=' + cat;
  api('GET', path).then(function (products) {
    renderProducts(products || []);
  });
}

function escHtml(s) { if (!s) return ''; return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

function showProductForm(id) {
  var isEdit = !!id;
  var html = '<div class="form-grid">' +
    '<div class="form-group"><label>Codigo</label><input id="pf_barcode" class="w-full"></div>' +
    '<div class="form-group"><label>Nombre *</label><input id="pf_name" class="w-full"></div>' +
    '<div class="form-group"><label>Descripcion 1</label><input id="pf_description1" class="w-full"></div>' +
    '<div class="form-group"><label>Descripcion 2</label><input id="pf_description2" class="w-full"></div>' +
    '<div class="form-group"><label>Stock</label><input id="pf_stock" type="number" class="w-full"></div>' +
    '<div class="form-group"><label>Minimo</label><input id="pf_min_stock" type="number" class="w-full"></div>' +
    '<div class="form-group"><label>Maximo</label><input id="pf_max_stock" type="number" class="w-full"></div>' +
    '<div class="form-group"><label>Rubro/Familia</label><select id="pf_category" class="w-full"><option value="">Sin rubro</option></select></div>' +
    '<div class="form-group"><label>Observaciones</label><textarea id="pf_description" rows="2" style="resize:vertical" class="w-full"></textarea></div>' +
    '<div class="form-group"><label>Precio Venta *</label><input id="pf_price" type="number" step="0.01" class="w-full"></div>' +
    '<div class="form-group"><label>Costo Compra</label><input id="pf_cost" type="number" step="0.01" class="w-full"></div>' +
    '<div class="form-group"><label>Proveedor</label><select id="pf_supplier" class="w-full"><option value="">Sin proveedor</option></select></div>' +
    '</div>';
  openModal(isEdit ? 'Editar Producto' : 'Nuevo Producto', html, async function () {
    var data = {
      name: document.getElementById('pf_name').value.trim(),
      description: document.getElementById('pf_description').value.trim(),
      description1: document.getElementById('pf_description1').value.trim(),
      description2: document.getElementById('pf_description2').value.trim(),
      barcode: document.getElementById('pf_barcode').value.trim(),
      price: parseFloat(document.getElementById('pf_price').value) || 0,
      cost: parseFloat(document.getElementById('pf_cost').value) || 0,
      stock: parseInt(document.getElementById('pf_stock').value) || 0,
      min_stock: parseInt(document.getElementById('pf_min_stock').value) || 0,
      max_stock: parseInt(document.getElementById('pf_max_stock').value) || 0,
      category_id: document.getElementById('pf_category').value || null,
      supplier_id: document.getElementById('pf_supplier').value || null
    };
    if (!data.name) return showAlert('Nombre requerido', 'danger');
    var res = await api(isEdit ? 'PUT' : 'POST', isEdit ? '/products/' + id : '/products', data);
    if (res && res.success) { closeModal(); searchProducts(); showAlert(isEdit ? 'Producto actualizado' : 'Producto creado'); }
    else showAlert(res && res.error ? res.error : 'Error', 'danger');
  });
  api('GET', '/categories').then(function (cats) {
    if (!cats) return;
    var s = document.getElementById('pf_category');
    for (var i = 0; i < cats.length; i++) {
      var o = document.createElement('option');
      o.value = cats[i].id;
      o.textContent = cats[i].name;
      s.appendChild(o);
    }
  });
  api('GET', '/suppliers').then(function (sups) {
    if (!sups) return;
    var s = document.getElementById('pf_supplier');
    for (var i = 0; i < sups.length; i++) {
      var o = document.createElement('option');
      o.value = sups[i].id;
      o.textContent = sups[i].name;
      s.appendChild(o);
    }
  });
  if (isEdit) {
    api('GET', '/products/' + id).then(function (p) {
      if (!p) return;
      document.getElementById('pf_name').value = p.name || '';
      document.getElementById('pf_barcode').value = p.barcode || '';
      document.getElementById('pf_price').value = p.price || '';
      document.getElementById('pf_cost').value = p.cost || '';
      document.getElementById('pf_stock').value = p.stock || '';
      document.getElementById('pf_min_stock').value = p.min_stock || '';
      document.getElementById('pf_max_stock').value = p.max_stock || '';
      if (p.category_id) document.getElementById('pf_category').value = p.category_id;
      if (p.supplier_id) document.getElementById('pf_supplier').value = p.supplier_id;
      document.getElementById('pf_description').value = p.description || '';
      document.getElementById('pf_description1').value = p.description1 || '';
      document.getElementById('pf_description2').value = p.description2 || '';
    });
  }
}

async function deleteProduct(id) {
  if (!confirm('Eliminar producto?')) return;
  var res = await api('DELETE', '/products/' + id);
  if (res && res.success) { searchProducts(); showAlert('Producto eliminado'); }
}

function exportProducts() {
  var token = localStorage.getItem('token');
  if (!token) return;
  var a = document.createElement('a');
  a.href = '/api/export/products?token=' + encodeURIComponent(token);
  a.download = 'inventario.csv';
  a.click();
  showAlert('Descargando inventario...');
}

// ==================== CATEGORIES ====================
function viewCategories() {
  return '<div class="toolbar"><div class="spacer"></div><button class="btn btn-primary" onclick="showCategoryForm()">+ Nueva Categoria</button></div><div class="card"><div class="table-wrap"><table><thead><tr><th>Nombre</th><th>Descripcion</th><th class="text-right">Acciones</th></tr></thead><tbody id="categoriesTable"></tbody></table></div></div>';
}

async function loadCategories() {
  var cats = await api('GET', '/categories') || [];
  var html = '';
  for (var i = 0; i < cats.length; i++) {
    html += '<tr><td><strong>' + escHtml(cats[i].name) + '</strong></td><td>' + (cats[i].description || '-') + '</td><td class="text-right"><button class="btn btn-sm btn-outline" onclick="showCategoryForm(' + cats[i].id + ')">Editar</button> <button class="btn btn-sm btn-danger" onclick="deleteCategory(' + cats[i].id + ')">Eliminar</button></td></tr>';
  }
  document.getElementById('categoriesTable').innerHTML = html;
}

function showCategoryForm(id) {
  var isEdit = !!id;
  openModal(isEdit ? 'Editar Categoria' : 'Nueva Categoria',
    '<div class="form-group"><label>Nombre *</label><input id="cf_name" class="w-full"></div><div class="form-group mt-1"><label>Descripcion</label><textarea id="cf_description" rows="2" class="w-full"></textarea></div>',
    async function () {
      var n = document.getElementById('cf_name').value.trim();
      if (!n) return showAlert('Nombre requerido', 'danger');
      var r = await api(isEdit ? 'PUT' : 'POST', isEdit ? '/categories/' + id : '/categories', { name: n, description: document.getElementById('cf_description').value.trim() });
      if (r.success) { closeModal(); loadCategories(); showAlert(isEdit ? 'Categoria actualizada' : 'Categoria creada'); }
      else showAlert(r && r.error ? r.error : 'Error', 'danger');
    });
  if (isEdit) {
    api('GET', '/categories').then(function (cats) {
      if (!cats) return;
      for (var i = 0; i < cats.length; i++) {
        if (cats[i].id == id) {
          document.getElementById('cf_name').value = cats[i].name;
          document.getElementById('cf_description').value = cats[i].description || '';
          break;
        }
      }
    });
  }
}

async function deleteCategory(id) {
  if (!confirm('Eliminar categoria?')) return;
  var r = await api('DELETE', '/categories/' + id);
  if (r.success) { loadCategories(); showAlert('Categoria eliminada'); }
}

// ==================== SUPPLIERS ====================
function viewSuppliers() {
  return '<div class="toolbar"><input class="search-input" id="supSearch" placeholder="Buscar proveedor..." oninput="loadSuppliers()"><div class="spacer"></div><button class="btn btn-primary" onclick="showSupplierForm()">+ Nuevo Proveedor</button></div><div class="card"><div class="table-wrap"><table><thead><tr><th>Nombre</th><th>Contacto</th><th>Telefono</th><th>Email</th><th>Productos</th><th class="text-right">Acciones</th></tr></thead><tbody id="suppliersTable"></tbody></table></div></div>';
}

async function loadSuppliers() {
  var s = await api('GET', '/suppliers') || [];
  var html = '';
  for (var i = 0; i < s.length; i++) {
    html += '<tr><td><strong>' + escHtml(s[i].name) + '</strong></td><td>' + (s[i].contact || '-') + '</td><td>' + (s[i].phone || '-') + '</td><td>' + (s[i].email || '-') + '</td><td><span class="badge badge-info">' + (s[i].product_count || 0) + '</span></td><td class="text-right"><button class="btn btn-sm btn-outline" onclick="showSupplierForm(' + s[i].id + ')">Editar</button> <button class="btn btn-sm btn-danger" onclick="deleteSupplier(' + s[i].id + ')">Eliminar</button></td></tr>';
  }
  document.getElementById('suppliersTable').innerHTML = html;
}

function showSupplierForm(id) {
  var isEdit = !!id;
  openModal(isEdit ? 'Editar Proveedor' : 'Nuevo Proveedor',
    '<div class="form-grid"><div class="form-group"><label>Nombre *</label><input id="sf_name" class="w-full"></div><div class="form-group"><label>Contacto</label><input id="sf_contact" class="w-full"></div><div class="form-group"><label>Telefono</label><input id="sf_phone" class="w-full"></div><div class="form-group"><label>Email</label><input id="sf_email" type="email" class="w-full"></div></div><div class="form-group"><label>Direccion</label><textarea id="sf_address" rows="2" class="w-full"></textarea></div>',
    async function () {
      var data = {
        name: document.getElementById('sf_name').value.trim(),
        contact: document.getElementById('sf_contact').value.trim(),
        phone: document.getElementById('sf_phone').value.trim(),
        email: document.getElementById('sf_email').value.trim(),
        address: document.getElementById('sf_address').value.trim()
      };
      if (!data.name) return showAlert('Nombre requerido', 'danger');
      var r = await api(isEdit ? 'PUT' : 'POST', isEdit ? '/suppliers/' + id : '/suppliers', data);
      if (r.success) { closeModal(); loadSuppliers(); showAlert(isEdit ? 'Proveedor actualizado' : 'Proveedor creado'); }
    });
  if (isEdit) {
    api('GET', '/suppliers/' + id).then(function (s) {
      if (!s) return;
      document.getElementById('sf_name').value = s.name || '';
      document.getElementById('sf_contact').value = s.contact || '';
      document.getElementById('sf_phone').value = s.phone || '';
      document.getElementById('sf_email').value = s.email || '';
      document.getElementById('sf_address').value = s.address || '';
    });
  }
}

async function deleteSupplier(id) {
  if (!confirm('Eliminar proveedor?')) return;
  var r = await api('DELETE', '/suppliers/' + id);
  if (r.success) { loadSuppliers(); showAlert('Proveedor eliminado'); }
}

// ==================== CLIENTS ====================
function viewClients() {
   return '<div class="toolbar"><input class="search-input" id="cliSearch" placeholder="Buscar cliente..." oninput="loadClients()"><div class="spacer"></div><button class="btn btn-primary" onclick="showClientForm()">+ Nuevo Cliente</button><button class="btn btn-outline" onclick="exportClientsExcel()">Exportar Excel</button></div><div class="card"><div class="table-wrap"><table><thead><tr><th>Codigo</th><th>Nombre</th><th>CUIT</th><th>IVA</th><th>Razon Social</th><th>Telefono</th><th>WhatsApp</th><th>Localidad</th><th>Pago Pendiente</th><th class="text-right">Acciones</th></tr></thead><tbody id="clientsTable"></tbody></table></div></div>';
}

async function loadClients() {
  var search = (document.getElementById('cliSearch') && document.getElementById('cliSearch').value) || '';
  var clients = await api('GET', '/clients?search=' + encodeURIComponent(search)) || [];
  var html = '';
  for (var i = 0; i < clients.length; i++) {
    var c = clients[i];
    var bal = c.balance || 0;
    html += '<tr><td>' + escHtml(c.code) + '</td><td><strong>' + escHtml(c.name) + '</strong></td><td>' + escHtml(c.cuit || '-') + '</td><td><span class="badge badge-info">' + escHtml(c.iva || 'Consumidor Final') + '</span></td><td>' + escHtml(c.business_name) + '</td><td>' + (c.phone || '-') + '</td><td>' + (c.whatsapp || '-') + '</td><td>' + escHtml(c.locality) + '</td><td class="text-right"><span class="badge ' + (bal > 0 ? 'badge-danger' : 'badge-success') + '">$' + Number(bal).toFixed(2) + '</span>' + (bal > 0 ? ' <small style="color:var(--danger);font-weight:600">PENDIENTE</small>' : '') + '</td>' +
      '<td class="text-right">' +
      '<button class="btn btn-sm btn-outline" onclick="showClientForm(' + c.id + ')" title="Editar">Editar</button> ' +
      '<button class="btn btn-sm btn-outline" onclick="viewClientSales(' + c.id + ')" title="Ver Ventas">Ventas</button> ' +
      '<button class="btn btn-sm btn-outline" onclick="viewClientQuotes(' + c.id + ')" title="Ver Cotizaciones">Cotiz.</button> ' +
      '<button class="btn btn-sm btn-outline" onclick="viewClientAccount(' + c.id + ')" title="Ver Cuenta">Cuenta</button> ' +
      '<button class="btn btn-sm btn-outline" onclick="viewClientPayments(' + c.id + ')" title="Ver Recibos">Recibos</button> ' +
      (bal > 0 ? '<button class="btn btn-sm btn-success" onclick="collectPayment(' + c.id + ')" title="Cobrar">Cobrar</button> ' : '') +
      '<button class="btn btn-sm btn-danger" onclick="deleteClient(' + c.id + ')" title="Eliminar">Eliminar</button></td></tr>';
  }
  document.getElementById('clientsTable').innerHTML = html;
  initColumnResize();
}

function showClientForm(id) {
  var isEdit = !!id;
  var ivas = ['Consumidor Final', 'Responsable Inscripto', 'Responsable Monotributo', 'Exento', 'No Responsable', 'Sujeto Exento'];
  var ivaOpts = ivas.map(function(v) { return '<option value="' + v + '">' + v + '</option>'; }).join('');
  openModal(isEdit ? 'Editar Cliente' : 'Nuevo Cliente',
    '<div class="form-grid">' +
    '<div class="form-group"><label>Codigo</label><input id="clf_code" class="w-full"></div>' +
    '<div class="form-group"><label>Nombre *</label><input id="clf_name" class="w-full"></div>' +
    '<div class="form-group"><label>Razon Social</label><input id="clf_business" class="w-full"></div>' +
    '<div class="form-group"><label>CUIT</label><input id="clf_cuit" class="w-full"></div>' +
    '<div class="form-group"><label>IVA</label><select id="clf_iva" class="w-full">' + ivaOpts + '</select></div>' +
    '<div class="form-group"><label>Apodo / Nick</label><input id="clf_nick" class="w-full"></div>' +
    '<div class="form-group"><label>Telefono</label><input id="clf_phone" class="w-full"></div>' +
    '<div class="form-group"><label>Email</label><input id="clf_email" type="email" class="w-full"></div>' +
    '<div class="form-group"><label>Direccion</label><input id="clf_address" class="w-full"></div>' +
    '<div class="form-group"><label>Localidad</label><input id="clf_locality" class="w-full"></div>' +
    '<div class="form-group"><label>WhatsApp</label><input id="clf_whatsapp" class="w-full"></div>' +
    '</div>',
    async function () {
      var data = {
        code: document.getElementById('clf_code').value.trim(),
        name: document.getElementById('clf_name').value.trim(),
        business_name: document.getElementById('clf_business').value.trim(),
        cuit: document.getElementById('clf_cuit').value.trim(),
        iva: document.getElementById('clf_iva').value,
        nickname: document.getElementById('clf_nick').value.trim(),
        phone: document.getElementById('clf_phone').value.trim(),
        email: document.getElementById('clf_email').value.trim(),
        address: document.getElementById('clf_address').value.trim(),
        locality: document.getElementById('clf_locality').value.trim(),
        whatsapp: document.getElementById('clf_whatsapp').value.trim()
      };
      if (!data.name) return showAlert('Nombre requerido', 'danger');
      var r = await api(isEdit ? 'PUT' : 'POST', isEdit ? '/clients/' + id : '/clients', data);
      if (r.success) { closeModal(); loadClients(); showAlert(isEdit ? 'Cliente actualizado' : 'Cliente creado'); }
    });
  if (isEdit) {
    api('GET', '/clients/' + id).then(function (c) {
      if (!c) return;
      document.getElementById('clf_code').value = c.code || '';
      document.getElementById('clf_name').value = c.name || '';
      document.getElementById('clf_business').value = c.business_name || '';
      document.getElementById('clf_cuit').value = c.cuit || '';
      if (c.iva) document.getElementById('clf_iva').value = c.iva;
      document.getElementById('clf_nick').value = c.nickname || '';
      document.getElementById('clf_phone').value = c.phone || '';
      document.getElementById('clf_email').value = c.email || '';
      document.getElementById('clf_address').value = c.address || '';
      document.getElementById('clf_locality').value = c.locality || '';
      document.getElementById('clf_whatsapp').value = c.whatsapp || '';
    });
  }
}

async function deleteClient(id) {
  if (!confirm('Eliminar cliente?')) return;
  var r = await api('DELETE', '/clients/' + id);
  if (r.success) { loadClients(); showAlert('Cliente eliminado'); }
}

function collectPayment(clientId) {
  api('GET', '/clients/' + clientId).then(async function(c) {
    if (!c) return;
    var bal = c.balance || 0;
    if (bal <= 0) return showAlert('El cliente no tiene deuda pendiente', 'danger');
    var sales = await api('GET', '/clients/' + clientId + '/sales') || [];
    var payments = await api('GET', '/clients/' + clientId + '/payments') || [];
    // Ordenar ventas y pagos por fecha, calcular que ventas siguen impagas (FIFO)
    sales = sales.filter(function(s) { return s.payment_method === 'cuenta_corriente'; });
    sales.sort(function(a,b) { return new Date(a.created_at) - new Date(b.created_at); });
    payments.sort(function(a,b) { return new Date(a.created_at) - new Date(b.created_at); });
    var pagoIdx = 0;
    var pendingSales = [];
    for (var i = 0; i < sales.length; i++) {
      var resto = sales[i].total;
      while (resto > 0 && pagoIdx < payments.length) {
        var usar = Math.min(resto, payments[pagoIdx].amount);
        resto -= usar;
        payments[pagoIdx].amount -= usar;
        if (payments[pagoIdx].amount <= 0) pagoIdx++;
      }
      if (resto > 0) pendingSales.push({ sale: sales[i], resto: resto });
    }
    var prodsHtml = '';
    for (var i = 0; i < pendingSales.length; i++) {
      var ps = pendingSales[i];
      prodsHtml += '<tr style="background:rgba(14,165,233,0.05)"><td colspan="4" style="font-size:.8rem;font-weight:600;color:var(--primary-light)">Venta #' + ps.sale.id + ' - Pendiente: $' + ps.resto.toFixed(2) + '</td></tr>';
      if (ps.sale.items) {
        for (var j = 0; j < ps.sale.items.length; j++) {
          var it = ps.sale.items[j];
          prodsHtml += '<tr><td>' + escHtml(it.product_name) + '</td><td class="text-center">' + it.quantity + '</td><td class="text-right">$' + Number(it.price).toFixed(2) + '</td><td class="text-right">$' + Number(it.subtotal).toFixed(2) + '</td></tr>';
        }
      }
    }
    openModal('Cobrar a ' + escHtml(c.name),
      '<p><strong>Pendiente total:</strong> <span class="badge badge-danger" style="font-size:1rem">$' + bal.toFixed(2) + '</span></p>' +
      '<hr style="margin:.75rem 0;border:none;border-top:1px solid var(--border)">' +
      '<p style="font-weight:600;margin-bottom:.5rem;color:var(--text)">Materiales que debe (' + pendingSales.length + ' ventas impagas):</p>' +
      '<div style="max-height:250px;overflow-y:auto;margin-bottom:.75rem">' +
      '<table><thead><tr><th>Producto</th><th class="text-center">Cant</th><th class="text-right">Precio</th><th class="text-right">Subtotal</th></tr></thead><tbody>' + (prodsHtml || '<tr><td colspan="4" class="empty-state">Sin deuda</td></tr>') + '</tbody></table></div>' +
      '<hr style="margin:.75rem 0;border:none;border-top:1px solid var(--border)">' +
      '<div class="form-grid">' +
      '<div class="form-group"><label>Monto a cobrar *</label><input id="cp_amount" type="number" step="0.01" class="w-full" value="' + bal.toFixed(2) + '"></div>' +
      '<div class="form-group"><label>Forma de pago</label><select id="cp_method" class="w-full"><option value="efectivo">Efectivo</option><option value="tarjeta">Tarjeta</option><option value="transferencia">Transferencia</option><option value="cuenta_corriente">Cuenta Corriente</option></select></div>' +
      '</div>' +
      '<div class="form-group"><label>Notas</label><textarea id="cp_notes" rows="2" class="w-full" placeholder="Pago de cuenta corriente"></textarea></div>',
      async function() {
        var amount = parseFloat(document.getElementById('cp_amount').value);
        if (!amount || amount <= 0) return showAlert('Ingrese un monto valido', 'danger');
        var res = await api('POST', '/payments', { client_id: clientId, amount: amount, payment_method: document.getElementById('cp_method').value, notes: document.getElementById('cp_notes').value.trim() || 'Pago cuenta corriente' });
        if (res.success) {
          closeModal(); loadClients();
          var inv = res.invoice;
          if (inv) showAlert('Pago registrado - Factura ' + inv.invoiceLetter + ' ' + inv.invoiceNumber + ' emitida', 'success');
          else showAlert('Pago registrado correctamente');
        }
        else showAlert(res && res.error ? res.error : 'Error', 'danger');
      });
  });
}

function exportClientsExcel() {
  fetch('/api/export/clients', { headers: { 'Authorization': 'Bearer ' + token } })
    .then(r => r.blob())
    .then(b => {
      var a = document.createElement('a');
      a.href = URL.createObjectURL(b);
      a.download = 'clientes.csv';
      a.click();
    });
}

async function viewClientSales(clientId) {
  var sales = await api('GET', '/clients/' + clientId + '/sales') || [];
  var html = '<table><thead><tr><th>#</th><th>Productos</th><th>Total</th><th>Descuento</th><th>Metodo</th><th>Usuario</th><th>Fecha</th></tr></thead><tbody>';
  var total = 0;
  for (var i = 0; i < sales.length; i++) {
    total += Number(sales[i].total);
    var itemsHtml = '';
    if (sales[i].items) {
      for (var j = 0; j < sales[i].items.length; j++) {
        var it = sales[i].items[j];
        itemsHtml += (j > 0 ? '<br>' : '') + escHtml(it.product_name) + ' x' + it.quantity + ' ($' + Number(it.subtotal).toFixed(2) + ')';
      }
    }
    html += '<tr><td>' + sales[i].id + '</td><td style="max-width:250px;overflow:hidden;text-overflow:ellipsis;white-space:normal;font-size:.8rem">' + (itemsHtml || '-') + '</td><td><strong>$' + Number(sales[i].total).toFixed(2) + '</strong></td><td>' + Number(sales[i].discount || 0).toFixed(2) + '</td><td>' + fmtPay(sales[i].payment_method) + '</td><td>' + (sales[i].user_name || '-') + '</td><td style="font-size:.8rem">' + (sales[i].created_at || '') + '</td></tr>';
  }
  html += '</tbody></table>';
  if (!sales.length) html = '<div class="empty-state">Sin ventas registradas</div>';
  openModal('Ventas del Cliente', '<p><strong>Total vendido: $' + total.toFixed(2) + '</strong></p>' + html, null, '<button class="btn btn-outline" onclick="closeModal()">Cerrar</button>');
}

async function viewClientQuotes(clientId) {
  var quotes = await api('GET', '/clients/' + clientId + '/quotes') || [];
  var html = '<table><thead><tr><th>#</th><th>Total</th><th>Estado</th><th>Usuario</th><th>Notas</th><th>Fecha</th></tr></thead><tbody>';
  var total = 0;
  for (var i = 0; i < quotes.length; i++) {
    total += Number(quotes[i].total);
    html += '<tr><td>' + quotes[i].id + '</td><td><strong>$' + Number(quotes[i].total).toFixed(2) + '</strong></td><td><span class="badge ' + (quotes[i].status === 'aprobada' ? 'badge-success' : quotes[i].status === 'rechazada' ? 'badge-danger' : 'badge-warning') + '">' + (quotes[i].status || 'pendiente') + '</span></td><td>' + (quotes[i].user_name || '-') + '</td><td>' + escHtml(quotes[i].notes) + '</td><td style="font-size:.8rem">' + (quotes[i].created_at || '') + '</td></tr>';
  }
  html += '</tbody></table>';
  if (!quotes.length) html = '<div class="empty-state">Sin cotizaciones</div>';
  openModal('Cotizaciones del Cliente', '<p><strong>Total cotizado: $' + total.toFixed(2) + '</strong></p>' + html, null, '<button class="btn btn-outline" onclick="closeModal()">Cerrar</button>');
}

async function viewClientAccount(clientId) {
  var data = await api('GET', '/clients/' + clientId + '/account');
  if (!data) return;
  var html = '<p><strong>Cliente:</strong> ' + escHtml(data.client.name) + ' (' + data.client.code + ')</p>';
  html += '<p><strong>Saldo actual:</strong> <span class="badge ' + (data.balance > 0 ? 'badge-danger' : 'badge-success') + '" style="font-size:1rem">$' + Number(data.balance).toFixed(2) + '</span></p>';
  html += '<hr><table><thead><tr><th>Fecha</th><th>Descripcion</th><th class="text-right">Monto</th><th class="text-right">Saldo</th></tr></thead><tbody>';
  for (var i = 0; i < data.movements.length; i++) {
    var m = data.movements[i];
    html += '<tr><td style="font-size:.8rem">' + m.date + '</td><td>' + escHtml(m.desc) + '</td><td class="text-right ' + (m.amount < 0 ? '' : '') + '">' + (m.amount < 0 ? '' : '+') + '$' + Number(m.amount).toFixed(2) + '</td><td class="text-right"><strong>$' + Number(m.balance).toFixed(2) + '</strong></td></tr>';
  }
  html += '</tbody></table>';
  openModal('Cuenta Corriente', html, null, '<button class="btn btn-outline" onclick="closeModal()">Cerrar</button>');
}

async function viewClientPayments(clientId) {
  var payments = await api('GET', '/clients/' + clientId + '/payments') || [];
  var html = '<table><thead><tr><th>Monto</th><th>Metodo</th><th>Notas</th><th>Fecha</th></tr></thead><tbody>';
  var total = 0;
  for (var i = 0; i < payments.length; i++) {
    total += Number(payments[i].amount);
    html += '<tr><td><strong>$' + Number(payments[i].amount).toFixed(2) + '</strong></td><td>' + (payments[i].payment_method || '-') + '</td><td>' + escHtml(payments[i].notes) + '</td><td style="font-size:.8rem">' + (payments[i].created_at || '') + '</td></tr>';
  }
  html += '</tbody></table>';
  if (!payments.length) html = '<div class="empty-state">Sin pagos registrados</div>';
  openModal('Recibos / Pagos', '<p><strong>Total pagado: $' + total.toFixed(2) + '</strong></p>' + html, null, '<button class="btn btn-outline" onclick="closeModal()">Cerrar</button>');
}

// ==================== POS (Venta Rápida) ====================
var saleCart = [];

function viewPOS() {
  var today = new Date().toISOString().split('T')[0];
  return '<div style="max-width:900px;margin:0 auto">' +
    '<div class="card" style="margin-bottom:1rem">' +
    '<h3 style="margin-bottom:1rem;color:var(--text)">Buscar Producto</h3>' +
    '<div style="display:flex;gap:.5rem">' +
    '<input class="search-input" id="vs_search" placeholder="Buscar por codigo, descripcion 1 o descripcion 2..." style="flex:1" oninput="searchSaleProduct()">' +
    '<button class="btn btn-primary" onclick="searchSaleProduct()">Buscar</button>' +
    '</div>' +
    '<div id="vs_results" style="margin-top:.75rem;max-height:200px;overflow-y:auto"></div>' +
    '</div>' +
    '<div class="card" style="margin-bottom:1rem">' +
    '<h3 style="margin-bottom:1rem;color:var(--text)">Productos en Venta</h3>' +
    '<table><thead><tr><th>Producto</th><th>Cant</th><th>Precio</th><th>Subtotal</th><th></th></tr></thead><tbody id="vs_cart_items"></tbody></table>' +
    '<div style="text-align:right;font-weight:700;font-size:1.2rem;margin-top:.5rem;color:var(--primary-light)">Total: $<span id="vs_cart_total">0.00</span></div>' +
    '</div>' +
    '<div class="card">' +
    '<h3 style="margin-bottom:1rem;color:var(--text)">Completar Venta</h3>' +
    '<div class="form-grid">' +
    '<div class="form-group"><label>Fecha</label><input id="vs_date" type="date" class="w-full" value="' + today + '"></div>' +
    '<div class="form-group"><label>Forma Pago</label><select id="vs_payment" class="w-full"><option value="efectivo">Efectivo</option><option value="tarjeta">Tarjeta</option><option value="transferencia">Transferencia</option><option value="cuenta_corriente">Cuenta Corriente</option><option value="otro">Otro</option></select></div>' +
    '<div class="form-group"><label>Cliente *</label><select id="vs_client" class="w-full"><option value="">Seleccionar cliente (obligatorio)</option></select></div>' +
    '</div>' +
    '<button class="btn btn-success btn-lg w-full" onclick="quickSale()" id="btnQuickSale" style="margin-top:1rem">Completar Venta (' + saleCart.length + ' productos)</button>' +
    '</div></div>';
}

function renderSaleCart() {
  var tbody = document.getElementById('vs_cart_items');
  if (!tbody) return;
  var total = 0;
  var html = '';
  for (var i = 0; i < saleCart.length; i++) {
    var item = saleCart[i];
    var sub = item.qty * item.price;
    total += sub;
    html += '<tr><td><strong>' + escHtml(item.name) + '</strong>' +
      ((item.description1 || item.description2) ? '<br><small style="color:var(--text-muted)">' + escHtml(item.description1 || '') + (item.description1 && item.description2 ? ' | ' : '') + escHtml(item.description2 || '') + '</small>' : '') +
      '</td><td>' +
      '<button class="btn btn-sm btn-outline" onclick="saleCart[' + i + '].qty=Math.max(1,saleCart[' + i + '].qty-1);renderSaleCart()">-</button> ' +
      '<input type="number" min="1" value="' + item.qty + '" onchange="saleSetQty(' + i + ', this.value)" style="width:70px;text-align:center;padding:2px 4px;background:var(--bg, #fff);color:var(--text);border:1px solid var(--border);border-radius:4px" class="qty-input"> ' +
      '<button class="btn btn-sm btn-outline" onclick="saleCart[' + i + '].qty++;renderSaleCart()">+</button></td><td>$' + Number(item.price).toFixed(2) + '</td><td>$' + sub.toFixed(2) + '</td>' +
      '<td><button class="btn btn-sm btn-danger" onclick="saleCart.splice(' + i + ',1);renderSaleCart();updateQuickBtn()">&times;</button></td></tr>';
  }
  if (!html) html = '<tr><td colspan="5" class="empty-state">Sin productos. Busque y agregue productos arriba.</td></tr>';
  tbody.innerHTML = html;
  var totalEl = document.getElementById('vs_cart_total');
  if (totalEl) totalEl.textContent = total.toFixed(2);
  updateQuickBtn();
}

function updateQuickBtn() {
  var btn = document.getElementById('btnQuickSale');
  if (btn) btn.textContent = 'Completar Venta (' + saleCart.length + ' productos)';
}

var lastSearchResults = [];

async function searchSaleProduct() {
  var q = document.getElementById('vs_search').value.trim();
  if (!q) { document.getElementById('vs_results').innerHTML = ''; return; }
  var products = await api('GET', '/products?search=' + encodeURIComponent(q)) || [];
  lastSearchResults = products;
  var html = '';
  for (var i = 0; i < products.length; i++) {
    var p = products[i];
    var sinStock = p.stock <= 0;
    html += '<div class="prod-card" style="cursor:pointer;margin-bottom:4px" onclick="addSaleProductById(' + p.id + ')">' +
      '<div style="display:flex;justify-content:space-between;align-items:center">' +
      '<div><strong>' + escHtml(p.name) + '</strong>' +
      (sinStock ? ' <span class="badge badge-warning">Stock: ' + p.stock + '</span>' : '') +
      (p.barcode ? ' <small style="color:var(--text-muted)">Cod: ' + escHtml(p.barcode) + '</small>' : '') +
      (p.description1 ? ' <small style="color:var(--text-muted)">| ' + escHtml(p.description1) + '</small>' : '') +
      (p.description2 ? ' <small style="color:var(--text-muted)">| ' + escHtml(p.description2) + '</small>' : '') +
      '</div>' +
      '<div style="text-align:right"><div style="font-weight:700;color:var(--primary-light)">$' + Number(p.price).toFixed(2) + '</div><small style="color:var(--text-muted)">Stock: ' + p.stock + '</small></div>' +
      '</div></div>';
  }
  if (!html) html = '<div class="empty-state" style="padding:1rem">Sin resultados</div>';
  document.getElementById('vs_results').innerHTML = html;
}

function addSaleProductById(id) {
  var p = lastSearchResults.find(function(x) { return x.id === id; });
  if (!p) return;
  addSaleProduct(p.id, p.name, p.price, p.stock, p.description1, p.description2);
}

function addSaleProduct(id, name, price, stock, desc1, desc2) {
  for (var i = 0; i < saleCart.length; i++) {
    if (saleCart[i].product_id === id) {
      saleCart[i].qty++;
      renderSaleCart();
      document.getElementById('vs_search').value = '';
      document.getElementById('vs_results').innerHTML = '';
      return;
    }
  }
  saleCart.push({ product_id: id, name: name, qty: 1, price: price, description1: desc1 || '', description2: desc2 || '' });
  renderSaleCart();
  document.getElementById('vs_search').value = '';
  document.getElementById('vs_results').innerHTML = '';
}

function saleSetQty(i, val) {
  var q = parseInt(val, 10);
  if (isNaN(q) || q < 1) q = 1;
  if (i >= 0 && i < saleCart.length) { saleCart[i].qty = q; renderSaleCart(); }
}

function escJs(s) {
  if (!s) return '';
  return s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

async function initPOS() {
  saleCart = [];
  var clients = await api('GET', '/clients') || [];
  var csel = document.getElementById('vs_client');
  for (var i = 0; i < clients.length; i++) {
    var o = document.createElement('option');
    o.value = clients[i].id;
    o.textContent = clients[i].name;
    csel.appendChild(o);
  }
  renderSaleCart();
}

async function quickSale() {
  if (!saleCart.length) return showAlert('Agregue al menos un producto', 'danger');
  var clientEl = document.getElementById('vs_client');
  if (!clientEl.value) { showAlert('Debe seleccionar un cliente para la venta (cuenta corriente)', 'danger'); return; }
  var payment = document.getElementById('vs_payment').value;
  var clientId = clientEl.value;
  var clientName = clientEl.options[clientEl.selectedIndex].textContent;
  // Verificar stock (solo advertencia, no bloquea)
  var stockWarnings = [];
  for (var i = 0; i < saleCart.length; i++) {
    var item = saleCart[i];
    var p = await api('GET', '/products/' + item.product_id);
    if (p && item.qty > p.stock && p.stock >= 0) stockWarnings.push(item.name + ' (disp: ' + p.stock + ')');
  }
  // Mostrar confirmacion con detalle
  var total = 0;
  var itemsHtml = '';
  for (var i = 0; i < saleCart.length; i++) {
    var it = saleCart[i];
    var sub = it.qty * it.price;
    total += sub;
    itemsHtml += '<tr><td>' + escHtml(it.name) + ((it.description1 || it.description2) ? '<br><small style="color:var(--text-muted)">' + escHtml(it.description1 || '') + (it.description1 && it.description2 ? ' | ' : '') + escHtml(it.description2 || '') + '</small>' : '') + '</td><td class="text-center">' + it.qty + '</td><td class="text-right">$' + Number(it.price).toFixed(2) + '</td><td class="text-right">$' + sub.toFixed(2) + '</td></tr>';
  }
  var paymentLabels = { efectivo: 'Efectivo', tarjeta: 'Tarjeta', transferencia: 'Transferencia', cuenta_corriente: 'Cuenta Corriente', otro: 'Otro' };
  var pagoLabel = paymentLabels[payment] || payment;
  openModal('Confirmar Venta',
    '<p><strong>Cliente:</strong> ' + escHtml(clientName) + '<br><strong>Forma de pago:</strong> ' + pagoLabel + '</p>' +
    '<hr style="margin:.75rem 0;border:none;border-top:1px solid var(--border)">' +
    '<table><thead><tr><th>Producto</th><th class="text-center">Cant</th><th class="text-right">Precio</th><th class="text-right">Subtotal</th></tr></thead><tbody>' + itemsHtml +
    '<tr style="font-weight:700"><td colspan="3" class="text-right">TOTAL</td><td class="text-right" style="color:var(--primary-light);font-size:1.1rem">$' + total.toFixed(2) + '</td></tr>' +
    '</tbody></table>',
    async function () {
      var btn = document.getElementById('btnQuickSale');
      btn.disabled = true;
      btn.textContent = 'Procesando...';
      var items = saleCart.map(function(it) { return { product_id: it.product_id, product_name: it.name, quantity: it.qty, price: it.price }; });
      var res = await api('POST', '/sales', { items: items, discount: 0, payment_method: payment, client_id: clientId });
      btn.disabled = false;
      if (res && res.success) {
        closeModal();
        var invMsg = 'Venta registrada exitosamente';
        if (res.invoice) {
          invMsg += ' | Factura: ' + res.invoice.invoiceNumber + ' (' + (res.invoice.type === 'legal' ? 'Legal ' + res.invoice.invoiceLetter : 'Interna') + ')';
        }
        showAlert(invMsg);
        saleCart = [];
        renderSaleCart();
        document.getElementById('vs_search').value = '';
        document.getElementById('vs_results').innerHTML = '';
        btn.textContent = 'Completar Venta (0 productos)';
      } else {
        btn.textContent = 'Completar Venta (' + saleCart.length + ' productos)';
        showAlert(res && res.error ? res.error : 'Error al registrar venta', 'danger');
        closeModal();
      }
    },
    '<button class="btn btn-outline" onclick="closeModal()">Cancelar</button><button class="btn btn-success" onclick="modalSave()">Confirmar Venta</button>');
}

// ==================== PURCHASES ====================
var purCart = [];

function viewPurchases() {
  return '<div class="toolbar"><div class="spacer"></div><button class="btn btn-primary" onclick="showPurchaseForm()">+ Nueva Compra</button></div><div class="card"><div class="table-wrap"><table><thead><tr><th>#</th><th>Proveedor</th><th>Factura</th><th>Tipo</th><th>Producto</th><th>Usuario</th><th>Total</th><th>Fecha</th><th class="text-right">Acciones</th></tr></thead><tbody id="purchasesTable"></tbody></table></div></div>';
}

async function loadPurchases() {
  var purchases = await api('GET', '/purchases') || [];
  var html = '';
  for (var i = 0; i < purchases.length; i++) {
    var p = purchases[i];
    html += '<tr><td>' + p.id + '</td><td><strong>' + (p.supplier_name || '-') + '</strong></td><td>' + escHtml(p.invoice_number || '-') + '</td><td><span class="badge badge-info">' + (p.invoice_type || 'No Oficial') + '</span></td><td style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + escHtml(p.products_list || '-') + '</td><td>' + (p.user_name || '-') + '</td><td><strong>$' + Number(p.total).toFixed(2) + '</strong></td><td>' + (p.created_at || '-') + '</td><td class="text-right"><button class="btn btn-sm btn-outline" onclick="viewPurchase(' + p.id + ')">Ver</button> <button class="btn btn-sm btn-warning" onclick="editPurchase(' + p.id + ')">Editar</button></td></tr>';
  }
  document.getElementById('purchasesTable').innerHTML = html;
}

async function viewPurchase(id) {
  var purchase = await api('GET', '/purchases/' + id);
  if (!purchase) return;
  openModal('Compra #' + purchase.id,
    '<p><strong>Proveedor:</strong> ' + (purchase.supplier_name || '-') + '<br><strong>Factura:</strong> ' + (purchase.invoice_number || '-') + ' <span class="badge badge-info">' + (purchase.invoice_type || 'No Oficial') + '</span><br><strong>Usuario:</strong> ' + (purchase.user_name || '-') + '<br><strong>Total:</strong> $' + Number(purchase.total).toFixed(2) + '<br><strong>Fecha:</strong> ' + purchase.created_at + '</p>' +
    '<hr style="margin:.75rem 0;border:none;border-top:1px solid var(--border)"><table><thead><tr><th>Producto</th><th>Cantidad</th><th>Costo</th><th>Subtotal</th></tr></thead><tbody>' +
    (purchase.items || []).map(function (i) { return '<tr><td>' + i.product_name + '</td><td>' + i.quantity + '</td><td>$' + Number(i.cost).toFixed(2) + '</td><td>$' + Number(i.subtotal).toFixed(2) + '</td></tr>'; }).join('') +
    '</tbody></table>',
    null,
    '<button class="btn btn-outline" onclick="closeModal()">Cerrar</button>');
}

async function editPurchase(id) {
  var p = await api('GET', '/purchases/' + id);
  if (!p) return showAlert('Error al cargar compra', 'danger');
  var tiposFact = ['No Oficial', 'Factura A', 'Factura B', 'Factura C'];
  var tipoOpts = tiposFact.map(function(v) { return '<option value="' + v + '"' + (p.invoice_type === v ? ' selected' : '') + '>' + v + '</option>'; }).join('');
  purCart = (p.items || []).map(function(i) { return { product_id: i.product_id, product_name: i.product_name, quantity: i.quantity, cost: i.cost }; });
  openModal('Editar Compra #' + id,
    '<div class="form-grid">' +
    '<div class="form-group"><label>Proveedor</label><select id="purSupplier" class="w-full"><option value="">Seleccionar proveedor</option></select></div>' +
    '<div class="form-group"><label>Numero Factura</label><input id="purInvoiceNum" class="w-full" value="' + escHtml(p.invoice_number || '') + '"></div>' +
    '<div class="form-group"><label>Tipo Factura</label><select id="purInvoiceType" class="w-full">' + tipoOpts + '</select></div>' +
    '</div>' +
    '<hr style="margin:1rem 0;border:none;border-top:1px solid var(--border)">' +
    '<div style="display:flex;gap:.5rem;margin-bottom:.75rem;align-items:center">' +
    '<select id="purProduct" style="flex:1;padding:8px;border:2px solid var(--border);border-radius:8px;background:var(--bg);color:var(--text)"><option value="">Seleccionar producto</option></select>' +
    '<input id="purQty" type="number" placeholder="Cant" value="1" min="1" style="width:70px;padding:8px;border:2px solid var(--border);border-radius:8px;background:var(--bg);color:var(--text)">' +
    '<input id="purCost" type="number" step="0.01" placeholder="Costo" style="width:90px;padding:8px;border:2px solid var(--border);border-radius:8px;background:var(--bg);color:var(--text)">' +
    '<button class="btn btn-primary btn-sm" onclick="addPurchaseItem()">+</button></div>' +
    '<table><thead><tr><th>Producto</th><th>Cant</th><th>Costo</th><th>Subtotal</th><th></th></tr></thead><tbody id="purItems"></tbody></table>' +
    '<div style="text-align:right;font-weight:700;margin-top:.5rem">Total: $<span id="purTotal">0.00</span></div>',
    async function () {
      if (!purCart.length) return showAlert('Agregue al menos un producto', 'danger');
      var supplier_id = document.getElementById('purSupplier').value || null;
      var invoice_number = document.getElementById('purInvoiceNum').value.trim();
      var invoice_type = document.getElementById('purInvoiceType').value;
      var res = await api('PUT', '/purchases/' + id, { supplier_id: supplier_id, items: purCart, invoice_number: invoice_number, invoice_type: invoice_type });
      if (res.success) { closeModal(); loadPurchases(); showAlert('Compra actualizada'); }
      else showAlert(res && res.error ? res.error : 'Error', 'danger');
    });
  api('GET', '/suppliers').then(function (sups) {
    if (!sups) return;
    var sel = document.getElementById('purSupplier');
    for (var i = 0; i < sups.length; i++) {
      var o = document.createElement('option');
      o.value = sups[i].id;
      o.textContent = sups[i].name;
      if (sups[i].id == p.supplier_id) o.selected = true;
      sel.appendChild(o);
    }
  });
  api('GET', '/products').then(function (prods) {
    if (!prods) return;
    var sel = document.getElementById('purProduct');
    for (var i = 0; i < prods.length; i++) {
      var o = document.createElement('option');
      o.value = prods[i].id;
      o.textContent = prods[i].name + ' (Stock: ' + prods[i].stock + ')';
      o.setAttribute('data-name', prods[i].name);
      sel.appendChild(o);
    }
  });
  renderPurCart();
}

function showPurchaseForm() {
  var tiposFact = ['No Oficial', 'Factura A', 'Factura B', 'Factura C'];
  var tipoOpts = tiposFact.map(function(v) { return '<option value="' + v + '">' + v + '</option>'; }).join('');
  purCart = [];
  openModal('Nueva Compra',
    '<div class="form-grid">' +
    '<div class="form-group"><label>Proveedor</label><select id="purSupplier" class="w-full"><option value="">Seleccionar proveedor</option></select></div>' +
    '<div class="form-group"><label>Numero Factura</label><input id="purInvoiceNum" class="w-full"></div>' +
    '<div class="form-group"><label>Tipo Factura</label><select id="purInvoiceType" class="w-full">' + tipoOpts + '</select></div>' +
    '</div>' +
    '<hr style="margin:1rem 0;border:none;border-top:1px solid var(--border)">' +
    '<div style="display:flex;gap:.5rem;margin-bottom:.75rem;align-items:center">' +
    '<select id="purProduct" style="flex:1;padding:8px;border:2px solid var(--border);border-radius:8px;background:var(--bg);color:var(--text)"><option value="">Seleccionar producto</option></select>' +
    '<input id="purQty" type="number" placeholder="Cant" value="1" min="1" style="width:70px;padding:8px;border:2px solid var(--border);border-radius:8px;background:var(--bg);color:var(--text)">' +
    '<input id="purCost" type="number" step="0.01" placeholder="Costo" style="width:90px;padding:8px;border:2px solid var(--border);border-radius:8px;background:var(--bg);color:var(--text)">' +
    '<button class="btn btn-primary btn-sm" onclick="addPurchaseItem()">+</button></div>' +
    '<table><thead><tr><th>Producto</th><th>Cant</th><th>Costo</th><th>Subtotal</th><th></th></tr></thead><tbody id="purItems"></tbody></table>' +
    '<div style="text-align:right;font-weight:700;margin-top:.5rem">Total: $<span id="purTotal">0.00</span></div>',
    async function () {
      if (!purCart.length) return showAlert('Agregue al menos un producto', 'danger');
      var supplier_id = document.getElementById('purSupplier').value || null;
      var invoice_number = document.getElementById('purInvoiceNum').value.trim();
      var invoice_type = document.getElementById('purInvoiceType').value;
      var res = await api('POST', '/purchases', { supplier_id: supplier_id, items: purCart, invoice_number: invoice_number, invoice_type: invoice_type });
      if (res.success) { closeModal(); loadPurchases(); showAlert('Compra registrada'); }
      else showAlert(res && res.error ? res.error : 'Error', 'danger');
    });
  api('GET', '/suppliers').then(function (sups) {
    if (!sups) return;
    var sel = document.getElementById('purSupplier');
    for (var i = 0; i < sups.length; i++) {
      var o = document.createElement('option');
      o.value = sups[i].id;
      o.textContent = sups[i].name;
      sel.appendChild(o);
    }
  });
  api('GET', '/products').then(function (prods) {
    if (!prods) return;
    var sel = document.getElementById('purProduct');
    for (var i = 0; i < prods.length; i++) {
      var o = document.createElement('option');
      o.value = prods[i].id;
      o.textContent = prods[i].name + ' (Stock: ' + prods[i].stock + ')';
      o.setAttribute('data-name', prods[i].name);
      sel.appendChild(o);
    }
  });
}

function addPurchaseItem() {
  var sel = document.getElementById('purProduct');
  var qty = parseInt(document.getElementById('purQty').value) || 1;
  var cost = parseFloat(document.getElementById('purCost').value);
  if (!sel.value) return showAlert('Seleccione un producto', 'danger');
  if (!cost || cost <= 0) return showAlert('Ingrese un costo valido', 'danger');
  var name = sel.options[sel.selectedIndex].getAttribute('data-name');
  purCart.push({ product_id: parseInt(sel.value), product_name: name, quantity: qty, cost: cost });
  renderPurCart();
  sel.value = '';
  document.getElementById('purQty').value = '1';
  document.getElementById('purCost').value = '';
}

function removePurItem(i) { purCart.splice(i, 1); renderPurCart(); }

function renderPurCart() {
  var tbody = document.getElementById('purItems');
  var total = 0;
  var html = '';
  for (var i = 0; i < purCart.length; i++) {
    var sub = purCart[i].quantity * purCart[i].cost;
    total += sub;
    html += '<tr><td>' + purCart[i].product_name + '</td><td>' + purCart[i].quantity + '</td><td>$' + Number(purCart[i].cost).toFixed(2) + '</td><td>$' + sub.toFixed(2) + '</td><td><button class="btn btn-sm btn-danger" onclick="removePurItem(' + i + ')">&times;</button></td></tr>';
  }
  tbody.innerHTML = html;
  document.getElementById('purTotal').textContent = total.toFixed(2);
}

// ==================== SALES ====================
var payLabels = { efectivo: 'Efectivo', tarjeta: 'Tarjeta', transferencia: 'Transferencia', cuenta_corriente: 'Cuenta Corriente', cheque: 'Cheque', otro: 'Otro' };

function fmtPay(m) { return payLabels[m] || m; }

function viewSales() {
  return '<div class="toolbar"><input type="date" id="saleFrom" onchange="loadSales()"><input type="date" id="saleTo" onchange="loadSales()"><div class="spacer"></div><button class="btn btn-outline" onclick="document.getElementById(\'saleFrom\').value=\'\';document.getElementById(\'saleTo\').value=\'\';loadSales()">Limpiar</button></div><div class="card"><div class="table-wrap"><table><thead><tr><th>#</th><th>Cliente</th><th>Usuario</th><th>Total</th><th>Desc.</th><th>Metodo</th><th>Fecha</th><th class="text-right">Acciones</th></tr></thead><tbody id="salesTable"></tbody></table></div></div>';
}

async function loadSales() {
  var from = (document.getElementById('saleFrom') && document.getElementById('saleFrom').value) || '';
  var to = (document.getElementById('saleTo') && document.getElementById('saleTo').value) || '';
  var path = '/sales?limit=100';
  if (from) path += '&from=' + from;
  if (to) path += '&to=' + to;
  var sales = await api('GET', path) || [];
  var html = '';
  for (var i = 0; i < sales.length; i++) {
    html += '<tr><td>' + sales[i].id + '</td><td>' + (sales[i].client_name || 'General') + '</td><td>' + (sales[i].user_name || '-') + '</td><td><strong>$' + Number(sales[i].total).toFixed(2) + '</strong></td><td>' + Number(sales[i].discount || 0).toFixed(2) + '</td><td><span class="badge badge-info">' + fmtPay(sales[i].payment_method) + '</span></td><td style="font-size:.8rem">' + (sales[i].created_at || '-') + '</td><td class="text-right"><button class="btn btn-sm btn-outline" onclick="viewSale(' + sales[i].id + ')">Ver</button></td></tr>';
  }
  document.getElementById('salesTable').innerHTML = html;
}

async function viewSale(id) {
  var sale = await api('GET', '/sales/' + id);
  if (!sale) return;
  var itemsHtml = '';
  if (sale.items) {
    for (var i = 0; i < sale.items.length; i++) {
      itemsHtml += '<tr><td>' + sale.items[i].product_name + '</td><td>' + sale.items[i].quantity + '</td><td>$' + Number(sale.items[i].price).toFixed(2) + '</td><td>$' + Number(sale.items[i].subtotal).toFixed(2) + '</td></tr>';
    }
  }
  openModal('Venta #' + sale.id,
    '<p><strong>Cliente:</strong> ' + (sale.client_name || 'General') + '<br><strong>Usuario:</strong> ' + (sale.user_name || '-') + '<br><strong>Metodo de pago:</strong> ' + fmtPay(sale.payment_method) + '<br><strong>Fecha:</strong> ' + sale.created_at + '</p>' +
    '<hr style="margin:.75rem 0;border:none;border-top:1px solid var(--border)">' +
    '<table><thead><tr><th>Producto</th><th>Cantidad</th><th>Precio</th><th>Subtotal</th></tr></thead><tbody>' + itemsHtml + '</tbody></table>' +
    '<hr style="margin:.75rem 0;border:none;border-top:1px solid var(--border)">' +
    '<div style="display:flex;justify-content:space-between;font-weight:700"><span>Subtotal: $' + (Number(sale.total) + Number(sale.discount || 0)).toFixed(2) + '</span><span>Descuento: $' + Number(sale.discount || 0).toFixed(2) + '</span><span>Total: $' + Number(sale.total).toFixed(2) + '</span></div>' +
    '<div style="text-align:center;margin-top:1rem"><button class="btn btn-outline" onclick="printTicket(' + sale.id + ')">Imprimir Ticket</button></div>',
    null,
    '<button class="btn btn-outline" onclick="closeModal()">Cerrar</button>');
}

function printHtml(html) {
  var iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = 'none';
  iframe.style.opacity = '0';
  document.body.appendChild(iframe);
  iframe.contentDocument.open();
  iframe.contentDocument.write(html);
  iframe.contentDocument.close();
  setTimeout(function() {
    iframe.contentWindow.print();
    setTimeout(function() { document.body.removeChild(iframe); }, 1000);
  }, 500);
}

function ticketHeader() {
  return '<div style="text-align:center;margin-bottom:8px">' +
    '<img src="/logo-ticket.png" style="width:80px;height:80px;border-radius:50%;object-fit:cover;margin-bottom:4px" onerror="this.style.display=\'none\'">' +
    '<h1 style="font-size:16px;margin:2px 0;letter-spacing:1px">CAÑOS EMBALSE</h1>' +
    '<p style="font-size:10px;margin:2px 0;color:#555">Hipolito Yrigoyen 546</p>' +
    '<p style="font-size:10px;margin:2px 0;color:#555">Tel: 3571 637747</p>' +
    '<p style="font-size:10px;margin:2px 0;color:#555">canosembalse@gmail.com</p>' +
    '<div style="font-size:9px;margin:6px 0;padding:3px 0;border-top:1px dashed #000;border-bottom:1px dashed #000;color:#999;font-weight:600">DOCUMENTO NO VALIDO COMO FACTURA</div>' +
    '</div>';
}

async function printTicket(id) {
  var sale = await api('GET', '/sales/' + id);
  if (!sale) return;
  var itemsHtml = '';
  if (sale.items) {
    for (var i = 0; i < sale.items.length; i++) {
      itemsHtml += '<tr><td>' + escHtml(sale.items[i].product_name) + '</td><td class="r">' + sale.items[i].quantity + '</td><td class="r">$' + Number(sale.items[i].price).toFixed(2) + '</td><td class="r">$' + Number(sale.items[i].subtotal).toFixed(2) + '</td></tr>';
    }
  }
  printHtml('<html><head><title>Ticket #' + sale.id + '</title>' +
    '<style>body{font-family:monospace;font-size:12px;margin:0;padding:12px 16px;max-width:300px}*{box-sizing:border-box}table{width:100%;border-collapse:collapse}th,td{padding:3px 0;text-align:left}.r{text-align:right}.line{border-top:1px dashed #000;margin:8px 0}.total{font-weight:700;font-size:14px}.footer{text-align:center;margin-top:10px;font-size:10px;color:#666;border-top:1px dashed #000;padding-top:8px}.info{font-size:11px;line-height:1.5;margin:0}</style></head><body>' +
    ticketHeader() +
    '<p class="info"><strong>Ticket #' + sale.id + '</strong><br>Fecha: ' + (sale.created_at || '') + '<br>Vendedor: ' + (sale.user_name || '-') + '<br>Cliente: ' + (sale.client_name || 'General') + '<br>Pago: ' + fmtPay(sale.payment_method) + '</p>' +
    '<div class="line"></div><table><tr><th>Producto</th><th class="r">Cant</th><th class="r">Precio</th><th class="r">Subtotal</th></tr>' + itemsHtml + '</table>' +
    '<div class="line"></div>' +
    '<p style="display:flex;justify-content:space-between"><span>Subtotal:</span><span>$' + (Number(sale.total) + Number(sale.discount || 0)).toFixed(2) + '</span></p>' +
    (sale.discount > 0 ? '<p style="display:flex;justify-content:space-between"><span>Descuento:</span><span>-$' + Number(sale.discount).toFixed(2) + '</span></p>' : '') +
    '<p class="total" style="display:flex;justify-content:space-between"><span>TOTAL:</span><span>$' + Number(sale.total).toFixed(2) + '</span></p>' +
    '<div class="footer">Gracias por su compra</div></body></html>');
}

async function printInvoiceTicket(id) {
  var inv = await api('GET', '/invoices/' + id);
  if (!inv) return;
  var itemsHtml = '';
  var n = 0;
  if (inv.items) {
    for (var i = 0; i < inv.items.length; i++) {
      n++;
      itemsHtml += '<tr><td>' + n + '</td><td>' + escHtml(inv.items[i].product_name) + '</td><td class="r">' + inv.items[i].quantity + '</td><td class="r">$' + Number(inv.items[i].price).toFixed(2) + '</td><td class="r">$' + Number(inv.items[i].subtotal).toFixed(2) + '</td></tr>';
    }
  }
  var tipoLabel = inv.invoice_type === 'legal' ? (inv.invoice_letter ? 'Factura ' + inv.invoice_letter : 'Legal') : 'Interna';
  var legal = inv.invoice_type === 'legal' && inv.cae;
  var caeText = inv.cae ? 'CAE: ' + inv.cae : '';
  var caeVtoText = inv.cae_vto ? 'Vto CAE: ' + inv.cae_vto : '';
  printHtml('<html><head><title>Factura ' + inv.invoice_number + '</title>' +
    '<style>' +
    '@page{size:A4;margin:15mm}' +
    'body{font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#000;margin:0}' +
    '.top{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #000;padding-bottom:10px}' +
    '.company h1{font-size:20px;margin:0;letter-spacing:1px}' +
    '.company p{margin:2px 0;font-size:11px;color:#333}' +
    '.invbox{border:1.5px solid #000;padding:8px 14px;text-align:center;min-width:230px}' +
    '.invbox .tt{font-size:12px;font-weight:600;margin-bottom:2px}' +
    '.invbox .num{font-size:19px;font-weight:700}' +
    '.invbox .dt{font-size:11px;color:#333}' +
    '.sections{display:flex;gap:16px;margin:12px 0}' +
    '.box{flex:1;border:1px solid #999;padding:8px 12px}' +
    '.box h3{margin:0 0 6px;font-size:10.5px;text-transform:uppercase;color:#444;border-bottom:1px solid #ccc;padding-bottom:3px}' +
    '.box p{margin:2px 0;font-size:12px}' +
    'table.items{width:100%;border-collapse:collapse;margin-top:10px}' +
    'table.items th,table.items td{border:1px solid #000;padding:6px 8px;text-align:left;font-size:11px}' +
    'table.items th{background:#eee}' +
    '.r{text-align:right}' +
    '.totals{margin-top:10px;margin-left:auto;width:46%}' +
    '.trow{display:flex;justify-content:space-between;padding:4px 8px;font-size:12px}' +
    '.trow.grand{border-top:2px solid #000;font-weight:700;font-size:14px;margin-top:4px}' +
    '.foot{margin-top:16px;font-size:10px;color:#555;border-top:1px solid #999;padding-top:8px}' +
    '.discl{margin-top:6px;font-size:10px;font-weight:600;color:#c00}' +
    '</style></head><body>' +
    '<div class="top">' +
    '<div class="company">' +
    (inv.client_iva && inv.client_iva !== 'Consumidor Final' ? '<p style="font-size:10px;margin:0 0 4px"><strong>CUIT:</strong> 20123456789</p>' : '') +
    '<h1>CAÑOS EMBALSE</h1>' +
    '<p>Hipolito Yrigoyen 546</p>' +
    '<p>Tel: 3571 637747 | canosembalse@gmail.com</p>' +
    '</div>' +
    '<div class="invbox">' +
    '<div class="tt">' + tipoLabel + '</div>' +
    '<div class="num">' + escHtml(inv.invoice_number) + '</div>' +
    '<div class="dt">Fecha: ' + (inv.created_at || '') + '</div>' +
    (caeText ? '<div class="dt">' + caeText + '</div><div class="dt">' + caeVtoText + '</div>' : '') +
    '</div>' +
    '</div>' +
    '<div class="sections">' +
    '<div class="box"><h3>Datos del Cliente</h3>' +
    '<p><strong>' + escHtml(inv.client_name) + '</strong></p>' +
    '<p>CUIT: ' + (inv.client_cuit || '-') + '</p>' +
    '<p>Condicion IVA: ' + (inv.client_iva || 'Consumidor Final') + '</p>' +
    '</div>' +
    '<div class="box"><h3>Datos de la Venta</h3>' +
    '<p>Vendedor: ' + (inv.user_name || '-') + '</p>' +
    '<p>Forma de pago: ' + fmtPay(inv.payment_method) + '</p>' +
    '</div>' +
    '</div>' +
    '<table class="items"><thead><tr><th style="width:34px">#</th><th>Detalle</th><th class="r" style="width:60px">Cant.</th><th class="r" style="width:90px">Precio</th><th class="r" style="width:110px">Subtotal</th></tr></thead><tbody>' + (itemsHtml || '<tr><td colspan="5" style="text-align:center">Sin items</td></tr>') + '</tbody></table>' +
    '<div class="totals">' +
    '<div class="trow"><span>Subtotal:</span><span>$' + Number(inv.subtotal || inv.total).toFixed(2) + '</span></div>' +
    (inv.iva_total > 0 ? '<div class="trow"><span>IVA:</span><span>$' + Number(inv.iva_total).toFixed(2) + '</span></div>' : '') +
    '<div class="trow grand"><span>TOTAL:</span><span>$' + Number(inv.total).toFixed(2) + '</span></div>' +
    '</div>' +
    '<div class="foot">Documento emitido por el Sistema POS de Caños Embalse' +
    (legal ? '' : '<div class="discl">DOCUMENTO NO VALIDO COMO FACTURA</div>') +
    '</div></body></html>');
}

function shareWhatsApp(text) {
  window.open('https://wa.me/543571637747?text=' + encodeURIComponent(text), '_blank');
}

function shareEmail(inv) {
  var subject = 'Factura ' + inv.invoice_number + ' - Caños Embalse';
  var body = 'Factura: ' + inv.invoice_number + '\n';
  body += 'Cliente: ' + inv.client_name + '\n';
  body += 'Total: $' + Number(inv.total).toFixed(2) + '\n';
  body += 'Fecha: ' + inv.created_at + '\n\n';
  if (inv.items) {
    body += 'Productos:\n';
    for (var i = 0; i < inv.items.length; i++) {
      body += inv.items[i].product_name + ' x' + inv.items[i].quantity + ' $' + Number(inv.items[i].subtotal).toFixed(2) + '\n';
    }
  }
  body += '\nCaños Embalse\nHipolito Yrigoyen 546\nTel: 3571 637747\ncanosembalse@gmail.com';
  window.open('mailto:canosembalse@gmail.com?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(body), '_blank');
}

// ==================== QUOTES ====================
function viewQuotes() {
  return '<div class="toolbar"><div class="spacer"></div><button class="btn btn-primary" onclick="showQuoteForm()">+ Nueva Cotizacion</button></div><div class="card"><div class="table-wrap"><table><thead><tr><th>#</th><th>Cliente</th><th>Total</th><th>Estado</th><th>Usuario</th><th>Fecha</th><th class="text-right">Acciones</th></tr></thead><tbody id="quotesTable"></tbody></table></div></div>';
}

async function loadQuotes() {
  var quotes = await api('GET', '/quotes') || [];
  var html = '';
  for (var i = 0; i < quotes.length; i++) {
    var q = quotes[i];
    html += '<tr><td>' + q.id + '</td><td>' + escHtml(q.client_name || '-') + '</td><td><strong>$' + Number(q.total).toFixed(2) + '</strong></td><td><span class="badge ' + (q.status === 'aprobada' ? 'badge-success' : q.status === 'rechazada' ? 'badge-danger' : 'badge-warning') + '">' + (q.status || 'pendiente') + '</span></td><td>' + (q.user_name || '-') + '</td><td style="font-size:.8rem">' + (q.created_at || '') + '</td><td class="text-right"><button class="btn btn-sm btn-outline" onclick="viewQuoteDetail(' + q.id + ')">Ver</button> <button class="btn btn-sm btn-primary" onclick="editQuote(' + q.id + ')">Editar</button> <button class="btn btn-sm btn-outline" onclick="setQuoteStatus(' + q.id + ')">Estado</button> <button class="btn btn-sm btn-outline" onclick="exportQuotePdf(' + q.id + ')">PDF</button> <button class="btn btn-sm btn-danger" onclick="deleteQuote(' + q.id + ')">Eliminar</button></td></tr>';
  }
  document.getElementById('quotesTable').innerHTML = html;
}

function showQuoteForm() {
  var quoteCart = [];
  openModal('Nueva Cotizacion',
    '<div class="form-group"><label>Cliente</label><select id="qtClient" class="w-full"><option value="">Sin cliente</option></select></div>' +
    '<hr style="margin:1rem 0;border:none;border-top:1px solid var(--border)">' +
    '<div style="display:flex;gap:.5rem;margin-bottom:.75rem">' +
    '<select id="qtProduct" style="flex:1;padding:8px;border:2px solid var(--border);border-radius:8px;background:var(--bg);color:var(--text)"><option value="">Producto</option></select>' +
    '<input id="qtQty" type="number" value="1" min="1" style="width:70px;padding:8px;border:2px solid var(--border);border-radius:8px;background:var(--bg);color:var(--text)">' +
    '<input id="qtPrice" type="number" step="0.01" placeholder="Precio" style="width:90px;padding:8px;border:2px solid var(--border);border-radius:8px;background:var(--bg);color:var(--text)">' +
    '<button class="btn btn-primary btn-sm" onclick="addQuoteItem()">+</button></div>' +
    '<table><thead><tr><th>Producto</th><th>Cant</th><th>Precio</th><th>Subtotal</th><th></th></tr></thead><tbody id="qtItems"></tbody></table>' +
    '<div style="text-align:right;font-weight:700;margin-top:.5rem">Total: $<span id="qtTotal">0.00</span></div>' +
    '<div class="form-group mt-1"><label>Notas</label><textarea id="qtNotes" rows="2" class="w-full"></textarea></div>',
    async function () {
      if (!quoteCart.length) return showAlert('Agregue al menos un producto', 'danger');
      var client_id = document.getElementById('qtClient').value || null;
      var notes = document.getElementById('qtNotes').value.trim();
      var res = await api('POST', '/quotes', { client_id: client_id, items: quoteCart, notes: notes });
      if (res.success) { closeModal(); loadQuotes(); showAlert('Cotizacion creada'); }
      else showAlert(res && res.error ? res.error : 'Error', 'danger');
    });

  api('GET', '/clients').then(function (clients) {
    if (!clients) return;
    var sel = document.getElementById('qtClient');
    for (var i = 0; i < clients.length; i++) {
      var o = document.createElement('option');
      o.value = clients[i].id;
      o.textContent = clients[i].name;
      sel.appendChild(o);
    }
  });
  api('GET', '/products').then(function (prods) {
    if (!prods) return;
    var sel = document.getElementById('qtProduct');
    for (var i = 0; i < prods.length; i++) {
      var o = document.createElement('option');
      o.value = prods[i].id;
      o.textContent = prods[i].name;
      o.setAttribute('data-price', prods[i].price);
      sel.appendChild(o);
    }
  });

  window.quoteCart = quoteCart;
}

function addQuoteItem() {
  var sel = document.getElementById('qtProduct');
  var qty = parseInt(document.getElementById('qtQty').value) || 1;
  var price = parseFloat(document.getElementById('qtPrice').value);
  if (!sel.value) return showAlert('Seleccione un producto', 'danger');
  if (!price || price <= 0) {
    price = parseFloat(sel.options[sel.selectedIndex].getAttribute('data-price')) || 0;
    if (!price || price <= 0) return showAlert('Ingrese un precio valido', 'danger');
  }
  var name = sel.options[sel.selectedIndex].textContent;
  window.quoteCart.push({ product_id: parseInt(sel.value), product_name: name, quantity: qty, price: price });
  renderQuoteCart();
  sel.value = '';
  document.getElementById('qtQty').value = '1';
  document.getElementById('qtPrice').value = '';
}

function renderQuoteCart() {
  var cart = window.quoteCart || [];
  var tbody = document.getElementById('qtItems');
  var total = 0;
  var html = '';
  for (var i = 0; i < cart.length; i++) {
    var sub = cart[i].quantity * cart[i].price;
    total += sub;
    html += '<tr><td>' + cart[i].product_name + '</td><td>' + cart[i].quantity + '</td><td>$' + Number(cart[i].price).toFixed(2) + '</td><td>$' + sub.toFixed(2) + '</td><td><button class="btn btn-sm btn-danger" onclick="removeQtItem(' + i + ')">&times;</button></td></tr>';
  }
  tbody.innerHTML = html;
  document.getElementById('qtTotal').textContent = total.toFixed(2);
}

function removeQtItem(i) { window.quoteCart.splice(i, 1); renderQuoteCart(); }

async function viewQuoteDetail(id) {
  var q = await api('GET', '/quotes/' + id);
  if (!q) return;
  var html = '<p><strong>Cliente:</strong> ' + escHtml(q.client_name || '-') + '<br><strong>Estado:</strong> ' + (q.status || 'pendiente') + '<br><strong>Notas:</strong> ' + escHtml(q.notes || '-') + '<br><strong>Fecha:</strong> ' + q.created_at + '</p>' +
    '<hr><table><thead><tr><th>Producto</th><th>Cant</th><th>Precio</th><th>Subtotal</th></tr></thead><tbody>' +
    (q.items || []).map(function (i) { return '<tr><td>' + i.product_name + '</td><td>' + i.quantity + '</td><td>$' + Number(i.price).toFixed(2) + '</td><td>$' + Number(i.subtotal).toFixed(2) + '</td></tr>'; }).join('') +
    '</tbody></table><hr><p style="text-align:right;font-weight:700;font-size:1.1rem">Total: $' + Number(q.total).toFixed(2) + '</p>';
  openModal('Cotizacion #' + q.id, html, null, '<button class="btn btn-outline" onclick="closeModal()">Cerrar</button>');
}

async function setQuoteStatus(id) {
  var status = prompt('Estado (pendiente, aprobada, rechazada):');
  if (!status) return;
  status = status.toLowerCase();
  if (!['pendiente', 'aprobada', 'rechazada'].includes(status)) return showAlert('Estado invalido', 'danger');
  var r = await api('PUT', '/quotes/' + id + '/status', { status: status });
  if (!r.success) return showAlert(r && r.error ? r.error : 'Error', 'danger');
  if (status === 'aprobada') {
    var q = await api('GET', '/quotes/' + id);
    if (q && q.items && q.items.length) {
      if (!q.client_id) { loadQuotes(); showAlert('Cotizacion aprobada. No se genero venta: sin cliente asignado', 'warning'); return; }
      var saleRes = await api('POST', '/sales', {
        items: q.items.map(function(it) { return { product_id: it.product_id, product_name: it.product_name, quantity: it.quantity, price: it.price }; }),
        discount: 0, payment_method: 'cuenta_corriente', client_id: q.client_id
      });
      if (saleRes && saleRes.success) showAlert('Cotizacion aprobada - Venta #' + saleRes.id + ' generada');
      else showAlert('Cotizacion aprobada, error al generar venta', 'warning');
    } else {
      showAlert('Estado actualizado');
    }
  } else {
    showAlert('Estado actualizado');
  }
  loadQuotes();
}

async function deleteQuote(id) {
  if (!confirm('Eliminar cotizacion?')) return;
  var r = await api('DELETE', '/quotes/' + id);
  if (r.success) { loadQuotes(); showAlert('Cotizacion eliminada'); }
}

async function editQuote(id) {
  var q = await api('GET', '/quotes/' + id);
  if (!q) return;
  var quoteCart = (q.items || []).map(function(i) {
    return { product_id: i.product_id, product_name: i.product_name, quantity: i.quantity, price: i.price };
  });
  window.quoteCart = quoteCart;

  openModal('Editar Cotizacion #' + id,
    '<div class="form-group"><label>Cliente</label><select id="qtClient" class="w-full"><option value="">Sin cliente</option></select></div>' +
    '<hr style="margin:1rem 0;border:none;border-top:1px solid var(--border)">' +
    '<div style="display:flex;gap:.5rem;margin-bottom:.75rem">' +
    '<select id="qtProduct" style="flex:1;padding:8px;border:2px solid var(--border);border-radius:8px;background:var(--bg);color:var(--text)"><option value="">Producto</option></select>' +
    '<input id="qtQty" type="number" value="1" min="1" style="width:70px;padding:8px;border:2px solid var(--border);border-radius:8px;background:var(--bg);color:var(--text)">' +
    '<input id="qtPrice" type="number" step="0.01" placeholder="Precio" style="width:90px;padding:8px;border:2px solid var(--border);border-radius:8px;background:var(--bg);color:var(--text)">' +
    '<button class="btn btn-primary btn-sm" onclick="addQuoteItem()">+</button></div>' +
    '<table><thead><tr><th>Producto</th><th>Cant</th><th>Precio</th><th>Subtotal</th><th></th></tr></thead><tbody id="qtItems"></tbody></table>' +
    '<div style="text-align:right;font-weight:700;margin-top:.5rem">Total: $<span id="qtTotal">0.00</span></div>' +
    '<div class="form-group mt-1"><label>Notas</label><textarea id="qtNotes" rows="2" class="w-full">' + escHtml(q.notes || '') + '</textarea></div>',
    async function () {
      if (!window.quoteCart.length) return showAlert('Agregue al menos un producto', 'danger');
      var client_id = document.getElementById('qtClient').value || null;
      var notes = document.getElementById('qtNotes').value.trim();
      var r = await api('PUT', '/quotes/' + id, { client_id: client_id, items: window.quoteCart, notes: notes });
      if (!r.success) return showAlert(r && r.error ? r.error : 'Error', 'danger');
      await api('PUT', '/quotes/' + id + '/status', { status: 'aprobada' });
      var saleRes = await api('POST', '/sales', { items: window.quoteCart.map(function(it) { return { product_id: it.product_id, product_name: it.product_name, quantity: it.quantity, price: it.price }; }), discount: 0, payment_method: 'cuenta_corriente', client_id: client_id });
      closeModal(); loadQuotes();
      if (saleRes && saleRes.success) {
        showAlert('Presupuesto confirmado - Venta #' + saleRes.id + ' generada');
      } else {
        showAlert('Cotizacion actualizada, error al generar venta', 'danger');
      }
    },
    '<button class="btn btn-primary" onclick="modalSave()">Confirmar Presupuesto</button> <button class="btn btn-outline" onclick="closeModal()">Cancelar</button>');

  api('GET', '/clients').then(function (clients) {
    if (!clients) return;
    var sel = document.getElementById('qtClient');
    for (var i = 0; i < clients.length; i++) {
      var o = document.createElement('option');
      o.value = clients[i].id;
      o.textContent = clients[i].name;
      if (clients[i].id == q.client_id) o.selected = true;
      sel.appendChild(o);
    }
  });
  api('GET', '/products').then(function (prods) {
    if (!prods) return;
    var sel = document.getElementById('qtProduct');
    for (var i = 0; i < prods.length; i++) {
      var o = document.createElement('option');
      o.value = prods[i].id;
      o.textContent = prods[i].name;
      o.setAttribute('data-price', prods[i].price);
      sel.appendChild(o);
    }
  });
  renderQuoteCart();
}

async function exportQuotePdf(id) {
  var q = await api('GET', '/quotes/' + id);
  if (!q) return;
  var itemsHtml = '';
  if (q.items) {
    for (var i = 0; i < q.items.length; i++) {
      itemsHtml += '<tr><td>' + escHtml(q.items[i].product_name) + '</td><td class="r">' + q.items[i].quantity + '</td><td class="r">$' + Number(q.items[i].price).toFixed(2) + '</td><td class="r">$' + Number(q.items[i].subtotal).toFixed(2) + '</td></tr>';
    }
  }
  printHtml('<html><head><title>Cotizacion #' + q.id + '</title>' +
    '<style>body{font-family:monospace;font-size:12px;margin:0;padding:12px 16px;max-width:300px}*{box-sizing:border-box}table{width:100%;border-collapse:collapse;font-size:11px}th,td{padding:3px 0;text-align:left}.r{text-align:right}.line{border-top:1px dashed #000;margin:8px 0}.total{font-weight:700;font-size:13px}.info{font-size:11px;line-height:1.5;margin:0}.footer{text-align:center;margin-top:10px;font-size:10px;color:#666;border-top:1px dashed #000;padding-top:8px}</style></head><body>' +
    ticketHeader() +
    '<p class="info"><strong>COTIZACION #' + q.id + '</strong><br>Fecha: ' + (q.created_at || '') + '<br>Cliente: ' + escHtml(q.client_name || 'General') + '<br>Estado: ' + (q.status || 'pendiente') + '</p>' +
    (q.notes ? '<p class="info"><strong>Notas:</strong> ' + escHtml(q.notes) + '</p>' : '') +
    '<div class="line"></div>' +
    '<table><tr><th>Producto</th><th class="r">Cant</th><th class="r">Precio</th><th class="r">Subtotal</th></tr>' + itemsHtml + '</table>' +
    '<div class="line"></div>' +
    '<p class="total" style="display:flex;justify-content:space-between"><span>TOTAL:</span><span>$' + Number(q.total).toFixed(2) + '</span></p>' +
    '<div class="footer">Validez de la oferta: 7 dias</div></body></html>');
}

// ==================== PAYMENTS ====================
function viewPayments() {
  return '<div class="toolbar"><div class="spacer"></div><button class="btn btn-primary" onclick="showPaymentForm()">+ Nuevo Pago</button></div><div class="card"><div class="table-wrap"><table><thead><tr><th>#</th><th>Cliente</th><th>Monto</th><th>Metodo</th><th>Notas</th><th>Fecha</th><th class="text-right">Acciones</th></tr></thead><tbody id="paymentsTable"></tbody></table></div></div>';
}

async function loadPayments() {
  var payments = await api('GET', '/payments') || [];
  var html = '';
  for (var i = 0; i < payments.length; i++) {
    var p = payments[i];
    html += '<tr><td>' + p.id + '</td><td>' + escHtml(p.client_name || '-') + '</td><td><strong>$' + Number(p.amount).toFixed(2) + '</strong></td><td>' + fmtPay(p.payment_method) + '</td><td>' + escHtml(p.notes) + '</td><td style="font-size:.8rem">' + (p.created_at || '') + '</td><td class="text-right"><button class="btn btn-sm btn-danger" onclick="deletePayment(' + p.id + ')">Eliminar</button></td></tr>';
  }
  document.getElementById('paymentsTable').innerHTML = html;
}

function showPaymentForm() {
  openModal('Nuevo Pago',
    '<div class="form-grid">' +
    '<div class="form-group"><label>Cliente *</label><select id="pmClient" class="w-full"><option value="">Seleccionar</option></select></div>' +
    '<div class="form-group"><label>Monto *</label><input id="pmAmount" type="number" step="0.01" class="w-full"></div>' +
    '<div class="form-group"><label>Metodo</label><select id="pmMethod" class="w-full"><option value="efectivo">Efectivo</option><option value="tarjeta">Tarjeta</option><option value="transferencia">Transferencia</option><option value="cuenta_corriente">Cuenta Corriente</option></select></div>' +
    '</div><div class="form-group"><label>Notas</label><textarea id="pmNotes" rows="2" class="w-full"></textarea></div>',
    async function () {
      var client_id = document.getElementById('pmClient').value;
      var amount = parseFloat(document.getElementById('pmAmount').value);
      if (!client_id || !amount || amount <= 0) return showAlert('Seleccione cliente e ingrese monto', 'danger');
      var res = await api('POST', '/payments', { client_id: parseInt(client_id), amount: amount, payment_method: document.getElementById('pmMethod').value, notes: document.getElementById('pmNotes').value.trim() });
      if (res.success) { closeModal(); loadPayments(); showAlert('Pago registrado'); }
      else showAlert(res && res.error ? res.error : 'Error', 'danger');
    });
  api('GET', '/clients').then(function (clients) {
    if (!clients) return;
    var sel = document.getElementById('pmClient');
    for (var i = 0; i < clients.length; i++) {
      var o = document.createElement('option');
      o.value = clients[i].id;
      o.textContent = clients[i].name + (clients[i].code ? ' (' + clients[i].code + ')' : '');
      sel.appendChild(o);
    }
  });
}

async function deletePayment(id) {
  if (!confirm('Eliminar pago?')) return;
  var r = await api('DELETE', '/payments/' + id);
  if (r.success) { loadPayments(); showAlert('Pago eliminado'); }
}

// ==================== EXPENSES ====================
var expenseCats = ['Combustible', 'Proveeduría', 'Librería', 'Repuestos', 'Varios', 'Caja Chica', 'Otro'];

function toggleExpCat() {
  var sel = document.getElementById('ef_category');
  var wrap = document.getElementById('ef_custom_cat_wrap');
  if (wrap) wrap.style.display = sel && sel.value === 'Otro' ? '' : 'none';
}

function viewExpenses() {
  return '<div class="toolbar"><input type="date" id="expFrom" onchange="loadExpenses()"><input type="date" id="expTo" onchange="loadExpenses()"><select id="expCatFilter" onchange="loadExpenses()"><option value="">Todas las categorias</option>' + expenseCats.map(function(c) { return '<option value="' + c + '">' + c + '</option>'; }).join('') + '</select><button class="btn btn-outline" onclick="exportExpenses()">Exportar Excel</button><div class="spacer"></div><span id="expensesTotal" style="font-weight:600;color:var(--primary-light)"></span><button class="btn btn-primary" onclick="showExpenseForm()">+ Nuevo Gasto</button></div><div class="card"><div class="table-wrap"><table><thead><tr><th>Fecha</th><th>Detalle</th><th>Categoria</th><th>Forma Pago</th><th>Importe</th><th>Usuario</th><th class="text-right">Acciones</th></tr></thead><tbody id="expensesTable"></tbody></table></div></div>';
}

async function loadExpenses() {
  var from = document.getElementById('expFrom') ? document.getElementById('expFrom').value : '';
  var to = document.getElementById('expTo') ? document.getElementById('expTo').value : '';
  var cat = document.getElementById('expCatFilter') ? document.getElementById('expCatFilter').value : '';
  var path = '/expenses?';
  if (from) path += 'from=' + from + '&';
  if (to) path += 'to=' + to + '&';
  if (cat) path += 'category=' + encodeURIComponent(cat) + '&';
  var expenses = await api('GET', path) || [];
  var html = '';
  var total = 0;
  for (var i = 0; i < expenses.length; i++) {
    var e = expenses[i];
    total += Number(e.amount);
    var catLabel = e.category === 'Otro' && e.custom_category ? escHtml(e.custom_category) : escHtml(e.category);
    html += '<tr><td>' + (e.date || '-') + '</td><td><strong>' + escHtml(e.detail) + '</strong></td><td><span class="badge badge-info">' + catLabel + '</span></td><td>' + fmtPay(e.payment_method || 'efectivo') + '</td><td><strong style="color:var(--danger)">-$' + Number(e.amount).toFixed(2) + '</strong></td><td>' + (e.user_name || '-') + '</td><td class="text-right"><button class="btn btn-sm btn-outline" onclick="showExpenseForm(' + e.id + ')">Editar</button> <button class="btn btn-sm btn-danger" onclick="deleteExpense(' + e.id + ')">Eliminar</button></td></tr>';
  }
  document.getElementById('expensesTable').innerHTML = html || '<tr><td colspan="7" class="empty-state">Sin gastos</td></tr>';
  var summary = document.getElementById('expensesTotal');
  if (summary) summary.textContent = 'Total: $' + total.toFixed(2);
}

function showExpenseForm(id) {
  var isEdit = !!id;
  var catOpts = expenseCats.map(function(c) { return '<option value="' + c + '">' + c + '</option>'; }).join('');
  openModal(isEdit ? 'Editar Gasto' : 'Nuevo Gasto',
    '<div class="form-grid">' +
    '<div class="form-group"><label>Fecha *</label><input id="ef_date" type="date" class="w-full"></div>' +
    '<div class="form-group"><label>Detalle *</label><input id="ef_detail" class="w-full"></div>' +
    '<div class="form-group"><label>Categoria *</label><select id="ef_category" class="w-full" onchange="toggleExpCat()">' + catOpts + '</select></div>' +
    '<div class="form-group" id="ef_custom_cat_wrap" style="display:none"><label>Especificar</label><input id="ef_custom_cat" class="w-full"></div>' +
    '<div class="form-group"><label>Importe *</label><input id="ef_amount" type="number" step="0.01" class="w-full"></div>' +
    '<div class="form-group"><label>Forma Pago</label><select id="ef_method" class="w-full"><option value="efectivo">Efectivo</option><option value="transferencia">Transferencia</option><option value="tarjeta">Tarjeta</option><option value="cheque">Cheque</option><option value="otro">Otro</option></select></div>' +
    '</div>',
    async function () {
      var date = document.getElementById('ef_date').value;
      var detail = document.getElementById('ef_detail').value.trim();
      var category = document.getElementById('ef_category').value;
      var custom_category = category === 'Otro' ? document.getElementById('ef_custom_cat').value.trim() : '';
      var amount = parseFloat(document.getElementById('ef_amount').value) || 0;
      var method = document.getElementById('ef_method').value;
      if (!date || !detail || !category || !amount) return showAlert('Complete fecha, detalle, categoria e importe', 'danger');
      var res = await api(isEdit ? 'PUT' : 'POST', isEdit ? '/expenses/' + id : '/expenses', { date: date, detail: detail, amount: amount, payment_method: method, category: category, custom_category: custom_category });
      if (res.success) { closeModal(); loadExpenses(); showAlert(isEdit ? 'Gasto actualizado' : 'Gasto registrado'); }
      else showAlert(res && res.error ? res.error : 'Error', 'danger');
    });
  if (isEdit) {
    api('GET', '/expenses').then(function (list) {
      if (!list) return;
      var e = null;
      for (var i = 0; i < list.length; i++) { if (list[i].id == id) { e = list[i]; break; } }
      if (!e) return;
      document.getElementById('ef_date').value = e.date || '';
      document.getElementById('ef_detail').value = e.detail || '';
      document.getElementById('ef_category').value = e.category || 'Varios';
      if (e.category === 'Otro') {
        document.getElementById('ef_custom_cat_wrap').style.display = '';
        document.getElementById('ef_custom_cat').value = e.custom_category || '';
      }
      document.getElementById('ef_amount').value = e.amount || '';
      if (e.payment_method) document.getElementById('ef_method').value = e.payment_method;
    });
  }
}

async function deleteExpense(id) {
  if (!confirm('Eliminar gasto?')) return;
  var r = await api('DELETE', '/expenses/' + id);
  if (r.success) { loadExpenses(); showAlert('Gasto eliminado'); }
}

function exportExpenses() {
  var token = localStorage.getItem('token');
  if (!token) return;
  var from = document.getElementById('expFrom') ? document.getElementById('expFrom').value : '';
  var to = document.getElementById('expTo') ? document.getElementById('expTo').value : '';
  var cat = document.getElementById('expCatFilter') ? document.getElementById('expCatFilter').value : '';
  var url = '/api/export/expenses?token=' + encodeURIComponent(token);
  if (from) url += '&from=' + from;
  if (to) url += '&to=' + to;
  if (cat) url += '&category=' + encodeURIComponent(cat);
  var a = document.createElement('a');
  a.href = url;
  a.download = 'gastos.csv';
  a.click();
  showAlert('Descargando gastos...');
}

// ==================== INVOICES ====================
function viewInvoices() {
  return '<div class="toolbar"><input type="date" id="invFrom" onchange="loadInvoices()"><input type="date" id="invTo" onchange="loadInvoices()"><div class="spacer"></div><button class="btn btn-outline" onclick="document.getElementById(\'invFrom\').value=\'\';document.getElementById(\'invTo\').value=\'\';loadInvoices()">Limpiar</button></div><div class="card"><div class="table-wrap"><table><thead><tr><th>#</th><th>Tipo</th><th>Factura</th><th>Cliente</th><th>Total</th><th>CAE</th><th>Estado</th><th>Fecha</th><th class="text-right">Acciones</th></tr></thead><tbody id="invoicesTable"></tbody></table></div></div>';
}

async function loadInvoices() {
  var from = document.getElementById('invFrom') ? document.getElementById('invFrom').value : '';
  var to = document.getElementById('invTo') ? document.getElementById('invTo').value : '';
  var path = '/invoices?';
  if (from) path += 'from=' + from + '&';
  if (to) path += 'to=' + to + '&';
  var invoices = await api('GET', path) || [];
  var html = '';
  for (var i = 0; i < invoices.length; i++) {
    var inv = invoices[i];
    var tipoLabel = inv.invoice_type === 'legal' ? (inv.invoice_letter ? 'Factura ' + inv.invoice_letter : 'Legal') : 'Interna';
    var caeDisplay = inv.cae ? '<span class="badge badge-success">' + inv.cae + '</span>' : '<span class="badge badge-warning">Interno</span>';
    var payLabel = fmtPay(inv.payment_method);
    if (inv.payment_method === 'cuenta_corriente' && inv.client_balance <= 0) payLabel = '<span class="badge badge-success">Pagada</span>';
    html += '<tr><td>' + inv.id + '</td><td><span class="badge ' + (inv.invoice_type === 'legal' ? 'badge-success' : 'badge-warning') + '">' + tipoLabel + '</span></td><td><strong>' + escHtml(inv.invoice_number) + '</strong></td><td>' + escHtml(inv.client_name) + '</td><td><strong>$' + Number(inv.total).toFixed(2) + '</strong></td><td>' + caeDisplay + '</td><td>' + payLabel + '</td><td style="font-size:.8rem">' + (inv.created_at || '') + '</td><td class="text-right"><button class="btn btn-sm btn-outline" onclick="viewInvoiceDetail(' + inv.id + ')">Ver</button> <button class="btn btn-sm btn-primary" onclick="printInvoiceTicket(' + inv.id + ')">Ticket</button></td></tr>';
  }
  if (!html) html = '<tr><td colspan="9" class="empty-state">Sin facturas</td></tr>';
  document.getElementById('invoicesTable').innerHTML = html;
}

async function viewInvoiceDetail(id) {
  var inv = await api('GET', '/invoices/' + id);
  if (!inv) return;
  var tipoLabel = inv.invoice_type === 'legal' ? 'Factura ' + (inv.invoice_letter || '') : 'Interna';
  var caeHtml = inv.cae ? '<p><strong>CAE:</strong> ' + inv.cae + '<br><strong>Vto CAE:</strong> ' + (inv.cae_vto || '-') + '</p>' : '<p><em>Factura interna - sin CAE</em></p>';
  var itemsHtml = (inv.items || []).map(function(it) {
    return '<tr><td>' + escHtml(it.product_name) + '</td><td class="text-center">' + it.quantity + '</td><td class="text-right">$' + Number(it.price).toFixed(2) + '</td><td class="text-right">$' + Number(it.subtotal).toFixed(2) + '</td></tr>';
  }).join('');
  openModal('Factura ' + inv.invoice_number,
    '<p><strong>Tipo:</strong> ' + tipoLabel + '<br><strong>Cliente:</strong> ' + escHtml(inv.client_name) + '<br><strong>CUIT:</strong> ' + (inv.client_cuit || '-') + '<br><strong>IVA:</strong> ' + (inv.client_iva || '-') + '<br><strong>Pago:</strong> ' + fmtPay(inv.payment_method) + '<br><strong>Total:</strong> $' + Number(inv.total).toFixed(2) + '<br><strong>Fecha:</strong> ' + inv.created_at + '</p>' +
    caeHtml +
    '<hr style="margin:.75rem 0;border:none;border-top:1px solid var(--border)">' +
    '<table><thead><tr><th>Producto</th><th class="text-center">Cant</th><th class="text-right">Precio</th><th class="text-right">Subtotal</th></tr></thead><tbody>' + (itemsHtml || '<tr><td colspan="4">Sin items</td></tr>') + '</tbody></table>',
    null,
     '<button class="btn btn-primary" onclick="printInvoiceTicket(' + inv.id + ');closeModal()">Imprimir Ticket</button> ' +
     '<button class="btn btn-outline" onclick="shareWhatsApp(\'' + escJs('Factura ' + inv.invoice_number + ' - Total: $' + Number(inv.total).toFixed(2) + ' - Caños Embalse') + '\');closeModal()">WhatsApp</button> ' +
     '<button class="btn btn-outline" onclick="shareEmail(' + inv.id + ');closeModal()">Email</button> ' +
     '<button class="btn btn-outline" onclick="closeModal()">Cerrar</button>');
}

function shareEmail(id) {
  api('GET', '/invoices/' + id).then(function(inv) {
    if (!inv) return;
    var subject = 'Factura ' + inv.invoice_number + ' - Caños Embalse';
    var body = 'Factura: ' + inv.invoice_number + '\n';
    body += 'Cliente: ' + inv.client_name + '\n';
    body += 'Total: $' + Number(inv.total).toFixed(2) + '\n';
    body += 'Fecha: ' + inv.created_at + '\n\n';
    if (inv.items) {
      body += 'Productos:\n';
      for (var i = 0; i < inv.items.length; i++) {
        body += inv.items[i].product_name + ' x' + inv.items[i].quantity + ' $' + Number(inv.items[i].subtotal).toFixed(2) + '\n';
      }
    }
    body += '\nCaños Embalse\nHipolito Yrigoyen 546\nTel: 3571 637747\ncanosembalse@gmail.com';
    window.open('mailto:canosembalse@gmail.com?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(body), '_blank');
  });
}

// ==================== FISCAL CONFIG ====================
function viewFiscalConfig() {
  return '<div class="card" style="max-width:700px;margin:0 auto"><h3 style="margin-bottom:1.5rem;color:var(--text)">Configuracion ARCA (AFIP)</h3>' +
    '<div class="form-grid">' +
    '<div class="form-group"><label>CUIT</label><input id="fc_cuit" class="w-full" placeholder="XX-XXXXXXXX-X"></div>' +
    '<div class="form-group"><label>Razon Social</label><input id="fc_business" class="w-full"></div>' +
    '<div class="form-group"><label>Direccion</label><input id="fc_address" class="w-full"></div>' +
    '<div class="form-group"><label>Condicion IVA</label><select id="fc_iva" class="w-full"><option value="Responsable Inscripto">Responsable Inscripto</option><option value="Responsable Monotributo">Responsable Monotributo</option><option value="Exento">Exento</option></select></div>' +
    '<div class="form-group"><label>Ingresos Brutos</label><input id="fc_iibb" class="w-full"></div>' +
    '<div class="form-group"><label>Inicio Actividades</label><input id="fc_ini" type="date" class="w-full"></div>' +
    '<div class="form-group"><label>Punto de Venta</label><input id="fc_pos" type="number" class="w-full" value="1"></div>' +
    '<div class="form-group"><label>Entorno</label><select id="fc_env" class="w-full"><option value="homologacion">Homologacion (Pruebas)</option><option value="produccion">Produccion</option></select></div>' +
    '</div>' +
    '<hr style="margin:1rem 0;border:none;border-top:1px solid var(--border)">' +
    '<h4 style="margin-bottom:.75rem;color:var(--text)">Certificados Digitales</h4>' +
    '<p style="font-size:.85rem;color:var(--text-muted);margin-bottom:.75rem">Pegue el contenido del certificado (.crt) y la clave privada (.key) emitidos por ARCA.</p>' +
    '<div class="form-group"><label>Certificado (CRT)</label><textarea id="fc_cert" rows="5" class="w-full" style="font-family:monospace;font-size:.8rem"></textarea></div>' +
    '<div class="form-group"><label>Clave Privada (KEY)</label><textarea id="fc_key" rows="5" class="w-full" style="font-family:monospace;font-size:.8rem"></textarea></div>' +
    '<div class="form-group"><label>Password (opcional)</label><input id="fc_pass" type="password" class="w-full"></div>' +
    '<div style="display:flex;gap:.75rem;margin-top:1rem">' +
    '<button class="btn btn-primary" onclick="saveFiscalConfig()">Guardar Configuracion</button>' +
    '<button class="btn btn-outline" onclick="testArcaConnection()">Probar Conexion ARCA</button>' +
    '</div>' +
    '<div id="arcaTestResult" style="margin-top:1rem"></div>' +
    '</div>';
}

async function initFiscalConfig() {
  var cfg = await api('GET', '/fiscal-config');
  if (!cfg || !cfg.id) return;
  document.getElementById('fc_cuit').value = cfg.cuit || '';
  document.getElementById('fc_business').value = cfg.business_name || '';
  document.getElementById('fc_address').value = cfg.address || '';
  if (cfg.iva_condition) document.getElementById('fc_iva').value = cfg.iva_condition;
  document.getElementById('fc_iibb').value = cfg.ingresos_brutos || '';
  document.getElementById('fc_ini').value = cfg.inicio_actividades || '';
  document.getElementById('fc_pos').value = cfg.pos_number || 1;
  if (cfg.env_mode) document.getElementById('fc_env').value = cfg.env_mode;
  document.getElementById('fc_cert').value = cfg.cert_crt || '';
  document.getElementById('fc_key').value = cfg.cert_key || '';
  document.getElementById('fc_pass').value = cfg.cert_password || '';
}

async function saveFiscalConfig() {
  var data = {
    cuit: document.getElementById('fc_cuit').value.trim(),
    business_name: document.getElementById('fc_business').value.trim(),
    address: document.getElementById('fc_address').value.trim(),
    iva_condition: document.getElementById('fc_iva').value,
    ingresos_brutos: document.getElementById('fc_iibb').value.trim(),
    inicio_actividades: document.getElementById('fc_ini').value,
    pos_number: parseInt(document.getElementById('fc_pos').value) || 1,
    env_mode: document.getElementById('fc_env').value,
    cert_crt: document.getElementById('fc_cert').value,
    cert_key: document.getElementById('fc_key').value,
    cert_password: document.getElementById('fc_pass').value
  };
  var res = await api('PUT', '/fiscal-config', data);
  if (res.success) showAlert('Configuracion guardada');
  else showAlert(res && res.error ? res.error : 'Error', 'danger');
}

async function testArcaConnection() {
  var div = document.getElementById('arcaTestResult');
  div.innerHTML = '<p style="color:var(--text-muted)">Probando conexion con ARCA...</p>';
  var res = await api('POST', '/fiscal/test');
  if (res && res.success) {
    div.innerHTML = '<div class="stat-card"><span class="badge badge-success">Conexion exitosa</span><br><small>Puntos de venta: ' + (res.ptosVenta || []).map(function(p) { return p.nro; }).join(', ') + '</small></div>';
  } else {
    div.innerHTML = '<div class="stat-card"><span class="badge badge-danger">Error</span><br><small>' + escHtml(res && res.error ? res.error : 'Error de conexion') + '</small></div>';
  }
}

// ==================== REPORTS ====================
function viewReports() {
  return '<div class="tabs"><div class="tab active" data-tab="salesReport" onclick="switchReportTab(\'salesReport\',this)">Resumen</div><div class="tab" data-tab="salesDetail" onclick="switchReportTab(\'salesDetail\',this)">Detallado</div><div class="tab" data-tab="productsReport" onclick="switchReportTab(\'productsReport\',this)">Productos</div></div>' +
    '<div id="salesReport"><div class="toolbar"><input type="date" id="repFrom"><input type="date" id="repTo"><select id="repGroup"><option value="day">Por dia</option><option value="month">Por mes</option></select><button class="btn btn-primary" onclick="loadSalesReport()">Generar</button></div><div class="card" id="salesReportResult"></div></div>' +
    '<div id="salesDetail" class="hidden"><div class="toolbar"><input type="date" id="repDetFrom"><input type="date" id="repDetTo"><button class="btn btn-primary" onclick="loadSalesDetail()">Generar</button><button class="btn btn-outline" onclick="exportSalesReport()">Exportar Excel</button></div><div class="card" id="salesDetailResult"></div></div>' +
    '<div id="productsReport" class="hidden"><div class="card" id="productsReportResult"></div></div>';
}

function initReports() {
  document.getElementById('repTo').valueAsDate = new Date();
  var f = new Date();
  f.setDate(f.getDate() - 30);
  document.getElementById('repFrom').valueAsDate = f;
  document.getElementById('repDetTo').valueAsDate = new Date();
  var fd = new Date(); fd.setDate(fd.getDate() - 7);
  document.getElementById('repDetFrom').valueAsDate = fd;
  loadSalesReport();
  loadProductsReport();
}

function switchReportTab(tab, el) {
  var tabs = document.querySelectorAll('.tabs .tab');
  for (var i = 0; i < tabs.length; i++) tabs[i].classList.remove('active');
  el.classList.add('active');
  document.getElementById('salesReport').classList.toggle('hidden', tab !== 'salesReport');
  document.getElementById('salesDetail').classList.toggle('hidden', tab !== 'salesDetail');
  document.getElementById('productsReport').classList.toggle('hidden', tab !== 'productsReport');
  if (tab === 'salesDetail') loadSalesDetail();
  if (tab === 'productsReport') loadProductsReport();
}

async function loadSalesReport() {
  var from = document.getElementById('repFrom').value;
  var to = document.getElementById('repTo').value;
  var group = document.getElementById('repGroup').value;
  var path = '/reports/sales?group=' + group;
  if (from) path += '&from=' + from;
  if (to) path += '&to=' + to;
  var data = await api('GET', path) || [];
  var div = document.getElementById('salesReportResult');
  if (!data.length) { div.innerHTML = '<div class="empty-state">Sin datos para el periodo seleccionado</div>'; return; }
  var total = 0, count = 0;
  for (var i = 0; i < data.length; i++) { total += data[i].total; count += data[i].count; }
  var rows = '';
  for (var i = 0; i < data.length; i++) {
    rows += '<tr><td>' + data[i].period + '</td><td class="text-right">' + data[i].count + '</td><td class="text-right">$' + Number(data[i].total).toFixed(2) + '</td><td class="text-right">$' + Number(data[i].avg).toFixed(2) + '</td></tr>';
  }
  div.innerHTML = '<div style="display:flex;gap:1rem;margin-bottom:1rem;flex-wrap:wrap"><div class="stat-card" style="flex:1;min-width:120px"><div class="label">Total Ventas</div><div class="num">$' + total.toFixed(2) + '</div></div><div class="stat-card" style="flex:1;min-width:120px"><div class="label">Cantidad</div><div class="num">' + count + '</div></div><div class="stat-card" style="flex:1;min-width:120px"><div class="label">Promedio</div><div class="num">$' + (total / count).toFixed(2) + '</div></div></div><div class="table-wrap"><table><thead><tr><th>Periodo</th><th class="text-right">Ventas</th><th class="text-right">Total</th><th class="text-right">Promedio</th></tr></thead><tbody>' + rows + '</tbody></table></div>';
}

async function loadSalesDetail() {
  var from = document.getElementById('repDetFrom') ? document.getElementById('repDetFrom').value : '';
  var to = document.getElementById('repDetTo') ? document.getElementById('repDetTo').value : '';
  var path = '/reports/sales-detailed?';
  if (from) path += 'from=' + from + '&';
  if (to) path += 'to=' + to + '&';
  var sales = await api('GET', path) || [];
  var div = document.getElementById('salesDetailResult');
  if (!sales.length) { div.innerHTML = '<div class="empty-state">Sin ventas en el periodo</div>'; return; }
  var totalGeneral = 0, count = 0;
  var rows = '';
  for (var i = 0; i < sales.length; i++) {
    var s = sales[i];
    totalGeneral += Number(s.total);
    count++;
    var prods = '';
    if (s.items) {
      for (var j = 0; j < s.items.length; j++) {
        prods += (j > 0 ? '<br>' : '') + escHtml(s.items[j].product_name) + ' x' + s.items[j].quantity;
      }
    }
    rows += '<tr><td>' + s.id + '</td><td>' + (s.client_name || 'General') + '</td><td style="max-width:200px;font-size:.8rem">' + (prods || '-') + '</td><td class="text-right">$' + Number(s.total).toFixed(2) + '</td><td>' + fmtPay(s.payment_method) + '</td><td>' + (s.user_name || '-') + '</td><td style="font-size:.8rem">' + (s.created_at || '') + '</td></tr>';
  }
  div.innerHTML = '<div style="display:flex;gap:1rem;margin-bottom:1rem;flex-wrap:wrap"><div class="stat-card" style="flex:1;min-width:120px"><div class="label">Total Ventas</div><div class="num">$' + totalGeneral.toFixed(2) + '</div></div><div class="stat-card" style="flex:1;min-width:120px"><div class="label">Cantidad</div><div class="num">' + count + '</div></div></div><div class="table-wrap"><table><thead><tr><th>#</th><th>Cliente</th><th>Productos</th><th class="text-right">Total</th><th>Pago</th><th>Usuario</th><th>Fecha</th></tr></thead><tbody>' + rows + '</tbody></table></div>';
}

function exportSalesReport() {
  var token = localStorage.getItem('token');
  if (!token) return;
  var from = document.getElementById('repDetFrom') ? document.getElementById('repDetFrom').value : '';
  var to = document.getElementById('repDetTo') ? document.getElementById('repDetTo').value : '';
  var url = '/api/export/sales?token=' + encodeURIComponent(token);
  if (from) url += '&from=' + from;
  if (to) url += '&to=' + to;
  var a = document.createElement('a');
  a.href = url;
  a.download = 'ventas.csv';
  a.click();
  showAlert('Descargando ventas...');
}

async function loadProductsReport() {
  var data = await api('GET', '/reports/products') || [];
  var rows = '';
  for (var i = 0; i < data.length; i++) {
    var p = data[i];
    var low = p.stock <= p.min_stock && p.min_stock > 0;
    rows += '<tr' + (low ? ' class="row-low-stock"' : '') + '><td>' + escHtml(p.name) + '</td><td>' + (p.barcode || '-') + '</td><td>' + (p.category || '-') + '</td><td class="text-right"><span class="badge ' + (low ? 'badge-danger' : 'badge-success') + '">' + p.stock + '</span></td><td class="text-right">' + p.min_stock + '</td><td class="text-right">$' + Number(p.price).toFixed(2) + '</td><td class="text-right">$' + Number(p.cost).toFixed(2) + '</td><td class="text-right"><span class="badge ' + (p.margin > 0 ? 'badge-success' : 'badge-danger') + '">$' + Number(p.margin).toFixed(2) + '</span></td></tr>';
  }
  document.getElementById('productsReportResult').innerHTML = '<div class="table-wrap"><table><thead><tr><th>Producto</th><th>Codigo</th><th>Categoria</th><th class="text-right">Stock</th><th class="text-right">Stock Min</th><th class="text-right">Precio</th><th class="text-right">Costo</th><th class="text-right">Margen</th></tr></thead><tbody>' + rows + '</tbody></table></div>';
}

// ==================== USERS ====================
function viewUsers() {
  return '<div class="toolbar"><div class="spacer"></div><button class="btn btn-primary" onclick="showUserForm()">+ Nuevo Usuario</button></div><div class="card"><div class="table-wrap"><table><thead><tr><th>Usuario</th><th>Nombre</th><th>Rol</th><th>Estado</th><th>Fecha</th><th class="text-right">Acciones</th></tr></thead><tbody id="usersTable"></tbody></table></div></div>';
}

async function loadUsers() {
  var users = await api('GET', '/users') || [];
  var html = '';
  for (var i = 0; i < users.length; i++) {
    html += '<tr><td><strong>' + escHtml(users[i].username) + '</strong></td><td>' + (users[i].full_name || '-') + '</td><td><span class="badge ' + (users[i].role === 'admin' ? 'badge-warning' : 'badge-info') + '">' + (users[i].role === 'admin' ? 'Admin' : 'Vendedor') + '</span></td><td><span class="badge ' + (users[i].active ? 'badge-success' : 'badge-danger') + '">' + (users[i].active ? 'Activo' : 'Inactivo') + '</span></td><td style="font-size:.8rem">' + (users[i].created_at || '-') + '</td><td class="text-right"><button class="btn btn-sm btn-outline" onclick="showUserForm(' + users[i].id + ')">Editar</button></td></tr>';
  }
  document.getElementById('usersTable').innerHTML = html;
}

function showUserForm(id) {
  var isEdit = !!id;
  var extra = isEdit ? '<div class="form-group"><label>Estado</label><select id="uf_active" class="w-full"><option value="1">Activo</option><option value="0">Inactivo</option></select></div>' : '';
  openModal(isEdit ? 'Editar Usuario' : 'Nuevo Usuario',
    '<div class="form-grid"><div class="form-group"><label>Usuario *</label><input id="uf_username" class="w-full"' + (isEdit ? ' disabled' : '') + '></div><div class="form-group"><label>' + (isEdit ? 'Nueva Contrasena (dejar vacio)' : 'Contrasena *') + '</label><input id="uf_password" type="password" class="w-full"></div><div class="form-group"><label>Nombre Completo</label><input id="uf_fullname" class="w-full"></div><div class="form-group"><label>Rol</label><select id="uf_role" class="w-full"><option value="vendedor">Vendedor</option><option value="admin">Admin</option></select></div>' + extra + '</div>',
    async function () {
      if (!isEdit) {
        var username = document.getElementById('uf_username').value.trim();
        var password = document.getElementById('uf_password').value;
        if (!username || !password) return showAlert('Usuario y contrasena requeridos', 'danger');
        var res = await api('POST', '/users', { username: username, password: password, full_name: document.getElementById('uf_fullname').value.trim(), role: document.getElementById('uf_role').value });
        if (res.success) { closeModal(); loadUsers(); showAlert('Usuario creado'); }
        else showAlert(res && res.error ? res.error : 'Error', 'danger');
      } else {
        var data = { full_name: document.getElementById('uf_fullname').value.trim(), role: document.getElementById('uf_role').value, active: parseInt(document.getElementById('uf_active').value) };
        var pass = document.getElementById('uf_password').value;
        if (pass) data.password = pass;
        var res = await api('PUT', '/users/' + id, data);
        if (res.success) { closeModal(); loadUsers(); showAlert('Usuario actualizado'); }
      }
    });
  if (isEdit) {
    api('GET', '/users').then(function (users) {
      if (!users) return;
      for (var i = 0; i < users.length; i++) {
        if (users[i].id == id) {
          document.getElementById('uf_username').value = users[i].username;
          document.getElementById('uf_fullname').value = users[i].full_name || '';
          document.getElementById('uf_role').value = users[i].role;
          if (document.getElementById('uf_active')) document.getElementById('uf_active').value = users[i].active;
          break;
        }
      }
    });
  }
}

// ==================== SYNC ====================
function viewSync() {
  return '<div class="toolbar"><button class="btn btn-primary" onclick="syncPull()">Sincronizar desde otra PC</button></div>' +
    '<div class="card" style="max-width:600px;margin:1rem auto">' +
    '<h3 style="margin-bottom:1rem">Sincronizar Base de Datos</h3>' +
    '<p style="color:var(--text-muted);margin-bottom:1rem">Configure la direccion IP de la PC que tiene los datos actualizados y presione el boton para descargar su base de datos.</p>' +
    '<div class="form-group"><label>URL de la otra PC</label>' +
    '<div style="display:flex;gap:.5rem;align-items:center">' +
    '<input id="syncUrl" class="w-full" value="' + escHtml(localStorage.getItem('sync_url') || 'http://') + '" placeholder="http://192.168.1.100:3000">' +
    '<button class="btn btn-outline" onclick="syncPull()" style="white-space:nowrap">Sincronizar</button>' +
    '</div></div>' +
    '<div id="syncResult" style="margin-top:1rem"></div>' +
    '<hr style="margin:1.5rem 0;border:none;border-top:1px solid var(--border)">' +
    '<h4 style="margin-bottom:1rem">¿Como funciona?</h4>' +
    '<ol style="color:var(--text-muted);font-size:.85rem;line-height:1.6">' +
    '<li>En la PC que tiene los datos actualizados, asegurese de que el servidor este corriendo</li>' +
    '<li>En esta PC, ingrese la IP de la otra PC (ej: <code>http://192.168.1.100:3000</code>)</li>' +
    '<li>Presione "Sincronizar" y la base de datos se descargara automaticamente</li>' +
    '<li><strong>Reinicie el servidor</strong> para aplicar los cambios</li>' +
    '</ol>' +
    '<p style="color:#f87171;font-size:.8rem;margin-top:1rem">ATENCION: Esto sobrescribe TODOS los datos locales con los de la otra PC.</p>' +
    '</div>';
}

async function initSync() {
  var saved = localStorage.getItem('sync_url');
  if (saved) document.getElementById('syncUrl').value = saved;
}

async function syncPull() {
  var url = document.getElementById('syncUrl').value.trim();
  if (!url) return showAlert('Ingrese la URL de la otra PC', 'danger');
  localStorage.setItem('sync_url', url);
  var resultDiv = document.getElementById('syncResult');
  resultDiv.innerHTML = '<span style="color:#94a3b8">Conectando a ' + escHtml(url) + '...</span>';
  var downloadUrl = url.replace(/\/+$/, '') + '/api/sync/export';
  try {
    var loginRes = await fetch(downloadUrl, {
      headers: { 'Authorization': 'Bearer ' + token }
    });
    if (loginRes.status === 401 || loginRes.status === 403) {
      resultDiv.innerHTML = '<span style="color:#f87171">Error de autenticacion. Asegurese de usar un usuario admin en la otra PC.</span>';
      return;
    }
    if (!loginRes.ok) {
      resultDiv.innerHTML = '<span style="color:#f87171">Error: HTTP ' + loginRes.status + '. Verifique la URL y que la otra PC tenga el servidor corriendo.</span>';
      return;
    }
    resultDiv.innerHTML = '<span style="color:#94a3b8">Descargando base de datos...</span>';
    var blob = await loginRes.blob();
    resultDiv.innerHTML = '<span style="color:#94a3b8">Aplicando datos descargados...</span>';
    var formData = new FormData();
    formData.append('db', blob, 'sistema_pos.db');
    var importRes = await fetch('/api/sync/import-local', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + token },
      body: formData
    });
    var importData = await importRes.json();
    if (importData.success) {
      resultDiv.innerHTML = '<span style="color:#34d399">Sincronizacion completada. <strong>Reinicie el servidor</strong> para que los cambios tengan efecto.</span>';
      showAlert('Base de datos sincronizada correctamente');
    } else {
      resultDiv.innerHTML = '<span style="color:#f87171">Error al importar: ' + escHtml(importData.error || 'desconocido') + '</span>';
    }
  } catch (e) {
    resultDiv.innerHTML = '<span style="color:#f87171">Error de conexion: ' + escHtml(e.message) + '. Verifique que la otra PC este encendida y accesible en la red.</span>';
  }
}

// ==================== BACKUPS ====================
function viewBackups() {
  return '<div class="toolbar"><button class="btn btn-primary" onclick="createBackup()">Crear Respaldo</button><button class="btn btn-warning" onclick="restoreBackup()">Restaurar</button></div><div class="card"><div class="table-wrap"><table><thead><tr><th>Archivo</th><th>Tamanio</th><th>Fecha</th><th class="text-right">Acciones</th></tr></thead><tbody id="backupsTable"></tbody></table></div></div>';
}

async function loadBackups() {
  var backups = await api('GET', '/backups') || [];
  var html = '';
  for (var i = 0; i < backups.length; i++) {
    html += '<tr><td>' + backups[i].filename + '</td><td>' + (backups[i].size ? (backups[i].size / 1024).toFixed(1) + ' KB' : '-') + '</td><td style="font-size:.8rem">' + (backups[i].created_at || '-') + '</td><td class="text-right"><button class="btn btn-sm btn-danger" onclick="deleteBackup(' + backups[i].id + ')">Eliminar</button></td></tr>';
  }
  document.getElementById('backupsTable').innerHTML = html;
}

async function createBackup() {
  var res = await api('POST', '/backups');
  if (res.success) { loadBackups(); showAlert('Respaldo creado: ' + res.filename); }
  else showAlert('Error al crear respaldo', 'danger');
}

async function restoreBackup() {
  var backups = await api('GET', '/backups') || [];
  if (!backups.length) return showAlert('No hay respaldos disponibles', 'danger');
  var msg = '';
  for (var i = 0; i < backups.length; i++) {
    msg += (i + 1) + '. ' + backups[i].filename + ' (' + backups[i].created_at + ')\n';
  }
  var choice = prompt('Seleccione el numero del respaldo a restaurar:\n\n' + msg);
  if (!choice) return;
  var idx = parseInt(choice) - 1;
  if (idx < 0 || idx >= backups.length) return showAlert('Seleccion invalida', 'danger');
  if (!confirm('Restaurar respaldo ' + backups[idx].filename + '? Esto sobrescribira los datos actuales.')) return;
  var res = await api('POST', '/backups/restore/' + backups[idx].id);
  if (res.success) showAlert('Base de datos restaurada. Reinicie el servidor.');
  else showAlert(res && res.error ? res.error : 'Error', 'danger');
}

async function deleteBackup(id) {
  if (!confirm('Eliminar este respaldo?')) return;
  var res = await api('DELETE', '/backups/' + id);
  if (res.success) { loadBackups(); showAlert('Respaldo eliminado'); }
}
