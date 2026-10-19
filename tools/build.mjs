// Writes every landing page, the sitemap and robots.txt. Run: node tools/build.mjs
// Each page is the same converter with its own preset, copy and FAQ, aimed at one search.
import fs from 'node:fs';
import path from 'node:path';

const SITE = 'https://vl3.github.io/bankfile/';
const PRICE = '$19';
const OUT = path.resolve(new URL('..', import.meta.url).pathname);

const QB_IMPORT = [
  'In <b>QuickBooks Desktop</b>: File → Utilities → Import → Web Connect Files, then pick the account and match transactions in the Bank Feeds center.',
  'In <b>QuickBooks Online</b>: Transactions → Bank transactions → Link account ▾ → Upload from file, choose the .qbo file and map it to an account.',
];

const COMMON_FAQ = [
  ['Is my bank statement uploaded anywhere?', 'No. Bankfile reads and converts the file inside your browser, with the code on this page. There is no server that receives it, no account and no tracking script. Open your browser’s network panel while you convert and you’ll see the file never leaves your computer.'],
  ['What does the free version include?', `Every format and every feature for the first ${25} transactions of each file. That’s enough to test an import before you pay.`],
  ['What do I get with Pro?', `Every transaction in every file, in every format, on all your devices, for ${PRICE} once. No subscription. If it doesn’t work for your files, reply to the Gumroad receipt within 14 days for a full refund.`],
  ['Which banks work?', 'Any bank that gives you a CSV, Excel, QFX, OFX, QIF or text-based PDF statement. Column layouts, date formats and number formats are detected for you, and you can correct them before downloading.'],
];

