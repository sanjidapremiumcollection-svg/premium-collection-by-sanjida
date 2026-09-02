const express = require("express");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { Pool } = require("pg");

const app = express();
const PORT = process.env.PORT || 10000;
const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, "data");
fs.mkdirSync(DATA_DIR, { recursive: true });
const PRODUCTS_FILE = path.join(DATA_DIR, "products.json");
const ORDERS_FILE = path.join(DATA_DIR, "orders.json");

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch { return fallback; }
}
function writeJson(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2), "utf8");
}
if (!fs.existsSync(PRODUCTS_FILE)) writeJson(PRODUCTS_FILE, []);
if (!fs.existsSync(ORDERS_FILE)) writeJson(ORDERS_FILE, []);
// Persistent storage: when DATABASE_URL is present (Render + Supabase),
// products and orders are stored in PostgreSQL instead of Render's ephemeral filesystem.
let dbAvailable = false;
const pool = process.env.DATABASE_URL ? new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 5,
  connectionTimeoutMillis: 10000,
  idleTimeoutMillis: 30000
}) : null;
if (pool) {
  pool.on('error', (err) => console.error('PostgreSQL pool error:', err.message));
}

async function initDatabase() {
  if (!pool) return;
  await pool.query(`CREATE TABLE IF NOT EXISTS products (id TEXT PRIMARY KEY, data JSONB NOT NULL)`);
  await pool.query(`CREATE TABLE IF NOT EXISTS orders (order_id TEXT PRIMARY KEY, data JSONB NOT NULL)`);

  const pc = await pool.query('SELECT COUNT(*)::int AS count FROM products');
  if (pc.rows[0].count === 0) {
    const oldProducts = readJson(PRODUCTS_FILE, []);
    for (const item of oldProducts) {
      await pool.query('INSERT INTO products (id, data) VALUES ($1, $2::jsonb) ON CONFLICT (id) DO NOTHING', [item.id, JSON.stringify(item)]);
    }
  }

  const oc = await pool.query('SELECT COUNT(*)::int AS count FROM orders');
  if (oc.rows[0].count === 0) {
    const oldOrders = readJson(ORDERS_FILE, []);
    for (const item of oldOrders) {
      await pool.query('INSERT INTO orders (order_id, data) VALUES ($1, $2::jsonb) ON CONFLICT (order_id) DO NOTHING', [item.orderId, JSON.stringify(item)]);
    }
  }
  dbAvailable = true;
  console.log('Persistent PostgreSQL storage connected');
}

async function getProducts() {
  if (!pool || !dbAvailable) return readJson(PRODUCTS_FILE, []);
  const r = await pool.query(`SELECT data FROM products ORDER BY (data->>'createdAt') DESC`);
  return r.rows.map(r => r.data);
}
async function getOrders() {
  if (!pool || !dbAvailable) return readJson(ORDERS_FILE, []);
  const r = await pool.query(`SELECT data FROM orders ORDER BY (data->>'placedAt') DESC`);
  return r.rows.map(r => r.data);
}
async function saveProduct(item) {
  if (!pool || !dbAvailable) { const a = readJson(PRODUCTS_FILE, []); a.unshift(item); writeJson(PRODUCTS_FILE, a); return; }
  await pool.query('INSERT INTO products (id, data) VALUES ($1, $2::jsonb) ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data', [item.id, JSON.stringify(item)]);
}
async function updateProduct(item) {
  if (!pool || !dbAvailable) { const a = readJson(PRODUCTS_FILE, []); const i=a.findIndex(x=>x.id===item.id); if(i>=0){a[i]=item;writeJson(PRODUCTS_FILE,a);} return; }
  await pool.query('UPDATE products SET data=$2::jsonb WHERE id=$1', [item.id, JSON.stringify(item)]);
}
async function deleteProduct(id) {
  if (!pool || !dbAvailable) { const a=readJson(PRODUCTS_FILE, []), n=a.filter(x=>x.id!==id); writeJson(PRODUCTS_FILE,n); return a.length!==n.length; }
  const r=await pool.query('DELETE FROM products WHERE id=$1', [id]); return r.rowCount>0;
}
async function saveOrder(item) {
  if (!pool) {
    const a = readJson(ORDERS_FILE, []);
    a.unshift(item);
    writeJson(ORDERS_FILE, a);
    return;
  }
  // If the first database connection was not ready yet, retry initialization
  // at the moment an order is placed instead of failing checkout.
  if (!dbAvailable) {
    try { await initDatabase(); } catch (err) {
      console.error('Database not ready while saving order:', err.message);
    }
  }
  if (!dbAvailable) {
    const a = readJson(ORDERS_FILE, []);
    a.unshift(item);
    writeJson(ORDERS_FILE, a);
    return;
  }
  await pool.query(
    'INSERT INTO orders (order_id, data) VALUES ($1,$2::jsonb) ON CONFLICT (order_id) DO UPDATE SET data=EXCLUDED.data',
    [item.orderId, JSON.stringify(item)]
  );
}
async function updateOrder(item) {
  if (!pool || !dbAvailable) { const a=readJson(ORDERS_FILE, []), i=a.findIndex(x=>x.orderId===item.orderId); if(i>=0){a[i]=item;writeJson(ORDERS_FILE,a);} return; }
  await pool.query('UPDATE orders SET data=$2::jsonb WHERE order_id=$1', [item.orderId, JSON.stringify(item)]);
}
async function deleteOrder(id) {
  if (!pool || !dbAvailable) { const a=readJson(ORDERS_FILE, []), n=a.filter(x=>x.orderId!==id); writeJson(ORDERS_FILE,n); return a.length!==n.length; }
  const r=await pool.query('DELETE FROM orders WHERE order_id=$1', [id]); return r.rowCount>0;
}


