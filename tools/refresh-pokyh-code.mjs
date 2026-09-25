/**
 * The code the coder fly types is real: a handful of UI files from POKYH, its
 * team's public WebUntis frontend (github.com/bedchem/pokyh-frontend). This
 * fetches them at dev/build time and writes src/game/pokyhCode.js, which is
 * committed; the page itself never fetches anything.
 *
 *   node tools/refresh-pokyh-code.mjs            # uses the authenticated `gh` CLI
 *   node tools/refresh-pokyh-code.mjs --ref <sha>
 *   node tools/refresh-pokyh-code.mjs --dump <dir>   # also write the full files there, to read
 *
 * Only a WHITELIST of presentational files is read. Anything under app/api/,
 * anything to do with auth, login, tokens, cookies, analytics or the
 * environment, and every config file is refused even if it is listed. Each
 * file is then scanned line by line for anything secret-looking — keys,
 * tokens, JWTs, credentials in URLs, process.env — and those lines are
 * replaced by a comment. Snippets are kept short.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const REPO = 'bedchem/pokyh-frontend';
const OUT = 'src/game/pokyhCode.js';
/** At most this many lines per file: enough to type for a while, not a mirror of the repo. */
const MAX_LINES = 110;

/** The files the fly works on, in the order its tasks visit them. */
const WHITELIST = [
  'app/[lang]/timetable/timetable-logic.ts',
  'app/[lang]/timetable/WeekGrid.tsx',
  'app/[lang]/timetable/parts.tsx',
  'components/BottomNav.tsx',
  'app/[lang]/mensa/page.tsx',
  'components/ui/Spinner.tsx',
  'components/ui/EmptyView.tsx',
];
/** Read for its colours only; never shown. */
const COLORS_FROM = 'app/globals.css';

/** Never read, whitelisted or not. */
const REFUSE = [
  /^app\/api\//,
  /auth|login|logout|token|session|cookie|secret|password|env|firebase|analytics|push|register/i,
  /dockerfile|docker-compose|\.config\.|eslint|tsconfig|package(-lock)?\.json|middleware|proxy/i,
];

/** A line that could carry a secret, or reveal how the backend is reached. */
const SECRET = [
  /process\.env/,
  /(api[_-]?key|secret|token|passw(or)?d|bearer|authorization|private[_-]?key|client[_-]?id|credential)/i,
  /https?:\/\/[^\s'"`]*:[^\s'"`]*@/,            // user:pass@host
  /AKIA[0-9A-Z]{16}/,                              // AWS
  /AIza[0-9A-Za-z_-]{30,}/,                        // Google
  /gh[pousr]_[A-Za-z0-9]{30,}/,                    // GitHub
  /\bsk-[A-Za-z0-9]{20,}/,                         // generic secret keys
  /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/,     // JWT
  /-----BEGIN [A-Z ]+-----/,
  /['"`][A-Za-z0-9+/=_-]{40,}['"`]/,               // long opaque strings
];

const arg = (name) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : null;
};

const gh = (endpoint) => JSON.parse(execFileSync('gh', ['api', endpoint], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 }));
const contents = (p, ref) => {
  const res = gh(`repos/${REPO}/contents/${encodeURI(p)}?ref=${ref}`);
  return Buffer.from(res.content, 'base64').toString('utf8');
};

const langOf = (p) => (p.endsWith('.tsx') ? 'tsx' : p.endsWith('.ts') ? 'ts' : p.endsWith('.css') ? 'css' : 'text');

/**
 * The part of a file worth watching being typed: a few imports at most, then
 * the code itself, up to MAX_LINES.
 */
function snippet(lines) {
  const directive = /^['"]use client['"]/.test(lines[0] ?? '');
  let from = directive ? 1 : 0;
  while (from < lines.length && !lines[from].trim()) from++;
  // skip a long run of imports, keeping the last three statements so it still reads like the file
  const starts = [];
  for (let i = from; i < lines.length; i++) {
    if (/^import\b/.test(lines[i])) starts.push(i);
    else if (/^(export|function|const|let|interface|type|\/\*\*|\/\/)/.test(lines[i]) && starts.length) break;
  }
  if (starts.length > 3) from = starts[starts.length - 3];
  const body = lines.slice(from, from + MAX_LINES - (directive ? 2 : 0));
  // keep the directive: it is the first thing anyone types in a client component
  return directive ? [lines[0], '', ...body] : body;
}

function clean(text, file) {
  const out = [];
  let dropped = 0;
  for (const raw of text.replace(/\r\n?/g, '\n').split('\n')) {
    const line = raw.replace(/\t/g, '  ').replace(/\s+$/, '');
    if (SECRET.some((re) => re.test(line))) {
      dropped++;
      out.push(`${line.match(/^\s*/)[0]}// [line not shown]`);
    } else out.push(line);
  }
  if (dropped) console.warn(`  ${file}: ${dropped} line(s) redacted`);
  // no runs of blank lines
  return out.filter((l, i, a) => l || a[i - 1]);
}

function parseColors(css) {
  const block = (sel) => {
    const m = css.match(new RegExp(`${sel.replace('.', '\\.')}\\s*{([^}]*)}`));
    const vars = {};
    if (m) for (const [, k, v] of m[1].matchAll(/--([\w-]+):\s*([^;]+);/g)) vars[k] = v.trim();
    return vars;
  };
  return { light: block(':root'), dark: block('.dark') };
}

const head = gh(`repos/${REPO}/commits/${arg('ref') ?? 'main'}`);
const sha = head.sha;
const date = head.commit.committer.date;
console.log(`${REPO} @ ${sha.slice(0, 7)} (${date})`);

const dump = arg('dump');
const files = [];
for (const p of WHITELIST) {
  if (REFUSE.some((re) => re.test(p))) { console.warn(`  refused: ${p}`); continue; }
  const text = contents(p, sha);
  if (dump) {
    const d = path.join(dump, p);
    fs.mkdirSync(path.dirname(d), { recursive: true });
    fs.writeFileSync(d, text);
  }
  const lines = snippet(clean(text, p));
  files.push({ path: p, lang: langOf(p), lines });
  console.log(`  ${p}: ${lines.length} lines`);
}
const colors = parseColors(contents(COLORS_FROM, sha));

const body = `/**
 * Generated by tools/refresh-pokyh-code.mjs — do not edit by hand.
 *
 * A few UI files from POKYH (${REPO}), the public WebUntis frontend the
 * coder fly works on, as of commit ${sha.slice(0, 7)} (${date.slice(0, 10)}): short snippets,
 * whitelisted and scanned for anything secret. Its colours come from the
 * repo's app/globals.css. Nothing here is fetched at runtime.
 */
export default ${JSON.stringify({ repo: REPO, sha, date, files, colors }, null, 1)};
`;
fs.writeFileSync(OUT, body);
console.log(`wrote ${OUT}: ${files.length} files, ${files.reduce((a, f) => a + f.lines.length, 0)} lines, ${(body.length / 1024).toFixed(1)} KB`);
