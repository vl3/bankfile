'use strict';

// Filled in once the Gumroad product exists.
const CONFIG = {
  gumroadUrl: '',
  productId: '',
  price: '$19',
};

const FREE_ROWS = 25;
const SHOW_ROWS = 400;
const ROOT = new URL('.', document.currentScript.src).href;
const B = window.Bankfile;
const $ = (s) => document.querySelector(s);

const FORMATS = [
  { id: 'qbo', label: 'QBO', hint: 'QuickBooks', ext: 'qbo' },
  { id: 'qfx', label: 'QFX', hint: 'Quicken', ext: 'qfx' },
  { id: 'ofx', label: 'OFX', hint: 'Xero, Wave, GnuCash…', ext: 'ofx' },
  { id: 'csv', label: 'CSV', hint: 'Any app', ext: 'csv' },
  { id: 'xlsx', label: 'Excel', hint: 'Spreadsheet', ext: 'xlsx' },
  { id: 'qif', label: 'QIF', hint: 'Older Quicken, Money', ext: 'qif' },
];
const INTU = new Set(['qbo', 'qfx']);
const OFXISH = new Set(['qbo', 'qfx', 'ofx', 'qif']);
const DEFAULT_BANK = { id: '3000', name: 'Wells Fargo' };

const state = {
  name: '',
  source: '',           // 'table' | 'ofx' | 'qif' | 'pdf'
  rows: null,           // table rows for CSV and spreadsheets
  analysis: null,
  base: [],             // transactions as parsed
  edits: new Map(),     // index → { removed, flipped }
  flip: false,
  out: document.body.dataset.out || 'qbo',
  acct: { kind: 'checking', bankId: DEFAULT_BANK.id, bankName: DEFAULT_BANK.name, acctId: '', currency: 'USD', balance: null },
};

/* ---------- loading files ---------- */

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = resolve;
    s.onerror = () => reject(new Error(`Couldn't load ${src}`));
    document.head.appendChild(s);
  });
}

let pdfReady = null, xlsxReady = null;
const needPdf = () => pdfReady || (pdfReady = loadScript(ROOT + 'vendor/pdf.min.js').then(() => {
  window.pdfjsLib.GlobalWorkerOptions.workerSrc = ROOT + 'vendor/pdf.worker.min.js';
}));
const needXlsx = () => xlsxReady || (xlsxReady = loadScript(ROOT + 'vendor/xlsx.full.min.js'));

async function pdfPages(buf) {
  await needPdf();
  const doc = await window.pdfjsLib.getDocument({ data: buf, isEvalSupported: false }).promise;
  const pages = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const tc = await page.getTextContent();
    pages.push(tc.items.filter((it) => 'str' in it).map((it) => ({
      str: it.str, x: it.transform[4], y: it.transform[5], w: it.width, h: it.height || Math.hypot(it.transform[2], it.transform[3]),
    })));
  }
  return pages;
}

