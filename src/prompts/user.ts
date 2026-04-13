import type { Config, WorkItem, RepoContext } from '../types.js';
import { SYSTEM_IDENTITY } from './system.js';

/** URL web do repositório: https://dev.azure.com/{org}/{project}/_git/{repo} */
function repoGitWebUrl(config: Config, repoName: string): string {
  const base = config.organization.replace(/\/$/, '');
  return `${base}/${encodeURIComponent(config.project)}/_git/${encodeURIComponent(repoName)}`;
}

function buildAnalyzedReposSection(repoContexts: RepoContext[], config: Config): string {
  const analyzed =
    repoContexts.length > 0
      ? repoContexts
          .map(
            ctx =>
              `- **${ctx.name}** — ${ctx.files.length} arquivo(s) analisado(s) — ${repoGitWebUrl(config, ctx.name)}`,
          )
          .join('\n')
      : '_Nenhum repositório teve código carregado neste prompt._';

  const configured = config.repositories
    .map(r => `| \`${r.name}\` | ${repoGitWebUrl(config, r.name)} |`)
    .join('\n');

  const headerAnalyzed =
    repoContexts.length > 0
      ? 'Os repositórios abaixo foram lidos via Azure Repos API (árvore completa, extensões de código suportadas) e servem de contexto para os casos de teste.'
      : 'Nenhum repositório foi informado (tools `gen`/`repo`) ou o carregamento falhou; use o **nome do repositório Git no Azure** como em `dev.azure.com/(organização)/(projeto)/_git/(nomeDoRepositório)`. A tabela lista o que está em `testwise.config.json`.';

  return `## Repositórios Azure DevOps

${headerAnalyzed}

### Analisados neste prompt (código)

${analyzed}

### Configurados em testwise.config.json

| Repositório (nome no Azure) | URL \`_git/...\` |
|-----------------------------|------------------|
${configured}
`;
}

export function buildUserPrompt(workItem: WorkItem, repoContexts: RepoContext[], config: Config): string {
  const codeContext =
    repoContexts.length > 0
      ? repoContexts
          .map(ctx => {
            const files = ctx.files
              .map(f => `### ${f.path}\n\`\`\`tsx\n${f.content}\n\`\`\``)
              .join('\n\n');
            return `## Repositório: \`${ctx.name}\` (${repoGitWebUrl(config, ctx.name)})\n\n${files}`;
          })
          .join('\n\n---\n\n')
      : '_Nenhum contexto de código fornecido. Gere os casos de teste com base apenas nos critérios de aceite._';

  const reposSection = buildAnalyzedReposSection(repoContexts, config);

  return `${SYSTEM_IDENTITY}

---

# Work Item #${workItem.id} — ${workItem.title}

**Tipo:** ${workItem.type}
**Estado:** ${workItem.state}
**Sprint:** ${workItem.sprint}
**Prioridade:** ${workItem.priority}
**Responsável:** ${workItem.assignedTo}
**Tags:** ${workItem.tags.join(', ') || 'Nenhuma'}
**URL:** ${workItem.url}

## Descrição

${workItem.description || '_Sem descrição._'}

## Critérios de Aceite

${workItem.acceptanceCriteria || '_Sem critérios de aceite definidos._'}

---

${reposSection}

---

## Contexto do Código

${codeContext}`;
}
