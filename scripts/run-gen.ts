/**
 * Uso: npx tsx --env-file=.env scripts/run-gen.ts <workItemId> [repositórioAzure...]
 * Ex.: npx tsx --env-file=.env scripts/run-gen.ts 1350 mfe-operational-manager
 */
import { loadConfig } from '../src/config.js';
import { fetchWorkItem } from '../src/tools/fetchWorkItem.js';
import { readRepoContext } from '../src/tools/readRepoContext.js';
import { buildUserPrompt } from '../src/prompts/user.js';
import type { RepoContext } from '../src/types.js';

const id = Number(process.argv[2]);
const repoArgs = process.argv.slice(3);

if (!Number.isFinite(id)) {
  console.error('Informe o ID numérico do work item.');
  process.exit(1);
}

const config = loadConfig();
const workItem = await fetchWorkItem(id, config);

let repoContexts: RepoContext[] = [];
for (const repoName of repoArgs) {
  try {
    const ctx = await readRepoContext(repoName, config);
    repoContexts = repoContexts.concat(ctx);
  } catch (err) {
    console.error(`[aviso] repositório "${repoName}": ${(err as Error).message}`);
  }
}

const prompt = buildUserPrompt(workItem, repoContexts, config);
console.log(prompt);