const PAGES = [
  {
    slug: '', in: 'any', out: 'xlsx',
    title: 'Bank Statement Converter: PDF, CSV & QFX to QBO or Excel | Bankfile',
    desc: 'Convert bank statements to QBO, QFX, OFX, CSV or Excel. Works with PDF statements, CSV and Excel exports, QFX, OFX and QIF files. Runs in your browser; nothing is uploaded.',
    h1: 'Bank statement converter',
    lede: 'Turn PDF statements, CSV and Excel exports, and QFX, OFX or QIF files into QuickBooks, Quicken, Excel or CSV. It all happens in your browser, so your statements are never uploaded.',
    intro: [
      'Bookkeeping starts with getting transactions out of the bank and into the software. Banks hand them over in a dozen shapes: a PDF statement, a CSV with its own column names, a Quicken file, an old QIF export. Bankfile reads all of them and writes the format your software imports.',
      'Drop a file and you get a preview of every transaction, with dates, payees and signed amounts. Fix anything that looks off, choose the output, and download.',
    ],
    steps: ['Drop your statement or export: PDF, CSV, Excel, QFX, OFX, QBO or QIF.', 'Check the preview. Columns, date order and debit or credit signs are worked out for you, and every one can be changed.', 'Choose QBO for QuickBooks, QFX for Quicken, OFX, CSV, Excel or QIF, and download.'],
    faq: [
      ['Can it convert a PDF bank statement to Excel?', 'Yes, as long as the PDF has text in it, which is true of statements downloaded from online banking. Bankfile finds the transaction lines, works out each amount’s sign from the running balance, its column or its section, and writes one row per transaction.'],
      ['Which format should I pick for QuickBooks?', 'QBO (Web Connect). QuickBooks Desktop imports bank transactions only from QBO files, and QuickBooks Online accepts them too.'],
    ],
  },
  {
    slug: 'csv-to-qbo', in: 'csv', out: 'qbo',
    title: 'CSV to QBO Converter: Import Bank CSV into QuickBooks | Bankfile',
    desc: 'Convert a bank or credit card CSV to a QuickBooks Web Connect (.qbo) file. Columns detected automatically. Free for 25 transactions; runs in your browser.',
    h1: 'CSV to QBO converter',
    lede: 'Turn any bank or credit card CSV into a QuickBooks Web Connect (.qbo) file. Columns are detected for you, and the file never leaves your browser.',
    intro: [
      'QuickBooks Desktop won’t import a CSV into a bank account. It imports Web Connect files, the .qbo files your bank’s “Download for QuickBooks” button produces. When the bank only offers CSV, or the history you need is older than the bank will export as QBO, converting the CSV is the way in.',
      'Bankfile reads the CSV the way your bank wrote it: a single signed amount column or separate debit and credit columns, US or European dates and decimals, summary rows above the header. It writes a QBO file with the dates, payees, amounts and check numbers where QuickBooks expects them.',
    ],
    steps: ['Download the account activity from your bank as CSV.', 'Drop it above. Check that Date, Description and Amount point to the right columns in the preview.', 'Pick the account type and your bank, then download the .qbo file.', ...QB_IMPORT],
    faq: [
      ['Why can’t QuickBooks Desktop import my CSV?', 'QuickBooks Desktop brings bank transactions in through Web Connect, and Web Connect only reads .qbo files. A CSV can go in through other routes, but not into the Bank Feeds center where you match and add transactions. Converting to QBO puts it there.'],
      ['QuickBooks says it can’t verify the financial institution', 'QuickBooks checks the bank ID inside the file (INTU.BID) against Intuit’s list of banks. Pick your bank in the converter. If yours isn’t listed, keep the default Wells Fargo ID (3000), which QuickBooks recognizes.'],
      ['My amounts have the wrong sign', 'In a QBO file, money leaving the account is negative. Some card exports list purchases as positive numbers; Bankfile spots most of these and flips them, and you can tick Flip signs yourself, or click a single amount to flip just that one.'],
      ['Will importing the same file twice create duplicates?', 'No. Each transaction gets a stable ID made from its date, amount and payee, so QuickBooks recognizes transactions it has already downloaded.'],
    ],
  },
  {
    slug: 'excel-to-qbo', in: 'xlsx', out: 'qbo',
    title: 'Excel to QBO Converter: XLSX to QuickBooks Web Connect | Bankfile',
    desc: 'Convert an Excel (.xlsx or .xls) list of bank transactions into a QuickBooks .qbo file. Detects columns, dates and debits/credits. Runs in your browser.',
    h1: 'Excel to QBO converter',
    lede: 'Turn a spreadsheet of bank transactions into a QuickBooks Web Connect (.qbo) file, straight from .xlsx or .xls. Nothing is uploaded.',
    intro: [
      'Maybe the bank exported to Excel, maybe a client sent their transactions in a spreadsheet, maybe you typed them in from paper statements. Either way, QuickBooks Desktop needs a .qbo file to bring them into a bank account.',
      'Bankfile reads the first sheet of the workbook, skips title rows and totals, and finds the date, description and amount columns. It handles one signed amount column or separate debit and credit columns.',
    ],
    steps: ['Save the transactions as .xlsx or .xls, on the first sheet.', 'Drop the file above and check the column choices in the preview.', 'Choose the account type and your bank, then download the .qbo file.', ...QB_IMPORT],
    faq: [
      ['What should the spreadsheet look like?', 'One row per transaction with at least a date, a description and an amount (or debit and credit columns). A header row helps but isn’t required. Rows above the header and total rows without a date are skipped.'],
      ['Can I convert Google Sheets?', 'Yes. Use File → Download → Microsoft Excel (.xlsx) or Comma-separated values (.csv), then drop that file here.'],
    ],
  },
  {
    slug: 'qfx-to-qbo', in: 'qfx', out: 'qbo',
    title: 'QFX to QBO Converter: Quicken Files into QuickBooks | Bankfile',
    desc: 'Convert Quicken QFX files to QuickBooks QBO (Web Connect). Keeps dates, payees, amounts and check numbers. Free for 25 transactions; nothing is uploaded.',
    h1: 'QFX to QBO converter',
    lede: 'Bring a Quicken (.qfx) download into QuickBooks as a Web Connect (.qbo) file, with every date, payee, amount and check number intact.',
    intro: [
      'QFX and QBO are both flavors of OFX, but Quicken and QuickBooks each insist on their own. A file downloaded for Quicken carries Quicken’s extension and a bank ID that QuickBooks may not accept, so the import fails or the file doesn’t show up at all.',
      'Bankfile reads every transaction out of the QFX and writes a clean QBO with a bank ID QuickBooks recognizes, keeping the original transaction IDs so nothing imports twice.',
    ],
    steps: ['Drop the .qfx file above.', 'Pick the account type and your bank (it’s preselected when the QFX names one).', 'Download the .qbo file.', ...QB_IMPORT],
    faq: [
      ['Can I just rename .qfx to .qbo?', 'Sometimes. It works only when the bank ID inside the file is one QuickBooks accepts for Web Connect. When renaming fails, converting rewrites the header for you and keeps the transactions as they were.'],
      ['Does it keep the original transaction IDs?', 'Yes. The FITID from your bank’s file is kept, so QuickBooks matches transactions it has already seen and skips duplicates.'],
    ],
  },
  {
    slug: 'ofx-to-qbo', in: 'ofx', out: 'qbo',
    title: 'OFX to QBO Converter: Import OFX into QuickBooks Desktop | Bankfile',
    desc: 'Convert OFX bank files to QBO so QuickBooks Desktop can import them through Web Connect. Keeps transaction IDs. Runs in your browser.',
    h1: 'OFX to QBO converter',
    lede: 'Make an OFX bank file importable in QuickBooks Desktop by converting it to Web Connect (.qbo). Transactions and IDs stay exactly as your bank wrote them.',
    intro: [
      'OFX is the open standard many banks and finance apps export. QuickBooks Online takes it, but QuickBooks Desktop only imports bank files through Web Connect, which means .qbo with Intuit’s bank ID inside.',
      'Bankfile reads OFX version 1 (SGML) and version 2 (XML) files, keeps the transaction IDs, and writes a QBO that QuickBooks Desktop accepts.',
    ],
    steps: ['Drop the .ofx file above.', 'Pick the account type and your bank.', 'Download the .qbo file.', ...QB_IMPORT],
    faq: [
      ['Why doesn’t QuickBooks Desktop open my OFX file?', 'Web Connect imports look for .qbo files containing a bank ID from Intuit’s list. A plain OFX has neither, so QuickBooks Desktop won’t take it until it’s converted.'],
      ['Does it work with OFX from Xero, GnuCash or Moneydance?', 'Yes. Any OFX statement file with bank or credit card transactions works.'],
    ],
  },
  {
    slug: 'qif-to-qbo', in: 'qif', out: 'qbo',
    title: 'QIF to QBO Converter: Old Quicken & Money Files into QuickBooks | Bankfile',
    desc: 'Convert QIF files from Quicken, Microsoft Money or your bank into QuickBooks QBO. Handles every QIF date style. Free for 25 transactions.',
    h1: 'QIF to QBO converter',
    lede: 'Move transactions from QIF files (old Quicken, Microsoft Money and bank exports) into QuickBooks as a Web Connect (.qbo) file.',
    intro: [
      'QIF is the format personal finance software used for decades, and plenty of banks still offer it. Current versions of QuickBooks don’t import QIF bank files, so older history gets stuck.',
      'Bankfile reads QIF bank and credit card accounts, including the odd date styles QIF is known for (1/ 5’26, 01.05.2026), and writes a QBO file QuickBooks imports.',
    ],
    steps: ['Drop the .qif file above.', 'Check the dates in the preview. If day and month look swapped, change the date order.', 'Pick the account type and your bank, then download the .qbo file.', ...QB_IMPORT],
    faq: [
      ['My QIF file has several accounts in it', 'Bankfile reads the bank or credit card transactions in the file. If it holds several accounts, export each account to its own QIF first so they land in the right QuickBooks accounts.'],
      ['Can I convert QBO or CSV to QIF instead?', 'Yes. Drop any supported file and choose QIF as the output.'],
    ],
  },
  {
    slug: 'pdf-to-qbo', in: 'pdf', out: 'qbo',
    title: 'PDF to QBO Converter: Bank Statement PDF to QuickBooks | Bankfile',
    desc: 'Convert PDF bank and credit card statements into QuickBooks QBO files. Reads text-based PDFs in your browser; nothing is uploaded. Free for 25 transactions.',
    h1: 'PDF to QBO converter',
    lede: 'Turn a PDF bank or credit card statement into a QuickBooks Web Connect (.qbo) file, read right here in your browser.',
    intro: [
      'Online banking often lets you download only recent activity as a file, but keeps PDF statements for years. When you’re catching up on bookkeeping, the PDFs are what you have.',
      'Bankfile reads the text in the statement, finds each transaction line, and works out whether it’s money in or out from the running balance, the column it sits in, or its section (Deposits, Withdrawals, Payments, Purchases). Lines it isn’t sure about are marked so you can check them.',
    ],
    steps: ['Download the statement PDF from your bank.', 'Drop it above and check the preview. Click an amount to flip its sign, or × to drop a line.', 'Pick the account type and your bank, then download the .qbo file.', ...QB_IMPORT],
    faq: [
      ['How accurate is the PDF reading?', 'For statements downloaded from online banking, it gets the dates, descriptions and amounts directly from the PDF’s text, so there are no OCR errors. The sign of each amount is the part to check, and rows Bankfile wasn’t sure about are marked with a question mark.'],
      ['Does it work with scanned statements?', 'Not yet. Scanned paper statements are pictures of text, and Bankfile reads PDFs that contain the text itself.'],
      ['What about password-protected PDFs?', 'Open the PDF, use Print → Save as PDF to make an unlocked copy, and drop that copy here.'],
    ],
  },
  {
    slug: 'bank-statement-to-excel', in: 'pdf', out: 'xlsx',
    title: 'PDF Bank Statement to Excel Converter (Free, Private) | Bankfile',
    desc: 'Convert PDF bank statements to Excel with one row per transaction: date, description, amount, debit and credit. Runs in your browser, nothing uploaded.',
    h1: 'PDF bank statement to Excel',
    lede: 'Turn a PDF bank or credit card statement into a clean spreadsheet, one row per transaction, without uploading it anywhere.',
    intro: [
      'Copying a statement from PDF into Excel by hand takes forever, and pasting usually scrambles the columns. Bankfile reads the statement and gives you a tidy table: date, description, amount, plus separate debit and credit columns.',
      'It’s handy for bookkeeping, taxes, expense reports, loan applications and budgets, anywhere you need the transactions as data rather than a picture of a page.',
    ],
    steps: ['Download the statement PDF from online banking.', 'Drop it above. Review the transactions in the preview and fix any sign that looks wrong.', 'Choose Excel and download. Dates are real dates and amounts are numbers, ready for formulas and pivot tables.'],
    faq: [
      ['Which columns does the Excel file have?', 'Date, Description, Amount (negative for money out), Debit, Credit, Memo and Check Number.'],
      ['Does it work with credit card statements?', 'Yes. Payments and refunds come out positive and purchases negative, from the account’s point of view. Tick Flip signs if you prefer purchases positive.'],
      ['Can I convert several months at once?', 'Convert each statement and paste the rows together, or combine the PDFs into one file first. Every page of a PDF is read.'],
    ],
  },
  {
    slug: 'bank-statement-to-csv', in: 'pdf', out: 'csv',
    title: 'Bank Statement to CSV Converter: PDF to CSV in Your Browser | Bankfile',
    desc: 'Convert PDF bank statements to CSV for QuickBooks Online, Xero, Wave or YNAB. One row per transaction. Free for 25 transactions; nothing uploaded.',
    h1: 'Bank statement to CSV converter',
    lede: 'Turn a PDF bank statement into a CSV that imports into QuickBooks Online, Xero, Wave, YNAB or any spreadsheet.',
    intro: [
      'Most bookkeeping and budgeting apps import bank transactions from CSV, but banks don’t always offer a CSV for the months you need. The PDF statement is there, though.',
      'Bankfile reads the statement and writes a CSV whose first three columns are Date, Description and Amount, the layout QuickBooks Online maps by itself, followed by Debit, Credit, Memo and Check Number for apps that want those.',
    ],
    steps: ['Download the statement PDF from your bank.', 'Drop it above and check the preview.', 'Choose CSV and download, then import it into your app.'],
    faq: [
      ['What date format does the CSV use?', 'MM/DD/YYYY, which QuickBooks Online, Xero (US) and Wave read without changes.'],
      ['Can I convert a CSV from one bank layout to another?', 'Yes. Drop a CSV from any bank and download it again as a clean Date, Description, Amount CSV.'],
    ],
  },
  {
    slug: 'csv-to-qfx', in: 'csv', out: 'qfx',
    title: 'CSV to QFX Converter: Import CSV into Quicken | Bankfile',
    desc: 'Convert bank CSV files to Quicken QFX (Web Connect). Detects columns and debits/credits, lets you pick your bank. Runs in your browser.',
    h1: 'CSV to QFX converter for Quicken',
    lede: 'Turn a bank or credit card CSV into a Quicken Web Connect (.qfx) file, with the bank Quicken expects.',
    intro: [
      'Quicken imports downloaded transactions from QFX files and doesn’t take CSV into a bank account. When your bank only exports CSV, or you need history it no longer offers as QFX, converting is the way in.',
      'Bankfile reads the CSV, lets you check the columns, and writes a QFX with the bank ID Quicken checks against its list.',
    ],
    steps: ['Download the account activity from your bank as CSV.', 'Drop it above and check the preview.', 'Pick the account type and your bank, then download the .qfx file.', 'In Quicken for Windows: File → File Import → Web Connect (.QFX) File.'],
    faq: [
      ['Quicken says the financial institution isn’t supported', 'Quicken checks the bank ID in the file. Pick your own bank in the converter; if it isn’t listed, choose a large bank such as Wells Fargo (3000).'],
      ['Does it work with Quicken for Mac?', 'Quicken for Mac imports QFX files too, from File → Import → Web Connect File.'],
    ],
  },
  {
    slug: 'csv-to-ofx', in: 'csv', out: 'ofx',
    title: 'CSV to OFX Converter: Bank CSV to OFX for Xero, Wave, GnuCash | Bankfile',
    desc: 'Convert bank CSV exports to OFX for Xero, Wave, GnuCash, Moneydance or QuickBooks Online. Detects columns automatically. Runs in your browser.',
    h1: 'CSV to OFX converter',
    lede: 'Turn a bank CSV into an OFX statement file for Xero, Wave, GnuCash, Moneydance, QuickBooks Online and other finance apps.',
    intro: [
      'OFX carries more than a CSV does: transaction types, check numbers, unique IDs that stop duplicates. Many apps import OFX more reliably than CSV, because there’s nothing to map.',
      'Bankfile reads your CSV, lets you check the columns, and writes a standard OFX 1.02 file with a stable ID for every transaction.',
    ],
    steps: ['Download the account activity from your bank as CSV.', 'Drop it above and check the preview.', 'Choose OFX and download, then import it from your app’s bank statement import.'],
    faq: [
      ['Which apps import OFX?', 'Xero, Wave, GnuCash, Moneydance, Banktivity and QuickBooks Online, among others. QuickBooks Desktop needs QBO instead.'],
      ['Is it OFX 1 or OFX 2?', 'OFX 1.02, the widely supported SGML version.'],
    ],
  },
];

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const strip = (s) => s.replace(/<[^>]+>/g, '');

