// Builds banks.json from Intuit's financial institution list:
//   curl -o /tmp/fidir.txt https://ofx-prod-filist.intuit.com/qw2800/data/fidir.txt
//   node tools/banks.mjs /tmp/fidir.txt
// Keeps active banks and card issuers that support Web Connect, as [bankId, name] pairs.
import fs from 'node:fs';

const src = process.argv[2];
const rows = fs.readFileSync(src, 'latin1').split(/\r?\n/).slice(2).map((l) => l.split('\t'));
const seen = new Set();
const out = [];
for (const c of rows) {
  if (c.length < 12 || c[7] !== 'ACTIVE') continue;
  if (!/WEB-CONNECT/.test(c[9] || '') && !/BANKING|CREDIT/.test(c[11] || '')) continue;
  const id = c[0].replace(/^0+(?=\d)/, '');
  const name = c[3].trim();
  const key = name.toLowerCase();
  if (!name || seen.has(key)) continue;
  seen.add(key);
  out.push([id, name]);
}
out.sort((a, b) => a[1].localeCompare(b[1]));
fs.writeFileSync(new URL('../banks.json', import.meta.url), JSON.stringify(out));
console.log(out.length, 'banks');
