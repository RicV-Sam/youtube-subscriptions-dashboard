// Conservative publication guardrail. Reports locations, never matched values.
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const git = args => execFileSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 });
const files = [...new Set(git(['ls-files', '--cached', '--others', '--exclude-standard', '-z']).split('\0').filter(Boolean))];
const rules = [
  ['Google API key', /AIza[\w-]{30,}/],
  ['Google OAuth client ID', /\d+-[a-z0-9]+\.apps\.googleusercontent\.com/i],
  ['Google access token', /ya29\.[\w.-]{15,}/],
  ['GitHub token', /(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})/],
  ['private key', /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
  ['JWT-like token', /eyJ[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{12,}/],
  ['personal home path', /(?:[A-Z]:[\\/]+Users[\\/]+[^\s"'<>]+|\/(?:Users|home)\/[A-Za-z0-9_.-]+\/)/i],
  ['email address', /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i],
  ['credential-bearing URL', /https?:\/\/[^\s/@]+:[^\s/@]+@/i],
];
const forbidden = /(^|\/)(?:\.env(?:\..*)?|credentials[^/]*\.json|client_secret[^/]*\.json|[^/]*library[^/]*\.json|[^/]*\.(?:pem|key|p12|pfx|har|db|sqlite|zip))$|^(?:build|node_modules|review|private|backups|\.preview-build|output|\.publication-audit|\.playwright-cli)\//i;
let failures = 0;
function check(file, data, version) {
  const text = data.toString('utf8');
  if (file.endsWith('.json')) {
    try {
      const value = JSON.parse(text);
      if (value?.format === 'youtube-feed-backup') {
        console.error(`${file} (${version}): library backup content must not be published.`); failures++;
      }
    } catch { /* Other validation handles JSON syntax; continue pattern checks. */ }
  }
  // Only synthetic/example email addresses may appear in fixtures or documentation.
  const lines = text.split(/\r?\n/);
  lines.forEach((line, index) => rules.forEach(([label, pattern]) => {
    let sanitized = label === 'email address'
      ? line.replace(/[A-Z0-9._%+-]+@(?:example\.(?:com|org|net)|users\.noreply\.github\.com)\b/gi, '') : line;
    // Verified public npm maintainer contact in glob's registry deprecation notice.
    // Do not allow this address in application files or arbitrary lockfile fields.
    if (label === 'email address' && file === 'package-lock.json' && /^\s*"deprecated":/.test(line)) {
      sanitized = sanitized.replace(/i@izs[.]me\b/g, '');
    }
    if (pattern.test(sanitized)) {
      console.error(`${file}:${index + 1} (${version}): possible ${label}; inspect privately.`);
      failures++;
    }
  }));
}
for (const file of files) {
  if (file !== '.env.example' && forbidden.test(file)) {
    console.error(`${file}: private or generated file must not be published.`); failures++;
  }
  const absolute = path.join(root, file);
  if (fs.existsSync(absolute)) {
    if (fs.lstatSync(absolute).isSymbolicLink()) { console.error(`${file}: review symlink before publication.`); failures++; }
    else check(file, fs.readFileSync(absolute), 'working copy');
  }
}
// Check the index too: editing a file after staging does not sanitize the staged copy.
const staged = git(['diff', '--cached', '--name-only', '--diff-filter=ACMR', '-z']).split('\0').filter(Boolean);
for (const file of staged) check(file, Buffer.from(git(['show', `:${file}`])), 'staged');
console.log(`Checked ${files.length} candidate paths and ${staged.length} staged files. ${failures} potential issue(s).`);
console.log('Pattern scanning cannot prove absence of all personal data. Review images, exports and commit metadata separately.');
process.exitCode = failures ? 1 : 0;