const ICON_UP = '<svg viewBox="0 0 24 24" width="28" height="28" aria-hidden="true"><path d="M12 16V4m0 0-4.5 4.5M12 4l4.5 4.5M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const ICON_LOCK = '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><rect x="5" y="10.5" width="14" height="10" rx="2" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>';

function tool(p) {
  const accept = '.csv,.txt,.tsv,.xlsx,.xls,.ods,.pdf,.qfx,.ofx,.qbo,.qif';
  const inLabel = { any: 'a bank file', csv: 'a CSV file', xlsx: 'an Excel file', qfx: 'a QFX file', ofx: 'an OFX file', qif: 'a QIF file', pdf: 'a PDF statement' }[p.in];
  return `
<section class="tool" id="tool" aria-label="Converter">
  <div class="drop" id="drop" tabindex="0" role="button" aria-label="Choose ${inLabel} to convert">
    <input type="file" id="file" accept="${accept}" hidden>
    <div class="drop-hit">${ICON_UP}
      <p class="drop-title">Drop ${inLabel} here</p>
    </div>
    <p class="drop-sub">PDF, CSV, Excel, QFX, OFX, QBO or QIF &middot; <button type="button" class="link" id="pick">choose a file</button> &middot; <button type="button" class="link" id="sample">try a sample</button></p>
    <p class="private">${ICON_LOCK} Converted on your computer. Nothing is uploaded.</p>
    <p class="busy" id="busy" role="status" hidden></p>
    <p class="error" id="error" role="alert" hidden></p>
  </div>

  <div class="work" id="work" hidden>
    <div class="work-head">
      <p class="file"><b id="fileName"></b></p>
      <button type="button" class="link" id="reset">Convert another file</button>
    </div>
    <p class="notice" id="notice" role="status" hidden></p>
    <div class="mapping" id="mapping" hidden></div>
    <div class="work-grid">
      <div class="preview">
        <p class="stats" id="stats"></p>
        <div class="tablewrap">
          <table>
            <thead><tr><th>Date</th><th>Description</th><th class="a">Amount</th><th class="x"><span class="sr">Remove</span></th></tr></thead>
            <tbody id="rows"></tbody>
          </table>
        </div>
        <p class="more" id="more"></p>
      </div>
      <aside class="out">
        <p class="label" id="fmtLabel">Convert to</p>
        <div class="formats" id="formats" role="radiogroup" aria-labelledby="fmtLabel"></div>
        <div id="acctFields">
          <label class="field">Account type
            <select id="kind"><option value="checking">Checking</option><option value="savings">Savings</option><option value="creditcard">Credit card</option></select>
          </label>
          <div class="field bank" id="bankField">
            <label for="bank">Bank</label>
            <input id="bank" type="text" autocomplete="off" spellcheck="false" role="combobox" aria-controls="bankList" aria-expanded="false" aria-autocomplete="list">
            <ul id="bankList" role="listbox" hidden></ul>
            <p class="fine">QuickBooks and Quicken check this. Pick your bank, or keep Wells Fargo, which they recognize.</p>
          </div>
          <label class="field" id="idField">Account number
            <input id="acctId" type="text" inputmode="numeric" autocomplete="off" placeholder="1001">
            <span class="fine">Any number. Use a different one for each account.</span>
          </label>
        </div>
        <button type="button" class="cta" id="download">Download</button>
        <p class="fine center" id="limitNote"></p>
        <div class="upsell" id="upsell">
          <p id="upsellText"></p>
          <a class="cta alt" data-buy href="#pricing">Unlock Pro &middot; ${PRICE} once</a>
          <details class="license">
            <summary>Already bought? Enter your license key</summary>
            <form class="license-form"><input type="text" placeholder="License key" aria-label="License key" autocomplete="off" spellcheck="false"><button type="submit">Unlock</button></form>
            <p class="msg" role="status" aria-live="polite"></p>
          </details>
        </div>
      </aside>
    </div>
  </div>
</section>`;
}