const sessions = new Map();
const ADMIN_NUMBER = process.env.ADMIN_NUMBER || "01918444462";
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || "sanjidacollection";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "5566";

app.use(express.json({ limit: "25mb" }));
app.use(express.urlencoded({ extended: true, limit: "25mb" }));

function auth(req, res, next) {
  const h = req.get("authorization") || "";
  const token = h.startsWith("Bearer ") ? h.slice(7) : "";
  if (!token || !sessions.has(token)) return res.status(401).json({ message: "Unauthorized" });
  next();
}

app.post("/api/admin/login", (req, res) => {
  const { number, username, password } = req.body || {};
  if (String(number || "").trim() !== ADMIN_NUMBER ||
      String(username || "").trim() !== ADMIN_USERNAME ||
      String(password || "") !== ADMIN_PASSWORD) {
    return res.status(401).json({ message: "Invalid credentials" });
  }
  const token = crypto.randomBytes(32).toString("hex");
  sessions.set(token, Date.now());
  res.json({ ok: true, token });
});

app.get("/health", (req, res) => res.json({ ok: true, service: "premium-collection-by-sanjida" }));

// Always serve the storefront at the root URL.
// Prevent browser/proxy caching from preserving an old admin redirect.
app.use((req, res, next) => {
  if (req.method === "GET" && !req.path.startsWith("/api/")) {
    res.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    res.set("Pragma", "no-cache");
    res.set("Expires", "0");
  }
  next();
});
// Admin is available only at /admin.
app.get("/", (req, res) => { res.set("X-PC-Route", "storefront"); res.sendFile(path.join(ROOT, "index.html")); });
app.get("/index.html", (req, res) => { res.set("X-PC-Route", "storefront"); res.sendFile(path.join(ROOT, "index.html")); });

app.get("/api/products", async (req, res) => {
  try { res.json(await getProducts()); } catch (e) { console.error(e); res.status(500).json({ message: "Could not load products" }); }
});