async function openFile(file) {
  const name = file.name || 'statement';
  const ext = name.toLowerCase().split('.').pop();
  showError('');
  setBusy(`Reading ${name}…`);
  try {
    if (ext === 'pdf') {
      let pages;
      try { pages = await pdfPages(await file.arrayBuffer()); }
      catch (e) {
        if (e && e.name === 'PasswordException') throw new Error('This PDF is password-protected. Open it, use Print → Save as PDF to make an unlocked copy, then drop that here.');
        throw e;
      }
      if (!pages.some((p) => p.length)) throw new Error('This PDF has no text in it. It looks like a scanned image, and Bankfile reads the PDFs that online banking produces.');
      const r = B.extractStatement(pages);
      if (!r.txns.length) throw new Error("Couldn't find transactions in this PDF. If your bank offers a CSV or QFX download, that will convert perfectly.");
      setSource(name, 'pdf', { txns: r.txns, account: { kind: r.kind } });
      if (r.uncertain) note(`${r.uncertain} amount${r.uncertain > 1 ? 's' : ''} had no clear sign in the PDF and ${r.uncertain > 1 ? 'are' : 'is'} marked with ?. Click an amount to flip it.`);
      else note(`Read ${r.txns.length} transactions from the PDF. Give the preview a quick look before downloading.`);
    } else if (ext === 'xlsx' || ext === 'xls' || ext === 'ods') {
      await needXlsx();
      const wb = window.XLSX.read(await file.arrayBuffer(), { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = window.XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: '' })
        .map((r) => r.map((v) => String(v).trim())).filter((r) => r.some((v) => v !== ''));
      setTable(name, rows);
    } else {
      const text = await file.text();
      const fmt = B.detectFormat(name, text);
      if (fmt === 'ofx') {
        const r = B.parseOFX(text);
        if (!r.txns.length) throw new Error('No transactions found in this file.');
        setSource(name, 'ofx', r);
      } else if (fmt === 'qif') {
        const r = B.parseQIF(text);
        if (!r.txns.length) throw new Error('No transactions found in this QIF file.');
        setSource(name, 'qif', r);
      } else setTable(name, B.readTable(text));
    }
  } catch (e) {
    console.error(e);
    showError(e.message || "Couldn't read that file.");
    setBusy('');
    return;
  }
  setBusy('');
  $('#drop').hidden = true;
  $('#work').hidden = false;
  render();
  $('#work').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function reset(name, source) {
  state.name = name;
  state.source = source;
  state.edits = new Map();
  state.flip = false;
  state.rows = null;
  state.analysis = null;
  state.acct.balance = null;
  note('');
}

function setSource(name, source, r) {
  reset(name, source);
  state.base = r.txns;
  const a = r.account || {};
  if (a.kind) state.acct.kind = a.kind;
  if (a.acctId) state.acct.acctId = a.acctId;
  if (a.bankId && /^\d+$/.test(a.bankId)) { state.acct.bankId = a.bankId.replace(/^0+(?=\d)/, ''); state.acct.bankName = a.bankName || `Bank ${a.bankId}`; }
  if (a.currency) state.acct.currency = a.currency;
  if (a.balance != null) state.acct.balance = a.balance;
}

function setTable(name, rows) {
  if (!rows.length) throw new Error('This file is empty.');
  reset(name, 'table');
  state.rows = rows;
  state.analysis = B.analyzeTable(rows);
  const m = state.analysis.map;
  if (m.date == null || (m.amount == null && m.debit == null && m.credit == null)) {
    note("Couldn't tell which columns hold the date and amount. Pick them below.");
  }
  rebuildTable();
  if (B.suggestFlip(state.base)) {
    state.flip = true;
    state.acct.kind = 'creditcard';
    rebuildTable();
    note('Purchases were positive numbers in this file, as card exports often do, so the signs were flipped: money out is negative. Untick “Flip signs” to undo.');
  }
  const digits = name.match(/(\d{4})(?!.*\d)/);
  if (digits && !state.acct.acctId) state.acct.acctId = digits[1];
}

function rebuildTable() {
  state.base = B.tableToTxns(state.rows, state.analysis, { flip: state.flip });
  state.edits = new Map();
}

/* ---------- current transactions ---------- */

function current() {
  const out = [];
  state.base.forEach((t, i) => {
    const e = state.edits.get(i);
    if (e && e.removed) return;
    out.push(e && e.flipped ? { ...t, amount: -t.amount, uncertain: false } : t);
  });
  return out;
}

/* ---------- rendering ---------- */

const fmtMoney = (n) => (n < 0 ? '−' : '') + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtDate = (d) => new Date(d + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

function render() {
  renderMapping();
  renderPreview();
  renderOut();
}

function renderMapping() {
  const box = $('#mapping');
  box.hidden = state.source !== 'table';
  if (box.hidden) return;
  const a = state.analysis;
  const width = Math.max(a.width, ...state.rows.slice(0, 50).map((r) => r.length));
  const sampleRow = state.rows[a.header + 1] || [];
  const colName = (c) => {
    const head = a.header >= 0 && a.names[c] ? a.names[c] : `Column ${c + 1}`;
    const ex = sampleRow[c] ? ` (${sampleRow[c].slice(0, 18)})` : '';
    return head + ex;
  };
  const opts = (sel) => ['<option value="">—</option>']
    .concat(Array.from({ length: width }, (_, c) => `<option value="${c}"${sel === c ? ' selected' : ''}>${esc(colName(c))}</option>`)).join('');
  const split = a.map.amount == null && (a.map.debit != null || a.map.credit != null);
  box.innerHTML = `
    <div class="map-row">
      <label>Date<select data-role="date">${opts(a.map.date)}</select></label>
      <label>Description<select data-role="desc">${opts(a.map.desc)}</select></label>
      <label>Amounts<select id="amountMode"><option value="one"${split ? '' : ' selected'}>One column</option><option value="split"${split ? ' selected' : ''}>Debit + credit</option></select></label>
      ${split
        ? `<label>Debit (out)<select data-role="debit">${opts(a.map.debit)}</select></label><label>Credit (in)<select data-role="credit">${opts(a.map.credit)}</select></label>`
        : `<label>Amount<select data-role="amount">${opts(a.map.amount)}</select></label>`}
    </div>
    <div class="map-row">
      <label>Memo<select data-role="memo">${opts(a.map.memo)}</select></label>
      <label>Check #<select data-role="check">${opts(a.map.check)}</select></label>
      <label>Date order<select id="order"><option value="MDY"${a.order === 'MDY' ? ' selected' : ''}>MM/DD/YYYY</option><option value="DMY"${a.order === 'DMY' ? ' selected' : ''}>DD/MM/YYYY</option></select></label>
      <label class="check"><input type="checkbox" id="flip"${state.flip ? ' checked' : ''}> Flip signs</label>
    </div>`;
  box.querySelectorAll('select[data-role]').forEach((s) => s.addEventListener('change', () => {
    a.map[s.dataset.role] = s.value === '' ? null : +s.value;
    rebuildTable();
    render();
  }));
  $('#amountMode').addEventListener('change', (e) => {
    if (e.target.value === 'split') { a.map.debit = a.map.debit ?? a.map.amount; a.map.amount = null; }
    else { a.map.amount = a.map.amount ?? a.map.debit ?? a.map.credit; a.map.debit = null; a.map.credit = null; }
    rebuildTable();
    render();
  });
  $('#order').addEventListener('change', (e) => { a.order = e.target.value; rebuildTable(); render(); });
  $('#flip').addEventListener('change', (e) => { state.flip = e.target.checked; rebuildTable(); render(); });
}

function renderPreview() {
  const txns = current();
  const s = B.summary(txns);
  $('#fileName').textContent = state.name;
  $('#stats').innerHTML = s.count
    ? `<span><b>${s.count}</b> transaction${s.count === 1 ? '' : 's'}</span><span>${fmtDate(s.from)} – ${fmtDate(s.to)}</span><span class="in">In ${fmtMoney(s.in)}</span><span>Out ${fmtMoney(s.out)}</span>`
    : '<span>No transactions yet. Check the column choices above.</span>';
  const rows = [];
  let shown = 0;
  state.base.forEach((t, i) => {
    if (shown >= SHOW_ROWS) return;
    const e = state.edits.get(i) || {};
    if (e.removed) return;
    shown++;
    const amt = e.flipped ? -t.amount : t.amount;
    const unsure = t.uncertain && !e.flipped && !e.ok;
    rows.push(`<tr data-i="${i}"${unsure ? ' class="unsure"' : ''}>
      <td class="d">${t.date}</td>
      <td class="p">${esc(t.payee)}${t.memo ? `<small>${esc(t.memo)}</small>` : ''}</td>
      <td class="a"><button type="button" class="amt ${amt < 0 ? 'neg' : 'pos'}" data-act="flip" title="Click to flip the sign">${unsure ? '<i>?</i>' : ''}${fmtMoney(amt)}</button></td>
      <td class="x"><button type="button" data-act="remove" aria-label="Remove this row">×</button></td></tr>`);
  });
  $('#rows').innerHTML = rows.join('');
  const extra = txns.length - shown;
  $('#more').textContent = extra > 0 ? `Showing the first ${shown}. All ${txns.length} are in the download.` : '';
}

function renderOut() {
  const fmt = FORMATS.find((f) => f.id === state.out);
  $('#formats').innerHTML = FORMATS.map((f) => `<button type="button" role="radio" aria-checked="${f.id === state.out}" data-fmt="${f.id}"><b>${f.label}</b><small>${f.hint}</small></button>`).join('');
  $('#acctFields').hidden = !OFXISH.has(state.out);
  $('#bankField').hidden = !INTU.has(state.out);
  $('#idField').hidden = state.out === 'qif';
  $('#kind').value = state.acct.kind === 'creditcard' ? 'creditcard' : state.acct.kind === 'savings' ? 'savings' : 'checking';
  $('#bank').value = `${state.acct.bankName} (${state.acct.bankId})`;
  $('#acctId').value = state.acct.acctId;
  const n = current().length;
  const capped = !unlocked && n > FREE_ROWS;
  $('#download').textContent = `Download .${fmt.ext}`;
  $('#download').disabled = n === 0;
  $('#limitNote').innerHTML = unlocked
    ? `Pro: all ${n} transactions.`
    : capped
      ? `Free download includes the first ${FREE_ROWS} of ${n} transactions.`
      : `${n} transaction${n === 1 ? '' : 's'}, free.`;
  $('#upsell').hidden = unlocked;
  $('#upsellText').innerHTML = capped
    ? `<b>Convert all ${n} transactions</b> with Pro, ${CONFIG.price} once.`
    : `<b>Need more than ${FREE_ROWS} per file?</b> Pro is ${CONFIG.price} once.`;
}

/* ---------- events ---------- */

function bindTool() {
  const input = $('#file');
  const drop = $('#drop');
  $('#pick').addEventListener('click', () => input.click());
  drop.addEventListener('click', (e) => { if (e.target === drop || e.target.closest('.drop-hit')) input.click(); });
  drop.addEventListener('keydown', (e) => { if ((e.key === 'Enter' || e.key === ' ') && e.target === drop) { e.preventDefault(); input.click(); } });
  input.addEventListener('change', () => { if (input.files[0]) openFile(input.files[0]); input.value = ''; });
  ['dragenter', 'dragover'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('over'); }));
  ['dragleave', 'drop'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove('over'); }));
  drop.addEventListener('drop', (e) => { const f = e.dataTransfer.files[0]; if (f) openFile(f); });
  // Dropping anywhere on the page works too, so a near miss doesn't open the file in the browser.
  window.addEventListener('dragover', (e) => e.preventDefault());
  window.addEventListener('drop', (e) => { e.preventDefault(); const f = e.dataTransfer && e.dataTransfer.files[0]; if (f && !$('#drop').contains(e.target)) openFile(f); });

  $('#sample').addEventListener('click', async () => {
    const pdf = document.body.dataset.in === 'pdf';
    const url = ROOT + (pdf ? 'sample-statement.pdf' : 'sample.csv');
    const r = await fetch(url);
    const blob = await r.blob();
    openFile(new File([blob], pdf ? 'sample-statement.pdf' : 'sample-checking-1234.csv'));
  });
  $('#reset').addEventListener('click', () => {
    $('#work').hidden = true;
    $('#drop').hidden = false;
    note('');
    $('#tool').scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  $('#rows').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-act]');
    if (!btn) return;
    const i = +btn.closest('tr').dataset.i;
    const ed = state.edits.get(i) || {};
    if (btn.dataset.act === 'remove') ed.removed = true;
    else ed.flipped = !ed.flipped;
    state.edits.set(i, ed);
    renderPreview();
    renderOut();
  });

  $('#formats').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-fmt]');
    if (!b) return;
    state.out = b.dataset.fmt;
    renderOut();
  });
  $('#kind').addEventListener('change', (e) => { state.acct.kind = e.target.value; });
  $('#acctId').addEventListener('input', (e) => { state.acct.acctId = e.target.value.replace(/[^\w-]/g, ''); });
  bindBank();
  $('#download').addEventListener('click', download);
}

