// scripts/lib/tsResolve.mjs — module hook: lets node (--experimental-strip-types) import the game's extensionless
// relative TypeScript imports ('./cloudConfig' -> './cloudConfig.ts'), so pure rendering code can run in scripts.
// Use it with `--import ./scripts/lib/register-ts.mjs`.
import { existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

export async function resolve(specifier, context, next) {
  const relative = specifier.startsWith('./') || specifier.startsWith('../');
  if (relative && !/\.[a-z]+$/.test(specifier) && context.parentURL) {
    const base = fileURLToPath(new URL(specifier, context.parentURL));
    for (const candidate of [`${base}.ts`, `${base}/index.ts`]) {
      if (existsSync(candidate)) return next(pathToFileURL(candidate).href, context);
    }
  }
  return next(specifier, context);
}
