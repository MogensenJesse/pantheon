// Batch gitnexus context for exported symbols with zero static CALLS edges.
// Classifies into tiers and enriches with ripgrep evidence.
// Usage: node scripts/gitnexus-dead-code-report.mjs [outputDir]
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = 'pantheon';
const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const OUTPUT_DIR = resolve(process.argv[2] ?? join(ROOT, '.gitnexus'));

const CYPHER_QUERIES = [
  `MATCH (s:Function) WHERE s.isExported = true AND NOT EXISTS { MATCH ()-[:CodeRelation {type: 'CALLS'}]->(s) } RETURN s.id AS uid, s.name AS name, 'Function' AS kind, s.filePath AS filePath, s.startLine AS line ORDER BY s.filePath, s.startLine`,
  `MATCH (s:Method) WHERE s.isExported = true AND NOT EXISTS { MATCH ()-[:CodeRelation {type: 'CALLS'}]->(s) } RETURN s.id AS uid, s.name AS name, 'Method' AS kind, s.filePath AS filePath, s.startLine AS line ORDER BY s.filePath, s.startLine`,
];

function runCypher(query) {
  const raw = execSync(`npx gitnexus cypher -r ${REPO} ${JSON.stringify(query)}`, {
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024,
    cwd: ROOT,
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
    cwd: ROOT,
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

function rg(pattern, glob) {
  const globArg = glob ? `-g ${glob}` : '';
  try {
    const out = execSync(`rg --json -e ${JSON.stringify(pattern)} ${globArg} .`, {
      encoding: 'utf8',
      cwd: ROOT,
      maxBuffer: 4 * 1024 * 1024,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return parseRgJson(out);
  } catch (e) {
    if (e.stdout) return parseRgJson(e.stdout);
    return [];
  }
}

function parseRgJson(out) {
  const hits = [];
  for (const line of String(out).split('\n')) {
    if (!line.trim()) continue;
    try {
      const row = JSON.parse(line);
      if (row.type === 'match') {
        hits.push({
          path: row.data.path.text.replace(/\\/g, '/'),
          line: row.data.line_number,
          text: row.data.lines.text.trim(),
        });
      }
    } catch {
      /* skip */
    }
  }
  return hits;
}

function readSourceLine(filePath, line) {
  try {
    const lines = readFileSync(join(ROOT, filePath), 'utf8').split('\n');
    return lines[line - 1] ?? '';
  } catch {
    return '';
  }
}

/** Resolve symbol name from source when GitNexus labels inner bindings (e.g. `ps`, `parts`). */
function resolveExportName(candidate) {
  const { name, filePath, line } = candidate;
  for (let offset = 0; offset <= 3; offset++) {
    const src = readSourceLine(filePath, line + offset);
    const fn = src.match(/^\s*export\s+(?:async\s+)?function\s+(\w+)/);
    if (fn) return fn[1];
    const cnst = src.match(/^\s*export\s+const\s+(\w+)/);
    if (cnst) return cnst[1];
  }
  return name;
}

function isTopLevelExportFunction(filePath, line) {
  const src = readSourceLine(filePath, line);
  return /^\s*export\s+(async\s+)?function\s/.test(src);
}

function isTopLevelExportConst(filePath, line) {
  const src = readSourceLine(filePath, line);
  return /^\s*export\s+(const|let)\s/.test(src);
}

function hasDeprecatedJSDoc(filePath, line) {
  try {
    const lines = readFileSync(join(ROOT, filePath), 'utf8').split('\n');
    for (let i = Math.max(0, line - 6); i < line - 1; i++) {
      if (lines[i]?.includes('@deprecated')) return true;
    }
  } catch {
    /* ignore */
  }
  return false;
}

function isInsideNonExportFunction(filePath, line) {
  try {
    const lines = readFileSync(join(ROOT, filePath), 'utf8').split('\n');
    let depth = 0;
    for (let i = 0; i < line - 1; i++) {
      const l = lines[i];
      if (/^\s*export\s+(async\s+)?function\s/.test(l) && i < line - 1) {
        /* top-level export function — if we're past its opening, we're inside */
      }
      if (/function\s+\w+|=>\s*\{/.test(l)) depth++;
      if (/\}/.test(l)) depth = Math.max(0, depth - 1);
    }
    const src = lines[line - 1] ?? '';
    if (/^\s+/.test(src) && !/^\s*export\s/.test(src)) return true;
    if (src.includes('const ') && !/^\s*export\s/.test(src)) return true;
    return depth > 0 && !isTopLevelExportFunction(filePath, line);
  } catch {
    return false;
  }
}

function normPath(p) {
  return p.replace(/\\/g, '/');
}

function grepEvidence(name, filePath) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const normFile = normPath(filePath);
  const allNameHits = rg(`\\b${escaped}\\b`, '*.{ts,tsx,js,html}');
  const htmlHits = rg(`\\b${escaped}\\b`, '*.html');

  const importHits = allNameHits.filter(
    (h) => normPath(h.path) !== normFile && /import\b/.test(h.text),
  );
  const callHits = allNameHits.filter((h) => {
    if (!h.text.includes(`${name}(`)) return false;
    if (normPath(h.path) !== normFile) return true;
    return !/^\s*export\s+(async\s+)?function\s/.test(h.text);
  });
  const propertyHits = rg(`\\.${escaped}\\b`, '*.{ts,tsx,js,html}');

  return {
    importHits: importHits.length,
    callHits: callHits.length,
    propertyHits: propertyHits.length,
    htmlHits: htmlHits.length,
    importSamples: importHits.slice(0, 3),
    callSamples: callHits.slice(0, 3),
    propertySamples: propertyHits.slice(0, 3),
  };
}

function isDynamicApiName(name) {
  if (['dispose', 'update', 'sync', 'run'].includes(name)) return true;
  if (/^(on|get|set|is|rebind)/.test(name)) return true;
  return false;
}

function isDynamicApiPath(filePath) {
  if (filePath.startsWith('src/editor/')) return true;
  if (filePath.startsWith('src/ui/dev/')) return true;
  if (filePath.includes('createPostFxPipeline')) return true;
  if (/init[A-Z]/.test(filePath) || filePath.includes('Editor')) return true;
  if (filePath.startsWith('src/core/')) return true;
  if (filePath.startsWith('src/ui/') && !filePath.startsWith('src/ui/dev/')) return true;
  if (filePath.startsWith('src/entities/')) return true;
  return false;
}

function classifyTier(candidate, evidence, processCount, resolvedName) {
  const { kind, filePath, line } = candidate;
  const { importHits, callHits, propertyHits } = evidence;
  const totalUsage = importHits + callHits + propertyHits;

  if (filePath.startsWith('vite/') && resolvedName === 'configureServer') {
    return { tier: 1, label: 'framework_hook' };
  }

  if (kind === 'Method') {
    return { tier: 1, label: 'dynamic_api' };
  }

  if (hasDeprecatedJSDoc(filePath, line)) {
    return { tier: 2, label: 'deprecated_alias' };
  }

  if (
    isInsideNonExportFunction(filePath, line) ||
    (!isTopLevelExportFunction(filePath, line) && !isTopLevelExportConst(filePath, line))
  ) {
    return { tier: 1, label: 'graph_false_positive' };
  }

  if (isDynamicApiName(resolvedName) || isDynamicApiPath(filePath)) {
    return { tier: 1, label: 'dynamic_api' };
  }

  if (propertyHits > 0 || processCount > 0) {
    return { tier: 2, label: 'needs_review' };
  }

  if (isTopLevelExportFunction(filePath, line) || isTopLevelExportConst(filePath, line)) {
    if (totalUsage === 0 && processCount === 0) {
      return { tier: 3, label: 'orphan_export' };
    }
    return { tier: 2, label: 'needs_review' };
  }

  return { tier: 1, label: 'dynamic_api' };
}

const candidates = [...runCypher(CYPHER_QUERIES[0]), ...runCypher(CYPHER_QUERIES[1])];
console.log(`Found ${candidates.length} exported symbols with zero CALLS edges`);

const byFile = {};
const tier1 = [];
const tier2 = [];
const tier3 = [];
let verifiedZeroCallers = 0;
let hasCallers = 0;
const byTier = { tier1: 0, tier2: 0, tier3: 0 };

for (let i = 0; i < candidates.length; i++) {
  const c = candidates[i];
  process.stdout.write(`\rAnalyzing ${i + 1}/${candidates.length}: ${c.name}`);
  const ctx = runContext(c.uid);
  const calls = ctx.incoming?.calls ?? [];
  const totalIncoming = callerCount(ctx.incoming);
  const processCount = ctx.processes?.length ?? 0;

  if (calls.length === 0) verifiedZeroCallers++;
  else hasCallers++;

  const resolvedName = resolveExportName(c);
  const evidence = grepEvidence(resolvedName, c.filePath);
  const { tier, label } = classifyTier(c, evidence, processCount, resolvedName);

  const entry = {
    uid: c.uid,
    name: c.name,
    resolvedName,
    kind: c.kind,
    filePath: c.filePath,
    line: c.line,
    tier,
    label,
    callerCount: calls.length,
    totalIncomingRefs: totalIncoming,
    processCount,
    evidence,
    incoming: ctx.incoming ?? {},
    sourceLine: readSourceLine(c.filePath, c.line).trim(),
    isTopLevelExport:
      isTopLevelExportFunction(c.filePath, c.line) || isTopLevelExportConst(c.filePath, c.line),
  };

  byTier[`tier${tier}`]++;
  if (tier === 1) tier1.push(entry);
  else if (tier === 2) tier2.push(entry);
  else tier3.push(entry);

  if (!byFile[c.filePath]) byFile[c.filePath] = [];
  byFile[c.filePath].push(entry);
}

tier2.sort(
  (a, b) => b.evidence.propertyHits + b.processCount - (a.evidence.propertyHits + a.processCount),
);

console.log('\nDone.');

const report = {
  generatedAt: new Date().toISOString(),
  repo: REPO,
  criterion: 'isExported=true AND no incoming CALLS edge; context + grep tier classification',
  summary: {
    candidates: candidates.length,
    verifiedZeroCallers,
    contextFoundCallers: hasCallers,
    filesAffected: Object.keys(byFile).length,
    byTier,
  },
  byFile,
};

writeFileSync(join(OUTPUT_DIR, 'dead-code-report.json'), `${JSON.stringify(report, null, 2)}\n`);
writeFileSync(
  join(OUTPUT_DIR, 'dead-code-tier1.json'),
  `${JSON.stringify({ generatedAt: report.generatedAt, count: tier1.length, symbols: tier1 }, null, 2)}\n`,
);
writeFileSync(
  join(OUTPUT_DIR, 'dead-code-tier2-review.json'),
  `${JSON.stringify({ generatedAt: report.generatedAt, count: tier2.length, symbols: tier2 }, null, 2)}\n`,
);
writeFileSync(
  join(OUTPUT_DIR, 'dead-code-tier3-candidates.json'),
  `${JSON.stringify({ generatedAt: report.generatedAt, count: tier3.length, symbols: tier3 }, null, 2)}\n`,
);

console.log(`Wrote ${OUTPUT_DIR}/dead-code-report.json`);
console.log(`  tier1: ${tier1.length} | tier2: ${tier2.length} | tier3: ${tier3.length}`);

const resolutionLines = [
  '# Tier 2 triage resolutions',
  '',
  `Generated: ${report.generatedAt}`,
  '',
  '## Removed (promoted to Tier 3)',
  '',
  '- `revealTForPanel` — deprecated alias with zero usage; removed from devPanelSkyShared.ts',
  '',
  '## Keep — dynamic API (property access)',
  '',
  '| Symbol | File | Reason |',
  '|--------|------|--------|',
  '| `loadMapById`, `createNewMap` | EditorMapDocument.ts | `mapDocument.*` in EditorUI |',
  '| `getWorldY`, `getBiomeAt`, `uploadBiomeMap` | MapTerrainBuilder.ts | `terrain.*` across game/editor |',
  '| `getMovementAxes`, `getYaw` | CameraRig.ts | Returned on camera rig context |',
  '| PostFX setters/getters | createPostFxPipeline.ts | `postFX.*` from dev panels + main |',
  '| `configureServer` | vite/mapDevApiPlugin.ts | Vite framework hook |',
  '',
  '## Keep — event bus / DOM wiring',
  '',
  'StoryLog, HUD, DevPanel, and editor factory handlers are live via `bus.on` or `addEventListener` despite zero CALLS edges.',
  '',
  '## Keep — class / module API',
  '',
  '`isSunRevealAnimating`, `getSunRevealProgress` — module-level exports used by dev panels and game loop.',
  '',
  `## Tier 1 inventory (${tier1.length} symbols)`,
  '',
  'See `dead-code-tier1.json`. Majority are graph_false_positive closures inside factories (no TypeScript `export` keyword).',
  '',
  `## Tier 3 candidates (${tier3.length} symbols)`,
  '',
  ...tier3.map(
    (s) =>
      `- \`${s.resolvedName}\` (${s.filePath}:${s.line}) — import:${s.evidence.importHits} call:${s.evidence.callHits} prop:${s.evidence.propertyHits}`,
  ),
  '',
];

writeFileSync(join(OUTPUT_DIR, 'tier2-resolutions.md'), `${resolutionLines.join('\n')}\n`);
console.log(`Wrote ${OUTPUT_DIR}/tier2-resolutions.md`);