/* ---------- bank picker ---------- */

let banks = null;
async function loadBanks() {
  if (banks) return banks;
  const r = await fetch(ROOT + 'banks.json');
  banks = (await r.json()).map(([id, name]) => ({ id, name, key: name.toLowerCase() }));
  return banks;
}

function bindBank() {
  const input = $('#bank');
  const list = $('#bankList');
  let active = -1, items = [];
  const close = () => { list.hidden = true; active = -1; input.setAttribute('aria-expanded', 'false'); };
  const choose = (b) => {
    state.acct.bankId = b.id;
    state.acct.bankName = b.name;
    input.value = `${b.name} (${b.id})`;
    close();
  };
  const show = async () => {
    const q = input.value.toLowerCase().replace(/\(\d+\)/, '').trim();
    const all = await loadBanks();
    const words = q.split(/\s+/).filter(Boolean);
    items = (words.length ? all.filter((b) => words.every((w) => b.key.includes(w))) : all.filter((b) => /^(chase|wells fargo|bank of america|american express|capital one 360|citi cards|discover card|navy federal credit union|pnc - virtual wallet)$/.test(b.key)))
      .sort((a, b) => (a.key.startsWith(words[0] || '') ? 0 : 1) - (b.key.startsWith(words[0] || '') ? 0 : 1) || a.key.length - b.key.length)
      .slice(0, 8);
    list.innerHTML = items.length
      ? items.map((b, i) => `<li role="option" id="bank-${i}" data-i="${i}">${esc(b.name)} <small>${b.id}</small></li>`).join('')
      : '<li class="none">No match. Try a shorter name, or keep Wells Fargo.</li>';
    list.hidden = false;
    input.setAttribute('aria-expanded', 'true');
  };
  input.addEventListener('focus', () => { input.select(); show(); });
  input.addEventListener('input', show);
  input.addEventListener('keydown', (e) => {
    if (list.hidden) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      active = Math.max(0, Math.min(items.length - 1, active + (e.key === 'ArrowDown' ? 1 : -1)));
      list.querySelectorAll('li').forEach((li, i) => li.classList.toggle('on', i === active));
      input.setAttribute('aria-activedescendant', `bank-${active}`);
    } else if (e.key === 'Enter' && items[active >= 0 ? active : 0]) { e.preventDefault(); choose(items[active >= 0 ? active : 0]); }
    else if (e.key === 'Escape') close();
  });
  list.addEventListener('mousedown', (e) => {
    const li = e.target.closest('li[data-i]');
    if (li) { e.preventDefault(); choose(items[+li.dataset.i]); }
  });
  input.addEventListener('blur', () => setTimeout(() => {
    close();
    input.value = `${state.acct.bankName} (${state.acct.bankId})`;
  }, 120));
}

