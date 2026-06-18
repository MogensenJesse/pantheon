// Batch gitnexus context for exported symbols with zero static CALLS edges.
// Classifies into tiers and enriches with ripgrep evidence.
// Usage: node scripts/gitnexus-dead-code-report.mjs [outputDir]
// Env: DEAD_CODE_CONCURRENCY (default min(8, cpu count))
import { execSync, spawn } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = 'pantheon';
const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const OUTPUT_DIR = resolve(process.argv[2] ?? join(ROOT, '.gitnexus'));
const CONCURRENCY = Math.max(
  1,
  Number.parseInt(process.env.DEAD_CODE_CONCURRENCY ?? '', 10) ||
    Math.min(8, os.cpus().length),
);

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

function captureProcess(command, args, { maxBuffer = 4 * 1024 * 1024, allowExit1 = false } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: ROOT,
      shell: command === 'npx',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
      if (stdout.length > maxBuffer) {
        child.kill();
        reject(new Error(`${command} stdout exceeded ${maxBuffer} bytes`));
      }
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0 || (allowExit1 && code === 1)) resolve(stdout);
      else reject(new Error(stderr.trim() || `${command} exited ${code}`));
    });
  });
}

async function runContext(uid) {
  const raw = await captureProcess(
    'npx',
    ['gitnexus', 'context', '-r', REPO, '-u', uid],
    { maxBuffer: 2 * 1024 * 1024 },
  );
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

function expandRipgrepGlobs(glob) {
  if (!glob) return [];
  const brace = glob.match(/^\*\.(\{[^}]+\})$/);
  if (brace) {
    return brace[1]
      .slice(1, -1)
      .split(',')
      .map((ext) => `*.${ext}`);
  }
  return [glob];
}

