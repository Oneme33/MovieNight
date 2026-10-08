// Builds the download page (dist/site/) for coenvermeer.nl/movienight from app.json, the
// newest entry in release-notes.md and the built APK.  Usage: node scripts/site.mjs <path-to-apk>
import { copyFileSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = new URL('..', import.meta.url);
const apk = process.argv[2];
if (!apk) throw new Error('usage: node scripts/site.mjs <path-to-apk>');

const { expo } = JSON.parse(readFileSync(new URL('app.json', root), 'utf8'));
const version = expo.version;
const apkName = `movienight-${version}.apk`;
const sizeMb = (statSync(apk).size / 1024 / 1024).toFixed(0);

// Newest release-notes entry: from the first "## " heading up to the next one.
const notes = readFileSync(new URL('release-notes.md', root), 'utf8');
const [heading, ...rest] = notes.split(/^## /m)[1].split('\n');
const body = rest.join('\n');
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const inline = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/`(.+?)`/g, '<code>$1</code>');
let html = '';
let item = null;
const flush = () => { if (item != null) html += `<li>${inline(item)}</li>`; item = null; };
let inList = false;
for (const line of body.split('\n')) {
  if (line.startsWith('### ')) { flush(); if (inList) { html += '</ul>'; inList = false; } html += `<h3>${inline(line.slice(4))}</h3>`; }
  else if (line.startsWith('- ')) { flush(); if (!inList) { html += '<ul>'; inList = true; } item = line.slice(2); }
  else if (line.trim() && item != null) item += ' ' + line.trim();
}
flush();
if (inList) html += '</ul>';

const date = heading.match(/\d{4}-\d{2}-\d{2}/)?.[0] ?? '';
const page = `<!doctype html>
<html lang="nl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>MovieNight downloaden</title>
<link rel="icon" href="icon.png">
<style>
  :root { --bg:#17110F; --card:#211714; --text:#F6F1EE; --muted:#B7A69E; --faint:#8A756D; --red:#E11D2A; --border:#3A2A25; }
  * { box-sizing: border-box; }
  body { margin:0; background:var(--bg); color:var(--text); font:16px/1.55 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif; }
  main { max-width:560px; margin:0 auto; padding:40px 16px 56px; }
  header { display:flex; align-items:center; gap:16px; }
  header img { width:76px; height:76px; border-radius:18px; }
  h1 { margin:0; font-size:28px; letter-spacing:.5px; }
  .sub { color:var(--muted); margin:2px 0 0; }
  .dl { display:flex; align-items:center; justify-content:center; gap:10px; margin:28px 0 8px; padding:16px;
        background:var(--red); color:#fff; text-decoration:none; font-weight:700; font-size:18px; border-radius:14px; }
  .dl:active { transform:scale(.98); }
  .meta { text-align:center; color:var(--faint); font-size:14px; margin:0 0 28px; }
  section { background:var(--card); border:1px solid var(--border); border-radius:14px; padding:18px 20px; margin-top:16px; }
  h2 { font-size:17px; margin:0 0 8px; }
  h3 { font-size:14px; text-transform:uppercase; letter-spacing:.8px; color:var(--muted); margin:16px 0 4px; }
  ul, ol { margin:6px 0 0; padding-left:20px; }
  li { margin:6px 0; }
  li, ol { color:#e8dfda; }
  code { font-size:.9em; background:#2E211C; padding:1px 5px; border-radius:5px; }
</style>
</head>
<body>
<main>
  <header>
    <img src="icon.png" alt="">
    <div><h1>MovieNight</h1><p class="sub">Jullie gedeelde kijklijst</p></div>
  </header>

  <a class="dl" href="${apkName}" download>⬇ Download versie ${esc(version)}</a>
  <p class="meta">Android · ${sizeMb} MB${date ? ` · ${date}` : ''}</p>

  <section>
    <h2>Installeren</h2>
    <ol>
      <li>Tik op de downloadknop en open het bestand als het binnen is.</li>
      <li>Vraagt Android om toestemming voor "onbekende apps", sta die dan toe voor je browser.</li>
      <li>Tik op <strong>Bijwerken</strong>. Je lijst en koppeling blijven gewoon staan.</li>
    </ol>
  </section>

  <section>
    <h2>Nieuw in ${esc(version)}</h2>
    ${html}
  </section>
</main>
</body>
</html>
`;

const out = new URL('dist/site/', root);
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
writeFileSync(new URL('index.html', out), page);
copyFileSync(apk, new URL(apkName, out));
await sharp(fileURLToPath(new URL('assets/icon.png', root))).resize(192, 192).png().toFile(fileURLToPath(new URL('icon.png', out)));
console.log(`dist/site: index.html, icon.png, ${apkName} (${sizeMb} MB)`);
