'use strict';

// Bankfile conversion engine: reads bank files into a list of transactions and writes them back out.
// Pure functions, no network, no DOM, so it runs in the browser and under Node for tests.
// A transaction is { date: 'YYYY-MM-DD', amount, payee, memo, check }, where amount > 0 is money in.
(function (root) {

/* ---------- small helpers ---------- */

const pad = (n, w = 2) => String(n).padStart(w, '0');
const round2 = (n) => Math.round(n * 100) / 100;
const near = (a, b) => Math.abs(a - b) < 0.005;

function validYMD(y, m, d) {
  if (!(m >= 1 && m <= 12 && d >= 1 && d <= 31 && y >= 1900 && y <= 2100)) return false;
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
}

// FNV-1a, used for stable transaction IDs so re-importing the same file doesn't duplicate.
function hash(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(16).padStart(8, '0');
}

const clean = (s) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim();

/* ---------- dates ---------- */

const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12, ene: 1, abr: 4, ago: 8, dic: 12 };
const monthOf = (w) => MONTHS[String(w).toLowerCase().replace(/\.$/, '').slice(0, 3)] || 0;
const year4 = (y) => { y = +y; return y < 100 ? (y < 70 ? 2000 + y : 1900 + y) : y; };

// Splits the start of a string into date parts without deciding day/month order.
// Returns { y, a, b } for numeric dates, { y, ymd } when the year leads, { y, month, day } for named months.
function dateParts(v) {
  const s = String(v == null ? '' : v).trim().toLowerCase().replace(/'/g, '/');
  let m;
  if ((m = s.match(/^(\d{4})(\d{2})(\d{2})(?:\d{4,6})?(?:\.\d+)?(?:\[.*\])?$/))) return { y: +m[1], a: +m[2], b: +m[3], ymd: true };
  if ((m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?![\d])/))) return { y: +m[1], a: +m[2], b: +m[3], ymd: true };
  if ((m = s.match(/^(\d{1,2})\s*[-/.]\s*(\d{1,2})(?:\s*[-/.]\s*(\d{2}|\d{4}))?(?![\d.,])/))) return { a: +m[1], b: +m[2], y: m[3] ? year4(m[3]) : null };
  if ((m = s.match(/^([a-z]{3,9})\.?[\s-]+(\d{1,2})(?:st|nd|rd|th)?,?(?:[\s-]+(\d{4}|\d{2}))?(?![\d])/)) && monthOf(m[1])) return { month: monthOf(m[1]), day: +m[2], y: m[3] ? year4(m[3]) : null };
  if ((m = s.match(/^(\d{1,2})(?:st|nd|rd|th)?[\s-]+([a-z]{3,9})\.?,?(?:[\s-]+(\d{4}|\d{2}))?(?![\d])/)) && monthOf(m[2])) return { month: monthOf(m[2]), day: +m[1], y: m[3] ? year4(m[3]) : null };
  return null;
}

function toISO(p, order, fallbackYear) {
  if (!p) return null;
  let m, d;
  if (p.month) { m = p.month; d = p.day; }
  else if (p.ymd) { m = p.a; d = p.b; }
  else if (order === 'DMY') { d = p.a; m = p.b; }
  else { m = p.a; d = p.b; }
  const y = p.y != null ? p.y : fallbackYear;
  if (y == null || !validYMD(y, m, d)) return null;
  return `${y}-${pad(m)}-${pad(d)}`;
}

// Decides MM/DD versus DD/MM from every date in a column. `sure` is false when nothing gave it away.
function guessOrder(values) {
  let dmy = 0, mdy = 0;
  for (const v of values) {
    const p = dateParts(v);
    if (!p || p.ymd || p.month) continue;
    if (p.a > 12 && p.b <= 12) dmy++;
    else if (p.b > 12 && p.a <= 12) mdy++;
  }
  return { order: dmy > mdy ? 'DMY' : 'MDY', sure: dmy + mdy > 0 };
}

const isDate = (v) => {
  const p = dateParts(v);
  return !!p && !!(toISO(p, 'MDY', 2000) || toISO(p, 'DMY', 2000));
};

/* ---------- money ---------- */

