const STORAGE_KEY = "stockOpnameApp.v1";

const sampleItems = [
  { barcode: "8991002100014", sku: "SKU-001", name: "Rice Premium 5kg", category: "Groceries", unit: "bag", location: "Aisle A / Rack 01", systemStock: 42, cost: 58000, price: 69500, minStock: 10 },
  { barcode: "8992775311018", sku: "SKU-002", name: "Cooking Oil 2L", category: "Groceries", unit: "bottle", location: "Aisle A / Rack 04", systemStock: 36, cost: 28500, price: 34900, minStock: 12 },
  { barcode: "8999999001457", sku: "SKU-003", name: "Instant Noodle Chicken", category: "Food", unit: "pcs", location: "Aisle B / Rack 02", systemStock: 180, cost: 2450, price: 3200, minStock: 50 },
  { barcode: "8991234567890", sku: "SKU-004", name: "Mineral Water 600ml", category: "Beverage", unit: "bottle", location: "Aisle C / Cooler", systemStock: 96, cost: 2300, price: 3500, minStock: 36 }
];

let state = loadState();

const els = {
  views: document.querySelectorAll(".view"),
  moduleCards: document.querySelectorAll(".module-card"),
  masterTable: document.getElementById("masterTable"),
  countTable: document.getElementById("countTable"),
  itemForm: document.getElementById("itemForm"),
  importMasterInput: document.getElementById("importMasterInput"),
  scanInput: document.getElementById("scanInput"),
  scanResult: document.getElementById("scanResult"),
  masterSearch: document.getElementById("masterSearch"),
  sessionName: document.getElementById("sessionName"),
  countLocation: document.getElementById("countLocation"),
  toast: document.getElementById("toast")
};

document.addEventListener("DOMContentLoaded", () => {
  bindEvents();
  renderAll();
  document.getElementById("storageStatus").textContent = window.XLSX ? "Excel ready" : "Excel CDN loading";
  setTimeout(() => {
    document.getElementById("storageStatus").textContent = window.XLSX ? "Excel ready" : "Excel fallback";
  }, 900);
});

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (saved && Array.isArray(saved.items)) return saved;
  } catch (error) {
    console.warn(error);
  }
  return {
    items: sampleItems,
    counts: {},
    sessionName: `Stock Opname ${new Date().toLocaleDateString("en-GB")}`,
    countLocation: "Main Store",
    updatedAt: new Date().toISOString()
  };
}

