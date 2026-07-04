import {
  getFirestore,
  collection,
  addDoc,
  getDocs
} from "https://www.gstatic.com/firebasejs/12.15.0/firebase-firestore.js";
const db = getFirestore(window.firebaseApp);
/* =========================================================
   DairyDesk — Milk Supply Management System
   Vanilla JavaScript — Local Storage powered
   ========================================================= */

/* ---------------------------------------------------------
   1. DATA STORE
   --------------------------------------------------------- */
const DB_KEYS = {
  customers: 'dd_customers',
  entries: 'dd_entries',  
  payments: 'dd_payments',
  settings: 'dd_settings',
  counters: 'dd_counters'
};

const Store = {
  get(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) {
      console.error('Storage read error', e);
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (e) {
      console.error('Storage write error', e);
      toast('Storage Error', 'Could not save data. Storage might be full.', 'danger');
      return false;
    }
  }
};

let customers = Store.get(DB_KEYS.customers, []);
let entries = Store.get(DB_KEYS.entries, []);
let payments = Store.get(DB_KEYS.payments, []); // { id, customerId, month(YYYY-MM), paidAmount, status, paymentDate, paymentMethod }
let settings = Store.get(DB_KEYS.settings, { businessName: 'Pal Dairy Farm', businessPhone: '', businessAddress: '', logo: '' });
let counters = Store.get(DB_KEYS.counters, { customerSeq: 0, billSeq: 0 });

function persistAll() {
  Store.set(DB_KEYS.customers, customers);
  Store.set(DB_KEYS.entries, entries);
  Store.set(DB_KEYS.payments, payments);
  Store.set(DB_KEYS.settings, settings);
  Store.set(DB_KEYS.counters, counters);
}

/* ---------------------------------------------------------
   2. UTILITIES
   --------------------------------------------------------- */