// "$1,234.56", "(12.00)", "12.00-", "1.234,56 €", "45.10 CR" → signed number, or null when it isn't money.
// `info.mark` reports how the sign was written: 'cr', 'dr', 'neg' or ''.
function parseAmount(v, info) {
  if (typeof v === 'number') return Number.isFinite(v) ? round2(v) : null;
  let s = String(v == null ? '' : v).trim();
  if (!s) return null;
  let neg = false, mark = '';
  const drcr = s.match(/\s*\b(cr|dr|db)\.?$/i);
  if (drcr) { s = s.slice(0, drcr.index); mark = drcr[1].toLowerCase() === 'cr' ? 'cr' : 'dr'; if (mark === 'dr') neg = true; }
  if (/^\(.*\)$/.test(s)) { neg = !neg; mark = mark || 'neg'; s = s.slice(1, -1); }
  if (/-$/.test(s)) { neg = !neg; mark = mark || 'neg'; s = s.slice(0, -1); }
  s = s.replace(/[\s '’]/g, '').replace(/^[A-Z]{3}(?=[-+\d$€£])/i, '').replace(/[$€£¥₹]|US\$|R\$/g, '');
  if (/^\+/.test(s)) s = s.slice(1);
  if (/^-/.test(s)) { neg = !neg; mark = mark || 'neg'; s = s.slice(1); }
  s = s.replace(/^[$€£]/, '');
  if (!/^\d[\d.,]*$/.test(s)) return null;
  let int = s, frac = '';
  const dec = s.match(/[.,](\d{1,2})$/);
  if (dec) { int = s.slice(0, dec.index); frac = dec[1]; }
  int = int.replace(/[.,]/g, '');
  if (!/^\d+$/.test(int)) return null;
  const n = round2(Number(int + '.' + (frac || '0')));
  if (info) info.mark = mark;
  return neg && n !== 0 ? -n : n;
}

// Stricter test for spotting money in a column: needs cents or a currency mark, so IDs and years don't count.
const MONEYISH = /^[-+(]?\s*[A-Z]{0,3}\s?[$€£]?\s*[-(]?\s*(\d{1,3}([,.' ]\d{3})+|\d+)([.,]\d{2})\)?\s*-?\s*(cr|dr)?$/i;
const looksMoney = (v) => { const s = String(v).trim(); return s !== '' && MONEYISH.test(s) && (/[.,]\d{2}\)?\s*-?\s*(cr|dr)?$/i.test(s) || /[$€£]/.test(s)); };

/* ---------- CSV ---------- */

function parseCSV(text, d) {
  const rows = [];
  let row = [], f = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; }
      else f += c;
    } else if (c === '"' && f.trim() === '') { q = true; f = ''; }
    else if (c === d) { row.push(f); f = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(f); rows.push(row); row = []; f = '';
    } else f += c;
  }
  if (f !== '' || row.length) { row.push(f); rows.push(row); }
  return rows.map((r) => r.map((x) => x.trim())).filter((r) => r.some((x) => x !== ''));
}

function sniffDelimiter(text) {
  const sample = text.split(/\r?\n/).slice(0, 40).join('\n');
  let best = ',', bestScore = 0;
  for (const d of [',', ';', '\t', '|']) {
    const counts = parseCSV(sample, d).map((r) => r.length).filter((n) => n > 1);
    if (!counts.length) continue;
    const freq = {};
    for (const n of counts) freq[n] = (freq[n] || 0) + 1;
    const [mode, hits] = Object.entries(freq).sort((a, b) => b[1] - a[1] || b[0] - a[0])[0];
    const score = hits * Math.min(+mode, 8);
    if (score > bestScore) { best = d; bestScore = score; }
  }
  return best;
}

function readTable(text) {
  text = String(text).replace(/^﻿/, '');
  return parseCSV(text, sniffDelimiter(text));
}

/* ---------- table analysis (CSV and spreadsheets) ---------- */

const HEAD = [
  ['date', /\bdate\b|^posted$|^posting$|fecha|datum|^dt$/],
  ['debit', /debit|withdraw|money out|paid out|outflow|spent|^charges?$|^cargos?$|retiro|egreso/],
  ['credit', /credit|deposit|money in|paid in|inflow|received|abono|ingreso/],
  ['balance', /balance|running|saldo/],
  ['amount', /amount|^amt\.?$|^value$|^sum$|importe|monto|betrag|valor|^total$/],
  ['check', /check|cheque|^chq|^chk|^ref(erence)?\.? ?(no|num|number|#)\.?$|^num(ber)?\.?$|^no\.?$|^#$/],
  ['type', /type|^dr\/cr$|^cr\/dr$|^d\/c$|^c\/d$|^debit\/credit$|^credit\/debit$/],
  ['desc', /desc|payee|^name$|merchant|narrat|particular|^details?$|^transaction$|concept|beneficiar|counterparty|^reference$|^memo$|^notes?$|category|^item$/],
];

const headRoles = (cell) => {
  const c = clean(cell).toLowerCase();
  if (!c || c.length > 40) return [];
  return HEAD.filter(([, re]) => re.test(c)).map(([r]) => r);
};

// `money` is strict (cents or a currency mark) for guessing; `num` accepts any number for named columns.
function colStats(rows, col) {
  let n = 0, dates = 0, money = 0, num = 0, len = 0;
  const uniq = new Set();
  for (const r of rows) {
    const v = r[col];
    if (v == null || v === '') continue;
    n++;
    if (isDate(v)) dates++;
    if (looksMoney(v)) money++;
    if (parseAmount(v) != null) num++;
    len += v.length;
    uniq.add(v);
  }
  const k = n || 1;
  return { n, date: dates / k, money: money / k, num: num / k, len: len / k, uniq: uniq.size };
}

const TYPE_DEBIT = /^(dr|db|d|debit|debito|débito|withdrawal|sale|purchase|charge)$/i;
const TYPE_CREDIT = /^(cr|c|credit|credito|crédito|deposit|refund|return)$/i;
const DESC_MAIN = /desc|payee|^name$|merchant|narrat|particular|concept|beneficiar|counterparty/i;

// Finds the header row and what each column holds. Works without a header by looking at the values.
function analyzeTable(rows) {
  let header = -1;
  for (let i = 0; i < Math.min(rows.length, 40); i++) {
    const roles = rows[i].map(headRoles);
    const named = roles.filter((r) => r.length).length;
    const valuey = rows[i].filter((c) => isDate(c) || looksMoney(c)).length;
    if (named >= 2 && valuey === 0 && rows.slice(i + 1, i + 6).some((r) => r.some(isDate))) { header = i; break; }
  }
  const body = rows.slice(header + 1);
  const sample = body.slice(0, 400);
  const width = Math.max(0, ...rows.slice(Math.max(0, header), header + 60).map((r) => r.length));
  const stats = Array.from({ length: width }, (_, c) => colStats(sample, c));
  const map = { date: null, desc: null, amount: null, debit: null, credit: null, balance: null, memo: null, check: null, type: null };
  const names = header >= 0 ? rows[header] : [];

  if (header >= 0) {
    const dateCols = [];
    const descCols = [];
    names.forEach((name, c) => {
      const st = stats[c];
      for (const role of headRoles(name)) {
        if (role === 'date') { if (st.date >= 0.6) { dateCols.push(c); break; } continue; }
        if (role === 'desc') { descCols.push(c); break; }
        if (role === 'type') { if (st.num < 0.5 && map.type == null) { map.type = c; break; } continue; }
        if (role === 'check') { if (map.check == null && st.money < 0.5) { map.check = c; break; } continue; }
        if (['debit', 'credit', 'amount', 'balance'].includes(role)) {
          if (map[role] == null && (st.num >= 0.6 || st.n === 0)) { map[role] = c; break; }
          continue;
        }
      }
    });
    map.date = dateCols.find((c) => /post/i.test(names[c])) ?? dateCols[0] ?? null;
    const descScore = (c) => (DESC_MAIN.test(names[c]) ? 1e9 : 0) + stats[c].uniq * stats[c].len;
    descCols.sort((a, b) => descScore(b) - descScore(a));
    map.desc = descCols[0] ?? null;
    const memo = descCols.find((c) => c !== map.desc && /memo|note|comment/i.test(names[c]));
    map.memo = memo ?? null;
  }

  // Fill whatever the header didn't settle from the values themselves.
  const taken = () => new Set(Object.values(map).filter((v) => v != null));
  if (map.date == null) {
    const c = stats.map((s, i) => [s.date, i]).filter(([r, i]) => r >= 0.8 && !taken().has(i)).sort((a, b) => b[0] - a[0])[0];
    if (c) map.date = c[1];
  }
  if (map.amount == null && map.debit == null && map.credit == null) {
    const money = stats.map((s, i) => [s, i]).filter(([s, i]) => s.money >= 0.6 && !taken().has(i)).map(([, i]) => i);
    if (money.length === 1) map.amount = money[0];
    else if (money.length >= 2) {
      const pair = findBalancePair(sample, money);
      if (pair) { map.amount = pair[0]; map.balance = map.balance ?? pair[1]; }
      else if (exclusive(sample, money[0], money[1])) { map.debit = money[0]; map.credit = money[1]; }
      else map.amount = money[0];
    }
  }
  if (map.desc == null) {
    const c = stats.map((s, i) => [s, i]).filter(([s, i]) => !taken().has(i) && s.date < 0.5 && s.money < 0.5)
      .sort((a, b) => (b[0].uniq * b[0].len) - (a[0].uniq * a[0].len))[0];
    if (c) map.desc = c[1];
  }

  const dates = map.date != null ? body.map((r) => r[map.date]) : [];
  const { order, sure } = guessOrder(dates);
  return { header, map, order, orderSure: sure, names, width };
}

// Two money columns where the second is a running balance of the first.
function findBalancePair(rows, cols) {
  for (const a of cols) for (const b of cols) {
    if (a === b) continue;
    let hits = 0, tries = 0;
    for (let i = 1; i < rows.length && tries < 60; i++) {
      const x = parseAmount(rows[i][a]), b0 = parseAmount(rows[i - 1][b]), b1 = parseAmount(rows[i][b]);
      if (x == null || b0 == null || b1 == null) continue;
      tries++;
      if (near(Math.abs(b1 - b0), Math.abs(x))) hits++;
    }
    if (tries >= 3 && hits / tries > 0.7) return [a, b];
  }
  return null;
}

const exclusive = (rows, a, b) => rows.every((r) => !(r[a] && r[b]) || parseAmount(r[a]) === 0 || parseAmount(r[b]) === 0);

// Turns table rows into transactions using a column map (from analyzeTable, possibly edited by the user).
function tableToTxns(rows, a, opts = {}) {
  const { map } = a;
  const order = opts.order || a.order;
  const year = opts.year || new Date().getFullYear();
  const body = rows.slice(a.header + 1);
  // A type column only decides the sign when the amounts themselves are all unsigned.
  const useType = map.amount != null && map.type != null && !body.some((r) => (parseAmount(r[map.amount]) || 0) < 0);
  const out = [];
  for (const r of body) {
    if (map.date == null) break;
    const date = toISO(dateParts(r[map.date]), order, year);
    if (!date) continue;
    let amount = null;
    if (map.amount != null) {
      amount = parseAmount(r[map.amount]);
      if (amount != null && useType) {
        const t = clean(r[map.type]);
        if (TYPE_DEBIT.test(t)) amount = -Math.abs(amount);
        else if (TYPE_CREDIT.test(t)) amount = Math.abs(amount);
      }
    } else if (map.debit != null || map.credit != null) {
      const dr = map.debit != null ? parseAmount(r[map.debit]) : null;
      const cr = map.credit != null ? parseAmount(r[map.credit]) : null;
      if (dr == null && cr == null) continue;
      amount = round2(Math.abs(cr || 0) - Math.abs(dr || 0));
    }
    if (amount == null) continue;
    const payee = map.desc != null ? clean(r[map.desc]) : '';
    if (/^(beginning|opening|starting|ending|closing) balance$|^balance (forward|brought forward)$/i.test(payee)) continue;
    out.push({
      date,
      amount: opts.flip ? -amount : amount,
      payee,
      memo: map.memo != null ? clean(r[map.memo]) : '',
      check: map.check != null ? (clean(r[map.check]).match(/^\d{1,10}$/) || [''])[0] : '',
    });
  }
  return out;
}

// Card exports often list purchases as positive numbers. Spot that so the signs can be flipped.
function suggestFlip(txns) {
  if (txns.length < 4) return false;
  const pos = txns.filter((t) => t.amount > 0).length;
  const payBack = txns.filter((t) => t.amount < 0 && /payment|thank you|autopay|pymt|pmt/i.test(t.payee)).length;
  return pos / txns.length > 0.7 && payBack > 0;
}

/* ---------- QIF ---------- */

function parseQIF(text) {
  const raw = [];
  let t = {}, kind = 'checking';
  for (const line of String(text).split(/\r?\n/)) {
    if (!line.trim()) continue;
    if (line[0] === '!') { if (/ccard/i.test(line)) kind = 'creditcard'; continue; }
    const k = line[0], v = line.slice(1).trim();
    if (k === '^') { if (t.d && t.amount != null) raw.push(t); t = {}; continue; }
    if (k === 'D') t.d = v.replace(/\s+/g, '');
    else if (k === 'T' || k === 'U') { if (t.amount == null) t.amount = parseAmount(v); }
    else if (k === 'P') t.payee = clean(v);
    else if (k === 'M') t.memo = clean(v);
    else if (k === 'N') t.check = /^\d{1,10}$/.test(v) ? v : '';
  }
  if (t.d && t.amount != null) raw.push(t);
  const { order } = guessOrder(raw.map((x) => x.d));
  const txns = raw.map((x) => ({ date: toISO(dateParts(x.d), order, new Date().getFullYear()), amount: x.amount, payee: x.payee || '', memo: x.memo || '', check: x.check || '' }))
    .filter((x) => x.date);
  return { txns, account: { kind } };
}

/* ---------- OFX, QFX, QBO ---------- */

const decodeEnt = (s) => s.replace(/&(amp|lt|gt|quot|apos|nbsp|#\d+);/g, (m, e) =>
  ({ amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' })[e] ?? String.fromCharCode(+e.slice(1)));

function ofxTag(s, tag) {
  const m = s.match(new RegExp('<' + tag.replace('.', '\\.') + '>([^<\\r\\n]*)', 'i'));
  return m ? decodeEnt(m[1]).trim() : '';
}

const ACCT_KIND = { CHECKING: 'checking', SAVINGS: 'savings', MONEYMRKT: 'moneymrkt', CREDITLINE: 'creditline' };

function parseOFX(text) {
  text = String(text);
  const body = text.slice(Math.max(0, text.search(/<OFX>/i)));
  const blocks = body.split(/<STMTTRN>/i).slice(1).map((b) => b.split(/<\/STMTTRN>|<\/BANKTRANLIST>|<STMTTRN>/i)[0]);
  const txns = blocks.map((b) => {
    const name = ofxTag(b, 'NAME') || ofxTag(b, 'PAYEE');
    const check = ofxTag(b, 'CHECKNUM');
    return {
      date: toISO(dateParts(ofxTag(b, 'DTPOSTED') || ofxTag(b, 'DTUSER')), 'MDY'),
      amount: parseAmount(ofxTag(b, 'TRNAMT')),
      payee: clean(name),
      memo: clean(ofxTag(b, 'MEMO')),
      check: /^\d{1,10}$/.test(check) ? check : '',
      fitid: ofxTag(b, 'FITID'),
    };
  }).filter((t) => t.date && t.amount != null);
  const card = /<CCSTMTRS>|<CREDITCARDMSGSRSV1>/i.test(body);
  const bal = parseAmount(ofxTag(body.slice(Math.max(0, body.search(/<LEDGERBAL>/i))), 'BALAMT'));
  return {
    txns,
    account: {
      kind: card ? 'creditcard' : (ACCT_KIND[ofxTag(body, 'ACCTTYPE').toUpperCase()] || 'checking'),
      acctId: ofxTag(body, 'ACCTID'),
      routing: card ? '' : ofxTag(body, 'BANKID'),
      bankId: ofxTag(body, 'INTU.BID') || ofxTag(body, 'FID'),
      bankName: ofxTag(body, 'ORG'),
      currency: ofxTag(body, 'CURDEF') || 'USD',
      balance: /<LEDGERBAL>/i.test(body) ? bal : null,
    },
  };
}

/* ---------- PDF statements ---------- */

// pages: one array per page of text items { str, x, y, w, h } in PDF units (y grows upward).
function pdfLines(pages) {
  const lines = [];
  pages.forEach((items, page) => {
    const its = items.filter((i) => i.str && i.str.trim()).sort((a, b) => b.y - a.y || a.x - b.x);
    let cur = null;
    for (const it of its) {
      const tol = Math.max(1.5, (it.h || 10) * 0.4);
      if (cur && Math.abs(cur.y - it.y) <= tol) cur.items.push(it);
      else { cur = { page, y: it.y, items: [it] }; lines.push(cur); }
    }
  });
  for (const l of lines) {
    l.items.sort((a, b) => a.x - b.x);
    l.toks = lineTokens(l.items);
    l.text = l.toks.map((t) => t.s).join(' ');
  }
  return lines;
}

// Glues items that touch (some PDFs draw one character at a time), then splits on spaces with an x per token.
function lineTokens(items) {
  const runs = [];
  for (const it of items) {
    const last = runs[runs.length - 1];
    const h = it.h || 10;
    if (last && it.x - (last.x + last.w) < h * 0.1 && !/\s$/.test(last.str) && !/^\s/.test(it.str)) {
      last.str += it.str;
      last.w = it.x + it.w - last.x;
    } else runs.push({ str: it.str, x: it.x, w: it.w });
  }
  const toks = [];
  for (const r of runs) {
    const cw = r.w / Math.max(1, r.str.length);
    const re = /\S+/g;
    let m;
    while ((m = re.exec(r.str))) toks.push({ s: m[0], x: r.x + m.index * cw, w: m[0].length * cw });
  }
  return toks;
}

const MONEY_TOK = /^[-+]?\(?[-+]?\$?[-+]?(\d{1,3}(,\d{3})+|\d+)\.\d{2}\)?-?(CR|DR)?$|^[-+]?\(?[-+]?€?(\d{1,3}(\.\d{3})+|\d+),\d{2}\)?-?(CR|DR)?$/i;

// Reads the date at the start of a line's tokens. Returns { p, n } with how many tokens it used.
function leadDate(toks, i) {
  const t0 = toks[i] && toks[i].s, t1 = toks[i + 1] && toks[i + 1].s, t2 = toks[i + 2] && toks[i + 2].s;
  if (!t0) return null;
  if (/^\d{1,2}[/.-]\d{1,2}([/.-](\d{2}|\d{4}))?$/.test(t0) || /^\d{4}-\d{2}-\d{2}$/.test(t0) || /^\d{1,2}-[a-z]{3}-(\d{2}|\d{4})$/i.test(t0)) {
    const p = dateParts(t0);
    return p ? { p, n: 1, raw: t0 } : null;
  }
  if (monthOf(t0) && /^[a-z]{3,9}\.?$/i.test(t0) && t1 && /^\d{1,2},?$/.test(t1)) {
    const withYear = t2 && /^\d{4}$/.test(t2);
    return { p: dateParts(`${t0} ${t1}${withYear ? ' ' + t2 : ''}`), n: withYear ? 3 : 2, raw: t0 + ' ' + t1 };
  }
  if (/^\d{1,2}$/.test(t0) && t1 && monthOf(t1) && /^[a-z]{3,9}\.?$/i.test(t1)) {
    const withYear = t2 && /^\d{4}$/.test(t2);
    return { p: dateParts(`${t0} ${t1}${withYear ? ' ' + t2 : ''}`), n: withYear ? 3 : 2, raw: t0 + ' ' + t1 };
  }
  return null;
}

const SECTION_IN = /deposit|addition|credits?\b|money in|interest (earned|paid)|refund|payments? received|payments?,? (and|&) (other )?credits/i;
const SECTION_OUT = /withdrawal|debit|checks? paid|purchase|fees?\b|charges?\b|money out|payments? (sent|made)|electronic payment|atm|card transaction|cash advance/i;
const BAL_LINE = /(beginning|opening|starting|previous|prior) balance|balance (forward|brought forward|last statement)/i;
const END_LINE = /(ending|closing|new) balance/i;
const COL_DEBIT = /withdrawal|debit|subtraction|charge|money out|paid out/i;
const COL_CREDIT = /deposit|credit|addition|money in|paid in/i;
const COL_AMOUNT = /^amount$/i;
const COL_BALANCE = /balance/i;

function statementYearInfo(text) {
  const full = [];
  const re1 = /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{1,2}),?\s+(20\d{2})\b/gi;
  const re2 = /\b(\d{1,2})[/.-](\d{1,2})[/.-](20\d{2})\b/g;
  const re3 = /\b(20\d{2})-(\d{2})-(\d{2})\b/g;
  const re4 = /(?<![\d/.-])(\d{1,2})\/(\d{1,2})\/(\d{2})(?![\d/])/g;
  let m;
  while ((m = re1.exec(text))) { const d = toISO({ month: monthOf(m[1]), day: +m[2], y: +m[3] }); if (d) full.push(d); }
  while ((m = re2.exec(text))) { const d = toISO({ a: +m[1], b: +m[2], y: +m[3] }, +m[1] > 12 ? 'DMY' : 'MDY'); if (d) full.push(d); }
  while ((m = re4.exec(text))) { const d = toISO({ a: +m[1], b: +m[2], y: 2000 + +m[3] }, +m[1] > 12 ? 'DMY' : 'MDY'); if (d) full.push(d); }
  while ((m = re3.exec(text))) { const d = toISO({ ymd: true, y: +m[1], a: +m[2], b: +m[3] }); if (d) full.push(d); }
  full.sort();
  return { min: full[0] || null, max: full[full.length - 1] || null };
}

// Gives a yearless date the year that puts it closest to the statement's own dates.
function fillYear(p, order, span) {
  if (p.y != null) return toISO(p, order);
  const base = span.max ? +span.max.slice(0, 4) : new Date().getFullYear();
  let best = null, bestDist = Infinity;
  for (const y of [base, base - 1, base + 1]) {
    const d = toISO(p, order, y);
    if (!d) continue;
    const t = Date.parse(d);
    const lo = span.min ? Date.parse(span.min) : t, hi = span.max ? Date.parse(span.max) : t;
    const dist = t < lo ? lo - t : t > hi ? t - hi : 0;
    if (dist < bestDist) { best = d; bestDist = dist; }
  }
  return best;
}

// Table cells that are vertically centered leave a row's date and amount on their own line,
// between the lines of a wrapped description. Fold those description lines into the dated line.
function foldCentered(lines) {
  const loose = (l) => l && !l.used && !leadDate(l.toks, 0) && !l.toks.some((t) => MONEY_TOK.test(t.s));
  lines.forEach((l, i) => {
    const lead = leadDate(l.toks, 0);
    if (!lead) return;
    let k = lead.n;
    const second = leadDate(l.toks, k);
    if (second) k += second.n;
    const rest = l.toks.slice(k);
    if (!rest.length || !rest.every((t) => MONEY_TOK.test(t.s) || /^(\$|cr|dr)$/i.test(t.s))) return;
    const gap = (l.items[0].h || 10) * 1.15;
    const up = lines[i - 1], down = lines[i + 1];
    const above = loose(up) && up.page === l.page && up.y - l.y < gap ? up : null;
    const below = loose(down) && down.page === l.page && l.y - down.y < gap ? down : null;
    if (!above && !below) return;
    l.toks = [...l.toks.slice(0, k), ...(above ? above.toks : []), ...(below ? below.toks : []), ...rest];
    l.text = l.toks.map((t) => t.s).join(' ');
    if (above) above.used = true;
    if (below) below.used = true;
  });
  return lines.filter((l) => !l.used);
}

function extractStatement(pages) {
  const lines = foldCentered(pdfLines(pages));
  const text = lines.map((l) => l.text).join('\n');
  const span = statementYearInfo(text);
  const cardHits = (text.match(/credit card|card ?member|minimum payment|payment due date|credit limit|available credit|new balance/gi) || []).length;
  const card = cardHits >= 2;

  const leads = lines.map((l) => leadDate(l.toks, 0)).filter(Boolean).map((d) => d.raw);
  const { order } = guessOrder(leads);

  let cols = null, section = 0, startBal = null, last = null, skipping = false;
  const rows = [];
  for (const l of lines) {
    const toks = l.toks;
    const words = l.text;
    // Column header: two or more money column names on one short line.
    const heads = toks.filter((t) => COL_DEBIT.test(t.s) || COL_CREDIT.test(t.s) || COL_AMOUNT.test(t.s) || COL_BALANCE.test(t.s));
    // Check registers start with the check number, then the date.
    const checkFirst = /^\d{3,6}\*?$/.test(toks[0] ? toks[0].s : '') && leadDate(toks, 1);
    const lead = checkFirst || leadDate(toks, 0);
    const headCols = heads.map((t) => ({
      right: t.x + t.w,
      role: COL_BALANCE.test(t.s) ? 'balance' : COL_DEBIT.test(t.s) ? 'debit' : COL_CREDIT.test(t.s) ? 'credit' : 'amount',
    }));
    const kinds = new Set(headCols.map((c) => c.role)).size;
    const tableHead = kinds >= 2 || (heads.length && toks.some((t) => /^date$/i.test(t.s)) && toks.some((t) => /^desc/i.test(t.s)));
    if (!lead && tableHead && toks.length <= 12 && !toks.some((t) => MONEY_TOK.test(t.s))) {
      cols = headCols;
      skipping = false;
      last = null;
      continue;
    }
    // Money tokens at the end of the line, allowing a separate CR/DR marker.
    const money = [];
    let j = toks.length - 1;
    while (j >= 0) {
      let s = toks[j].s, right = toks[j].x + toks[j].w;
      if (/^(cr|dr)$/i.test(s) && j > 0 && MONEY_TOK.test(toks[j - 1].s)) { s = toks[j - 1].s + s; j--; }
      if (s === '$' || s === '€') { j--; continue; }
      if (!MONEY_TOK.test(s)) break;
      const info = {};
      const v = parseAmount(s, info);
      money.unshift({ v, mark: info.mark, right });
      j--;
    }
    const firstMoney = j + 1;

    if (!lead) {
      if (BAL_LINE.test(words) && money.length) startBal = money[money.length - 1].v;
      else if (!money.length && words.length < 70 && !/^total/i.test(words)) {
        const inn = SECTION_IN.test(words), out = SECTION_OUT.test(words);
        // Daily-balance tables are dates and balances, not transactions.
        if (/daily (ending )?balance|balance summary|ending daily balance/i.test(words) && toks.length <= 6) { skipping = true; last = null; }
        else if (inn !== out) { section = inn ? 1 : -1; skipping = false; }
        // A wrapped description line right under a transaction.
        else if (last && l.page === last.page && last.y - l.y < 22 && toks.length && toks[0].x > last.descX - 4 && words.length < 60) {
          last.row.memo = clean(`${last.row.memo} ${words}`);
          last.y = l.y;
        }
      }
      continue;
    }
    if (!money.length || skipping) { last = null; continue; }

    let k = lead.n + (checkFirst ? 1 : 0), date = fillYear(lead.p, order, span);
    const second = leadDate(toks, k);
    if (second && second.n <= firstMoney - k) { date = fillYear(second.p, order, span) || date; k += second.n; }
    if (!date) continue;
    let desc = clean(toks.slice(k, firstMoney).map((t) => t.s).join(' ').replace(/(^|\s)\$(\s|$)/g, ' '));
    if (BAL_LINE.test(desc)) { startBal = money[money.length - 1].v; continue; }
    if (END_LINE.test(desc) || /^total\b/i.test(desc)) continue;
    if (checkFirst) desc = desc ? `Check ${toks[0].s.replace('*', '')} ${desc}` : `Check ${toks[0].s.replace('*', '')}`;
    if (!/[a-z]/i.test(desc)) continue;

    let amt = null, bal = null, role = '';
    if (cols) {
      for (const mt of money) {
        let best = null, bd = Infinity;
        for (const c of cols) { const dd = Math.abs(c.right - mt.right); if (dd < bd) { bd = dd; best = c; } }
        const r = best && bd < 45 ? best.role : '';
        if (r === 'balance') bal = mt.v;
        else if (amt == null) { amt = mt; role = r; }
      }
    }
    if (amt == null) {
      amt = money.length >= 2 ? money[money.length - 2] : money[0];
      if (money.length >= 2) bal = money[money.length - 1].v;
    }
    const row = { date, amount: 0, payee: desc, memo: '', check: '' };
    const chk = desc.match(/^(?:check|chk|cheque)\s*#?\s*(\d{1,10})\b/i) || (/^\d{3,6}$/.test(desc) ? [desc, desc] : null);
    if (chk) row.check = chk[1];
    rows.push({ row, abs: Math.abs(amt.v), printed: amt.v, mark: amt.mark, role, section, bal });
    last = { row, page: l.page, y: l.y, descX: toks[k] ? toks[k].x : 0 };
  }

  // Running balances settle the sign when they're there, in either chronological direction.
  const bals = rows.map((r) => r.bal);
  const prevBal = (i, dir) => {
    const n = i - dir;
    if (n >= 0 && n < rows.length) return bals[n];
    return dir === 1 && n === -1 ? startBal : null;
  };
  let fwd = 0, rev = 0;
  rows.forEach((r, i) => {
    if (r.bal == null) return;
    const pf = prevBal(i, 1), pr = prevBal(i, -1);
    if (pf != null && near(Math.abs(r.bal - pf), r.abs)) fwd++;
    if (pr != null && near(Math.abs(r.bal - pr), r.abs)) rev++;
  });
  const dir = fwd || rev ? (fwd >= rev ? 1 : -1) : 0;

  let uncertain = 0;
  const txns = rows.map((r, i) => {
    let sign = 0;
    if (r.role === 'debit') sign = -1;
    else if (r.role === 'credit') sign = 1;
    if (!sign && dir && r.bal != null) {
      const p = prevBal(i, dir);
      if (p != null && near(Math.abs(r.bal - p), r.abs) && r.abs) sign = Math.sign(round2(r.bal - p)) || 0;
    }
    if (!sign && r.section) sign = r.section;
    if (!sign && r.mark === 'cr') sign = 1;
    if (!sign && r.mark === 'dr') sign = -1;
    if (!sign && r.mark === 'neg') sign = card ? 1 : -1;
    if (!sign && r.role === 'amount') sign = card ? -1 : 1;
    if (!sign && card) sign = -1;
    if (!sign) { sign = r.printed < 0 ? -1 : 1; r.row.uncertain = true; uncertain++; }
    r.row.amount = round2(sign * r.abs);
    return r.row;
  }).filter((t) => t.amount !== 0);

  return { txns, kind: card ? 'creditcard' : 'checking', uncertain, lines: lines.length };
}

/* ---------- writers ---------- */

const ascii = (s) => String(s || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^\x20-\x7e]/g, '');
const sgml = (s) => ascii(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const ymd = (d) => d.replace(/-/g, '');
const money2 = (n) => (Math.round(n * 100) / 100).toFixed(2);
const usDate = (d) => `${d.slice(5, 7)}/${d.slice(8, 10)}/${d.slice(0, 4)}`;

function stamp(now) {
  const d = now || new Date();
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

// Gives every transaction a stable, unique FITID; QuickBooks uses it to skip duplicates on re-import.
function withIds(txns) {
  const seen = {};
  return txns.map((t) => {
    if (t.fitid) return t;
    const base = ymd(t.date) + hash(`${t.date}|${money2(t.amount)}|${t.payee}|${t.memo}|${t.check}`);
    seen[base] = (seen[base] || 0) + 1;
    return { ...t, fitid: seen[base] > 1 ? `${base}${seen[base]}` : base };
  });
}

// QBO (QuickBooks Web Connect), QFX (Quicken) and plain OFX share one OFX 1.02 body.
// QuickBooks and Quicken check INTU.BID against Intuit's bank list, so the bank picked matters there.
function writeOFX(txns, acct = {}, flavor = 'qbo', now) {
  txns = withIds(txns);
  const intu = flavor !== 'ofx';
  const card = acct.kind === 'creditcard';
  const dates = txns.map((t) => t.date).sort();
  const today = stamp(now);
  const start = dates.length ? ymd(dates[0]) + '120000' : today;
  const end = dates.length ? ymd(dates[dates.length - 1]) + '120000' : today;
  const bid = String(acct.bankId || '3000').replace(/^0+(?=\d)/, '');
  const org = sgml(acct.bankName || 'Bankfile').slice(0, 32);
  const acctId = sgml(acct.acctId || '1001').replace(/\s/g, '').slice(0, 22) || '1001';
  const cur = sgml(acct.currency || 'USD').toUpperCase().slice(0, 3);
  const bal = acct.balance != null ? acct.balance : 0;
  const L = [];
  L.push('OFXHEADER:100', 'DATA:OFXSGML', 'VERSION:102', 'SECURITY:NONE', 'ENCODING:USASCII', 'CHARSET:1252',
    'COMPRESSION:NONE', 'OLDFILEUID:NONE', 'NEWFILEUID:NONE', '');
  L.push('<OFX>', '<SIGNONMSGSRSV1>', '<SONRS>', '<STATUS>', '<CODE>0', '<SEVERITY>INFO', '</STATUS>',
    `<DTSERVER>${today}`, '<LANGUAGE>ENG');
  if (intu) L.push('<FI>', `<ORG>${org}`, `<FID>${bid}`, '</FI>', `<INTU.BID>${bid}`);
  L.push('</SONRS>', '</SIGNONMSGSRSV1>');
  L.push(card ? '<CREDITCARDMSGSRSV1>' : '<BANKMSGSRSV1>', card ? '<CCSTMTTRNRS>' : '<STMTTRNRS>', '<TRNUID>1',
    '<STATUS>', '<CODE>0', '<SEVERITY>INFO', '</STATUS>', card ? '<CCSTMTRS>' : '<STMTRS>', `<CURDEF>${cur}`);
  if (card) L.push('<CCACCTFROM>', `<ACCTID>${acctId}`, '</CCACCTFROM>');
  else {
    const type = ({ savings: 'SAVINGS', moneymrkt: 'MONEYMRKT', creditline: 'CREDITLINE' })[acct.kind] || 'CHECKING';
    L.push('<BANKACCTFROM>', `<BANKID>${sgml(acct.routing || '000000000').slice(0, 9)}`, `<ACCTID>${acctId}`, `<ACCTTYPE>${type}`, '</BANKACCTFROM>');
  }
  L.push('<BANKTRANLIST>', `<DTSTART>${start}`, `<DTEND>${end}`);
  for (const t of txns) {
    const payee = sgml(t.payee) || 'Unknown';
    const name = payee.slice(0, 32);
    const memo = [payee.length > 32 ? payee : '', sgml(t.memo)].filter(Boolean).join(' ').slice(0, 255);
    L.push('<STMTTRN>', `<TRNTYPE>${t.check && t.amount < 0 ? 'CHECK' : t.amount < 0 ? 'DEBIT' : 'CREDIT'}`,
      `<DTPOSTED>${ymd(t.date)}120000`, `<TRNAMT>${money2(t.amount)}`, `<FITID>${sgml(t.fitid).slice(0, 255)}`);
    if (t.check) L.push(`<CHECKNUM>${t.check}`);
    L.push(`<NAME>${name}`);
    if (memo) L.push(`<MEMO>${memo}`);
    L.push('</STMTTRN>');
  }
  L.push('</BANKTRANLIST>', '<LEDGERBAL>', `<BALAMT>${money2(bal)}`, `<DTASOF>${end}`, '</LEDGERBAL>',
    card ? '</CCSTMTRS>' : '</STMTRS>', card ? '</CCSTMTTRNRS>' : '</STMTTRNRS>', card ? '</CREDITCARDMSGSRSV1>' : '</BANKMSGSRSV1>', '</OFX>', '');
  return L.join('\r\n');
}

const csvCell = (v) => { const s = String(v == null ? '' : v); return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };

// Date, Description, Amount first so QuickBooks Online's 3-column import maps itself; the rest helps in Excel.
function writeCSV(txns) {
  const L = [['Date', 'Description', 'Amount', 'Debit', 'Credit', 'Memo', 'Check Number']];
  for (const t of txns) {
    L.push([usDate(t.date), t.payee, money2(t.amount), t.amount < 0 ? money2(-t.amount) : '', t.amount > 0 ? money2(t.amount) : '', t.memo, t.check]);
  }
  return L.map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

function writeQIF(txns, acct = {}) {
  const L = [acct.kind === 'creditcard' ? '!Type:CCard' : '!Type:Bank'];
  for (const t of txns) {
    L.push(`D${usDate(t.date)}`, `T${money2(t.amount)}`);
    if (t.check) L.push(`N${t.check}`);
    L.push(`P${clean(t.payee)}`);
    if (t.memo) L.push(`M${clean(t.memo)}`);
    L.push('^');
  }
  return L.join('\r\n') + '\r\n';
}

function detectFormat(name, text) {
  const ext = String(name).toLowerCase().split('.').pop();
  const head = String(text || '').slice(0, 2000);
  if (/OFXHEADER|<OFX>/i.test(head)) return 'ofx';
  if (/^\s*!(Type|Account|Option)/im.test(head)) return 'qif';
  if (['ofx', 'qfx', 'qbo'].includes(ext)) return 'ofx';
  if (ext === 'qif') return 'qif';
  return 'csv';
}

function summary(txns) {
  let inn = 0, out = 0;
  for (const t of txns) { if (t.amount > 0) inn += t.amount; else out += t.amount; }
  const dates = txns.map((t) => t.date).sort();
  return { count: txns.length, in: round2(inn), out: round2(out), from: dates[0] || null, to: dates[dates.length - 1] || null };
}

const Bankfile = {
  dateParts, toISO, guessOrder, parseAmount, looksMoney,
  readTable, parseCSV, analyzeTable, tableToTxns, suggestFlip,
  parseQIF, parseOFX, extractStatement, pdfLines,
  writeOFX, writeCSV, writeQIF, detectFormat, summary, usDate,
};

if (typeof module !== 'undefined' && module.exports) module.exports = Bankfile;
else root.Bankfile = Bankfile;
})(typeof self !== 'undefined' ? self : this);