function saveState() {
  state.updatedAt = new Date().toISOString();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function bindEvents() {
  els.moduleCards.forEach((card) => {
    card.addEventListener("click", () => activateView(card.dataset.view));
  });

  els.itemForm.addEventListener("submit", saveItemFromForm);
  document.getElementById("cancelEditBtn").addEventListener("click", clearItemForm);
  document.getElementById("addItemBtn").addEventListener("click", () => document.getElementById("barcode").focus());
  document.getElementById("downloadTemplateBtn").addEventListener("click", downloadTemplate);
  document.getElementById("exportMasterBtn").addEventListener("click", () => exportRows("master-data", masterRows()));
  document.getElementById("exportResultsBtn").addEventListener("click", () => exportRows("stock-count-result", countRows(false)));
  document.getElementById("exportVarianceBtn").addEventListener("click", () => exportRows("variance-report", countRows(true)));
  document.getElementById("resetCountBtn").addEventListener("click", resetCount);
  els.importMasterInput.addEventListener("change", importMasterFile);
  els.scanInput.addEventListener("keydown", handleScan);
  els.masterSearch.addEventListener("input", renderMasterTable);
  els.sessionName.addEventListener("input", (event) => {
    state.sessionName = event.target.value;
    saveState();
  });
  els.countLocation.addEventListener("input", (event) => {
    state.countLocation = event.target.value;
    saveState();
  });
}

function activateView(viewId) {
  els.views.forEach((view) => view.classList.toggle("active", view.id === viewId));
  els.moduleCards.forEach((card) => card.classList.toggle("active", card.dataset.view === viewId));
  if (viewId === "countView") setTimeout(() => els.scanInput.focus(), 100);
}

function renderAll() {
  els.sessionName.value = state.sessionName || "";
  els.countLocation.value = state.countLocation || "";
  renderMasterTable();
  renderCountTable();
  renderMetrics();
}

function renderMasterTable() {
  const term = els.masterSearch.value.trim().toLowerCase();
  const rows = state.items.filter((item) => {
    return [item.barcode, item.sku, item.name, item.category, item.location].some((value) => String(value || "").toLowerCase().includes(term));
  });
  els.masterTable.innerHTML = rows.map((item) => `
    <tr>
      <td>${escapeHtml(item.barcode)}</td>
      <td>${escapeHtml(item.sku)}</td>
      <td>${escapeHtml(item.name)}</td>
      <td>${escapeHtml(item.category)}</td>
      <td>${escapeHtml(item.location)}</td>
      <td class="num">${number(item.systemStock)}</td>
      <td class="num">${rupiah(item.price)}</td>
      <td>
        <div class="row-actions">
          <button class="icon-btn" type="button" title="Edit" onclick="editItem('${escapeAttr(item.barcode)}')">✎</button>
          <button class="icon-btn" type="button" title="Delete" onclick="deleteItem('${escapeAttr(item.barcode)}')">×</button>
        </div>
      </td>
    </tr>
  `).join("") || `<tr><td colspan="8">No items found.</td></tr>`;
}

function renderCountTable() {
  const rows = state.items
    .map((item) => ({ item, counted: Number(state.counts[item.barcode] || 0) }))
    .filter(({ counted }) => counted > 0);
  els.countTable.innerHTML = rows.map(({ item, counted }) => {
    const variance = counted - Number(item.systemStock || 0);
    const value = variance * Number(item.cost || item.price || 0);
    return `
      <tr>
        <td>${escapeHtml(item.barcode)}</td>
        <td>${escapeHtml(item.sku)}</td>
        <td>${escapeHtml(item.name)}</td>
        <td>${escapeHtml(item.location)}</td>
        <td class="num">${number(item.systemStock)}</td>
        <td class="num"><input type="number" min="0" step="1" value="${counted}" onchange="setCount('${escapeAttr(item.barcode)}', this.value)" /></td>
        <td class="num ${varianceClass(variance)}">${signed(variance)}</td>
        <td class="num">${rupiah(value)}</td>
        <td><button class="icon-btn" type="button" title="Clear count" onclick="clearCount('${escapeAttr(item.barcode)}')">×</button></td>
      </tr>
    `;
  }).join("") || `<tr><td colspan="9">No counted items yet. Scan a barcode to start.</td></tr>`;
}

function renderMetrics() {
  const countedItems = Object.values(state.counts).filter((qty) => Number(qty) > 0).length;
  const varianceQty = state.items.reduce((sum, item) => sum + (Number(state.counts[item.barcode] || 0) - Number(item.systemStock || 0)), 0);
  const varianceValue = state.items.reduce((sum, item) => {
    const variance = Number(state.counts[item.barcode] || 0) - Number(item.systemStock || 0);
    return sum + variance * Number(item.cost || item.price || 0);
  }, 0);
  document.getElementById("metricItems").textContent = number(state.items.length);
  document.getElementById("metricCounted").textContent = number(countedItems);
  document.getElementById("metricVariance").textContent = signed(varianceQty);
  document.getElementById("metricValue").textContent = rupiah(varianceValue);
}

function saveItemFromForm(event) {
  event.preventDefault();
  const editingBarcode = document.getElementById("editingBarcode").value;
  const item = {
    barcode: field("barcode"),
    sku: field("sku"),
    name: field("name"),
    category: field("category"),
    unit: field("unit"),
    location: field("location"),
    systemStock: Number(field("systemStock")),
    cost: Number(field("price")),
    price: Number(field("price")),
    minStock: 0
  };
  const barcodeExists = state.items.some((row) => row.barcode === item.barcode && row.barcode !== editingBarcode);
  if (barcodeExists) {
    showToast("Barcode already exists in master data.");
    return;
  }
  if (editingBarcode) {
    state.items = state.items.map((row) => row.barcode === editingBarcode ? item : row);
    if (editingBarcode !== item.barcode && state.counts[editingBarcode]) {
      state.counts[item.barcode] = state.counts[editingBarcode];
      delete state.counts[editingBarcode];
    }
  } else {
    state.items.unshift(item);
  }
  saveState();
  clearItemForm();
  renderAll();
  showToast("Item saved.");
}

function field(id) {
  return document.getElementById(id).value.trim();
}

function clearItemForm() {
  els.itemForm.reset();
  document.getElementById("editingBarcode").value = "";
  document.getElementById("systemStock").value = 0;
  document.getElementById("price").value = 0;
}

function editItem(barcode) {
  const item = state.items.find((row) => row.barcode === barcode);
  if (!item) return;
  document.getElementById("editingBarcode").value = item.barcode;
  ["barcode", "sku", "name", "category", "unit", "location", "systemStock", "price"].forEach((id) => {
    document.getElementById(id).value = item[id] ?? "";
  });
  activateView("masterView");
  document.getElementById("barcode").focus();
}

function deleteItem(barcode) {
  state.items = state.items.filter((item) => item.barcode !== barcode);
  delete state.counts[barcode];
  saveState();
  renderAll();
  showToast("Item deleted.");
}

function handleScan(event) {
  if (event.key !== "Enter") return;
  event.preventDefault();
  const barcode = els.scanInput.value.trim();
  if (!barcode) return;
  const item = state.items.find((row) => row.barcode === barcode);
  if (!item) {
    setScanResult(`Barcode ${barcode} not found in master data.`, "error");
    els.scanInput.select();
    return;
  }
  state.counts[barcode] = Number(state.counts[barcode] || 0) + 1;
  saveState();
  renderAll();
  setScanResult(`${item.name} counted. Qty: ${state.counts[barcode]}`, "success");
  els.scanInput.value = "";
}

function setScanResult(text, type) {
  els.scanResult.textContent = text;
  els.scanResult.className = `scan-result ${type || ""}`;
}

function setCount(barcode, value) {
  const qty = Math.max(0, Number(value || 0));
  if (qty === 0) delete state.counts[barcode];
  else state.counts[barcode] = qty;
  saveState();
  renderAll();
}

function clearCount(barcode) {
  delete state.counts[barcode];
  saveState();
  renderAll();
}

function resetCount() {
  state.counts = {};
  saveState();
  renderAll();
  setScanResult("Count has been reset.", "");
  showToast("Stock count reset.");
}

async function importMasterFile(event) {
  const file = event.target.files[0];
  if (!file) return;
  try {
    const rows = await readSheetRows(file);
    const items = rows.map(normalizeImportRow).filter((item) => item.barcode && item.name);
    if (!items.length) throw new Error("No valid item rows found.");
    const byBarcode = new Map(state.items.map((item) => [item.barcode, item]));
    items.forEach((item) => byBarcode.set(item.barcode, item));
    state.items = Array.from(byBarcode.values());
    saveState();
    renderAll();
    showToast(`${items.length} item rows imported.`);
  } catch (error) {
    showToast(error.message || "Import failed.");
  } finally {
    event.target.value = "";
  }
}

function readSheetRows(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        if (window.XLSX) {
          const workbook = XLSX.read(reader.result, { type: "array" });
          const sheet = workbook.Sheets[workbook.SheetNames[0]];
          resolve(XLSX.utils.sheet_to_json(sheet, { defval: "" }));
        } else if (file.name.toLowerCase().endsWith(".xls") || file.type.includes("html")) {
          const text = new TextDecoder().decode(reader.result);
          resolve(htmlTableToRows(text));
        } else {
          const text = new TextDecoder().decode(reader.result);
          resolve(csvToRows(text));
        }
      } catch (error) {
        reject(error);
      }
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(file);
  });
}

