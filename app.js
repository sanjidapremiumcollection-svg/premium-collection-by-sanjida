function getCart() {
  try { return JSON.parse(localStorage.getItem("pcs_cart") || "[]"); } catch { return []; }
}
function saveCart(cart) { localStorage.setItem("pcs_cart", JSON.stringify(cart)); }
function updateCount() {
  const el = document.getElementById("cartCount");
  if (el) el.textContent = getCart().reduce((s, p) => s + (p.qty || 1), 0);
}
function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>'"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c]));
}
function buyNow(product) {
  window.location.href = "/product.html?id=" + encodeURIComponent(product.id);
}
function productCard(product) {
  const name = escapeHTML(product.name);
  const description = escapeHTML(product.description || "");
  const image = (Array.isArray(product.images) && product.images[0]) || product.image || "/assets/product-placeholder.svg";
  const groupLabel = product.group === "clothing" ? "Women's Clothing" : "Women's Cosmetics";
  const subcategory = escapeHTML(product.subcategory || "");
  return `
    <article class="product-card premium-product">
      <div class="product-image-wrap">
        <img class="product-real-image" src="${escapeHTML(image)}" alt="${name}" onerror="this.style.display='none';this.nextElementSibling.style.display='grid'">
        <div class="product-placeholder" style="display:none"><span>${subcategory.toUpperCase()}</span></div>
      </div>
      <div class="product-info">
        <p class="product-category">${groupLabel} · ${subcategory}</p>
        <h3><a href="/product.html?id=${encodeURIComponent(product.id)}" style="color:inherit;text-decoration:none">${name}</a></h3>
        ${description ? `<p class="product-description">${description}</p>` : ""}
        <strong>৳ ${Number(product.price || 0).toLocaleString("en-BD")}.00</strong>
        <button class="btn buy-now" data-id="${escapeHTML(product.id)}">BUY NOW</button>
      </div>
    </article>`;
}
async function loadFeaturedProducts() {
  try {
    const response = await fetch("/api/products");
    if (!response.ok) throw new Error("Products unavailable");
    const products = (await response.json()).filter(p => p.active !== false);
    const clothing = products.filter(p => p.group === "clothing");
    const cosmetics = products.filter(p => p.group === "cosmetics");
    const clothingGrid = document.getElementById("clothingProducts");
    const cosmeticsGrid = document.getElementById("cosmeticsProducts");
    clothingGrid.innerHTML = clothing.length ? clothing.map(productCard).join("") : "";
    cosmeticsGrid.innerHTML = cosmetics.length ? cosmetics.map(productCard).join("") : "";
    document.getElementById("clothingEmpty").hidden = clothing.length > 0;
    document.getElementById("cosmeticsEmpty").hidden = cosmetics.length > 0;
    document.querySelectorAll(".buy-now").forEach(btn => {
      btn.addEventListener("click", () => {
        const p = products.find(item => item.id === btn.dataset.id);
        if (p) buyNow(p);
      });
    });
  } catch (error) {
    document.getElementById("clothingProducts").innerHTML = "";
    document.getElementById("cosmeticsProducts").innerHTML = "";
    document.getElementById("clothingEmpty").hidden = false;
    document.getElementById("cosmeticsEmpty").hidden = false;
  }
}
updateCount();
loadFeaturedProducts();
