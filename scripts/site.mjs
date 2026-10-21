// Builds the download page (dist/site/) for coenvermeer.nl/movienight from site/ (template, style,
// script, screenshots + captions), app.json, the newest 3 entries in release-notes.md and the APK.
//   node scripts/site.mjs <path-to-apk>
import { copyFileSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = new URL('..', import.meta.url);
const read = (p) => readFileSync(new URL(p, root), 'utf8');
const apk = process.argv[2];
if (!apk) throw new Error('usage: node scripts/site.mjs <path-to-apk>');

const { expo } = JSON.parse(read('app.json'));
const version = expo.version;
const apkName = `movienight-${version}.apk`;
const sizeMb = (statSync(apk).size / 1024 / 1024).toFixed(0);
const LANGS = ['nl', 'en'];

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const inline = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/`(.+?)`/g, '<code>$1</code>');
const both = (v) => LANGS.map((l) => `<span lang="${l}">${v[l]}</span>`).join('');
// "2026-10-08" → { nl: "8 oktober 2026", en: "8 October 2026" }
const longDate = (iso) => ({
  nl: new Date(`${iso}T12:00:00Z`).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' }),
  en: new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }),
});

// Release notes: "## <version> — <date>" entries with "### nl" / "### en" bullet lists; newest first.
const entries = read('release-notes.md').split(/^## /m).slice(1).map((chunk) => {
  const [heading, ...body] = chunk.split('\n');
  const notes = {};
  let lang = null;
  for (const line of body) {
    if (line.startsWith('### ')) lang = line.slice(4).trim();
    else if (line.startsWith('- ') && lang) (notes[lang] ??= []).push(line.slice(2));
    else if (line.trim() && lang && notes[lang]?.length) notes[lang][notes[lang].length - 1] += ' ' + line.trim();
  }
  return { version: heading.split(' ')[0], date: heading.match(/\d{4}-\d{2}-\d{2}/)?.[0] ?? '', notes };
});
const list = (items = []) => `<ul>${items.map((i) => `<li>${inline(i)}</li>`).join('')}</ul>`;
// The newest 3 versions, collapsed; older ones behind a "read more" link.
const versionBlock = (e) => `        <details>
          <summary>${esc(e.version)} ${e.date ? `<span class="when">${both(longDate(e.date))}</span>` : ''}</summary>
          ${LANGS.map((l) => `<div lang="${l}">${list(e.notes[l])}</div>`).join('\n          ')}
        </details>`;
const older = entries.slice(3);
const versions = entries.slice(0, 3).map(versionBlock).join('\n') + (older.length ? `
        <details class="older">
          <summary>${both({ nl: 'Lees meer: oudere versies', en: 'Read more: older versions' })}</summary>
${older.map(versionBlock).join('\n')}
        </details>` : '');

// Screenshots: small clickable ones (each carries its own title + text) and the large first one.
const shots = JSON.parse(read('site/screenshots.json'));
const img = (s, l, extra = '') =>
  `<img lang="${l}" src="screenshots/${l}-${s.file}.webp" alt="${esc(s.title[l])}" width="540" height="1200"${extra}>`;
const story = (s) => `<h2>${both({ nl: esc(s.title.nl), en: esc(s.title.en) })}</h2><p>${both({ nl: esc(s.text.nl), en: esc(s.text.en) })}</p>`;
const slides = shots.map((s, i) => `        <button type="button" class="shot" aria-current="${i === 0}">
          ${LANGS.map((l) => img(s, l, i > 2 ? ' loading="lazy"' : '')).join('\n          ')}
          <div class="cap">${story(s)}</div>
        </button>`).join('\n');
const feature = LANGS.map((l) => `      ${img(shots[0], l)}`).join('\n');

const date = longDate(entries[0].date);
const page = Object.entries({
  VERSION: esc(version), APK: apkName, SIZE: sizeMb, DATE_NL: date.nl, DATE_EN: date.en,
  FEATURE: feature, STORY: story(shots[0]), SLIDES: slides, VERSIONS: versions,
}).reduce((html, [k, v]) => html.replaceAll(`{{${k}}}`, v), read('site/index.template.html'));

const out = new URL('dist/site/', root);
const copy = (from, to) => copyFileSync(new URL(from, root), new URL(to, out));
rmSync(out, { recursive: true, force: true });
mkdirSync(new URL('screenshots/', out), { recursive: true });
mkdirSync(new URL('fonts/', out), { recursive: true });
writeFileSync(new URL('index.html', out), page);
// Read by the app (src/version.ts) to show "new version available".
writeFileSync(new URL('version.json', out), JSON.stringify({ version, versionCode: expo.android.versionCode, date: entries[0].date, apk: apkName }) + '\n');
copyFileSync(apk, new URL(apkName, out));
copy('site/style.css', 'style.css');
copy('site/app.js', 'app.js');
copy('node_modules/@expo-google-fonts/bebas-neue/400Regular/BebasNeue_400Regular.ttf', 'fonts/BebasNeue-Regular.ttf');
for (const f of readdirSync(new URL('site/screenshots/', root))) copy(`site/screenshots/${f}`, `screenshots/${f}`);
await sharp(fileURLToPath(new URL('assets/icon.png', root))).resize(192, 192).png().toFile(fileURLToPath(new URL('icon.png', out)));
console.log(`dist/site: index.html, ${shots.length * 2} screenshots, ${entries.length} versions, ${apkName} (${sizeMb} MB)`);