function page(p) {
  const root = p.slug ? '../' : '';
  const url = SITE + (p.slug ? p.slug + '/' : '');
  const faq = [...p.faq, ...COMMON_FAQ];
  const ld = [
    { '@context': 'https://schema.org', '@type': 'SoftwareApplication', name: 'Bankfile', url: SITE, applicationCategory: 'FinanceApplication', operatingSystem: 'Any (web browser)', description: p.desc,
      offers: [{ '@type': 'Offer', price: '0', priceCurrency: 'USD', name: 'Free' }, { '@type': 'Offer', price: PRICE.slice(1), priceCurrency: 'USD', name: 'Pro' }] },
    { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: faq.map(([q, a]) => ({ '@type': 'Question', name: strip(q), acceptedAnswer: { '@type': 'Answer', text: strip(a) } })) },
  ];
  const related = PAGES.filter((x) => x !== p).map((x) => `<li><a href="${root}${x.slug ? x.slug + '/' : ''}">${esc(x.h1)}</a></li>`).join('');
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(p.title)}</title>
<meta name="description" content="${esc(p.desc)}">
<link rel="canonical" href="${url}">
<meta property="og:title" content="${esc(p.title)}">
<meta property="og:description" content="${esc(p.desc)}">
<meta property="og:url" content="${url}">
<meta property="og:type" content="website">
<meta property="og:image" content="${SITE}og.png">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='7' fill='%2313211b'/%3E%3Cpath d='M9 11h14M9 16h14M9 21h9' stroke='%2378d6a5' stroke-width='2.4' stroke-linecap='round'/%3E%3C/svg%3E">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans:wght@400;500;600&display=swap" rel="stylesheet">
<link href="${root}styles.css" rel="stylesheet">
<script type="application/ld+json">${JSON.stringify(ld)}</script>
</head>
<body data-in="${p.in}" data-out="${p.out}">
<header class="top">
  <a class="brand" href="${root}">Bankfile</a>
  <nav><a href="#converters">Converters</a><a href="#pricing">Pricing</a><a href="#faq">FAQ</a></nav>
