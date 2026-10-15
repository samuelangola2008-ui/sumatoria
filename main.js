"use strict";

/* =========================================================
   CONFIGURACIÓN
   Para cambiar los precios por defecto, edita "price" aquí
   (o cámbialos directamente en la pantalla; se guardan solos).
   ========================================================= */
const PRODUCTS = [
  { id: "pequena", name: "Pequeña", emoji: "🍟", price: 10000 },
  { id: "mediana", name: "Mediana", emoji: "🌭", price: 14000 },
  { id: "grande",  name: "Grande",  emoji: "🔥", price: 18000 },
];

const KEY_SALES  = "salchipapas_ventas";
const KEY_PRICES = "salchipapas_precios";

/* ---------- Utilidades ---------- */
const $ = (id) => document.getElementById(id);

const copFormatter = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 0,
});
const money = (n) => copFormatter.format(n);

const todayKey = (d = new Date()) => d.toLocaleDateString("en-CA"); // YYYY-MM-DD local

function loadJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}
function saveJSON(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    showToast("⚠️ No se pudo guardar en el navegador");
  }
}

/* ---------- Estado ---------- */
let sales  = loadJSON(KEY_SALES, []);
let prices = loadJSON(KEY_PRICES, {});
PRODUCTS.forEach((p) => {
  const saved = Number(prices[p.id]);
  prices[p.id] = Number.isFinite(saved) && saved >= 0 && prices[p.id] !== undefined ? saved : p.price;
});

/* ---------- Referencias DOM ---------- */
const form       = $("saleForm");
const customerEl = $("customer");
const rowsEl     = $("productRows");
const totalEl    = $("orderTotal");
const errorEl    = $("formError");
const bodyEl     = $("salesBody");
const emptyEl    = $("emptyMsg");
const filterEl   = $("filter");
const toastEl    = $("toast");

const rowRefs = {}; // id -> { qty, price, subtotal }

/* ---------- Construir filas de productos ---------- */
function buildRows() {
  PRODUCTS.forEach((p) => {
    const row = document.createElement("div");
    row.className = "product-row";

    // Nombre
    const name = document.createElement("div");
    name.className = "product-name";
    const emoji = document.createElement("span");
    emoji.className = "emoji";
    emoji.textContent = p.emoji;
    const label = document.createElement("span");
    label.textContent = "Salchipapa " + p.name.toLowerCase();
    name.append(emoji, label);

    // Precio
    const priceWrap = document.createElement("div");
    priceWrap.className = "price-wrap";
    const priceInput = document.createElement("input");
    priceInput.type = "number";
    priceInput.min = "0";
    priceInput.step = "500";
    priceInput.inputMode = "numeric";
    priceInput.value = prices[p.id];
    priceInput.setAttribute("aria-label", "Precio unitario " + p.name);
    priceWrap.append(priceInput);

    // Cantidad
    const qtyWrap = document.createElement("div");
    qtyWrap.className = "qty-wrap";
    const minus = document.createElement("button");
    minus.type = "button";
    minus.className = "qty-btn";
    minus.textContent = "−";
    minus.setAttribute("aria-label", "Restar una " + p.name);
    const qtyInput = document.createElement("input");
    qtyInput.type = "number";
    qtyInput.min = "0";
    qtyInput.step = "1";
    qtyInput.inputMode = "numeric";
    qtyInput.value = "0";
    qtyInput.setAttribute("aria-label", "Cantidad " + p.name);
    const plus = document.createElement("button");
    plus.type = "button";
    plus.className = "qty-btn";
    plus.textContent = "+";
    plus.setAttribute("aria-label", "Sumar una " + p.name);
    qtyWrap.append(minus, qtyInput, plus);

    // Subtotal
    const subtotal = document.createElement("div");
    subtotal.className = "subtotal";
    subtotal.textContent = money(0);

    row.append(name, priceWrap, qtyWrap, subtotal);
    rowsEl.append(row);

    rowRefs[p.id] = { qty: qtyInput, price: priceInput, subtotal };

    // Eventos
    minus.addEventListener("click", () => {
      qtyInput.value = Math.max(0, (parseInt(qtyInput.value, 10) || 0) - 1);
      recalc();
    });
    plus.addEventListener("click", () => {
      qtyInput.value = (parseInt(qtyInput.value, 10) || 0) + 1;
      recalc();
    });
    qtyInput.addEventListener("input", recalc);
    priceInput.addEventListener("input", () => {
      recalc();
      const v = Number(priceInput.value);
      if (priceInput.value !== "" && Number.isFinite(v) && v >= 0) {
        prices[p.id] = v;
        saveJSON(KEY_PRICES, prices);
      }
    });
  });
}

