import type { Config } from '../types.js';

function markdownToHtml(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\n(\d+)\.\s/g, '\n<li>')
    .replace(/\n-\s/g, '\n<li>')
    .replace(/\n/g, '<br />');
}

export async function postToWorkItem(
  workItemId: number,
  content: string,
  config: Config,
): Promise<string> {
  const { organization, project, pat } = config;
  const token = Buffer.from(`:${pat}`).toString('base64');
  const url = `${organization}/${project}/_apis/wit/workitems/${workItemId}/comments?api-version=7.1-preview.3`;

  const htmlContent = `<div>
<h2>Casos de Teste — Spectr MCP</h2>
<p><em>Gerado em: ${new Date().toLocaleString('pt-BR')}</em></p>
<hr />
${markdownToHtml(content)}
</div>`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ text: htmlContent }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Falha ao postar comentário no work item #${workItemId}: ${response.status} ${response.statusText} — ${errorText}`,
    );
  }

  return `${organization}/${project}/_workitems/edit/${workItemId}`;
}