function normalizeImportRow(row) {
  const get = (...keys) => {
    const key = keys.find((candidate) => Object.prototype.hasOwnProperty.call(row, candidate));
    return key ? row[key] : "";
  };
  return {
    barcode: String(get("Barcode", "barcode", "BARCODE")).trim(),
    sku: String(get("SKU", "Sku", "sku")).trim(),
    name: String(get("Item Name", "Name", "Product Name", "name")).trim(),
    category: String(get("Category", "category")).trim(),
    unit: String(get("Unit", "unit")).trim() || "pcs",
    systemStock: Number(get("System Stock", "Stock", "Qty System", "systemStock") || 0),
    cost: Number(get("Cost", "HPP", "cost") || get("Price", "price") || 0),
    price: Number(get("Price", "Selling Price", "price") || 0),
    location: String(get("Location", "Rack", "location")).trim(),
    minStock: Number(get("Min Stock", "minStock") || 0)
  };
}

function masterRows() {
  return state.items.map((item) => ({
    Barcode: item.barcode,
    SKU: item.sku,
    "Item Name": item.name,
    Category: item.category,
    Unit: item.unit,
    "System Stock": item.systemStock,
    Cost: item.cost || item.price || 0,
    Price: item.price || 0,
    Location: item.location,
    "Min Stock": item.minStock || 0
  }));
}

function countRows(varianceOnly) {
  const timestamp = new Date().toLocaleString("en-GB");
  return state.items.map((item) => {
    const counted = Number(state.counts[item.barcode] || 0);
    const variance = counted - Number(item.systemStock || 0);
    return {
      Session: state.sessionName || "",
      Location: state.countLocation || item.location || "",
      Barcode: item.barcode,
      SKU: item.sku,
      "Item Name": item.name,
      Category: item.category,
      Unit: item.unit,
      "System Stock": Number(item.systemStock || 0),
      "Counted Qty": counted,
      Variance: variance,
      "Variance Value": variance * Number(item.cost || item.price || 0),
      "Counted At": timestamp
    };
  }).filter((row) => !varianceOnly || row.Variance !== 0);
}