</header>

<main>
<section class="hero">
  <h1>${esc(p.h1)}</h1>
  <p class="lede">${esc(p.lede)}</p>
</section>
${tool(p)}

<section class="info">
  <div class="prose">${p.intro.map((x) => `<p>${esc(x)}</p>`).join('')}</div>
  <h2>How to convert</h2>
  <ol class="steps">${p.steps.map((s) => `<li>${s.includes('<b>') ? s : esc(s)}</li>`).join('')}</ol>
</section>

<section class="info">
  <h2>Why Bankfile</h2>
  <ul class="features">
    <li><b>Private by design.</b> Your statement is read by this page in your browser. No upload, no account, no tracking scripts.</li>
    <li><b>Reads what banks actually export.</b> Summary rows above the header, debit and credit columns, day-first dates, decimal commas, PDFs with sections and running balances.</li>
    <li><b>Ready for QuickBooks.</b> Web Connect files with your bank’s ID from Intuit’s list of over 14,000 banks and card issuers, and stable transaction IDs so nothing imports twice.</li>
    <li><b>Check before you download.</b> See every transaction, flip a sign or drop a line, then download.</li>
  </ul>
</section>

<section class="info" id="pricing">
  <h2>Pricing</h2>
  <div class="plans">
    <div class="plan">
      <h3>Free</h3>
      <p class="price">$0</p>
      <ul><li>Every input and output format</li><li>First 25 transactions of each file</li><li>Enough to test an import</li></ul>
    </div>
    <div class="plan pro">
      <h3>Pro</h3>
      <p class="price">${PRICE} <span>once</span></p>
      <ul><li>Every transaction, every file</li><li>All formats, all future updates</li><li>Use it on all your devices</li><li>Full refund within 14 days</li></ul>
      <a class="cta" data-buy href="#pricing">Get Pro &middot; ${PRICE}</a>
      <p class="fine center" data-pro hidden>Pro is unlocked on this browser. Thank you!</p>
    </div>
  </div>
