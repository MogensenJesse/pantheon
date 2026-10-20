// scripts/lib/register-ts.mjs — registers tsResolve.mjs (see there)
import { register } from 'node:module';

register('./tsResolve.mjs', import.meta.url);
