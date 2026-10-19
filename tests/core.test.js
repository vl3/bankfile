'use strict';
// Run with: node --test tests/
const test = require('node:test');
const assert = require('node:assert/strict');
const B = require('../core.js');

const fromCSV = (text, opts) => {
  const rows = B.readTable(text);
  const a = B.analyzeTable(rows);
  return { a, txns: B.tableToTxns(rows, a, opts) };
};

test('amounts in the formats banks actually use', () => {
  const cases = [['$1,234.56', 1234.56], ['(12.00)', -12], ['12.00-', -12], ['1.234,56 €', 1234.56], ['-23,45', -23.45],
    ['45.10 CR', 45.1], ['45.10 DR', -45.1], ['USD -7.5', -7.5], ['-$3.00', -3], ['$-3.00', -3], ['1,000', 1000], ['0.99', 0.99],
    ['', null], ['abc', null], ['2026-01-05', null], ['--', null]];
  for (const [s, want] of cases) assert.equal(B.parseAmount(s), want, s);
});

test('dates, including day-first files and named months', () => {
  assert.equal(B.toISO(B.dateParts('01/05/2026'), 'MDY'), '2026-01-05');
  assert.equal(B.toISO(B.dateParts('01/05/2026'), 'DMY'), '2026-05-01');
  assert.equal(B.toISO(B.dateParts('2026-01-05')), '2026-01-05');
  assert.equal(B.toISO(B.dateParts('20260105120000.000[-5:EST]')), '2026-01-05');
  assert.equal(B.toISO(B.dateParts('Jan 5, 2026')), '2026-01-05');
  assert.equal(B.toISO(B.dateParts('05 Jan 2026')), '2026-01-05');
  assert.equal(B.toISO(B.dateParts("1/5'26"), 'MDY'), '2026-01-05');
  assert.equal(B.toISO(B.dateParts('1/5/26'), 'MDY'), '2026-01-05');
  assert.deepEqual(B.guessOrder(['05/01/2026', '15/01/2026']), { order: 'DMY', sure: true });
  assert.deepEqual(B.guessOrder(['01/05/2026', '01/15/2026']), { order: 'MDY', sure: true });
  assert.equal(B.guessOrder(['01/05/2026']).sure, false);
});

test('Chase checking CSV', () => {
  const csv = `Details,Posting Date,Description,Amount,Type,Balance,Check or Slip #
DEBIT,01/05/2026,"AMAZON MKTPLACE PMTS AMZN.COM/BILL WA",-45.12,DEBIT_CARD,1954.88,,
CREDIT,01/06/2026,"ACME PAYROLL PPD ID: 123",2500.00,ACH_CREDIT,4454.88,,
CHECK,01/07/2026,"CHECK 1043",-300.00,CHECK_PAID,4154.88,1043,
DEBIT,01/08/2026,"Zelle payment to Ana",-20.5,QUICKPAY_DEBIT,4134.38,,
`;
  const { a, txns } = fromCSV(csv);
  assert.equal(a.names[a.map.desc], 'Description');
  assert.equal(a.names[a.map.amount], 'Amount');
  assert.equal(txns.length, 4);
  assert.deepEqual(txns[0], { date: '2026-01-05', amount: -45.12, payee: 'AMAZON MKTPLACE PMTS AMZN.COM/BILL WA', memo: '', check: '' });
  assert.equal(txns[1].amount, 2500);
  assert.equal(txns[2].check, '1043');
  assert.equal(txns[3].amount, -20.5);
});

test('Chase card CSV keeps signs; a Payment type is not a debit', () => {
  const csv = `Transaction Date,Post Date,Description,Category,Type,Amount,Memo
01/03/2026,01/04/2026,STARBUCKS STORE 123,Food & Drink,Sale,-6.45,
01/10/2026,01/10/2026,Payment Thank You-Mobile,,Payment,500.00,
01/12/2026,01/13/2026,AMAZON.COM,Shopping,Return,12.99,
`;
  const { a, txns } = fromCSV(csv);
  assert.equal(a.names[a.map.date], 'Post Date');
  assert.deepEqual(txns.map((t) => t.amount), [-6.45, 500, 12.99]);
  assert.equal(B.suggestFlip(txns), false);
});

