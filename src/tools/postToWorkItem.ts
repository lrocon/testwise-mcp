import type { Config } from '../types.js';

function markdownToHtml(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\n(\d+)\.\s/g, '\n<li>')
    .replace(/\n-\s/g, '\n<li>')
    .replace(/\n/g, '<br />');
}

function parseTestCasesFromMarkdown(content: string, prefix: string): { title: string; body: string }[] {
  // Divide pelo separador --- ou por headings que começam com o prefix (ex: CT-01, CT-1)
  const headingPattern = new RegExp(`^#{1,3}\\s+${prefix}[\\s\\-]`, 'm');
  const separatorPattern = /^---$/m;

  let blocks: string[];

  if (headingPattern.test(content)) {
    // Divide por headings do tipo "## CT-01" ou "# CT 01"
    const splitRegex = new RegExp(`(?=^#{1,3}\\s+${prefix}[\\s\\-])`, 'm');
    blocks = content.split(splitRegex).filter(b => b.trim().length > 0);
  } else if (separatorPattern.test(content)) {
    blocks = content.split(/^---$/m).filter(b => b.trim().length > 0);
  } else {
    // Fallback: trata o conteúdo inteiro como um único caso
    blocks = [content];
  }

  return blocks.map(block => {
    const lines = block.trim().split('\n');
    // Extrai o título da primeira linha de heading
    const firstLine = lines[0].replace(/^#{1,3}\s+/, '').trim();
    const body = lines.slice(1).join('\n').trim();
    return { title: firstLine, body };
  });
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
<h2>Casos de Teste — Testwise MCP</h2>
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

export async function createTestTasks(
  parentWorkItemId: number,
  content: string,
  config: Config,
): Promise<{ created: number; urls: string[] }> {
  const { organization, project, pat } = config;
  const token = Buffer.from(`:${pat}`).toString('base64');
  const prefix = config.template?.prefix ?? 'CT';

  const testCases = parseTestCasesFromMarkdown(content, prefix);

  const parentUrl = `${organization.replace(/\/$/, '')}/_apis/wit/workitems/${parentWorkItemId}`;
  const urls: string[] = [];

  for (const testCase of testCases) {
    const description = markdownToHtml(testCase.body);
    const createUrl = `${organization}/${project}/_apis/wit/workitems/$Task?api-version=7.1`;

    const body = [
      { op: 'add', path: '/fields/System.Title', value: testCase.title },
      { op: 'add', path: '/fields/System.Description', value: `<div>${description}</div>` },
      {
        op: 'add',
        path: '/relations/-',
        value: {
          rel: 'System.LinkTypes.Hierarchy-Reverse',
          url: parentUrl,
          attributes: { comment: 'Gerado pelo Testwise MCP' },
        },
      },
    ];

    const response = await fetch(createUrl, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${token}`,
        'Content-Type': 'application/json-patch+json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Falha ao criar Task para "${testCase.title}": ${response.status} ${response.statusText} — ${errorText}`,
      );
    }

    const data = (await response.json()) as { id: number };
    urls.push(`${organization}/${project}/_workitems/edit/${data.id}`);
  }

  return { created: testCases.length, urls };
}