/* ---------- Cálculo del pedido ---------- */
function readOrder() {
  return PRODUCTS.map((p) => {
    const r = rowRefs[p.id];
    const qty = Number(r.qty.value);
    const price = Number(r.price.value);
    return {
      id: p.id,
      name: p.name,
      qty,
      price,
      qtyRaw: r.qty.value,
      priceRaw: r.price.value,
    };
  });
}

function recalc() {
  let total = 0;
  readOrder().forEach((it) => {
    const valid = Number.isFinite(it.qty) && it.qty > 0 && Number.isFinite(it.price) && it.price >= 0;
    const sub = valid ? it.qty * it.price : 0;
    rowRefs[it.id].subtotal.textContent = money(sub);
    total += sub;
  });
  totalEl.textContent = money(total) + " COP";
  return total;
}

/* ---------- Validación ---------- */
function validate() {
  const items = readOrder();
  let error = "";
  let firstBad = null;

  [customerEl, ...Object.values(rowRefs).flatMap((r) => [r.qty, r.price])]
    .forEach((el) => el.classList.remove("invalid"));

  if (customerEl.value.trim() === "") {
    error = "Escribe el nombre del cliente.";
    firstBad = customerEl;
  }

  if (!error) {
    for (const it of items) {
      const r = rowRefs[it.id];
      if (it.qtyRaw === "" || !Number.isFinite(it.qty) || it.qty < 0) {
        error = "La cantidad no puede estar vacía ni ser negativa (" + it.name + ").";
        firstBad = r.qty;
        break;
      }
      if (!Number.isInteger(it.qty)) {
        error = "La cantidad debe ser un número entero (" + it.name + ").";
        firstBad = r.qty;
        break;
      }
      if (it.priceRaw === "" || !Number.isFinite(it.price) || it.price < 0) {
        error = "El precio no puede estar vacío ni ser negativo (" + it.name + ").";
        firstBad = r.price;
        break;
      }
    }
  }

  if (!error && !items.some((it) => it.qty > 0)) {
    error = "Agrega al menos una salchipapa al pedido.";
    firstBad = rowRefs[PRODUCTS[0].id].qty;
  }

  errorEl.textContent = error;
  if (firstBad) {
    firstBad.classList.add("invalid");
    firstBad.focus();
  }
  return error === "" ? items : null;
}

/* ---------- Registrar venta ---------- */
form.addEventListener("submit", (e) => {
  e.preventDefault();
  const items = validate();
  if (!items) return;

  const chosen = items
    .filter((it) => it.qty > 0)
    .map((it) => ({ id: it.id, name: it.name, qty: it.qty, price: it.price }));

  const sale = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
    customer: customerEl.value.trim(),
    items: chosen,
    units: chosen.reduce((s, it) => s + it.qty, 0),
    total: chosen.reduce((s, it) => s + it.qty * it.price, 0),
    day: todayKey(),
    time: new Date().toISOString(),
  };

  sales.push(sale);
  saveJSON(KEY_SALES, sales);

  resetForm();
  render();
  showToast("✅ Venta registrada: " + money(sale.total));
});

