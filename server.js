require('dotenv').config();
const express = require('express');
const cors = require('cors');
const QRCode = require('qrcode');
const axios = require('axios');

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

// ─── TU GOOGLE SHEETS API URL ───────────────────────────
const SHEETS_API = process.env.SHEETS_API || '';

// ─── PRODUCTOS EN MEMORIA (fallback sin Sheets) ─────────
let products = [];

// ─── HELPER: obtener ganancia ────────────────────────────
function getGanancia(p) {
  const g = Number(p.venta) - Number(p.compra);
  const pct = Math.round((g / Number(p.venta)) * 100);
  return { ganancia: g, porcentaje: pct };
}

// ─── SINCRONIZAR CON GOOGLE SHEETS ──────────────────────
async function syncFromSheets() {
  if (!SHEETS_API) return;
  try {
    const res = await axios.get(`${SHEETS_API}?action=get`);
    if (res.data.success && res.data.data.length > 0) {
      products = res.data.data;
      console.log(`✅ Sincronizado: ${products.length} productos desde Sheets`);
    }
  } catch (e) {
    console.log('⚠️ Sin conexión a Sheets, usando datos locales');
  }
}

// ─── RUTAS API ───────────────────────────────────────────

// Status
app.get('/api/status', (req, res) => {
  res.json({
    status: 'ok',
    mensaje: 'PacaBot backend activo',
    productos: products.length,
    sheets: SHEETS_API ? 'conectado' : 'local'
  });
});

// Todos los productos
app.get('/api/products', async (req, res) => {
  await syncFromSheets();
  res.json({ success: true, data: products });
});

// Buscar producto por ID
app.get('/api/products/:id', (req, res) => {
  const p = products.find(x => x.id === req.params.id.toUpperCase());
  if (!p) return res.status(404).json({ success: false, mensaje: 'Producto no encontrado' });
  const { ganancia, porcentaje } = getGanancia(p);
  res.json({ success: true, data: { ...p, ganancia, porcentaje } });
});

// Agregar producto
app.post('/api/products', async (req, res) => {
  const { id, nombre, categoria, compra, venta, stock } = req.body;
  if (!id || !nombre || !compra || !venta) {
    return res.status(400).json({ success: false, mensaje: 'Faltan campos obligatorios' });
  }
  const nuevo = { id: id.toUpperCase(), nombre, categoria: categoria || '📦', compra: Number(compra), venta: Number(venta), stock: Number(stock) || 1 };
  products.push(nuevo);
  if (SHEETS_API) {
    await axios.post(SHEETS_API, { action: 'add', product: nuevo }).catch(() => {});
  }
  res.json({ success: true, mensaje: 'Producto agregado', data: nuevo });
});

// Actualizar stock
app.patch('/api/products/:id/stock', async (req, res) => {
  const p = products.find(x => x.id === req.params.id.toUpperCase());
  if (!p) return res.status(404).json({ success: false, mensaje: 'Producto no encontrado' });
  const { delta } = req.body;
  p.stock = Math.max(0, Number(p.stock) + Number(delta));
  if (SHEETS_API) {
    await axios.post(SHEETS_API, { action: 'update', product: p }).catch(() => {});
  }
  res.json({ success: true, mensaje: 'Stock actualizado', data: p });
});

// Eliminar producto
app.delete('/api/products/:id', async (req, res) => {
  const id = req.params.id.toUpperCase();
  products = products.filter(p => p.id !== id);
  if (SHEETS_API) {
    await axios.post(SHEETS_API, { action: 'delete', id }).catch(() => {});
  }
  res.json({ success: true, mensaje: 'Producto eliminado' });
});

// Generar QR
app.get('/api/qr/:id', async (req, res) => {
  const id = req.params.id.toUpperCase();
  try {
    const qr = await QRCode.toDataURL(id, { margin: 2, scale: 8 });
    res.json({ success: true, id, qr });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// Resumen del inventario
app.get('/api/resumen', (req, res) => {
  const totalProductos = products.length;
  const totalUnidades = products.reduce((a, p) => a + Number(p.stock), 0);
  const gananciaTotal = products.reduce((a, p) => a + (Number(p.venta) - Number(p.compra)) * Number(p.stock), 0);
  const stockBajo = products.filter(p => Number(p.stock) <= 1).map(p => p.id);
  res.json({ success: true, data: { totalProductos, totalUnidades, gananciaTotal, stockBajo } });
});

// ─── BOT WHATSAPP (webhook) ──────────────────────────────
app.post('/api/bot', async (req, res) => {
  await syncFromSheets();
  const msg = (req.body.message || req.body.Body || '').toUpperCase().trim();
  let reply = '';

  if (msg === 'HOLA' || msg === 'AYUDA') {
    reply = `👋 Hola! Soy PacaBot.\n\nComandos:\n• P001 → info producto\n• LISTA → todos los productos\n• STOCK → stock bajo\n• TOTAL → resumen\n• BUSCAR [nombre] → buscar`;
  } else if (msg === 'LISTA') {
    reply = `📦 Productos (${products.length}):\n` + products.map(p => `${p.id} — ${p.nombre} | S/${p.venta} | Stock:${p.stock}`).join('\n');
  } else if (msg === 'STOCK') {
    const bajos = products.filter(p => Number(p.stock) <= 1);
    reply = bajos.length ? `⚠️ Stock bajo:\n` + bajos.map(p => `${p.id} — ${p.nombre} (${p.stock})`).join('\n') : '✅ Todo el stock está bien';
  } else if (msg === 'TOTAL') {
    const gan = products.reduce((a, p) => a + (Number(p.venta) - Number(p.compra)) * Number(p.stock), 0);
    reply = `📊 Resumen:\n🔢 Productos: ${products.length}\n📦 Unidades: ${products.reduce((a,p)=>a+Number(p.stock),0)}\n💰 Ganancia potencial: S/${gan}`;
  } else if (msg.startsWith('BUSCAR ')) {
    const q = msg.replace('BUSCAR ', '').toLowerCase();
    const found = products.filter(p => p.nombre.toLowerCase().includes(q));
    reply = found.length ? `🔍 Resultados:\n` + found.map(p => `${p.id} — ${p.nombre} | S/${p.venta}`).join('\n') : `❌ No encontré "${q}"`;
  } else {
    const p = products.find(x => x.id === msg);
    if (p) {
      const { ganancia, porcentaje } = getGanancia(p);
      reply = `${p.categoria} *${p.nombre}*\n\n🏷️ Código: ${p.id}\n💵 Compra: S/${p.compra}\n💰 Venta: S/${p.venta}\n📈 Ganancia: S/${ganancia} (${porcentaje}%)\n📦 Stock: ${p.stock} unidades\n💼 Valor en stock: S/${ganancia * Number(p.stock)}`;
    } else {
      reply = `❌ No encontré "${msg}".\nEscribe LISTA o AYUDA para ver los comandos.`;
    }
  }
  res.json({ success: true, reply });
});

// ─── INICIAR SERVIDOR ────────────────────────────────────
app.listen(port, () => {
  console.log(`🚀 PacaBot corriendo en http://localhost:${port}`);
  console.log(`📦 Productos cargados: ${products.length}`);
  syncFromSheets();
});