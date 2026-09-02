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

// IMPORTANT: Render's normal filesystem is temporary. When DATABASE_URL is set,
// products and orders are stored in PostgreSQL so they survive restarts/redeploys.
// Without DATABASE_URL, local development keeps using the JSON files.
const pool = process.env.DATABASE_URL
  ? new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false
    })
  : null;

let dbReady = false;

async function initDatabase() {
  if (!pool) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS pcs_products (
      id TEXT PRIMARY KEY,
      data JSONB NOT NULL
    );
    CREATE TABLE IF NOT EXISTS pcs_orders (
      order_id TEXT PRIMARY KEY,
      data JSONB NOT NULL
    );
  `);

  // One-time migration: copy the current JSON data into the database only when
  // the database table is empty. This keeps existing products/orders safe.
  const productCount = Number((await pool.query("SELECT COUNT(*)::int AS count FROM pcs_products")).rows[0].count);
  if (productCount === 0) {
    const products = readJson(PRODUCTS_FILE, []);
    for (const product of products) {
      await pool.query(
        "INSERT INTO pcs_products (id, data) VALUES ($1, $2::jsonb) ON CONFLICT (id) DO NOTHING",
        [product.id, JSON.stringify(product)]
      );
    }
  }

  const orderCount = Number((await pool.query("SELECT COUNT(*)::int AS count FROM pcs_orders")).rows[0].count);
  if (orderCount === 0) {
    const orders = readJson(ORDERS_FILE, []);
    for (const order of orders) {
      await pool.query(
        "INSERT INTO pcs_orders (order_id, data) VALUES ($1, $2::jsonb) ON CONFLICT (order_id) DO NOTHING",
        [order.orderId, JSON.stringify(order)]
      );
    }
  }
  dbReady = true;
  console.log("Permanent PostgreSQL storage is connected.");
}

async function getProducts() {
  if (!pool || !dbReady) return readJson(PRODUCTS_FILE, []);
  const result = await pool.query("SELECT data FROM pcs_products ORDER BY (data->>'createdAt') DESC");
  return result.rows.map(r => r.data);
}
async function saveProduct(product) {
  if (!pool || !dbReady) {
    const products = readJson(PRODUCTS_FILE, []);
    const i = products.findIndex(p => p.id === product.id);
    if (i >= 0) products[i] = product; else products.unshift(product);
    writeJson(PRODUCTS_FILE, products);
    return;
  }
  await pool.query(
    "INSERT INTO pcs_products (id, data) VALUES ($1, $2::jsonb) ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data",
    [product.id, JSON.stringify(product)]
  );
}
async function deleteProductById(id) {
  if (!pool || !dbReady) {
    const products = readJson(PRODUCTS_FILE, []);
    const next = products.filter(p => p.id !== id);
    writeJson(PRODUCTS_FILE, next);
    return next.length !== products.length;
  }
  const result = await pool.query("DELETE FROM pcs_products WHERE id = $1", [id]);
  return result.rowCount > 0;
}
async function getOrders() {
  if (!pool || !dbReady) return readJson(ORDERS_FILE, []);
  const result = await pool.query("SELECT data FROM pcs_orders ORDER BY (data->>'placedAt') DESC");
  return result.rows.map(r => r.data);
}
async function saveOrder(order) {
  if (!pool || !dbReady) {
    const orders = readJson(ORDERS_FILE, []);
    orders.unshift(order);
    writeJson(ORDERS_FILE, orders);
    return;
  }
  await pool.query(
    "INSERT INTO pcs_orders (order_id, data) VALUES ($1, $2::jsonb) ON CONFLICT (order_id) DO UPDATE SET data = EXCLUDED.data",
    [order.orderId, JSON.stringify(order)]
  );
}
async function updateOrder(order) {
  if (!pool || !dbReady) {
    const orders = readJson(ORDERS_FILE, []);
    const i = orders.findIndex(o => o.orderId === order.orderId);
    if (i < 0) return false;
    orders[i] = order;
    writeJson(ORDERS_FILE, orders);
    return true;
  }
  const result = await pool.query("UPDATE pcs_orders SET data = $2::jsonb WHERE order_id = $1", [order.orderId, JSON.stringify(order)]);
  return result.rowCount > 0;
}
async function deleteOrderById(id) {
  if (!pool || !dbReady) {
    const orders = readJson(ORDERS_FILE, []);
    const next = orders.filter(o => o.orderId !== id);
    writeJson(ORDERS_FILE, next);
    return next.length !== orders.length;
  }
  const result = await pool.query("DELETE FROM pcs_orders WHERE order_id = $1", [id]);
  return result.rowCount > 0;
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

app.get("/health", (req, res) => res.json({ ok: true, service: "premium-collection-by-sanjida", storage: pool && dbReady ? "postgresql" : "local-json" }));

app.get("/api/products", async (req, res) => {
  try { res.json(await getProducts()); }
  catch (e) { console.error(e); res.status(500).json({ message: "Could not load products" }); }
});

app.post("/api/products", auth, async (req, res) => {
  try {
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
    await saveProduct(product);
    res.status(201).json(product);
  } catch (e) { console.error(e); res.status(500).json({ message: "Could not save product" }); }
});

app.put("/api/products/:id", auth, async (req, res) => {
  try {
    const products = await getProducts();
    const i = products.findIndex(p => p.id === req.params.id);
    if (i < 0) return res.status(404).json({ message: "Product not found" });
    const old = products[i], b = req.body || {};
    const product = {
      ...old,
      name: String(b.name ?? old.name).trim(),
      group: b.group === "cosmetics" ? "cosmetics" : (b.group || old.group),
      subcategory: String(b.subcategory ?? old.subcategory ?? ""),
      price: Number(b.price ?? old.price ?? 0),
      description: String(b.description ?? old.description ?? ""),
      images: Array.isArray(b.images) ? b.images : (old.images || []),
      active: b.active !== false,
      updatedAt: new Date().toISOString()
    };
    await saveProduct(product);
    res.json(product);
  } catch (e) { console.error(e); res.status(500).json({ message: "Could not update product" }); }
});

app.delete("/api/products/:id", auth, async (req, res) => {
  try {
    if (!(await deleteProductById(req.params.id))) return res.status(404).json({ message: "Product not found" });
    res.json({ ok: true });
  } catch (e) { console.error(e); res.status(500).json({ message: "Could not delete product" }); }
});

app.post("/api/orders", async (req, res) => {
  try {
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
    await saveOrder(order);
    res.status(201).json({ ok: true, orderId: order.orderId });
  } catch (e) { console.error(e); res.status(500).json({ ok: false, message: "Could not save order" }); }
});

app.get("/api/admin/orders", auth, async (req, res) => {
  try { res.json({ orders: await getOrders() }); }
  catch (e) { console.error(e); res.status(500).json({ message: "Could not load orders" }); }
});

app.patch("/api/admin/orders/:id", auth, async (req, res) => {
  try {
    const orders = await getOrders();
    const i = orders.findIndex(o => o.orderId === req.params.id);
    if (i < 0) return res.status(404).json({ message: "Order not found" });
    orders[i].status = String(req.body?.status || "Pending");
    orders[i].updatedAt = new Date().toISOString();
    await updateOrder(orders[i]);
    res.json({ ok: true, order: orders[i] });
  } catch (e) { console.error(e); res.status(500).json({ message: "Could not update order" }); }
});

app.delete("/api/admin/orders/:id", auth, async (req, res) => {
  try {
    if (!(await deleteOrderById(req.params.id))) return res.status(404).json({ message: "Order not found" });
    res.json({ ok: true });
  } catch (e) { console.error(e); res.status(500).json({ message: "Could not delete order" }); }
});

app.get("/admin", (req, res) => res.sendFile(path.join(ROOT, "admin-login.html")));
app.get("/admin/", (req, res) => res.sendFile(path.join(ROOT, "admin-login.html")));
app.get("/admin/dashboard", (req, res) => res.sendFile(path.join(ROOT, "admin-dashboard.html")));
app.use(express.static(ROOT, { extensions: ["html"] }));
app.use((req, res) => {
  if (req.method === "GET" && !req.path.startsWith("/api/")) res.sendFile(path.join(ROOT, "index.html"));
  else res.status(404).json({ message: "Not found" });
});

(async () => {
  try {
    await initDatabase();
    app.listen(PORT, () => console.log(`Premium Collection By Sanjida running on port ${PORT}`));
  } catch (e) {
    console.error("DATABASE CONNECTION FAILED:", e.message);
    console.error("If DATABASE_URL is set, fix the database connection before starting the site.");
    process.exit(1);
  }
})();