/* ---------- Limpiar formulario ---------- */
function resetForm() {
  customerEl.value = "";
  PRODUCTS.forEach((p) => {
    rowRefs[p.id].qty.value = "0";
    rowRefs[p.id].price.value = prices[p.id];
  });
  errorEl.textContent = "";
  document.querySelectorAll(".invalid").forEach((el) => el.classList.remove("invalid"));
  recalc();
  customerEl.focus();
}
$("btnClear").addEventListener("click", resetForm);

/* ---------- Eliminar venta ---------- */
function deleteSale(id) {
  const sale = sales.find((s) => s.id === id);
  if (!sale) return;
  if (!confirm("¿Eliminar la venta de " + sale.customer + " por " + money(sale.total) + "?")) return;
  sales = sales.filter((s) => s.id !== id);
  saveJSON(KEY_SALES, sales);
  render();
  showToast("🗑️ Venta eliminada");
}

/* ---------- Render: resumen + tabla ---------- */
function render() {
  const today = todayKey();
  const todays = sales.filter((s) => s.day === today);

  const sum = (arr, k) => arr.reduce((acc, s) => acc + s[k], 0);

  $("statTodayMoney").textContent  = money(sum(todays, "total"));
  $("statTodayOrders").textContent = todays.length;
  $("statTodayUnits").textContent  = sum(todays, "units");
  $("statAllMoney").textContent    = money(sum(sales, "total"));
  $("statAllDetail").textContent   =
    sales.length + (sales.length === 1 ? " pedido" : " pedidos") + " · " +
    sum(sales, "units") + " salchipapas";

  const list = (filterEl.value === "hoy" ? todays : sales).slice().reverse();

  bodyEl.replaceChildren();
  emptyEl.hidden = list.length > 0;

  list.forEach((s) => {
    const tr = document.createElement("tr");

    const tdClient = document.createElement("td");
    tdClient.dataset.label = "Cliente";
    const nameEl = document.createElement("span");
    nameEl.className = "client-name";
    nameEl.textContent = s.customer;
    const timeEl = document.createElement("span");
    timeEl.className = "client-time";
    const d = new Date(s.time);
    timeEl.textContent =
      (s.day === today ? "" : d.toLocaleDateString("es-CO") + " ") +
      d.toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" });
    tdClient.append(nameEl, timeEl);

    const tdProducts = document.createElement("td");
    tdProducts.dataset.label = "Productos";
    const ul = document.createElement("ul");
    ul.className = "items-list";
    s.items.forEach((it) => {
      const li = document.createElement("li");
      li.textContent = "Salchipapa " + it.name.toLowerCase() + " · " + money(it.price) + " c/u";
      ul.append(li);
    });
    tdProducts.append(ul);

    const tdQty = document.createElement("td");
    tdQty.dataset.label = "Cantidades";
    const ulQ = document.createElement("ul");
    ulQ.className = "items-list";
    s.items.forEach((it) => {
      const li = document.createElement("li");
      li.textContent = it.qty + " × " + it.name.toLowerCase();
      ulQ.append(li);
    });
    tdQty.append(ulQ);

    const tdTotal = document.createElement("td");
    tdTotal.className = "total";
    tdTotal.dataset.label = "Total";
    tdTotal.textContent = money(s.total);

    const tdAct = document.createElement("td");
    tdAct.dataset.label = "Acción";
    const del = document.createElement("button");
    del.type = "button";
    del.className = "btn-delete";
    del.textContent = "🗑️ Eliminar";
    del.addEventListener("click", () => deleteSale(s.id));
    tdAct.append(del);

    tr.append(tdClient, tdProducts, tdQty, tdTotal, tdAct);
    bodyEl.append(tr);
  });
}

filterEl.addEventListener("change", render);

/* ---------- Toast ---------- */
let toastTimer;
function showToast(msg) {
  toastEl.textContent = msg;
  toastEl.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove("show"), 2600);
}

/* ---------- Inicio ---------- */
$("todayLabel").textContent = new Date().toLocaleDateString("es-CO", {
  weekday: "long", day: "numeric", month: "long", year: "numeric",
});
buildRows();
recalc();
render();