test('Amex CSV lists charges as positive, so flipping is suggested', () => {
  const csv = `Date,Description,Amount
01/02/2026,UBER TRIP,23.10
01/03/2026,DELTA AIR LINES,412.00
01/05/2026,WHOLE FOODS,88.20
01/09/2026,AUTOPAY PAYMENT - THANK YOU,-523.30
01/11/2026,NETFLIX.COM,15.49
`;
  const { txns } = fromCSV(csv);
  assert.equal(B.suggestFlip(txns), true);
  const flipped = fromCSV(csv, { flip: true }).txns;
  assert.equal(flipped[0].amount, -23.1);
  assert.equal(flipped[3].amount, 523.3);
});

test('Bank of America CSV with a summary block above the header', () => {
  const csv = `Description,,Summary Amt.
Beginning balance as of 01/01/2026,,"1,000.00"
Total credits,,"2,500.00"
Total debits,,"-45.20"
Ending balance as of 01/31/2026,,"3,454.80"

Date,Description,Amount,Running Bal.
01/01/2026,Beginning balance as of 01/01/2026,,"1,000.00"
01/02/2026,"PAYROLL ACME CORP DES:PAYROLL","2,500.00","3,500.00"
01/03/2026,"SHELL OIL 57444 HOUSTON TX","-45.20","3,454.80"
`;
  const { a, txns } = fromCSV(csv);
  assert.equal(a.header, 5);
  assert.equal(a.names[a.map.balance], 'Running Bal.');
  assert.deepEqual(txns.map((t) => [t.date, t.amount]), [['2026-01-02', 2500], ['2026-01-03', -45.2]]);
});

test('European semicolon CSV with day-first dates and decimal commas', () => {
  const csv = `Fecha;Concepto;Importe;Saldo
05/01/2026;MERCADONA VALENCIA;-23,45;1.234,56
15/01/2026;NOMINA EMPRESA SL;1.850,00;3.084,56
`;
  const { a, txns } = fromCSV(csv);
  assert.equal(a.order, 'DMY');
  assert.deepEqual(txns.map((t) => [t.date, t.amount]), [['2026-01-05', -23.45], ['2026-01-15', 1850]]);
});

test('separate debit and credit columns', () => {
  const csv = `Date,Description,Debit,Credit,Balance
2026-02-01,Rent,1200.00,,800.00
2026-02-03,Client invoice 18,,950.00,1750.00
`;
  const { txns } = fromCSV(csv);
  assert.deepEqual(txns.map((t) => t.amount), [-1200, 950]);
});

test('Wells Fargo CSV without a header row', () => {
  const csv = `"01/05/2026","-45.12","*","","PURCHASE AUTHORIZED ON 01/04 AMAZON.COM"
"01/06/2026","2500.00","*","","ACME PAYROLL DIR DEP"
"01/07/2026","-300.00","*","1043","CHECK # 1043"
`;
  const { a, txns } = fromCSV(csv);
  assert.equal(a.header, -1);
  assert.equal(a.map.date, 0);
  assert.equal(a.map.amount, 1);
  assert.equal(a.map.desc, 4);
  assert.deepEqual(txns.map((t) => t.amount), [-45.12, 2500, -300]);
});

test('QIF', () => {
  const qif = `!Type:Bank
D1/ 5'26
T-45.12
PAMAZON
^
D01/06/2026
T2,500.00
PACME PAYROLL
MJanuary
^
`;
  const { txns, account } = B.parseQIF(qif);
  assert.equal(account.kind, 'checking');
  assert.deepEqual(txns, [
    { date: '2026-01-05', amount: -45.12, payee: 'AMAZON', memo: '', check: '' },
    { date: '2026-01-06', amount: 2500, payee: 'ACME PAYROLL', memo: 'January', check: '' },
  ]);
});