function downloadTemplate() {
  const templateRows = [
    { Barcode: "8991002100014", SKU: "SKU-001", "Item Name": "Rice Premium 5kg", Category: "Groceries", Unit: "bag", "System Stock": 42, Cost: 58000, Price: 69500, Location: "Aisle A / Rack 01", "Min Stock": 10 },
    { Barcode: "8992775311018", SKU: "SKU-002", "Item Name": "Cooking Oil 2L", Category: "Groceries", Unit: "bottle", "System Stock": 36, Cost: 28500, Price: 34900, Location: "Aisle A / Rack 04", "Min Stock": 12 }
  ];
  const instructions = [
    { Field: "Barcode", Note: "Required. Keep as text to preserve leading zeroes." },
    { Field: "SKU", Note: "Required internal item code." },
    { Field: "Item Name", Note: "Required product display name." },
    { Field: "System Stock", Note: "Current stock from POS/ERP before physical count." },
    { Field: "Location", Note: "Shelf, aisle, warehouse, or store area." }
  ];
  exportWorkbook("master-data-template", [
    { name: "Master Data", rows: templateRows },
    { name: "Instructions", rows: instructions }
  ]);
}

function exportRows(name, rows) {
  if (!rows.length) {
    showToast("No rows to export.");
    return;
  }
  exportWorkbook(name, [{ name: "Data", rows }]);
}

function exportWorkbook(name, sheets) {
  if (window.XLSX) {
    const workbook = XLSX.utils.book_new();
    sheets.forEach((sheetConfig) => {
      const sheet = XLSX.utils.json_to_sheet(sheetConfig.rows);
      sheet["!cols"] = Object.keys(sheetConfig.rows[0] || {}).map((key) => ({ wch: Math.max(12, key.length + 4) }));
      XLSX.utils.book_append_sheet(workbook, sheet, sheetConfig.name);
    });
    XLSX.writeFile(workbook, `${name}.xlsx`);
    showToast(`${name}.xlsx downloaded.`);
  } else {
    downloadExcelHtml(`${name}.xls`, sheets);
    showToast(`${name}.xls downloaded.`);
  }
}

function downloadExcelHtml(filename, sheets) {
  const sheetHtml = sheets.map((sheet) => `
    <h2>${escapeHtml(sheet.name)}</h2>
    <table>
      <thead><tr>${Object.keys(sheet.rows[0] || {}).map((header) => `<th>${escapeHtml(header)}</th>`).join("")}</tr></thead>
      <tbody>
        ${sheet.rows.map((row) => `<tr>${Object.values(row).map((value) => `<td>${escapeHtml(value)}</td>`).join("")}</tr>`).join("")}
      </tbody>
    </table>
  `).join("<br>");
  const html = `<!doctype html><html><head><meta charset="utf-8"></head><body>${sheetHtml}</body></html>`;
  const blob = new Blob([html], { type: "application/vnd.ms-excel;charset=utf-8" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
}

function downloadCsv(filename, rows) {
  const headers = Object.keys(rows[0] || {});
  const csv = [headers.join(","), ...rows.map((row) => headers.map((header) => csvCell(row[header])).join(","))].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
}

function htmlTableToRows(text) {
  const doc = new DOMParser().parseFromString(text, "text/html");
  const table = doc.querySelector("table");
  if (!table) return csvToRows(text);
  const headers = Array.from(table.querySelectorAll("thead th")).map((cell) => cell.textContent.trim());
  return Array.from(table.querySelectorAll("tbody tr")).map((row) => {
    const cells = Array.from(row.children).map((cell) => cell.textContent.trim());
    return Object.fromEntries(headers.map((header, index) => [header, cells[index] || ""]));
  });
}

function csvToRows(text) {
  const lines = text.split(/\r?\n/).filter(Boolean);
  const headers = lines.shift().split(",").map((header) => header.trim());
  return lines.map((line) => {
    const values = line.split(",");
    return Object.fromEntries(headers.map((header, index) => [header, values[index] || ""]));
  });
}

function csvCell(value) {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function number(value) {
  return new Intl.NumberFormat("en-US").format(Number(value || 0));
}

function signed(value) {
  const num = Number(value || 0);
  return `${num > 0 ? "+" : ""}${number(num)}`;
}

function rupiah(value) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(Number(value || 0));
}

function varianceClass(value) {
  if (value > 0) return "variance-positive";
  if (value < 0) return "variance-negative";
  return "variance-zero";
}

function showToast(message) {
  els.toast.textContent = message;
  els.toast.classList.add("show");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => els.toast.classList.remove("show"), 2600);
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[char]));
}

function escapeAttr(value) {
  return escapeHtml(value).replace(/`/g, "&#096;");
}

window.editItem = editItem;
window.deleteItem = deleteItem;
window.setCount = setCount;
window.clearCount = clearCount;
