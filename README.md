# Bankfile

Bank statement converter that runs entirely in the browser: PDF statements, CSV, Excel, QFX, OFX, QBO and QIF in; QBO (QuickBooks Web Connect), QFX, OFX, CSV, Excel and QIF out. Files are never uploaded.

Live at https://vl3.github.io/bankfile/

## Layout

- `core.js`: the conversion engine. Pure functions, no DOM, also runs under Node.
- `app.js`: the converter UI, free limit and Gumroad license check (`CONFIG` at the top).
- `tools/build.mjs`: writes every landing page (`index.html`, `csv-to-qbo/`, …), `sitemap.xml` and `robots.txt`. Edit page copy there, not in the generated HTML.
- `tools/banks.mjs`: rebuilds `banks.json` (bank IDs QuickBooks and Quicken check) from Intuit's list.
- `vendor/`: pdf.js 3.11.174 and SheetJS 0.18.5, self-hosted so no third-party script runs on the page.

## Develop

```sh
node tools/build.mjs          # regenerate pages after editing copy
node --test tests/            # engine tests
python3 -m http.server 8766   # then open http://localhost:8766/
```

pdf.js and SheetJS are Apache-2.0 licensed.
