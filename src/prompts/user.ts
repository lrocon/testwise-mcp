import type { WorkItem, RepoContext } from '../types.js';

export function buildUserPrompt(workItem: WorkItem, repoContexts: RepoContext[]): string {
  const codeContext =
    repoContexts.length > 0
      ? repoContexts
          .map(ctx => {
            const files = ctx.files
              .map(f => `### ${f.path}\n\`\`\`tsx\n${f.content}\n\`\`\``)
              .join('\n\n');
            return `## Módulo: ${ctx.module} (${ctx.name})\n\n${files}`;
          })
          .join('\n\n---\n\n')
      : '_Nenhum contexto de código fornecido. Gere os casos de teste com base apenas nos critérios de aceite._';

  return `# Work Item #${workItem.id} — ${workItem.title}

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

## Contexto do Código

${codeContext}`;
}