</section>

<section class="info" id="faq">
  <h2>Questions</h2>
  ${faq.map(([q, a]) => `<details><summary>${esc(q)}</summary><p>${esc(a)}</p></details>`).join('\n  ')}
</section>

<section class="info" id="converters">
  <h2>More converters</h2>
  <ul class="related">${related}</ul>
</section>
</main>

<footer class="foot">
  <p>Bankfile is made by one person and runs entirely in your browser. QuickBooks and Quicken are trademarks of their owners; Bankfile isn’t affiliated with them.</p>
  <p>Questions or a file that won’t convert? Reply to your receipt, or open an issue on <a href="https://github.com/vl3/bankfile">GitHub</a>.</p>
</footer>

<script src="${root}core.js"></script>
<script src="${root}app.js"></script>
</body>
</html>
`;
}

for (const p of PAGES) {
  const dir = path.join(OUT, p.slug);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'index.html'), page(p));
}
const today = new Date().toISOString().slice(0, 10);
fs.writeFileSync(path.join(OUT, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${PAGES.map((p) => `  <url><loc>${SITE}${p.slug ? p.slug + '/' : ''}</loc><lastmod>${today}</lastmod></url>`).join('\n')}
</urlset>
`);
fs.writeFileSync(path.join(OUT, 'robots.txt'), `User-agent: *\nAllow: /\nSitemap: ${SITE}sitemap.xml\n`);
console.log(`Wrote ${PAGES.length} pages`);
