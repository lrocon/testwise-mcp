import type { Config, WorkItem } from '../types.js';

function sanitizeHtml(html: string): string {
  if (!html) return '';
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<li>/gi, '• ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export async function fetchWorkItem(id: number, config: Config): Promise<WorkItem> {
  const { organization, project, pat } = config;
  const token = Buffer.from(`:${pat}`).toString('base64');
  const url = `${organization}/${project}/_apis/wit/workitems/${id}?api-version=7.1&$expand=all`;

  const response = await fetch(url, {
    headers: {
      Authorization: `Basic ${token}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Falha ao buscar work item #${id}: ${response.status} ${response.statusText} — ${errorText}`,
    );
  }

  const data = (await response.json()) as Record<string, unknown>;
  const fields = data['fields'] as Record<string, unknown>;

  const iterationPath = (fields['System.IterationPath'] as string) ?? '';
  const sprint = iterationPath.split('\\').pop() ?? iterationPath;

  const assignedTo = fields['System.AssignedTo'] as Record<string, string> | undefined;

  return {
    id: data['id'] as number,
    type: (fields['System.WorkItemType'] as string) ?? '',
    title: (fields['System.Title'] as string) ?? '',
    description: sanitizeHtml((fields['System.Description'] as string) ?? ''),
    acceptanceCriteria: sanitizeHtml(
      (fields['Microsoft.VSTS.Common.AcceptanceCriteria'] as string) ?? '',
    ),
    state: (fields['System.State'] as string) ?? '',
    sprint,
    assignedTo: assignedTo?.displayName ?? 'Não atribuído',
    priority: (fields['Microsoft.VSTS.Common.Priority'] as number) ?? 0,
    tags: ((fields['System.Tags'] as string) ?? '')
      .split(';')
      .map((t: string) => t.trim())
      .filter((t: string) => t.length > 0),
    url: `${organization}/${project}/_workitems/edit/${data['id'] as number}`,
  };
}
