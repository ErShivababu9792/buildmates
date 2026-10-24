/**
 * Writes the app's English text to ai-api/i18n_en.json.
 * The server translates ONLY this file into other languages (so nobody can inject text into the app).
 * Runs automatically before `npm run dev` and `npm run build`.
 */
import { writeFileSync } from 'node:fs';
import { STRINGS } from '../src/i18n/strings.js';
import { INTERESTS, SKILLS } from '../src/lib/constants.js';

const table = { ...STRINGS.en };
[...SKILLS, ...INTERESTS].forEach((s) => { table[`list.${s}`] = s; });
writeFileSync(new URL('../ai-api/i18n_en.json', import.meta.url), `${JSON.stringify(table, null, 1)}\n`);
console.log(`i18n: exported ${Object.keys(table).length} English strings → ai-api/i18n_en.json`);