/* ---------- download ---------- */

function saveBlob(blob, filename) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}

async function download() {
  const all = current();
  const txns = unlocked ? all : all.slice(0, FREE_ROWS);
  const fmt = FORMATS.find((f) => f.id === state.out);
  const base = state.name.replace(/\.[^.]+$/, '') || 'statement';
  const acct = { ...state.acct, acctId: state.acct.acctId || '1001' };
  const btn = $('#download');
  btn.disabled = true;
  try {
    if (fmt.id === 'xlsx') {
      await needXlsx();
      const X = window.XLSX;
      // Dates go in as Excel serial numbers worked out in UTC, so no timezone can shift them a day.
      const serial = (d) => (Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10)) - Date.UTC(1899, 11, 30)) / 864e5;
      const aoa = [['Date', 'Description', 'Amount', 'Debit', 'Credit', 'Memo', 'Check Number']];
      for (const t of txns) {
        aoa.push([serial(t.date), t.payee, t.amount, t.amount < 0 ? -t.amount : null, t.amount > 0 ? t.amount : null, t.memo, t.check]);
      }
      const ws = X.utils.aoa_to_sheet(aoa);
      ws['!cols'] = [{ wch: 11 }, { wch: 44 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 30 }, { wch: 12 }];
      for (let r = 1; r < aoa.length; r++) {
        for (const c of ['C', 'D', 'E']) { const cell = ws[c + (r + 1)]; if (cell) cell.z = '#,##0.00'; }
        const d = ws['A' + (r + 1)]; if (d) d.z = 'yyyy-mm-dd';
      }
      const wb = X.utils.book_new();
      X.utils.book_append_sheet(wb, ws, 'Transactions');
      X.writeFile(wb, `${base}.xlsx`, { compression: true });
    } else {
      let text, type = 'application/octet-stream';
      if (fmt.id === 'csv') { text = B.writeCSV(txns); type = 'text/csv'; }
      else if (fmt.id === 'qif') text = B.writeQIF(txns, acct);
      else text = B.writeOFX(txns, acct, fmt.id);
      saveBlob(new Blob([text], { type }), `${base}.${fmt.ext}`);
    }
    note(!unlocked && all.length > FREE_ROWS
      ? `Downloaded the first ${FREE_ROWS} of ${all.length} transactions. Import it to check everything lines up, then unlock Pro to convert the rest.`
      : `Downloaded ${base}.${fmt.ext}. ${importTip(fmt.id)}`);
  } catch (e) {
    console.error(e);
    showError("Couldn't create the file. Try again, or pick another format.");
  } finally {
    btn.disabled = false;
  }
}