function uid(prefix) {
  return prefix + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function fmtMoney(n) {
  n = Number(n) || 0;
  return '₹' + n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtLitre(n) {
  n = Number(n) || 0;
  return n.toFixed(1) + ' L';
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function monthKey(dateStr) {
  return dateStr.slice(0, 7); // YYYY-MM
}

function monthLabel(ym) {
  if (!ym) return '';
  const [y, m] = ym.split('-');
  const d = new Date(Number(y), Number(m) - 1, 1);
  return d.toLocaleString('en-IN', { month: 'long', year: 'numeric' });
}

function getCustomer(id) {
  return customers.find(c => c.id === id);
}

function escapeHtml(str) {
  if (str == null) return '';
  return String(str).replace(/[&<>"']/g, s => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[s]));
}

/* Toast notifications */
function toast(title, message, type = 'success') {
  const container = document.getElementById('toastContainer');
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = `<strong>${escapeHtml(title)}</strong>${escapeHtml(message)}`;
  container.appendChild(el);
  setTimeout(() => {
    el.style.transition = 'opacity .3s ease, transform .3s ease';
    el.style.opacity = '0';
    el.style.transform = 'translateX(30px)';
    setTimeout(() => el.remove(), 300);
  }, 3200);
}

/* Confirm modal (returns a Promise<boolean>) */
function confirmDialog(title, message) {
  return new Promise(resolve => {
    const modal = document.getElementById('confirmModal');
    document.getElementById('confirmTitle').textContent = title;
    document.getElementById('confirmMessage').textContent = message;
    modal.classList.remove('hidden');

    const okBtn = document.getElementById('confirmOkBtn');
    const cancelBtn = document.getElementById('confirmCancelBtn');

    function cleanup(result) {
      modal.classList.add('hidden');
      okBtn.removeEventListener('click', onOk);
      cancelBtn.removeEventListener('click', onCancel);
      resolve(result);
    }
    function onOk() { cleanup(true); }
    function onCancel() { cleanup(false); }

    okBtn.addEventListener('click', onOk);
    cancelBtn.addEventListener('click', onCancel);
  });
}
async function loadCustomersFromFirebase() {
  try {
    const querySnapshot = await getDocs(collection(db, "customers"));

    customers = [];

    querySnapshot.forEach((doc) => {
      customers.push(doc.data());
    });

    console.log("Customers loaded:", customers);

    renderCustomersTable();
    populateCustomerSelects();
    renderDashboard();

  } catch (err) {
    console.error("Firebase Load Error:", err);
  }
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    if (!file) return resolve('');
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
/* ---------------------------------------------------------
   3. NAVIGATION
   --------------------------------------------------------- */
function initNavigation() {
  const links = document.querySelectorAll('.nav-link');
  links.forEach(link => {
    link.addEventListener('click', e => {
      e.preventDefault();
      const pageId = link.dataset.page;
      goToPage(pageId);
      closeSidebarMobile();
    });
  });

  document.getElementById('sidebarToggle').addEventListener('click', () => {
    document.getElementById('sidebar').classList.toggle('open');
    document.getElementById('sidebarOverlay').classList.toggle('show');
  });
  document.getElementById('sidebarOverlay').addEventListener('click', closeSidebarMobile);
}

function closeSidebarMobile() {
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('sidebarOverlay').classList.remove('show');
}

function goToPage(pageId) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById('page-' + pageId).classList.add('active');
  document.querySelectorAll('.nav-link').forEach(l => l.classList.toggle('active', l.dataset.page === pageId));

  if (pageId === 'dashboard') renderDashboard();
  if (pageId === 'customers') renderCustomersTable();
  if (pageId === 'daily-entry') populateCustomerSelects();
  if (pageId === 'history') { populateCustomerSelects(); renderHistoryTable(); }
  if (pageId === 'payments') { rebuildPaymentDues(); renderPaymentsTable(); }
  if (pageId === 'bills') populateCustomerSelects();
  if (pageId === 'reports') populateCustomerSelects();
  if (pageId === 'settings') loadSettingsForm();
}

/* ---------------------------------------------------------
   4. DARK MODE
   --------------------------------------------------------- */
function initDarkMode() {
  const btn = document.getElementById('darkModeToggle');
  const saved = localStorage.getItem('dd_theme');
  if (saved === 'dark') {
    document.body.classList.add('dark');
    btn.textContent = '☀️';
  }
  btn.addEventListener('click', () => {
    document.body.classList.toggle('dark');
    const isDark = document.body.classList.contains('dark');
    localStorage.setItem('dd_theme', isDark ? 'dark' : 'light');
    btn.textContent = isDark ? '☀️' : '🌙';
    // Redraw charts to pick up new grid colors
    //renderDashboardCharts();
  });
}

/* ---------------------------------------------------------
   5. CUSTOMER MANAGEMENT
   --------------------------------------------------------- */
function nextCustomerId() {
  counters.customerSeq += 1;
  Store.set(DB_KEYS.counters, counters);
  return 'CUST' + String(counters.customerSeq).padStart(4, '0');
}

function openCustomerModal(customerId = null) {
  const modal = document.getElementById('customerModal');
  const form = document.getElementById('customerForm');
  form.reset();
  document.getElementById('customerFormId').value = '';

  if (customerId) {
    const c = getCustomer(customerId);
    document.getElementById('customerModalTitle').textContent = 'Edit Customer';
    document.getElementById('customerFormId').value = c.id;
    document.getElementById('customerName').value = c.name;
    document.getElementById('customerMobile').value = c.mobile;
    document.getElementById('customerAddress').value = c.address || '';
    document.getElementById('customerRate').value = c.rate;
    document.getElementById('customerJoinDate').value = c.joinDate || '';
    document.getElementById('customerStatus').value = c.status;
    document.getElementById('customerNotes').value = c.notes || '';
  } else {
    document.getElementById('customerModalTitle').textContent = 'Add Customer';
    document.getElementById('customerJoinDate').value = todayISO();
  }
  modal.classList.remove('hidden');
}

function closeCustomerModal() {
  document.getElementById('customerModal').classList.add('hidden');
}

async function handleCustomerFormSubmit(e) {
  e.preventDefault();
  const id = document.getElementById('customerFormId').value;
  const mobile = document.getElementById('customerMobile').value.trim();

  if (!/^[0-9]{10}$/.test(mobile)) {
    toast('Invalid Mobile', 'Please enter a valid 10-digit mobile number.', 'danger');
    return;
  }
  console.log(customers);
  console.log(mobile);
  const dupe = customers.find(c => c.mobile === mobile && c.id !== id);
  if (dupe) {
    toast('Duplicate Mobile', 'Another customer already uses this mobile number.', 'warning');
    return;
  }

  const photoFile = document.getElementById('customerPhoto').files[0];
  let photoData = '';
  if (photoFile) photoData = await fileToBase64(photoFile);

  if (id) {
    const c = getCustomer(id);
    c.name = document.getElementById('customerName').value.trim();
    c.mobile = mobile;
    c.address = document.getElementById('customerAddress').value.trim();
    c.rate = parseFloat(document.getElementById('customerRate').value) || 0;
    c.joinDate = document.getElementById('customerJoinDate').value;
    c.status = document.getElementById('customerStatus').value;
    c.notes = document.getElementById('customerNotes').value.trim();
    if (photoData) c.photo = photoData;
    toast('Customer Updated', `${c.name}'s details were updated.`, 'success');
  } else {
    const newCustomer = {
      id: nextCustomerId(),
      name: document.getElementById('customerName').value.trim(),
      mobile,
      address: document.getElementById('customerAddress').value.trim(),
      rate: parseFloat(document.getElementById('customerRate').value) || 0,
      joinDate: document.getElementById('customerJoinDate').value || todayISO(),
      status: document.getElementById('customerStatus').value,
      notes: document.getElementById('customerNotes').value.trim(),
      photo: photoData
    };
    customers.push(newCustomer);
    try {
  await addDoc(collection(db, "customers"), newCustomer);
  console.log("Customer saved to Firebase");
} catch (err) {
  console.error("Firebase Error:", err);
}
    toast('Customer Added', `${newCustomer.name} (${newCustomer.id}) was added successfully.`, 'success');
  }

  persistAll();
  closeCustomerModal();
  renderCustomersTable();
  populateCustomerSelects();
  renderDashboard();
}

async function deleteCustomer(id) {
  const c = getCustomer(id);
  const ok = await confirmDialog('Delete Customer', `Delete "${c.name}"? All related entries and payments will remain but this profile will be removed.`);
  if (!ok) return;
  customers = customers.filter(x => x.id !== id);
  persistAll();
  renderCustomersTable();
  populateCustomerSelects();
  renderDashboard();
  toast('Customer Deleted', `${c.name} has been removed.`, 'warning');
}

function viewCustomerProfile(id) {
  const c = getCustomer(id);
  if (!c) return;
  const custEntries = entries.filter(e => e.customerId === id).sort((a, b) => b.date.localeCompare(a.date));
  const totalMilk = custEntries.reduce((s, e) => s + e.totalMilk, 0);
  const totalAmount = custEntries.reduce((s, e) => s + e.totalAmount, 0);
  const paid = payments.filter(p => p.customerId === id).reduce((s, p) => s + (p.paidAmount || 0), 0);
  const pending = totalAmount - paid;

  const photoHtml = c.photo
    ? `<img src="${c.photo}" style="width:80px;height:80px;border-radius:50%;object-fit:cover;">`
    : `<div style="width:80px;height:80px;border-radius:50%;background:var(--primary-light);color:var(--primary-dark);display:flex;align-items:center;justify-content:center;font-size:28px;font-weight:700;">${c.name.charAt(0)}</div>`;

  document.getElementById('customerProfileContent').innerHTML = `
    <div style="display:flex;gap:16px;align-items:center;margin-bottom:18px;">
      ${photoHtml}
      <div>
        <h3>${escapeHtml(c.name)}</h3>
        <p class="muted-text" style="margin:2px 0 0;">${c.id} • ${escapeHtml(c.mobile)}</p>
        <span class="badge ${c.status === 'Active' ? 'badge-active' : 'badge-inactive'}">${c.status}</span>
      </div>
    </div>
    <div class="form-grid" style="margin-bottom:18px;">
      <div><strong>Address:</strong><br>${escapeHtml(c.address) || '—'}</div>
      <div><strong>Rate per Litre:</strong><br>${fmtMoney(c.rate)}</div>
      <div><strong>Joining Date:</strong><br>${c.joinDate || '—'}</div>
      <div><strong>Notes:</strong><br>${escapeHtml(c.notes) || '—'}</div>
    </div>
    <div class="stat-grid" style="grid-template-columns:repeat(3,1fr);margin-bottom:18px;">
      <div class="stat-card"><div class="stat-info"><span class="stat-value">${fmtLitre(totalMilk)}</span><span class="stat-label">Total Milk Supplied</span></div></div>
      <div class="stat-card"><div class="stat-info"><span class="stat-value">${fmtMoney(totalAmount)}</span><span class="stat-label">Total Billed</span></div></div>
      <div class="stat-card"><div class="stat-info"><span class="stat-value">${fmtMoney(pending)}</span><span class="stat-label">Pending Amount</span></div></div>
    </div>
    <h4 style="margin-bottom:10px;">Recent Entries</h4>
    <div class="table-wrap">
      <table class="data-table">
        <thead><tr><th>Date</th><th>Morning</th><th>Evening</th><th>Total</th><th>Amount</th></tr></thead>
        <tbody>
          ${custEntries.slice(0, 10).map(e => `
            <tr><td>${e.date}</td><td>${fmtLitre(e.morning)}</td><td>${fmtLitre(e.evening)}</td><td>${fmtLitre(e.totalMilk)}</td><td>${fmtMoney(e.totalAmount)}</td></tr>
          `).join('') || '<tr><td colspan="5" style="text-align:center;opacity:.6;">No entries yet</td></tr>'}
        </tbody>
      </table>
    </div>
  `;
  document.getElementById('customerProfileModal').classList.remove('hidden');
}

function renderCustomersTable() {
  const tbody = document.querySelector('#customersTable tbody');
  const search = document.getElementById('customerSearchInput').value.toLowerCase().trim();
  const statusFilter = document.getElementById('customerStatusFilter').value;

  let list = customers.filter(c => {
    const matchSearch = !search || c.name.toLowerCase().includes(search) || c.mobile.includes(search) || c.id.toLowerCase().includes(search);
    const matchStatus = statusFilter === 'all' || c.status === statusFilter;
    return matchSearch && matchStatus;
  });

  tbody.innerHTML = list.map(c => `
    <tr>
      <td>${c.photo ? `<img class="table-avatar" src="${c.photo}">` : `<div class="table-avatar" style="display:flex;align-items:center;justify-content:center;color:var(--primary-dark);font-weight:700;">${c.name.charAt(0)}</div>`}</td>
      <td>${c.id}</td>
      <td>${escapeHtml(c.name)}</td>
      <td>${escapeHtml(c.mobile)}</td>
      <td>${fmtMoney(c.rate)}</td>
      <td>${c.joinDate || '—'}</td>
      <td><span class="badge ${c.status === 'Active' ? 'badge-active' : 'badge-inactive'}">${c.status}</span></td>
      <td>
        <div class="row-actions">
          <button class="icon-action" title="View Profile" onclick="viewCustomerProfile('${c.id}')">👁</button>
          <button class="icon-action" title="Edit" onclick="openCustomerModal('${c.id}')">✏️</button>
          <button class="icon-action danger" title="Delete" onclick="deleteCustomer('${c.id}')">🗑</button>
        </div>
      </td>
    </tr>
  `).join('');

  document.getElementById('customersEmpty').classList.toggle('hidden', list.length !== 0);
}

function populateCustomerSelects() {
  const activeCustomers = customers.filter(c => c.status === 'Active').concat(customers.filter(c => c.status !== 'Active'));
  const options = activeCustomers.map(c => `<option value="${c.id}">${escapeHtml(c.name)} (${c.id})</option>`).join('');

  const selects = ['entryCustomer', 'billCustomer', 'reportCustomer'];
  selects.forEach(selId => {
    const sel = document.getElementById(selId);
    if (!sel) return;
    const currentVal = sel.value;
    const placeholder = sel.querySelector('option[value=""]');
    sel.innerHTML = (placeholder ? placeholder.outerHTML : '') + options;
    if (currentVal) sel.value = currentVal;
  });

  const historyFilter = document.getElementById('historyCustomerFilter');
  if (historyFilter) {
    const currentVal = historyFilter.value;
    historyFilter.innerHTML = '<option value="all">All Customers</option>' + options;
    historyFilter.value = currentVal || 'all';
  }
}

/* ---------------------------------------------------------
   6. DAILY MILK ENTRY
   --------------------------------------------------------- */
function initDailyEntryForm() {
  const morningEl = document.getElementById('entryMorning');
  const eveningEl = document.getElementById('entryEvening');
  const rateEl = document.getElementById('entryRate');
  const totalMilkEl = document.getElementById('entryTotalMilk');
  const totalAmountEl = document.getElementById('entryTotalAmount');
  const dateEl = document.getElementById('entryDate');
  const customerEl = document.getElementById('entryCustomer');

  dateEl.value = todayISO();

  function recalc() {
    const morning = parseFloat(morningEl.value) || 0;
    const evening = parseFloat(eveningEl.value) || 0;
    const rate = parseFloat(rateEl.value) || 0;
    const totalMilk = morning + evening;
    const totalAmount = totalMilk * rate;
    totalMilkEl.value = totalMilk.toFixed(1);
    totalAmountEl.value = totalAmount.toFixed(2);
  }

  [morningEl, eveningEl, rateEl].forEach(el => el.addEventListener('input', recalc));

  customerEl.addEventListener('change', () => {
    const c = getCustomer(customerEl.value);
    if (c) { rateEl.value = c.rate; recalc(); }
  });

  document.getElementById('dailyEntryForm').addEventListener('submit', e => {
    e.preventDefault();
    const customerId = customerEl.value;
    if (!customerId) { toast('Missing Customer', 'Please select a customer.', 'danger'); return; }

    const date = dateEl.value;
    const morning = parseFloat(morningEl.value) || 0;
    const evening = parseFloat(eveningEl.value) || 0;
    const rate = parseFloat(rateEl.value) || 0;
    const totalMilk = morning + evening;
    const totalAmount = totalMilk * rate;

    if (totalMilk <= 0) { toast('Invalid Entry', 'Total milk must be greater than 0.', 'danger'); return; }

    const existing = entries.find(en => en.customerId === customerId && en.date === date);
    if (existing) {
      existing.morning = morning; existing.evening = evening; existing.rate = rate;
      existing.totalMilk = totalMilk; existing.totalAmount = totalAmount;
      toast('Entry Updated', 'Existing entry for this date was updated (no duplicate created).', 'success');
    } else {
      entries.push({ id: uid('ENT'), customerId, date, morning, evening, rate, totalMilk, totalAmount });
      toast('Entry Saved', `${fmtLitre(totalMilk)} recorded for ${date}.`, 'success');
    }

    persistAll();
    document.getElementById('dailyEntryForm').reset();
    dateEl.value = todayISO();
    totalMilkEl.value = '0.0';
    totalAmountEl.value = '0.00';
    renderDashboard();
  });
}

function deleteEntry(entryId) {
  confirmDialog('Delete Entry', 'Remove this milk entry permanently?').then(ok => {
    if (!ok) return;
    entries = entries.filter(e => e.id !== entryId);
    persistAll();
    renderHistoryTable();
    renderDashboard();
    toast('Entry Deleted', 'The entry was removed.', 'warning');
  });
}

/* ---------------------------------------------------------
   7. ENTRY HISTORY
   --------------------------------------------------------- */
function renderHistoryTable() {
  const search = document.getElementById('historySearch').value.toLowerCase().trim();
  const custFilter = document.getElementById('historyCustomerFilter').value;
  const dateFrom = document.getElementById('historyDateFrom').value;
  const dateTo = document.getElementById('historyDateTo').value;
  const sortVal = document.getElementById('historySort').value;

  let list = entries.filter(e => {
    const c = getCustomer(e.customerId);
    const name = c ? c.name.toLowerCase() : '';
    const matchSearch = !search || name.includes(search);
    const matchCust = custFilter === 'all' || e.customerId === custFilter;
    const matchFrom = !dateFrom || e.date >= dateFrom;
    const matchTo = !dateTo || e.date <= dateTo;
    return matchSearch && matchCust && matchFrom && matchTo;
  });

  list.sort((a, b) => {
    if (sortVal === 'date-desc') return b.date.localeCompare(a.date);
    if (sortVal === 'date-asc') return a.date.localeCompare(b.date);
    if (sortVal === 'amount-desc') return b.totalAmount - a.totalAmount;
    if (sortVal === 'amount-asc') return a.totalAmount - b.totalAmount;
    return 0;
  });

  const tbody = document.querySelector('#historyTable tbody');
  tbody.innerHTML = list.map(e => {
    const c = getCustomer(e.customerId);
    return `
      <tr>
        <td>${c ? escapeHtml(c.name) : 'Unknown'}</td>
        <td>${e.date}</td>
        <td>${fmtLitre(e.morning)}</td>
        <td>${fmtLitre(e.evening)}</td>
        <td>${fmtLitre(e.totalMilk)}</td>
        <td>${fmtMoney(e.rate)}</td>
        <td>${fmtMoney(e.totalAmount)}</td>
        <td><button class="icon-action danger" title="Delete" onclick="deleteEntry('${e.id}')">🗑</button></td>
      </tr>`;
  }).join('');

  document.getElementById('historyEmpty').classList.toggle('hidden', list.length !== 0);
  return list;
}

function exportHistoryCsv() {
  const list = renderHistoryTable();
  if (!list.length) { toast('Nothing to Export', 'No entries match the current filters.', 'warning'); return; }
  const rows = [['Customer', 'Date', 'Morning (L)', 'Evening (L)', 'Total (L)', 'Rate', 'Amount']];
  list.forEach(e => {
    const c = getCustomer(e.customerId);
    rows.push([c ? c.name : 'Unknown', e.date, e.morning, e.evening, e.totalMilk, e.rate, e.totalAmount]);
  });
  downloadCsv(rows, 'milk_entry_history.csv');
}

function downloadCsv(rows, filename) {
  const csvContent = rows.map(r => r.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
  toast('Export Ready', `${filename} has been downloaded.`, 'success');
}

/* ---------------------------------------------------------
   8. PAYMENTS
   --------------------------------------------------------- */
// Rebuild monthly dues from entries: ensures a payment record exists for every customer+month with entries
function rebuildPaymentDues() {
  const monthTotals = {}; // key: customerId|month -> { totalAmount }
  entries.forEach(e => {
    const key = e.customerId + '|' + monthKey(e.date);
    if (!monthTotals[key]) monthTotals[key] = { customerId: e.customerId, month: monthKey(e.date), totalAmount: 0 };
    monthTotals[key].totalAmount += e.totalAmount;
  });

  Object.values(monthTotals).forEach(mt => {
    let rec = payments.find(p => p.customerId === mt.customerId && p.month === mt.month);
    if (!rec) {
      rec = { id: uid('PAY'), customerId: mt.customerId, month: mt.month, totalAmount: mt.totalAmount, paidAmount: 0, status: 'Pending', paymentDate: '', paymentMethod: '' };
      payments.push(rec);
    } else {
      rec.totalAmount = mt.totalAmount;
      if (rec.paidAmount >= rec.totalAmount && rec.totalAmount > 0) rec.status = 'Paid';
      else rec.status = rec.paidAmount > 0 ? 'Pending' : 'Pending';
    }
  });
  persistAll();
  populatePaymentMonthFilter();
}

function populatePaymentMonthFilter() {
  const sel = document.getElementById('paymentMonthFilter');
  const months = [...new Set(payments.map(p => p.month))].sort().reverse();
  const currentVal = sel.value;
  sel.innerHTML = '<option value="all">All Months</option>' + months.map(m => `<option value="${m}">${monthLabel(m)}</option>`).join('');
  sel.value = currentVal || 'all';
}

function renderPaymentsTable() {
  const search = document.getElementById('paymentSearch').value.toLowerCase().trim();
  const statusFilter = document.getElementById('paymentStatusFilter').value;
  const monthFilter = document.getElementById('paymentMonthFilter').value;

  let list = payments.filter(p => {
    const c = getCustomer(p.customerId);
    const name = c ? c.name.toLowerCase() : '';
    const matchSearch = !search || name.includes(search);
    const matchStatus = statusFilter === 'all' || p.status === statusFilter;
    const matchMonth = monthFilter === 'all' || p.month === monthFilter;
    return matchSearch && matchStatus && matchMonth;
  }).sort((a, b) => b.month.localeCompare(a.month));

  const tbody = document.querySelector('#paymentsTable tbody');
  tbody.innerHTML = list.map(p => {
    const c = getCustomer(p.customerId);
    const pending = Math.max(p.totalAmount - p.paidAmount, 0);
    return `
      <tr>
        <td>${c ? escapeHtml(c.name) : 'Unknown'}</td>
        <td>${monthLabel(p.month)}</td>
        <td>${fmtMoney(p.totalAmount)}</td>
        <td>${fmtMoney(p.paidAmount)}</td>
        <td>${fmtMoney(pending)}</td>
        <td><span class="badge ${p.status === 'Paid' ? 'badge-paid' : 'badge-pending'}">${p.status}</span></td>
        <td><button class="btn btn-sm btn-outline" onclick="openPaymentModal('${p.id}')">Update</button></td>
      </tr>`;
  }).join('');

  document.getElementById('paymentsEmpty').classList.toggle('hidden', list.length !== 0);
}

let activePaymentId = null;
function openPaymentModal(paymentId) {
  activePaymentId = paymentId;
  const p = payments.find(x => x.id === paymentId);
  document.getElementById('paymentAmountInput').value = p.paidAmount || '';
  document.getElementById('paymentDateInput').value = p.paymentDate || todayISO();
  document.getElementById('paymentMethodInput').value = p.paymentMethod || 'Cash';
  document.getElementById('paymentModal').classList.remove('hidden');
}

function savePayment() {
  const p = payments.find(x => x.id === activePaymentId);
  if (!p) return;
  const amount = parseFloat(document.getElementById('paymentAmountInput').value) || 0;
  p.paidAmount = amount;
  p.paymentDate = document.getElementById('paymentDateInput').value;
  p.paymentMethod = document.getElementById('paymentMethodInput').value;
  p.status = amount >= p.totalAmount && p.totalAmount > 0 ? 'Paid' : 'Pending';
  persistAll();
  document.getElementById('paymentModal').classList.add('hidden');
  renderPaymentsTable();
  renderDashboard();
  toast('Payment Updated', `Payment marked as ${p.status}.`, 'success');
}

/* ---------------------------------------------------------
   9. BILL GENERATION
   --------------------------------------------------------- */
function generateBill() {
  const customerId = document.getElementById('billCustomer').value;
  const month = document.getElementById('billMonth').value;
  if (!customerId || !month) { toast('Missing Info', 'Please select a customer and bill month.', 'danger'); return; }

  const c = getCustomer(customerId);
  const monthEntries = entries.filter(e => e.customerId === customerId && monthKey(e.date) === month).sort((a, b) => a.date.localeCompare(b.date));

  if (!monthEntries.length) { toast('No Entries', 'No milk entries found for this customer in the selected month.', 'warning'); return; }

  const totalMilk = monthEntries.reduce((s, e) => s + e.totalMilk, 0);
  const totalAmount = monthEntries.reduce((s, e) => s + e.totalAmount, 0);
  const payRec = payments.find(p => p.customerId === customerId && p.month === month);
  const status = payRec ? payRec.status : 'Pending';

  counters.billSeq += 1;
  Store.set(DB_KEYS.counters, counters);
  const billNo = 'BILL-' + month.replace('-', '') + '-' + String(counters.billSeq).padStart(4, '0');

  const logoHtml = settings.logo ? `<img src="${settings.logo}">` : `<div style="width:54px;height:54px;border-radius:10px;background:#E0F2F1;display:flex;align-items:center;justify-content:center;font-size:26px;">🥛</div>`;

  const rowsHtml = monthEntries.map(e => `
    <tr><td>${e.date}</td><td>${fmtLitre(e.morning)}</td><td>${fmtLitre(e.evening)}</td><td>${fmtLitre(e.totalMilk)}</td><td>${fmtMoney(e.rate)}</td><td>${fmtMoney(e.totalAmount)}</td></tr>
  `).join('');

  const statusColor = status === 'Paid' ? '#DCFCE7' : '#FEF3C7';
  const statusText = status === 'Paid' ? '#16A34A' : '#B45309';

  document.getElementById('billPreview').innerHTML = `
    <div class="bill-head">
      <div class="bill-brand">${logoHtml}<div><h2>${escapeHtml(settings.businessName || 'Dairy Business')}</h2><p style="font-size:12px;color:#6B7280;">${escapeHtml(settings.businessAddress || '')}</p></div></div>
      <div class="bill-meta"><strong>${billNo}</strong><br>Bill Month: ${monthLabel(month)}<br>Generated: ${todayISO()}</div>
    </div>
    <div class="bill-section">
      <div>
        <strong>Billed To</strong><br>
        ${escapeHtml(c.name)}<br>
        Customer ID: ${c.id}<br>
        Phone: ${escapeHtml(c.mobile)}<br>
        Address: ${escapeHtml(c.address) || '—'}
      </div>
      <div style="text-align:right;">
        <strong>Business Contact</strong><br>
        ${escapeHtml(settings.businessPhone) || '—'}<br><br>
        <span class="bill-status" style="background:${statusColor};color:${statusText};">${status.toUpperCase()}</span>
      </div>
    </div>
    <table class="bill-table">
      <thead><tr><th>Date</th><th>Morning</th><th>Evening</th><th>Total Milk</th><th>Rate</th><th>Amount</th></tr></thead>
      <tbody>${rowsHtml}</tbody>
      <tfoot>
        <tr class="bill-total-row"><td colspan="3">Total</td><td>${fmtLitre(totalMilk)}</td><td>—</td><td>${fmtMoney(totalAmount)}</td></tr>
      </tfoot>
    </table>
    <div class="bill-footer">
      <div class="bill-qr"><div id="billQrCode"></div><p>Scan to view bill summary</p></div>
      <div style="text-align:right;">
        <p style="font-size:12px;color:#6B7280;">Thank you for your business!</p>
        <p style="font-size:12px;color:#6B7280;">${escapeHtml(settings.businessName || '')}</p>
      </div>
    </div>
  `;

  document.getElementById('billPreviewCard').classList.remove('hidden');
  document.getElementById('billPreviewCard').scrollIntoView({ behavior: 'smooth' });

  // QR code with bill summary text
  const qrText = `${billNo}\n${c.name} (${c.id})\nMonth: ${monthLabel(month)}\nAmount: ${fmtMoney(totalAmount)}\nStatus: ${status}`;
  document.getElementById('billQrCode').innerHTML = '';
  try {
    // eslint-disable-next-line no-undef
    new QRCode(document.getElementById('billQrCode'), { text: qrText, width: 80, height: 80, colorDark: '#111827', colorLight: '#ffffff' });
  } catch (err) { console.warn('QR generation skipped', err); }

  window._lastBill = { billNo, customerId, month, totalAmount, statusText: status, customerName: c.name, customerMobile: c.mobile };
}

function printBill() {
  window.print();
}

async function downloadBillPdf() {
  const el = document.getElementById('billPreview');
  if (!el.innerHTML.trim()) { toast('No Bill', 'Generate a bill first.', 'warning'); return; }
  toast('Preparing PDF', 'Please wait while your bill is prepared...', 'success');
  try {
    const canvas = await html2canvas(el, { scale: 2, backgroundColor: '#ffffff' });
    const imgData = canvas.toDataURL('image/png');
    // eslint-disable-next-line no-undef
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF('p', 'mm', 'a4');
    const pageWidth = pdf.internal.pageSize.getWidth();
    const imgWidth = pageWidth - 20;
    const imgHeight = (canvas.height * imgWidth) / canvas.width;
    pdf.addImage(imgData, 'PNG', 10, 10, imgWidth, imgHeight);
    const filename = (window._lastBill ? window._lastBill.billNo : 'bill') + '.pdf';
    pdf.save(filename);
    toast('PDF Downloaded', filename, 'success');
  } catch (err) {
    console.error(err);
    toast('PDF Failed', 'Could not generate PDF in this environment.', 'danger');
  }
}

function shareBillWhatsapp() {
  const b = window._lastBill;
  if (!b) { toast('No Bill', 'Generate a bill first.', 'warning'); return; }
  const text = `Hello ${b.customerName}, your ${monthLabel(b.month)} milk bill (${b.billNo}) is ${fmtMoney(b.totalAmount)}. Status: ${b.statusText}. Thank you - ${settings.businessName || 'Dairy'}`;
  const mobile = (b.customerMobile || '').replace(/\D/g, '');
  const url = `https://wa.me/${mobile ? '91' + mobile : ''}?text=${encodeURIComponent(text)}`;
  window.open(url, '_blank');
}

/* ---------------------------------------------------------
   10. REPORTS
   --------------------------------------------------------- */
let currentReportRows = [];
let currentReportHeaders = [];

function generateReport() {
  const type = document.getElementById('reportType').value;
  const date = document.getElementById('reportDate').value;
  const month = document.getElementById('reportMonth').value;
  const year = document.getElementById('reportYear').value;
  const customerId = document.getElementById('reportCustomer').value;

  let filtered = entries.slice();
  let summary = {};

  if (type === 'daily') {
    if (!date) { toast('Select Date', 'Please choose a date for the daily report.', 'warning'); return; }
    filtered = filtered.filter(e => e.date === date);
  } else if (type === 'weekly') {
    if (!date) { toast('Select Date', 'Please choose any date within the target week.', 'warning'); return; }
    const d = new Date(date);
    const day = d.getDay();
    const start = new Date(d); start.setDate(d.getDate() - day);
    const end = new Date(start); end.setDate(start.getDate() + 6);
    const startStr = start.toISOString().slice(0, 10);
    const endStr = end.toISOString().slice(0, 10);
    filtered = filtered.filter(e => e.date >= startStr && e.date <= endStr);
  } else if (type === 'monthly') {
    if (!month) { toast('Select Month', 'Please choose a month.', 'warning'); return; }
    filtered = filtered.filter(e => monthKey(e.date) === month);
  } else if (type === 'yearly') {
    if (!year) { toast('Select Year', 'Please enter a year.', 'warning'); return; }
    filtered = filtered.filter(e => e.date.startsWith(String(year)));
  } else if (type === 'customer') {
    if (!customerId) { toast('Select Customer', 'Please select a customer for this report.', 'warning'); return; }
    filtered = filtered.filter(e => e.customerId === customerId);
  } else if (type === 'income' || type === 'milk') {
    // use month if provided else all-time
    if (month) filtered = filtered.filter(e => monthKey(e.date) === month);
  }

  filtered.sort((a, b) => a.date.localeCompare(b.date));

  const totalMilk = filtered.reduce((s, e) => s + e.totalMilk, 0);
  const totalAmount = filtered.reduce((s, e) => s + e.totalAmount, 0);
  summary = { entries: filtered.length, totalMilk, totalAmount };

  currentReportHeaders = ['Customer', 'Date', 'Morning (L)', 'Evening (L)', 'Total (L)', 'Rate', 'Amount'];
  currentReportRows = filtered.map(e => {
    const c = getCustomer(e.customerId);
    return [c ? c.name : 'Unknown', e.date, e.morning, e.evening, e.totalMilk, e.rate, e.totalAmount];
  });

  document.getElementById('reportSummary').innerHTML = `
    <div class="rs-item">📥 Entries: ${summary.entries}</div>
    <div class="rs-item">🥛 Total Milk: ${fmtLitre(summary.totalMilk)}</div>
    <div class="rs-item">💰 Total Amount: ${fmtMoney(summary.totalAmount)}</div>
  `;

  const thead = document.querySelector('#reportTable thead');
  const tbody = document.querySelector('#reportTable tbody');
  thead.innerHTML = '<tr>' + currentReportHeaders.map(h => `<th>${h}</th>`).join('') + '</tr>';
  tbody.innerHTML = currentReportRows.map(r => '<tr>' + r.map((cell, i) => `<td>${i === 6 ? fmtMoney(cell) : (i === 4 ? fmtLitre(cell) : escapeHtml(String(cell)))}</td>`).join('') + '</tr>').join('');

  document.getElementById('reportEmpty').classList.toggle('hidden', currentReportRows.length !== 0);
  if (!currentReportRows.length) toast('No Data', 'No records found for the selected criteria.', 'warning');
}

function exportReportCsv() {
  if (!currentReportRows.length) { toast('Nothing to Export', 'Generate a report first.', 'warning'); return; }
  downloadCsv([currentReportHeaders, ...currentReportRows], 'report.csv');
}

/* ---------------------------------------------------------
   11. DASHBOARD
   --------------------------------------------------------- */
let incomeChartInstance = null;
let milkChartInstance = null;

function renderDashboard() {
  document.getElementById('todayDateLabel').textContent = new Date().toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  const today = todayISO();
  const thisMonth = monthKey(today);

  const todayEntries = entries.filter(e => e.date === today);
  const monthEntries = entries.filter(e => monthKey(e.date) === thisMonth);

  const todayMilk = todayEntries.reduce((s, e) => s + e.totalMilk, 0);
  const monthMilk = monthEntries.reduce((s, e) => s + e.totalMilk, 0);
  const monthAmount = monthEntries.reduce((s, e) => s + e.totalAmount, 0);
  const totalIncome = entries.reduce((s, e) => s + e.totalAmount, 0);

  rebuildPaymentDuesQuiet();
  const pendingTotal = payments.reduce((s, p) => s + Math.max(p.totalAmount - p.paidAmount, 0), 0);
  const paidCustomers = new Set(payments.filter(p => p.status === 'Paid').map(p => p.customerId)).size;

  document.getElementById('statTotalCustomers').textContent = customers.length;
  document.getElementById('statTodayMilk').textContent = fmtLitre(todayMilk);
  document.getElementById('statMonthMilk').textContent = fmtLitre(monthMilk);
  document.getElementById('statTotalIncome').textContent = fmtMoney(totalIncome);
  document.getElementById('statPending').textContent = fmtMoney(pendingTotal);
  document.getElementById('statPaidCustomers').textContent = paidCustomers;
  document.getElementById('statTodayEntries').textContent = todayEntries.length;
  document.getElementById('statMonthAmount').textContent = fmtMoney(monthAmount);

  const recent = entries.slice().sort((a, b) => b.date.localeCompare(a.date) || (b.id > a.id ? 1 : -1)).slice(0, 8);
  const tbody = document.querySelector('#recentEntriesTable tbody');
  tbody.innerHTML = recent.map(e => {
    const c = getCustomer(e.customerId);
    return `<tr><td>${c ? escapeHtml(c.name) : 'Unknown'}</td><td>${e.date}</td><td>${fmtLitre(e.morning)}</td><td>${fmtLitre(e.evening)}</td><td>${fmtLitre(e.totalMilk)}</td><td>${fmtMoney(e.totalAmount)}</td></tr>`;
  }).join('');
  document.getElementById('recentEntriesEmpty').classList.toggle('hidden', recent.length !== 0);

  renderDashboardCharts();
}

function rebuildPaymentDuesQuiet() {
  const monthTotals = {};
  entries.forEach(e => {
    const key = e.customerId + '|' + monthKey(e.date);
    if (!monthTotals[key]) monthTotals[key] = { customerId: e.customerId, month: monthKey(e.date), totalAmount: 0 };
    monthTotals[key].totalAmount += e.totalAmount;
  });
  Object.values(monthTotals).forEach(mt => {
    let rec = payments.find(p => p.customerId === mt.customerId && p.month === mt.month);
    if (!rec) {
      payments.push({ id: uid('PAY'), customerId: mt.customerId, month: mt.month, totalAmount: mt.totalAmount, paidAmount: 0, status: 'Pending', paymentDate: '', paymentMethod: '' });
    } else {
      rec.totalAmount = mt.totalAmount;
      rec.status = rec.paidAmount >= rec.totalAmount && rec.totalAmount > 0 ? 'Paid' : 'Pending';
    }
  });
  Store.set(DB_KEYS.payments, payments);
}

function renderDashboardCharts() {
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    days.push(d.toISOString().slice(0, 10));
  }
  const incomeData = days.map(d => entries.filter(e => e.date === d).reduce((s, e) => s + e.totalAmount, 0));
  const milkData = days.map(d => entries.filter(e => e.date === d).reduce((s, e) => s + e.totalMilk, 0));
  const labels = days.map(d => new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }));

  const isDark = document.body.classList.contains('dark');
  const gridColor = isDark ? 'rgba(255,255,255,.08)' : 'rgba(0,0,0,.06)';
  const textColor = isDark ? '#D1D5DB' : '#374151';

  const incomeCtx = document.getElementById('incomeChart').getContext('2d');
  if (incomeChartInstance) incomeChartInstance.destroy();
  incomeChartInstance = new Chart(incomeCtx, {
    type: 'line',
    data: { labels, datasets: [{ label: 'Income (₹)', data: incomeData, borderColor: '#009688', backgroundColor: 'rgba(0,150,136,.15)', fill: true, tension: .35, pointRadius: 3 }] },
    options: { responsive: true, plugins: { legend: { display: false } }, scales: { x: { grid: { color: gridColor }, ticks: { color: textColor } }, y: { grid: { color: gridColor }, ticks: { color: textColor } } } }
  });

  const milkCtx = document.getElementById('milkChart').getContext('2d');
  if (milkChartInstance) milkChartInstance.destroy();
  milkChartInstance = new Chart(milkCtx, {
    type: 'bar',
    data: { labels, datasets: [{ label: 'Milk (L)', data: milkData, backgroundColor: '#00695C', borderRadius: 6 }] },
    options: { responsive: true, plugins: { legend: { display: false } }, scales: { x: { grid: { color: gridColor }, ticks: { color: textColor } }, y: { grid: { color: gridColor }, ticks: { color: textColor } } } }
  });
}

/* ---------------------------------------------------------
   12. SETTINGS & BACKUP
   --------------------------------------------------------- */
function loadSettingsForm() {
  document.getElementById('settingsBusinessName').value = settings.businessName || '';
  document.getElementById('settingsBusinessPhone').value = settings.businessPhone || '';
  document.getElementById('settingsBusinessAddress').value = settings.businessAddress || '';
}

async function saveSettings() {
  settings.businessName = document.getElementById('settingsBusinessName').value.trim();
  settings.businessPhone = document.getElementById('settingsBusinessPhone').value.trim();
  settings.businessAddress = document.getElementById('settingsBusinessAddress').value.trim();
  const logoFile = document.getElementById('settingsLogoInput').files[0];
  if (logoFile) settings.logo = await fileToBase64(logoFile);
  persistAll();
  toast('Settings Saved', 'Your business details have been updated.', 'success');
}

function downloadBackup() {
  const backup = { customers, entries, payments, settings, counters, exportedAt: new Date().toISOString() };
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `dairydesk_backup_${todayISO()}.json`;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
  toast('Backup Downloaded', 'Your data backup has been saved.', 'success');
}

function restoreBackup(file) {
  const reader = new FileReader();
  reader.onload = async () => {
    try {
      const data = JSON.parse(reader.result);
      const ok = await confirmDialog('Restore Backup', 'This will overwrite all current data with the backup file. Continue?');
      if (!ok) return;
      customers = data.customers || [];
      entries = data.entries || [];
      payments = data.payments || [];
      settings = data.settings || settings;
      counters = data.counters || counters;
      persistAll();
      toast('Backup Restored', 'Your data has been restored successfully.', 'success');
      goToPage('dashboard');
      populateCustomerSelects();
    } catch (err) {
      toast('Restore Failed', 'The selected file is not a valid backup.', 'danger');
    }
  };
  reader.readAsText(file);
}

async function clearAllData() {
  const ok = await confirmDialog('Clear All Data', 'This will permanently delete ALL customers, entries and payments. This cannot be undone.');
  if (!ok) return;
  customers = []; entries = []; payments = [];
  counters = { customerSeq: 0, billSeq: 0 };
  persistAll();
  toast('Data Cleared', 'All data has been removed.', 'warning');
  goToPage('dashboard');
  renderCustomersTable();
  populateCustomerSelects();
}

/* ---------------------------------------------------------
   13. GLOBAL SEARCH
   --------------------------------------------------------- */
function initGlobalSearch() {
  document.getElementById('globalSearch').addEventListener('input', e => {
    const q = e.target.value.trim();
    if (q.length < 2) return;
    goToPage('customers');
    document.getElementById('customerSearchInput').value = q;
    renderCustomersTable();
  });
}

/* ---------------------------------------------------------
   14. EVENT BINDINGS / INIT
   --------------------------------------------------------- */
function initEventListeners() {
  // Customers
  document.getElementById('addCustomerBtn').addEventListener('click', () => openCustomerModal());
  document.getElementById('customerCancelBtn').addEventListener('click', closeCustomerModal);
  document.getElementById('customerForm').addEventListener('submit', handleCustomerFormSubmit);
  document.getElementById('customerSearchInput').addEventListener('input', renderCustomersTable);
  document.getElementById('customerStatusFilter').addEventListener('change', renderCustomersTable);
  document.getElementById('profileCloseBtn').addEventListener('click', () => document.getElementById('customerProfileModal').classList.add('hidden'));

  // History
  ['historySearch', 'historyCustomerFilter', 'historyDateFrom', 'historyDateTo', 'historySort'].forEach(id => {
    document.getElementById(id).addEventListener('input', renderHistoryTable);
    document.getElementById(id).addEventListener('change', renderHistoryTable);
  });
  document.getElementById('exportHistoryCsv').addEventListener('click', exportHistoryCsv);
  document.getElementById('printHistoryBtn').addEventListener('click', () => window.print());

  // Payments
  ['paymentSearch', 'paymentStatusFilter', 'paymentMonthFilter'].forEach(id => {
    document.getElementById(id).addEventListener('input', renderPaymentsTable);
    document.getElementById(id).addEventListener('change', renderPaymentsTable);
  });
  document.getElementById('paymentCancelBtn').addEventListener('click', () => document.getElementById('paymentModal').classList.add('hidden'));
  document.getElementById('paymentSaveBtn').addEventListener('click', savePayment);

  // Bills
  document.getElementById('generateBillBtn').addEventListener('click', generateBill);
  document.getElementById('printBillBtn').addEventListener('click', printBill);
  document.getElementById('downloadBillPdfBtn').addEventListener('click', downloadBillPdf);
  document.getElementById('shareWhatsappBtn').addEventListener('click', shareBillWhatsapp);

  // Reports
  document.getElementById('generateReportBtn').addEventListener('click', generateReport);
  document.getElementById('exportReportCsvBtn').addEventListener('click', exportReportCsv);
  document.getElementById('printReportBtn').addEventListener('click', () => window.print());

  // Settings & Backup
  document.getElementById('saveSettingsBtn').addEventListener('click', saveSettings);
  document.getElementById('backupDataBtn').addEventListener('click', downloadBackup);
  document.getElementById('backupBtnNav').addEventListener('click', downloadBackup);
  document.getElementById('restoreFileInput').addEventListener('change', e => {
    if (e.target.files[0]) restoreBackup(e.target.files[0]);
    e.target.value = '';
  });
  document.getElementById('clearAllDataBtn').addEventListener('click', clearAllData);

  // Confirm modal backdrop click closes as cancel
  document.getElementById('confirmModal').addEventListener('click', e => {
    if (e.target.id === 'confirmModal') document.getElementById('confirmCancelBtn').click();
  });
  document.getElementById('customerModal').addEventListener('click', e => {
    if (e.target.id === 'customerModal') closeCustomerModal();
  });
  document.getElementById('customerProfileModal').addEventListener('click', e => {
    if (e.target.id === 'customerProfileModal') document.getElementById('customerProfileModal').classList.add('hidden');
  });
  document.getElementById('paymentModal').addEventListener('click', e => {
    if (e.target.id === 'paymentModal') document.getElementById('paymentModal').classList.add('hidden');
  });
}

function init() {
  initNavigation();
  initDarkMode();
  initGlobalSearch();
  initDailyEntryForm();
  initEventListeners();

  populatePaymentMonthFilter();
  loadCustomersFromFirebase();

  // hide loading screen
  setTimeout(() => {
    document.getElementById('loadingScreen').classList.add('hidden');
  }, 500);
}

document.addEventListener('DOMContentLoaded', init);