test('OFX in, QBO out, and back again', () => {
  const txns = [
    { date: '2026-01-05', amount: -45.12, payee: 'AMAZON MKTPLACE PMTS AMZN.COM/BILL WA & CO', memo: '', check: '' },
    { date: '2026-01-06', amount: 2500, payee: 'Café Payroll', memo: 'Jan', check: '' },
    { date: '2026-01-07', amount: -300, payee: 'Check 1043', memo: '', check: '1043' },
    { date: '2026-01-07', amount: -300, payee: 'Check 1043', memo: '', check: '1043' },
  ];
  const qbo = B.writeOFX(txns, { kind: 'checking', bankId: '03000', bankName: 'Wells Fargo', acctId: '9876' }, 'qbo', new Date(2026, 0, 31, 9, 0, 0));
  assert.match(qbo, /^OFXHEADER:100\r\n/);
  assert.match(qbo, /<INTU\.BID>3000\r\n/);
  assert.match(qbo, /<NAME>AMAZON MKTPLACE PMTS AMZN\.COM\/BI\r\n/);
  assert.match(qbo, /<MEMO>AMAZON MKTPLACE PMTS AMZN\.COM\/BILL WA &amp; CO\r\n/);
  assert.match(qbo, /<NAME>Cafe Payroll\r\n/);
  assert.match(qbo, /<TRNTYPE>CHECK\r\n/);
  assert.doesNotMatch(qbo, /[^\x00-\x7f]/);
  const back = B.parseOFX(qbo);
  assert.equal(back.txns.length, 4);
  assert.equal(new Set(back.txns.map((t) => t.fitid)).size, 4, 'FITIDs are unique');
  assert.equal(back.account.bankId, '3000');
  assert.equal(back.account.acctId, '9876');
  assert.deepEqual(back.txns.map((t) => t.amount), [-45.12, 2500, -300, -300]);
  assert.equal(back.txns[0].payee, 'AMAZON MKTPLACE PMTS AMZN.COM/BI');

  const again = B.writeOFX(txns, { kind: 'checking', bankId: '3000' }, 'qbo', new Date(2026, 0, 31));
  assert.deepEqual(B.parseOFX(again).txns.map((t) => t.fitid), back.txns.map((t) => t.fitid), 'FITIDs are stable');

  const cc = B.writeOFX(txns.slice(0, 1), { kind: 'creditcard' }, 'ofx');
  assert.match(cc, /<CCSTMTRS>/);
  assert.doesNotMatch(cc, /INTU\.BID/);
  assert.equal(B.parseOFX(cc).account.kind, 'creditcard');
});

test('XML-style OFX 2 from a bank', () => {
  const ofx = `<?xml version="1.0" encoding="UTF-8"?><?OFX OFXHEADER="200" VERSION="220"?>
<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS><CURDEF>USD</CURDEF><BANKACCTFROM><BANKID>021000021</BANKID><ACCTID>555</ACCTID><ACCTTYPE>SAVINGS</ACCTTYPE></BANKACCTFROM>
<BANKTRANLIST><STMTTRN><TRNTYPE>INT</TRNTYPE><DTPOSTED>20260131</DTPOSTED><TRNAMT>1.23</TRNAMT><FITID>A1</FITID><NAME>Interest Paid</NAME></STMTTRN></BANKTRANLIST>
<LEDGERBAL><BALAMT>101.23</BALAMT><DTASOF>20260131</DTASOF></LEDGERBAL></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>`;
  const { txns, account } = B.parseOFX(ofx);
  assert.deepEqual(txns, [{ date: '2026-01-31', amount: 1.23, payee: 'Interest Paid', memo: '', check: '', fitid: 'A1' }]);
  assert.equal(account.kind, 'savings');
  assert.equal(account.balance, 101.23);
  assert.equal(B.detectFormat('x.qfx', ofx), 'ofx');
});

test('CSV and QIF writers', () => {
  const txns = [{ date: '2026-01-05', amount: -45.12, payee: 'Amazon, Inc.', memo: 'He said "hi"', check: '' }];
  assert.equal(B.writeCSV(txns), 'Date,Description,Amount,Debit,Credit,Memo,Check Number\r\n01/05/2026,"Amazon, Inc.",-45.12,45.12,,"He said ""hi""",\r\n');
  assert.equal(B.writeQIF(txns, { kind: 'creditcard' }), '!Type:CCard\r\nD01/05/2026\r\nT-45.12\r\nPAmazon, Inc.\r\nMHe said "hi"\r\n^\r\n');
});

// Builds fake pdf.js text items from rows of [x, text] pairs, one row per line.
function page(rows, top = 700) {
  const items = [];
  rows.forEach((cells, i) => {
    for (const [x, str] of cells) items.push({ str, x, y: top - i * 14, w: str.length * 5, h: 10 });
  });
  return items;
}

