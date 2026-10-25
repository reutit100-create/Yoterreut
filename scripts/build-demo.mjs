// Builds dist/demo.html: the whole app (with the core running in the browser) in one file,
// for previews and for sharing without a server.
import { build } from 'esbuild';
import fs from 'node:fs';

const js = (await build({ entryPoints: ['demo/entry.js'], bundle: true, format: 'iife', minify: true, write: false, target: 'es2020' })).outputFiles[0].text;
const css = fs.readFileSync('public/styles.css', 'utf8');
const logo = 'data:image/jpeg;base64,' + fs.readFileSync('public/img/logo.jpg').toString('base64');
const html = `<title>יותר רעות</title>
<meta name="claude:viewport-fit-sides" content="cover">
<meta name="description" content="מועדון ההטבות הקהילתי של רעות – גרסת הדגמה">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Assistant:wght@400;600;700&family=Rubik:wght@500;600;700&display=swap">
<style>${css}</style>
<script>document.documentElement.lang='he';document.documentElement.dir='rtl';window.__YR_LOGO__=${JSON.stringify(logo)};</script>
<script>${js.replace(/<\/script/g, '<\\/script')}</script>
`;
fs.mkdirSync('dist', { recursive: true });
fs.writeFileSync('dist/demo.html', html);
// A standalone copy with its own document skeleton, to open directly in a browser.
fs.writeFileSync('dist/demo-standalone.html', `<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">${html}</head><body></body></html>`);
console.log(`dist/demo.html ${(html.length / 1024).toFixed(0)} KB`);
