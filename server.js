const express = require("express");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

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

const sessions = new Map();
const ADMIN_NUMBER = process.env.ADMIN_NUMBER || "01918444462";
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || "sanjidacollection";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "Sanjida@123";

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

app.get("/api/products", (req, res) => {
  res.json(readJson(PRODUCTS_FILE, []));
});

app.post("/api/products", auth, (req, res) => {
  const body = req.body || {};
  if (!String(body.name || "").trim()) return res.status(400).json({ message: "Product name is required" });
  const products = readJson(PRODUCTS_FILE, []);
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
  products.unshift(product);
  writeJson(PRODUCTS_FILE, products);
  res.status(201).json(product);
});

app.put("/api/products/:id", auth, (req, res) => {
  const products = readJson(PRODUCTS_FILE, []);
  const i = products.findIndex(p => p.id === req.params.id);
  if (i < 0) return res.status(404).json({ message: "Product not found" });
  const b = req.body || {};
  products[i] = {
    ...products[i],
    name: String(b.name ?? products[i].name).trim(),
    group: b.group === "cosmetics" ? "cosmetics" : (b.group || products[i].group),
    subcategory: String(b.subcategory ?? products[i].subcategory || ""),
    price: Number(b.price ?? products[i].price ?? 0),
    description: String(b.description ?? products[i].description || ""),
    images: Array.isArray(b.images) ? b.images : (products[i].images || []),
    active: b.active !== false,
    updatedAt: new Date().toISOString()
  };
  writeJson(PRODUCTS_FILE, products);
  res.json(products[i]);
});

app.delete("/api/products/:id", auth, (req, res) => {
  const products = readJson(PRODUCTS_FILE, []);
  const next = products.filter(p => p.id !== req.params.id);
  if (next.length === products.length) return res.status(404).json({ message: "Product not found" });
  writeJson(PRODUCTS_FILE, next);
  res.json({ ok: true });
});

app.post("/api/orders", (req, res) => {
  const b = req.body || {};
  if (!b.customer || !b.shipping || !Array.isArray(b.items) || !b.items.length) {
    return res.status(400).json({ ok: false, message: "Incomplete order information" });
  }
  const orders = readJson(ORDERS_FILE, []);
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
  orders.unshift(order);
  writeJson(ORDERS_FILE, orders);
  res.status(201).json({ ok: true, orderId: order.orderId });
});

app.get("/api/admin/orders", auth, (req, res) => {
  res.json({ orders: readJson(ORDERS_FILE, []) });
});

app.patch("/api/admin/orders/:id", auth, (req, res) => {
  const orders = readJson(ORDERS_FILE, []);
  const i = orders.findIndex(o => o.orderId === req.params.id);
  if (i < 0) return res.status(404).json({ message: "Order not found" });
  orders[i].status = String(req.body?.status || "Pending");
  orders[i].updatedAt = new Date().toISOString();
  writeJson(ORDERS_FILE, orders);
  res.json({ ok: true, order: orders[i] });
});

app.delete("/api/admin/orders/:id", auth, (req, res) => {
  const orders = readJson(ORDERS_FILE, []);
  const next = orders.filter(o => o.orderId !== req.params.id);
  if (next.length === orders.length) return res.status(404).json({ message: "Order not found" });
  writeJson(ORDERS_FILE, next);
  res.json({ ok: true });
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

app.listen(PORT, () => console.log(`Premium Collection By Sanjida running on port ${PORT}`));