test('PDF: checking statement with sections and no balances', () => {
  const p = page([
    [[40, 'Statement period January 1, 2026 through January 31, 2026']],
    [[40, 'DEPOSITS AND ADDITIONS']],
    [[40, 'DATE'], [100, 'DESCRIPTION'], [480, 'AMOUNT']],
    [[40, '01/06'], [100, 'ACME PAYROLL PPD ID 123'], [470, '$2,500.00']],
    [[40, 'Total Deposits and Additions'], [470, '$2,500.00']],
    [[40, 'ELECTRONIC WITHDRAWALS']],
    [[40, 'DATE'], [100, 'DESCRIPTION'], [480, 'AMOUNT']],
    [[40, '01/05'], [100, 'AMAZON MKTPLACE PMTS'], [480, '45.12']],
    [[100, 'AMZN.COM/BILL WA']],
    [[40, '01/09'], [100, 'COMCAST CABLE'], [480, '89.99']],
    [[40, 'DAILY ENDING BALANCE']],
    [[40, '01/05'], [100, '954.88'], [200, '01/06'], [260, '3,454.88']],
  ]);
  const r = B.extractStatement([p]);
  assert.equal(r.kind, 'checking');
  assert.deepEqual(r.txns.map((t) => [t.date, t.amount, t.payee]), [
    ['2026-01-06', 2500, 'ACME PAYROLL PPD ID 123'],
    ['2026-01-05', -45.12, 'AMAZON MKTPLACE PMTS'],
    ['2026-01-09', -89.99, 'COMCAST CABLE'],
  ]);
  assert.equal(r.txns[1].memo, 'AMZN.COM/BILL WA');
  assert.equal(r.uncertain, 0);
});

test('PDF: running balance decides the sign', () => {
  const p = page([
    [[40, 'Account summary 12/01/2025 - 12/31/2025']],
    [[40, 'Date'], [100, 'Description'], [400, 'Amount'], [500, 'Balance']],
    [[40, '12/01'], [100, 'Beginning balance'], [500, '1,000.00']],
    [[40, '12/02'], [100, 'Coffee shop'], [395, '4.50'], [500, '995.50']],
    [[40, '12/03'], [100, 'Refund from store'], [390, '20.00'], [500, '1,015.50']],
    [[40, '12/30'], [100, 'Check 1001'], [390, '100.00'], [505, '915.50']],
  ]);
  const r = B.extractStatement([p]);
  assert.deepEqual(r.txns.map((t) => [t.date, t.amount]), [['2025-12-02', -4.5], ['2025-12-03', 20], ['2025-12-30', -100]]);
  assert.equal(r.txns[2].check, '1001');
});

test('PDF: withdrawal and deposit columns', () => {
  const p = page([
    [[40, 'Statement ending 03/31/2026']],
    [[40, 'Date'], [100, 'Description'], [330, 'Withdrawals'], [430, 'Deposits'], [520, 'Balance']],
    [[40, '3/2'], [100, 'Transfer from savings'], [440, '500.00'], [530, '1,500.00']],
    [[40, '3/4'], [100, 'Electric company'], [350, '120.33'], [530, '1,379.67']],
  ]);
  const r = B.extractStatement([p]);
  assert.deepEqual(r.txns.map((t) => [t.date, t.amount]), [['2026-03-02', 500], ['2026-03-04', -120.33]]);
});

test('PDF: credit card with two dates and a year rollover', () => {
  const p = page([
    [[40, 'Credit Card Statement'], [300, 'Payment Due Date: 01/25/2026']],
    [[40, 'Opening/Closing Date 12/15/25 - 01/14/26'], [300, 'Minimum Payment Due $35.00']],
    [[40, 'PAYMENTS AND OTHER CREDITS']],
    [[40, '01/02'], [80, '01/02'], [130, 'PAYMENT THANK YOU'], [470, '-500.00']],
    [[40, 'PURCHASE']],
    [[40, '12/20'], [80, '12/21'], [130, 'DELTA AIR LINES'], [470, '412.00']],
    [[40, '01/05'], [80, '01/06'], [130, 'UBER TRIP'], [480, '23.10']],
  ]);
  const r = B.extractStatement([p]);
  assert.equal(r.kind, 'creditcard');
  assert.deepEqual(r.txns.map((t) => [t.date, t.amount, t.payee]), [
    ['2026-01-02', 500, 'PAYMENT THANK YOU'],
    ['2025-12-21', -412, 'DELTA AIR LINES'],
    ['2026-01-06', -23.1, 'UBER TRIP'],
  ]);
});