function importTip(id) {
  return ({
    qbo: 'In QuickBooks Desktop: File → Utilities → Import → Web Connect Files. In QuickBooks Online: Transactions → Bank transactions → Link account ▾ → Upload from file.',
    qfx: 'In Quicken for Windows: File → File Import → Web Connect (.QFX) File.',
    ofx: 'Import it from your accounting app’s bank statement import.',
    csv: 'It opens in Excel or Google Sheets, and imports into QuickBooks Online, Xero and Wave.',
    xlsx: '',
    qif: 'Import it with your app’s QIF import.',
  })[id];
}

/* ---------- messages ---------- */

function note(msg) { const n = $('#notice'); n.textContent = msg; n.hidden = !msg; }
function showError(msg) { const n = $('#error'); n.textContent = msg; n.hidden = !msg; }
function setBusy(msg) { const n = $('#busy'); n.textContent = msg; n.hidden = !msg; }

/* ---------- purchase ---------- */

const LS_KEY = 'bankfile.license';
const store = {
  get() { try { return localStorage.getItem(LS_KEY); } catch { return null; } },
  set(v) { try { localStorage.setItem(LS_KEY, v); } catch { /* private mode */ } },
};
let unlocked = !!store.get();

async function verifyLicense(key) {
  const body = new URLSearchParams({ product_id: CONFIG.productId, license_key: key, increment_uses_count: 'false' });
  const r = await fetch('https://api.gumroad.com/v2/licenses/verify', { method: 'POST', body });
  const j = await r.json().catch(() => ({}));
  const p = j.purchase || {};
  return Boolean(j.success && !p.refunded && !p.chargebacked && !p.disputed);
}