async function rg(pattern, glob) {
  const args = ['--json', '-e', pattern, ...expandRipgrepGlobs(glob).flatMap((g) => ['-g', g]), '.'];
  try {
    const out = await captureProcess('rg', args, { allowExit1: true });
    return parseRgJson(out);
  } catch {
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
  for (let offset = 0; offset <= 3; offset++) {
    const src = readSourceLine(filePath, line + offset);
    if (/^\s*export\s+(async\s+)?function\s/.test(src)) return true;
  }
  return false;
}

function isTopLevelExportConst(filePath, line) {
  for (let offset = 0; offset <= 3; offset++) {
    const src = readSourceLine(filePath, line + offset);
    if (/^\s*export\s+(const|let)\s/.test(src)) return true;
  }
  return false;
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

async function grepEvidence(name, filePath) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const normFile = normPath(filePath);
  const [allNameHits, htmlHits, propertyHits] = await Promise.all([
    rg(`\\b${escaped}\\b`, '*.{ts,tsx,js,html}'),
    rg(`\\b${escaped}\\b`, '*.html'),
    rg(`\\.${escaped}\\b`, '*.{ts,tsx,js,html}'),
  ]);

  const importHits = allNameHits.filter(
    (h) => normPath(h.path) !== normFile && /import\b/.test(h.text),
  );
  const callHits = allNameHits.filter((h) => {
    if (!h.text.includes(`${name}(`)) return false;
    if (normPath(h.path) !== normFile) return true;
    return !/^\s*export\s+(async\s+)?function\s/.test(h.text);
  });

  return {
    importHits: importHits.length,
    callHits: callHits.length,
    propertyHits: propertyHits.length,
    htmlHits: htmlHits.length,
    importSamples: importHits.slice(0, 3),
    callSamples: callHits.slice(0, 3),
    propertySamples: propertyHits.slice(0, 3),
    allNameHits,
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

function isTslModule(filePath) {
  try {
    const head = readFileSync(join(ROOT, filePath), 'utf8').slice(0, 800);
    return head.includes("from 'three/tsl'") || head.includes('from "three/tsl"');
  } catch {
    return false;
  }
}

function isTslNodeExport(filePath, line) {
  for (let offset = 0; offset <= 3; offset++) {
    const src = readSourceLine(filePath, line + offset);
    if (/=\s*Fn\s*\(/.test(src)) return true;
  }
  return isTslModule(filePath) && isTopLevelExportConst(filePath, line);
}

function isTypeOnlyImport(name, filePath, allNameHits) {
  const normFile = normPath(filePath);
  return allNameHits.some(
    (h) =>
      normPath(h.path) !== normFile &&
      /import\s+type\b/.test(h.text) &&
      new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(h.text),
  );
}

/** Symbols verified removed from the codebase (audit trail for triage). */
const REMOVED_SYMBOLS = [
  { name: 'revealTForPanel', file: 'devPanelSkyShared.ts', note: 'deprecated alias' },
  { name: 'createDefaultBiomeTuneMap', file: 'terrainBiomeTuning.ts' },
  { name: 'DEFAULT_BIOME_TUNE', file: 'terrainBiomeTuning.ts', note: 'only used by createDefaultBiomeTuneMap' },
  { name: 'terrainGltfUrl', file: 'terrainTextureManifest.ts' },
  { name: 'packOrmTexture', file: 'packOrmTexture.ts' },
  { name: 'isSunRevealAnimating', file: 'WorldReveal.ts' },
  { name: 'getSunRevealProgress', file: 'WorldReveal.ts' },
  { name: 'buildPathOffMask', file: 'biomeWeightBake.ts', note: 'replaced by buildPathGrassMultiplier' },
  { name: 'resetWaterReflectionQuality', file: 'updateWaterReflectionQuality.ts' },
  { name: 'terrainSurfaceUv', file: 'biomeAtlasUv.ts', note: 'unused TSL Fn; biomeSurfaceUv used instead' },
  { name: 'terrainDetailConfigFromVisual', file: 'terrainLodRings.ts' },
  { name: 'playMeshSegments', file: 'terrainLodRings.ts' },
  { name: 'createPlayTerrainGeometry', file: 'terrainLodRings.ts' },
  { name: 'createBiomeSplatMaterial', file: 'createBiomeSplatMaterial.ts', note: 'renamed to createTerrainSplatMaterial' },
  { name: 'buildInstancedMeshes', file: 'mapPropInstancing.ts', note: 'deprecated alias of buildMapPropInstancedMeshes' },
  { name: 'DETAIL_DISP_TILE', file: 'atlasConstants.ts', note: 'alias of TERRAIN_ATLAS_DISP_TILE_PX' },
  { name: 'TERRAIN_ATLAS_TILE_PX', file: 'atlasConstants.ts', note: 'alias of TERRAIN_ATLAS_SURF_TILE_PX' },
];

/** Live exports that lack CALLS edges but are known to be used (dynamic API / wiring). */
const KNOWN_KEEP = [
  { symbols: ['loadMapById', 'createNewMap'], file: 'EditorMapDocument.ts', reason: '`mapDocument.*` in EditorUI' },
  {
    symbols: ['getWorldY', 'getBiomeAt', 'uploadBiomeMap'],
    file: 'MapTerrainBuilder.ts',
    reason: '`terrain.*` across game/editor',
  },
  { symbols: ['getMovementAxes', 'getYaw'], file: 'CameraRig.ts', reason: 'returned on camera rig context' },
  { symbols: ['configureServer'], file: 'vite/mapDevApiPlugin.ts', reason: 'Vite framework hook' },
];

function knownKeepReason(candidate) {
  const { resolvedName, filePath } = candidate;
  const base = filePath.split('/').pop() ?? filePath;
  for (const row of KNOWN_KEEP) {
    if (base.includes(row.file) && row.symbols.includes(resolvedName)) return row.reason;
  }
  return null;
}

function classifyTier(candidate, evidence, processCount, resolvedName) {
  const { kind, filePath, line } = candidate;
  const { importHits, callHits, propertyHits } = evidence;
  const totalUsage = importHits + callHits + propertyHits;
  const typeOnlyImport = isTypeOnlyImport(resolvedName, filePath, evidence.allNameHits ?? []);

  if (filePath.startsWith('vite/') && resolvedName === 'configureServer') {
    return { tier: 1, label: 'framework_hook' };
  }

  if (knownKeepReason({ resolvedName, filePath })) {
    return { tier: 1, label: 'known_keep' };
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

  if (isTslNodeExport(filePath, line)) {
    if (importHits > 0 || callHits > 0) {
      return { tier: 1, label: 'tsl_node' };
    }
    return { tier: 3, label: 'tsl_orphan' };
  }

  if (typeOnlyImport && callHits === 0 && propertyHits === 0) {
    return { tier: 1, label: 'type_only_import' };
  }

  if (importHits > 0 && callHits === 0 && propertyHits === 0) {
    return { tier: 2, label: 'import_only' };
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

async function analyzeCandidate(c) {
  const resolvedName = resolveExportName(c);
  const [ctx, evidence] = await Promise.all([
    runContext(c.uid),
    grepEvidence(resolvedName, c.filePath),
  ]);
  const calls = ctx.incoming?.calls ?? [];
  const totalIncoming = callerCount(ctx.incoming);
  const processCount = ctx.processes?.length ?? 0;
  const { tier, label } = classifyTier(c, evidence, processCount, resolvedName);
  const keepReason = knownKeepReason({ resolvedName, filePath: c.filePath });

  return {
    candidate: c,
    entry: {
      uid: c.uid,
      name: c.name,
      resolvedName,
      kind: c.kind,
      filePath: c.filePath,
      line: c.line,
      tier,
      label,
      keepReason,
      callerCount: calls.length,
      totalIncomingRefs: totalIncoming,
      processCount,
      evidence,
      incoming: ctx.incoming ?? {},
      sourceLine: readSourceLine(c.filePath, c.line).trim(),
      isTopLevelExport:
        isTopLevelExportFunction(c.filePath, c.line) || isTopLevelExportConst(c.filePath, c.line),
    },
    callsLength: calls.length,
  };
}

async function mapPool(items, concurrency, fn) {
  const results = new Array(items.length);
  let next = 0;
  let done = 0;

  async function worker() {
    while (next < items.length) {
      const index = next++;
      results[index] = await fn(items[index], index);
      done++;
      process.stdout.write(
        `\rAnalyzing ${done}/${items.length} (${concurrency} workers): ${items[index].name}`.padEnd(72),
      );
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, () => worker()),
  );
  return results;
}

async function main() {
  const [functionCandidates, methodCandidates] = await Promise.all([
    Promise.resolve(runCypher(CYPHER_QUERIES[0])),
    Promise.resolve(runCypher(CYPHER_QUERIES[1])),
  ]);
  const candidates = [...functionCandidates, ...methodCandidates];
  console.log(
    `Found ${candidates.length} exported symbols with zero CALLS edges (concurrency: ${CONCURRENCY})`,
  );

  const analyzed = await mapPool(candidates, CONCURRENCY, analyzeCandidate);

  const byFile = {};
  const tier1 = [];
  const tier2 = [];
  const tier3 = [];
  let verifiedZeroCallers = 0;
  let hasCallers = 0;
  const byTier = { tier1: 0, tier2: 0, tier3: 0 };

  for (const { entry, callsLength } of analyzed) {
    if (callsLength === 0) verifiedZeroCallers++;
    else hasCallers++;

    byTier[`tier${entry.tier}`]++;
    if (entry.tier === 1) tier1.push(entry);
    else if (entry.tier === 2) tier2.push(entry);
    else tier3.push(entry);

    if (!byFile[entry.filePath]) byFile[entry.filePath] = [];
    byFile[entry.filePath].push(entry);
  }

  tier2.sort(
    (a, b) => b.evidence.propertyHits + b.processCount - (a.evidence.propertyHits + a.processCount),
  );

  tier3.sort((a, b) => a.filePath.localeCompare(b.filePath) || a.line - b.line);

  const tier3Actionable = tier3.filter(
    (s) =>
      (s.label === 'orphan_export' || s.label === 'tsl_orphan') &&
      s.evidence.importHits + s.evidence.callHits + s.evidence.propertyHits === 0,
  );

  const removedRegressions = [...tier2, ...tier3].filter((s) =>
    REMOVED_SYMBOLS.some(
      (r) => r.name === s.resolvedName && s.filePath.replace(/\\/g, '/').includes(r.file),
    ),
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
      tier3Actionable: tier3Actionable.length,
      removedRegressions: removedRegressions.length,
      concurrency: CONCURRENCY,
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
  writeFileSync(
    join(OUTPUT_DIR, 'dead-code-tier3-actionable.json'),
    `${JSON.stringify(
      { generatedAt: report.generatedAt, count: tier3Actionable.length, symbols: tier3Actionable },
      null,
      2,
    )}\n`,
  );

  console.log(`Wrote ${OUTPUT_DIR}/dead-code-report.json`);
  console.log(`  tier1: ${tier1.length} | tier2: ${tier2.length} | tier3: ${tier3.length}`);
  console.log(`  tier3 actionable (zero grep evidence): ${tier3Actionable.length}`);
  if (removedRegressions.length > 0) {
    console.warn(
      `  WARNING: ${removedRegressions.length} previously-removed symbol(s) reappeared — update REMOVED_SYMBOLS or revert deletion`,
    );
  }

  function formatEvidence(s) {
    const e = s.evidence;
    return `import:${e.importHits} call:${e.callHits} prop:${e.propertyHits}`;
  }

  function mdTableRow(cells) {
    return `| ${cells.join(' | ')} |`;
  }

  const tier2ByLabel = tier2.reduce((acc, s) => {
    if (!acc[s.label]) acc[s.label] = [];
    acc[s.label].push(s);
    return acc;
  }, {});

  const resolutionLines = [
    '# Dead code triage report',
    '',
    `Generated: ${report.generatedAt}`,
    '',
    '## Summary',
    '',
    `- Candidates (zero CALLS edges): **${candidates.length}**`,
    `- Tier 1 (auto-filtered): **${tier1.length}**`,
    `- Tier 2 (manual review): **${tier2.length}**`,
    `- Tier 3 (orphan exports): **${tier3.length}**`,
    `- Tier 3 actionable (zero grep hits): **${tier3Actionable.length}**`,
    `- Concurrency: **${CONCURRENCY}**`,
    '',
    'Tier 1 labels include `graph_false_positive`, `dynamic_api`, `tsl_node`, `known_keep`, `type_only_import`.',
    '',
    '## Previously removed (audit trail)',
    '',
    ...REMOVED_SYMBOLS.map(
      (r) => `- \`${r.name}\` (\`${r.file}\`)${r.note ? ` — ${r.note}` : ''}`,
    ),
    '',
  ];

  if (removedRegressions.length > 0) {
    resolutionLines.push(
      '## Regression warning',
      '',
      'These symbols were marked removed but still appear in the report:',
      '',
      ...removedRegressions.map(
        (s) => `- \`${s.resolvedName}\` (${s.filePath}:${s.line}) — ${formatEvidence(s)}`,
      ),
      '',
    );
  }

  resolutionLines.push(
    '## Known keep — dynamic API',
    '',
    mdTableRow(['Symbol(s)', 'File', 'Reason']),
    mdTableRow(['---', '---', '---']),
    ...KNOWN_KEEP.flatMap((row) =>
      row.symbols.map((sym, i) =>
        mdTableRow([i === 0 ? `\`${sym}\`` : `\`${sym}\` (cont.)`, row.file, row.reason]),
      ),
    ),
    '',
    'PostFX setters/getters (`createPostFxPipeline.ts`) and event-bus / DOM handlers are also live via `postFX.*`, `bus.on`, or `addEventListener` despite zero CALLS edges.',
    '',
  );

  if (tier2.length > 0) {
    resolutionLines.push('## Tier 2 — manual review queue', '');
    for (const [label, items] of Object.entries(tier2ByLabel).sort(([a], [b]) => a.localeCompare(b))) {
      resolutionLines.push(`### ${label} (${items.length})`, '');
      resolutionLines.push(mdTableRow(['Symbol', 'File', 'Evidence', 'Processes']));
      resolutionLines.push(mdTableRow(['---', '---', '---', '---']));
      for (const s of items) {
        resolutionLines.push(
          mdTableRow([
            `\`${s.resolvedName}\``,
            `\`${s.filePath}:${s.line}\``,
            formatEvidence(s),
            String(s.processCount),
          ]),
        );
      }
      resolutionLines.push('');
    }
  }

  if (tier3Actionable.length > 0) {
    resolutionLines.push('## Tier 3 — deletion candidates (zero usage evidence)', '');
    for (const s of tier3Actionable) {
      resolutionLines.push(
        `- \`${s.resolvedName}\` (\`${s.filePath}:${s.line}\`) — ${s.label}; ${formatEvidence(s)}`,
      );
    }
    resolutionLines.push('');
  }

  const tier3Other = tier3.filter((s) => !tier3Actionable.includes(s));
  if (tier3Other.length > 0) {
    resolutionLines.push('## Tier 3 — other (TSL orphans, etc.)', '');
    for (const s of tier3Other) {
      resolutionLines.push(
        `- \`${s.resolvedName}\` (\`${s.filePath}:${s.line}\`) — ${s.label}; ${formatEvidence(s)}`,
      );
    }
    resolutionLines.push('');
  }

  resolutionLines.push(
    `## Tier 1 inventory (${tier1.length} symbols)`,
    '',
    'See `dead-code-tier1.json`. Majority are `graph_false_positive` closures inside factories (no top-level `export` keyword).',
    '',
  );

  writeFileSync(join(OUTPUT_DIR, 'tier2-resolutions.md'), `${resolutionLines.join('\n')}\n`);
  console.log(`Wrote ${OUTPUT_DIR}/tier2-resolutions.md`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
