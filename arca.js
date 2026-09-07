const https = require('https');
const crypto = require('crypto');
const forge = require('node-forge');
const { XMLParser, XMLBuilder } = require('fast-xml-parser');
const { getDb, queryOne, queryAll, saveDb, lastId } = require('./database');

const WSAAs = {
  homologacion: 'https://wsaahomo.afip.gov.ar/ws/services/LoginCms',
  produccion: 'https://wsaa.afip.gov.ar/ws/services/LoginCms'
};
const WSFE_URLs = {
  homologacion: 'https://wswhomo.afip.gov.ar/wsfev1/service.asmx',
  produccion: 'https://servicios1.afip.gov.ar/wsfev1/service.asmx'
};

function getIvaLetter(iva, paymentMethod) {
  const consumidor = ['Consumidor Final', 'Exento', 'No Responsable', 'Sujeto Exento'];
  if (consumidor.includes(iva)) return paymentMethod === 'cuenta_corriente' ? 'C' : 'B';
  return 'A';
}

function getIvaAliquot(letter) {
  if (letter === 'B') return 21;
  if (letter === 'A') return 21;
  return 0;
}

function signXmlWithCert(xml, certPem, keyPem) {
  try {
    const p7 = forge.pkcs7.createSignedData();
    p7.content = forge.util.createBuffer(xml, 'utf8');
    p7.addCertificate(certPem);
    p7.addSigner({
      key: forge.pki.privateKeyFromPem(keyPem),
      certificate: forge.pki.certificateFromPem(certPem),
      hashAlgorithm: forge.md.sha256.create()
    });
    p7.sign({ detached: true });
    const cms = forge.pkcs7.messageToPem(p7);
    const b64 = cms.replace(/-----[^\\n]+-----/g, '').replace(/\\n/g, '').replace(/\\r/g, '').trim();
    return b64;
  } catch (e) {
    console.error('Error signing XML:', e.message);
    throw e;
  }
}

