// Batch gitnexus context for exported symbols with zero static CALLS edges.
// Usage: node scripts/gitnexus-dead-code-report.mjs [outputPath]
import { execSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const REPO = 'pantheon';
const OUTPUT = resolve(process.argv[2] ?? '.gitnexus/dead-code-report.json');

const CYPHER_QUERIES = [
  `MATCH (s:Function) WHERE s.isExported = true AND NOT EXISTS { MATCH ()-[:CodeRelation {type: 'CALLS'}]->(s) } RETURN s.id AS uid, s.name AS name, 'Function' AS kind, s.filePath AS filePath, s.startLine AS line ORDER BY s.filePath, s.startLine`,
  `MATCH (s:Method) WHERE s.isExported = true AND NOT EXISTS { MATCH ()-[:CodeRelation {type: 'CALLS'}]->(s) } RETURN s.id AS uid, s.name AS name, 'Method' AS kind, s.filePath AS filePath, s.startLine AS line ORDER BY s.filePath, s.startLine`,
];

function runCypher(query) {
  const raw = execSync(`npx gitnexus cypher -r ${REPO} ${JSON.stringify(query)}`, {
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024,
  });
  const parsed = JSON.parse(raw);
  if (parsed.error) throw new Error(parsed.error);
  return parseMarkdownTable(parsed.markdown);
}

function parseMarkdownTable(markdown) {
  const lines = markdown
    .trim()
    .split('\n')
    .filter((l) => l.startsWith('|') && !l.includes('---'));
  if (lines.length < 2) return [];
  const headers = lines[0]
    .split('|')
    .map((h) => h.trim())
    .filter(Boolean);
  return lines.slice(1).map((line) => {
    const cells = line
      .split('|')
      .map((c) => c.trim())
      .filter((_, i, arr) => i > 0 && i < arr.length);
    const row = {};
    headers.forEach((h, i) => {
      row[h] = h === 'line' ? Number(cells[i]) : cells[i];
    });
    return row;
  });
}

function runContext(uid) {
  const raw = execSync(`npx gitnexus context -r ${REPO} -u ${JSON.stringify(uid)}`, {
    encoding: 'utf8',
    maxBuffer: 2 * 1024 * 1024,
  });
  return JSON.parse(raw);
}

function callerCount(incoming) {
  if (!incoming || typeof incoming !== 'object') return 0;
  let n = 0;
  for (const refs of Object.values(incoming)) {
    if (Array.isArray(refs)) n += refs.length;
  }
  return n;
}

const candidates = [...runCypher(CYPHER_QUERIES[0]), ...runCypher(CYPHER_QUERIES[1])];
console.log(`Found ${candidates.length} exported symbols with zero CALLS edges`);

const byFile = {};
let verifiedZeroCallers = 0;
let hasCallers = 0;

for (let i = 0; i < candidates.length; i++) {
  const c = candidates[i];
  process.stdout.write(`\rContext ${i + 1}/${candidates.length}: ${c.name}`);
  const ctx = runContext(c.uid);
  const calls = ctx.incoming?.calls ?? [];
  const totalIncoming = callerCount(ctx.incoming);

  if (calls.length === 0) verifiedZeroCallers++;
  else hasCallers++;

  const entry = {
    uid: c.uid,
    name: c.name,
    kind: c.kind,
    line: c.line,
    callerCount: calls.length,
    totalIncomingRefs: totalIncoming,
    incoming: ctx.incoming ?? {},
    processCount: ctx.processes?.length ?? 0,
  };

  if (!byFile[c.filePath]) byFile[c.filePath] = [];
  byFile[c.filePath].push(entry);
}

console.log('\nDone.');

const report = {
  generatedAt: new Date().toISOString(),
  repo: REPO,
  criterion: 'isExported=true AND no incoming CALLS edge; context verified incoming.calls',
  summary: {
    candidates: candidates.length,
    verifiedZeroCallers,
    contextFoundCallers: hasCallers,
    filesAffected: Object.keys(byFile).length,
  },
  byFile,
};

writeFileSync(OUTPUT, `${JSON.stringify(report, null, 2)}\n`);
console.log(`Wrote ${OUTPUT}`);