function updateBuy() {
  document.querySelectorAll('[data-buy]').forEach((a) => {
    a.href = CONFIG.gumroadUrl ? CONFIG.gumroadUrl + '?wanted=true' : '#pricing';
    if (CONFIG.gumroadUrl) { a.target = '_blank'; a.rel = 'noopener'; }
    a.hidden = unlocked;
  });
  document.querySelectorAll('[data-pro]').forEach((el) => { el.hidden = !unlocked; });
  document.querySelectorAll('.license').forEach((el) => { el.hidden = unlocked; });
  if (!$('#work').hidden) renderOut();
}

function bindBuy() {
  document.querySelectorAll('form.license-form').forEach((form) => form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const key = form.querySelector('input').value.trim();
    const msg = form.parentElement.querySelector('.msg');
    const btn = form.querySelector('button');
    if (!key) { msg.className = 'msg err'; msg.textContent = 'Paste the key from your Gumroad receipt.'; return; }
    btn.disabled = true;
    msg.className = 'msg';
    msg.textContent = 'Checking…';
    try {
      if (await verifyLicense(key)) {
        store.set(key);
        unlocked = true;
        updateBuy();
        msg.className = 'msg ok';
        msg.textContent = 'Unlocked. Thank you!';
      } else {
        msg.className = 'msg err';
        msg.textContent = "That key wasn't recognized. Copy it again from your Gumroad receipt email.";
      }
    } catch {
      msg.className = 'msg err';
      msg.textContent = "Couldn't reach Gumroad. Check your connection and try again.";
    } finally {
      btn.disabled = false;
    }
  }));
}

/* ---------- boot ---------- */

bindTool();
bindBuy();
updateBuy();