app.post("/api/products", auth, async (req, res) => {
  const body = req.body || {};
  if (!String(body.name || "").trim()) return res.status(400).json({ message: "Product name is required" });
  const product = {
    id: crypto.randomUUID(),
    name: String(body.name).trim(),
    group: body.group === "cosmetics" ? "cosmetics" : "clothing",
    subcategory: String(body.subcategory || ""),
    price: Number(body.price || 0),
    description: String(body.description || ""),
    images: Array.isArray(body.images) ? body.images : [],
    active: body.active !== false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  try { await saveProduct(product); res.status(201).json(product); } catch (e) { console.error(e); res.status(500).json({ message: "Could not save product" }); }
});

app.put("/api/products/:id", auth, async (req, res) => {
  const products = await getProducts();
  const i = products.findIndex(p => p.id === req.params.id);
  if (i < 0) return res.status(404).json({ message: "Product not found" });
  const b = req.body || {};
  products[i] = {
    ...products[i],
    name: String(b.name ?? products[i].name).trim(),
    group: b.group === "cosmetics" ? "cosmetics" : (b.group || products[i].group),
    subcategory: String(b.subcategory ?? products[i].subcategory ?? ""),
    price: Number(b.price ?? products[i].price ?? 0),
    description: String(b.description ?? products[i].description ?? ""),
    images: Array.isArray(b.images) ? b.images : (products[i].images || []),
    active: b.active !== false,
    updatedAt: new Date().toISOString()
  };
  try { await updateProduct(products[i]); res.json(products[i]); } catch (e) { console.error(e); res.status(500).json({ message: "Could not update product" }); }
});

app.delete("/api/products/:id", auth, async (req, res) => {
  try { if (!(await deleteProduct(req.params.id))) return res.status(404).json({ message: "Product not found" }); res.json({ ok: true }); } catch (e) { console.error(e); res.status(500).json({ message: "Could not delete product" }); }
});

app.post("/api/orders", async (req, res) => {
  const b = req.body || {};
  if (!b.customer || !b.shipping || !Array.isArray(b.items) || !b.items.length) {
    return res.status(400).json({ ok: false, message: "Incomplete order information" });
  }
  const order = {
    orderId: "PCS-" + Date.now().toString(36).toUpperCase() + "-" + crypto.randomBytes(2).toString("hex").toUpperCase(),
    customer: b.customer,
    shipping: b.shipping,
    payment: b.payment || "Cash on Delivery (COD)",
    items: b.items,
    subtotal: Number(b.subtotal || 0),
    total: Number(b.total || 0),
    status: "Pending",
    placedAt: new Date().toISOString()
  };
  try { await saveOrder(order); res.status(201).json({ ok: true, orderId: order.orderId }); } catch (e) { console.error(e); res.status(500).json({ ok: false, message: "Could not save order" }); }
});

app.get("/api/admin/orders", auth, async (req, res) => {
  try { res.json({ orders: await getOrders() }); } catch (e) { console.error(e); res.status(500).json({ message: "Could not load orders" }); }
});

app.patch("/api/admin/orders/:id", auth, async (req, res) => {
  const orders = await getOrders();
  const i = orders.findIndex(o => o.orderId === req.params.id);
  if (i < 0) return res.status(404).json({ message: "Order not found" });
  orders[i].status = String(req.body?.status || "Pending");
  orders[i].updatedAt = new Date().toISOString();
  try { await updateOrder(orders[i]); res.json({ ok: true, order: orders[i] }); } catch (e) { console.error(e); res.status(500).json({ message: "Could not update order" }); }
});

app.delete("/api/admin/orders/:id", auth, async (req, res) => {
  try { if (!(await deleteOrder(req.params.id))) return res.status(404).json({ message: "Order not found" }); res.json({ ok: true }); } catch (e) { console.error(e); res.status(500).json({ message: "Could not delete order" }); }
});

app.get("/admin", (req, res) => res.sendFile(path.join(ROOT, "admin-login.html")));
app.get("/admin/", (req, res) => res.sendFile(path.join(ROOT, "admin-login.html")));
app.get("/admin/dashboard", (req, res) => res.sendFile(path.join(ROOT, "admin-dashboard.html")));

app.use(express.static(ROOT, { extensions: ["html"] }));

app.use((req, res) => {
  if (req.method === "GET" && !req.path.startsWith("/api/")) {
    res.sendFile(path.join(ROOT, "index.html"));
  } else {
    res.status(404).json({ message: "Not found" });
  }
});

app.listen(PORT, () => {
  console.log(`Premium Collection By Sanjida running on port ${PORT}`);
  if (process.env.DATABASE_URL) {
    const connect = async () => {
      try {
        await initDatabase();
      } catch (err) {
        dbAvailable = false;
        console.error("Database initialization failed; checkout will retry automatically:", err.message);
      }
    };
    connect();
    // Keep retrying in the background so a temporary Supabase/network issue
    // does not require a manual Render redeploy.
    setInterval(() => {
      if (!dbAvailable) connect();
    }, 15000).unref();
  } else {
    console.warn("DATABASE_URL is not set; server is using local file storage.");
  }
});
