import type { Config, WorkItem } from '../types.js';
import { fetchWorkItem } from './fetchWorkItem.js';

interface WiqlResult {
  workItems: Array<{ id: number; url: string }>;
}

export async function listSprintItems(config: Config, sprint?: string): Promise<WorkItem[]> {
  const { organization, project, pat } = config;
  const token = Buffer.from(`:${pat}`).toString('base64');

  const iterationClause = sprint
    ? `[System.IterationPath] UNDER '${project}\\${sprint}'`
    : `[System.IterationPath] = @CurrentIteration('[${project}]\\${project} Team')`;

  const query = `SELECT [System.Id] FROM WorkItems WHERE ${iterationClause} AND [System.TeamProject] = '${project}' ORDER BY [System.Id]`;

  const wiqlUrl = `${organization}/${project}/_apis/wit/wiql?api-version=7.1`;

  const response = await fetch(wiqlUrl, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Falha ao listar itens do sprint: ${response.status} ${response.statusText} — ${errorText}`,
    );
  }

  const data = (await response.json()) as WiqlResult;
  const ids = data.workItems.map(item => item.id);

  if (ids.length === 0) return [];

  const items = await Promise.all(ids.map(id => fetchWorkItem(id, config)));
  return items;
}