async function wsaaLogin(service, env) {
  const config = queryOne("SELECT * FROM fiscal_config WHERE id = 1");
  if (!config || !config.cert_crt || !config.cert_key) throw new Error('Configuracion fiscal o certificados no cargados');
  const uniqueId = Date.now();
  const genTime = new Date().toISOString().replace(/\..+/, '');
  const expTime = new Date(Date.now() + 12 * 3600000).toISOString().replace(/\..+/, '');
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<loginTicketRequest version="1.0">
  <header>
    <uniqueId>${uniqueId}</uniqueId>
    <generationTime>${genTime}</generationTime>
    <expirationTime>${expTime}</expirationTime>
    <service>${service}</service>
  </header>
</loginTicketRequest>`;
  const cms = signXmlWithCert(xml, config.cert_crt, config.cert_key);
  const soap = `<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <soap:Body>
    <loginCms xmlns="http://wsaa.view.sua.dvadac.desein.afip.gov.ar">
      <in0>${cms}</in0>
    </loginCms>
  </soap:Body>
</soap:Envelope>`;
  const url = WSAAs[env] || WSAAs.homologacion;
  const resp = await soapRequest(url, soap);
  const parser = new XMLParser({ ignoreAttributes: false });
  const json = parser.parse(resp);
  try {
    const ta = json['soap:Envelope']['soap:Body'].loginCmsResponse.loginCmsReturn;
    const taParser = new XMLParser();
    const taJson = taParser.parse(ta);
    const cred = taJson.loginTicketResponse.credentials;
    return { token: cred.token, sign: cred.sign, expirationTime: cred.expirationTime };
  } catch (e) {
    throw new Error('Error al obtener TA de ARCA: ' + JSON.stringify(json));
  }
}

function soapRequest(url, xml) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const opts = {
      hostname: u.hostname,
      port: 443,
      path: u.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'text/xml; charset=utf-8',
        'Content-Length': Buffer.byteLength(xml),
        'SOAPAction': ''
      }
    };
    const req = https.request(opts, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve(data));
    });
    req.on('error', reject);
    req.write(xml);
    req.end();
  });
}

function buildWsfeXml(method, params, token, sign) {
  let paramsXml = '';
  for (const [k, v] of Object.entries(params)) {
    if (typeof v === 'object') {
      let inner = '';
      for (const [ik, iv] of Object.entries(v)) {
        inner += `<${ik}>${iv}</${ik}>`;
      }
      paramsXml += `<${k}>${inner}</${k}>`;
    } else {
      paramsXml += `<${k}>${v}</${k}>`;
    }
  }
  return `<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <soap:Header>
    <Auth xmlns="http://ar.gov.afip.dif.FEV1/" xsi:type="ns2:FEAuthRequest">
      <Token>${token}</Token>
      <Sign>${sign}</Sign>
      <Cuit>${params.Cuit}</Cuit>
    </Auth>
  </soap:Header>
  <soap:Body>
    <${method} xmlns="http://ar.gov.afip.dif.FEV1/">
      ${paramsXml.replace(/<Cuit>.*?<\/Cuit>/, '')}
    </${method}>
  </soap:Body>
</soap:Envelope>`;
}

async function wsfeCall(method, params, token, sign, env) {
  const xml = buildWsfeXml(method, params, token, sign);
  const url = WSFE_URLs[env] || WSFE_URLs.homologacion;
  const resp = await soapRequest(url, xml);
  const parser = new XMLParser({ ignoreAttributes: false });
  const json = parser.parse(resp);
  try {
    const body = json['soap:Envelope']['soap:Body'];
    const resultKey = Object.keys(body).find(k => k.endsWith('Response'));
    if (!resultKey) throw new Error('Respuesta WSFE inesperada: ' + JSON.stringify(json));
    const resultData = body[resultKey];
    const result = resultData[method + 'Result'];
    return result;
  } catch (e) {
    throw new Error('Error en WSFE ' + method + ': ' + e.message);
  }
}

async function requestCae(invoice, env) {
  const ta = await wsaaLogin('wsfe', env);
  const config = queryOne("SELECT * FROM fiscal_config WHERE id = 1");
  if (!config || !config.cuit) throw new Error('CUIT no configurado');
  const cuit = config.cuit.replace(/-/g, '');
  const posNumber = config.pos_number || 1;
  const letter = invoice.letter;
  const cbteTipo = { 'A': 1, 'B': 6, 'C': 11 }[letter] || 6;
  const docTipo = invoice.client_cuit ? 80 : 99;
  const docNro = invoice.client_cuit ? invoice.client_cuit.replace(/-/g, '') : '0';
  const ivaAliquot = getIvaAliquot(letter);
  const ivaTotal = invoice.total - (invoice.total / (1 + ivaAliquot / 100));
  const subTotal = invoice.total / (1 + ivaAliquot / 100);
  const params = {
    Auth: { Token: ta.token, Sign: ta.sign, Cuit: cuit },
    FeCAEReq: {
      FeCabReq: { CantReg: 1, PtoVta: posNumber, CbteTipo: cbteTipo },
      FeDetReq: {
        FECAEDetRequest: {
          Concepto: 1,
          DocTipo: docTipo,
          DocNro: docNro,
          CbteDesde: 1,
          CbteHasta: 1,
          CbteFch: new Date().toISOString().split('T')[0].replace(/-/g, ''),
          ImpTotal: invoice.total.toFixed(2),
          ImpTotConc: 0,
          ImpNeto: subTotal.toFixed(2),
          ImpOpEx: 0,
          ImpIVA: ivaTotal.toFixed(2),
          ImpTrib: 0,
          MonId: 'PES',
          MonCotiz: 1,
          Iva: { AlicIva: { Id: 5, BaseImp: subTotal.toFixed(2), Importe: ivaTotal.toFixed(2) } }
        }
      }
    }
  };
  const result = await wsfeCall('FECAESolicitar', params, ta.token, ta.sign, env);
  if (result.Errors) {
    const errs = result.Errors.Err ? (Array.isArray(result.Errors.Err) ? result.Errors.Err : [result.Errors.Err]) : [];
    throw new Error('ARCA errors: ' + errs.map(e => e.Code + ': ' + e.Msg).join(', '));
  }
  const detail = result.FeDetResp?.FECAEDetResponse;
  if (!detail) throw new Error('Respuesta CAE sin detalle');
  return {
    cae: detail.CAE || '',
    cae_vto: detail.CAEFchVto || '',
    result: detail.Resultado || '',
    invoice_number: `${posNumber}-${String(detail.CbteDesde).padStart(8, '0')}`,
    letter: letter
  };
}

function generateInternalInvoiceNumber() {
  const last = queryOne("SELECT invoice_number FROM invoices WHERE invoice_letter = 'INT' ORDER BY id DESC LIMIT 1");
  const lastNum = last ? parseInt(last.invoice_number.split('-')[1] || '0', 10) : 0;
  return `INT-${String(lastNum + 1).padStart(8, '0')}`;
}

async function emitirFactura(saleId, paymentMethod) {
  const db = getDb();
  const sale = queryOne("SELECT s.*, c.name as client_name, c.cuit as client_cuit, c.iva as client_iva, c.id as client_id FROM sales s LEFT JOIN clients c ON s.client_id = c.id WHERE s.id = ?", [saleId]);
  if (!sale) throw new Error('Venta no encontrada');
  const items = queryAll("SELECT * FROM sale_items WHERE sale_id = ?", [saleId]);
  const config = queryOne("SELECT * FROM fiscal_config WHERE id = 1");
  const needsLegalInvoice = ['tarjeta', 'transferencia'].includes(paymentMethod);
  let invoiceLetter = 'INT';
  let cae = '';
  let caeVto = '';
  let result = '';
  let invoiceNumber = '';

  if (needsLegalInvoice && config && config.cuit && config.cert_crt) {
    invoiceLetter = getIvaLetter(sale.client_iva || 'Consumidor Final', paymentMethod);
    const ivaAliquot = getIvaAliquot(invoiceLetter);
    const ivaTotal = sale.total - (sale.total / (1 + ivaAliquot / 100));
    try {
      const caeData = await requestCae({
        total: sale.total,
        letter: invoiceLetter,
        client_cuit: sale.client_cuit || ''
      }, config.env_mode || 'homologacion');
      cae = caeData.cae;
      caeVto = caeData.cae_vto;
      result = caeData.result;
      invoiceNumber = caeData.invoice_number;
    } catch (e) {
      console.error('Error al obtener CAE, se emite factura interna:', e.message);
      needsLegalInvoice = false;
      invoiceLetter = 'INT';
    }
  }

  if (!needsLegalInvoice || !cae) {
    invoiceLetter = 'INT';
    invoiceNumber = generateInternalInvoiceNumber();
  }

   const subTotal = sale.total;
   const discountAmt = sale.discount || 0;
   const totalReal = sale.total + discountAmt;
   db.run("INSERT INTO invoices (sale_id, invoice_type, invoice_letter, invoice_number, cae, cae_vto, result, client_id, client_name, client_cuit, client_iva, total, iva_total, subtotal, discount, payment_method) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
     [saleId, needsLegalInvoice && cae ? 'legal' : 'interna', invoiceLetter, invoiceNumber, cae, caeVto, result, sale.client_id || null, sale.client_name || 'General', sale.client_cuit || '', sale.client_iva || '', sale.total, 0, subTotal, discountAmt, paymentMethod]);

  const invoiceId = lastId();
  for (const item of items) {
    db.run("INSERT INTO invoice_items (invoice_id, product_name, quantity, price, subtotal, description, iva_aliquot, iva_amount) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      [invoiceId, item.product_name, item.quantity, item.price, item.subtotal, item.description || '', 21, 0]);
  }

  try { db.run("ALTER TABLE invoices ADD COLUMN invoice_letter TEXT DEFAULT ''"); } catch (e) {}
  try { db.run("ALTER TABLE invoices ADD COLUMN payment_method TEXT DEFAULT ''"); } catch (e) {}
  try { db.run("ALTER TABLE invoices ADD COLUMN subtotal REAL NOT NULL DEFAULT 0"); } catch (e) {}

  saveDb();
  return { invoiceId, invoiceNumber, invoiceLetter, cae, type: needsLegalInvoice && cae ? 'legal' : 'interna' };
}

async function emitirFacturaDePago(paymentId) {
  const db = getDb();
  const payment = queryOne("SELECT p.*, c.name as client_name, c.cuit as client_cuit, c.iva as client_iva, c.id as client_id FROM payments p LEFT JOIN clients c ON p.client_id = c.id WHERE p.id = ?", [paymentId]);
  if (!payment) throw new Error('Pago no encontrado');
  const config = queryOne("SELECT * FROM fiscal_config WHERE id = 1");
  const needsLegalInvoice = ['tarjeta', 'transferencia'].includes(payment.payment_method);
  let invoiceLetter = 'INT';
  let cae = '';
  let caeVto = '';
  let result = '';
  let invoiceNumber = '';
  let legal = false;

  if (needsLegalInvoice && config && config.cuit && config.cert_crt) {
    invoiceLetter = getIvaLetter(payment.client_iva || 'Consumidor Final', payment.payment_method || 'efectivo');
    const ivaAliquot = getIvaAliquot(invoiceLetter);
    const ivaTotal = payment.amount - (payment.amount / (1 + ivaAliquot / 100));
    try {
      const caeData = await requestCae({
        total: payment.amount,
        letter: invoiceLetter,
        client_cuit: payment.client_cuit || ''
      }, config.env_mode || 'homologacion');
      cae = caeData.cae;
      caeVto = caeData.cae_vto;
      result = caeData.result;
      invoiceNumber = caeData.invoice_number;
      legal = true;
    } catch (e) {
      console.error('Error al obtener CAE en pago, se emite factura interna:', e.message);
    }
  }

  if (!legal || !cae) {
    invoiceLetter = 'INT';
    invoiceNumber = generateInternalInvoiceNumber();
  }

  db.run("INSERT INTO invoices (sale_id, invoice_type, invoice_letter, invoice_number, cae, cae_vto, result, client_id, client_name, client_cuit, client_iva, total, iva_total, subtotal, payment_method) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    [null, legal && cae ? 'legal' : 'interna', invoiceLetter, invoiceNumber, cae, caeVto, result, payment.client_id || null, payment.client_name || 'General', payment.client_cuit || '', payment.client_iva || '', payment.amount, 0, payment.amount, payment.payment_method || 'efectivo']);

  const invoiceId = lastId();
  db.run("INSERT INTO invoice_items (invoice_id, product_name, quantity, price, subtotal, iva_aliquot, iva_amount) VALUES (?, ?, ?, ?, ?, ?)",
    [invoiceId, payment.notes || 'Pago de cuenta corriente', 1, payment.amount, payment.amount, legal ? getIvaAliquot(invoiceLetter) : 0, 0]);

  saveDb();
  return { invoiceId, invoiceNumber, invoiceLetter, cae, type: legal && cae ? 'legal' : 'interna' };
}

async function testArcaConnection() {
  const config = queryOne("SELECT * FROM fiscal_config WHERE id = 1");
  if (!config) throw new Error('Sin configuracion fiscal');
  if (!config.cert_crt || !config.cert_key) throw new Error('Certificados no cargados');
  if (!config.cuit) throw new Error('CUIT no configurado');
  try {
    const ta = await wsaaLogin('wsfe', config.env_mode || 'homologacion');
    const cuit = config.cuit.replace(/-/g, '');
    const params = { Auth: { Token: ta.token, Sign: ta.sign, Cuit: cuit } };
    const result = await wsfeCall('FEParamGetPtosVenta', params, ta.token, ta.sign, config.env_mode || 'homologacion');
    const pts = result.ResultGet || [];
    const ptos = Array.isArray(pts) ? pts : [pts];
    return { success: true, message: 'Conexion exitosa', ptosVenta: ptos.map(p => ({ nro: p.Nro, emision: p.EmisionTipo, bloqueado: p.Bloqueado })) };
  } catch (e) {
    throw new Error('Error de conexion: ' + e.message);
  }
}

module.exports = { emitirFactura, emitirFacturaDePago, testArcaConnection, getIvaLetter, generateInternalInvoiceNumber };