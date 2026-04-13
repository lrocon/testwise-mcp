import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { loadConfig } from './config.js';
import { formatPingMessage } from './pingMessage.js';
import { fetchWorkItem } from './tools/fetchWorkItem.js';
import { listSprintItems } from './tools/listSprintItems.js';
import { readRepoContext } from './tools/readRepoContext.js';
import { searchRepoByKeyword } from './tools/searchRepoByKeyword.js';
import { buildUserPrompt } from './prompts/user.js';
import { exportToMarkdown } from './tools/exportToMarkdown.js';
import { postToWorkItem, createTestTasks } from './tools/postToWorkItem.js';

const config = loadConfig();

const server = new McpServer({
  name: 'testwise',
  version: '1.0.0',
});

// ─── ping ────────────────────────────────────────────────────────────────────

server.tool(
  'ping',
  'Verifica se o Testwise MCP está ativo e a configuração foi carregada corretamente',
  {},
  async () => ({
    content: [
      {
        type: 'text',
        text: formatPingMessage(config),
      },
    ],
  }),
);

// ─── item ─────────────────────────────────────────────────────────────────────

server.tool(
  'item',
  'Busca um work item no Azure DevOps pelo ID (PBI, Story, Bug, Melhoria)',
  { id: z.number().describe('ID do work item no Azure DevOps') },
  async ({ id }) => {
    try {
      const workItem = await fetchWorkItem(id, config);
      return { content: [{ type: 'text', text: JSON.stringify(workItem, null, 2) }] };
    } catch (err) {
      return {
        content: [{ type: 'text', text: `Erro: ${(err as Error).message}` }],
        isError: true,
      };
    }
  },
);

// ─── sprint ───────────────────────────────────────────────────────────────────

server.tool(
  'sprint',
  'Lista todos os work items do sprint atual ou de um sprint específico',
  {
    sprint: z
      .string()
      .optional()
      .describe('Nome do sprint (opcional — usa o sprint atual se omitido)'),
  },
  async ({ sprint }) => {
    try {
      const items = await listSprintItems(config, sprint);
      if (items.length === 0) {
        return { content: [{ type: 'text', text: 'Nenhum item encontrado no sprint.' }] };
      }
      const summary = items
        .map(i => `#${i.id} [${i.type}] ${i.title} — ${i.state} (${i.assignedTo})`)
        .join('\n');
      return {
        content: [{ type: 'text', text: `${items.length} item(s) encontrado(s):\n\n${summary}` }],
      };
    } catch (err) {
      return {
        content: [{ type: 'text', text: `Erro: ${(err as Error).message}` }],
        isError: true,
      };
    }
  },
);

// ─── repo ─────────────────────────────────────────────────────────────────────

server.tool(
  'repo',
  'Lê todos os arquivos de código suportados de um repositório Git no Azure (nome igual ao de dev.azure.com/.../_git/<nome>)',
  {
    repository: z
      .string()
      .describe('Nome do repositório no Azure DevOps (mesmo valor em testwise.config.json e na URL _git/...)'),
  },
  async ({ repository }) => {
    try {
      const contexts = await readRepoContext(repository, config);
      const totalFiles = contexts.reduce((acc, ctx) => acc + ctx.files.length, 0);
      const summary = contexts.map(ctx => `• ${ctx.name} — ${ctx.files.length} arquivo(s)`).join('\n');
      return {
        content: [
          {
            type: 'text',
            text: `Repositório "${repository}" — ${totalFiles} arquivo(s) carregado(s):\n${summary}\n\n${JSON.stringify(contexts, null, 2)}`,
          },
        ],
      };
    } catch (err) {
      return {
        content: [{ type: 'text', text: `Erro: ${(err as Error).message}` }],
        isError: true,
      };
    }
  },
);

// ─── search ───────────────────────────────────────────────────────────────────

server.tool(
  'search',
  'Busca por uma palavra-chave nos arquivos de todos os repositórios configurados',
  { keyword: z.string().describe('Palavra-chave a buscar nos repositórios') },
  async ({ keyword }) => {
    try {
      const matches = await searchRepoByKeyword(keyword, config);
      if (matches.length === 0) {
        return {
          content: [{ type: 'text', text: `Nenhum resultado encontrado para "${keyword}".` }],
        };
      }
      return { content: [{ type: 'text', text: JSON.stringify(matches, null, 2) }] };
    } catch (err) {
      return {
        content: [{ type: 'text', text: `Erro: ${(err as Error).message}` }],
        isError: true,
      };
    }
  },
);

// ─── gen ──────────────────────────────────────────────────────────────────────

server.tool(
  'gen',
  'Monta o prompt com work item + código do repositório para gerar casos de teste',
  {
    workItemId: z.number().describe('ID do work item no Azure DevOps'),
    repository: z
      .string()
      .optional()
      .describe(
        'Nome do repositório Git no Azure (opcional; mesmo nome em testwise.config.json e em .../_git/<nome>)',
      ),
  },
  async ({ workItemId, repository }) => {
    try {
      const workItem = await fetchWorkItem(workItemId, config);

      let repoContexts: Awaited<ReturnType<typeof readRepoContext>> = [];
      if (repository) {
        try {
          repoContexts = await readRepoContext(repository, config);
        } catch {
          // Continua sem contexto de código se o repositório não for encontrado
        }
      }

      return {
        content: [{ type: 'text', text: buildUserPrompt(workItem, repoContexts, config) }],
      };
    } catch (err) {
      return {
        content: [{ type: 'text', text: `Erro: ${(err as Error).message}` }],
        isError: true,
      };
    }
  },
);

// ─── save ─────────────────────────────────────────────────────────────────────

server.tool(
  'save',
  'Salva os casos de teste gerados como arquivo Markdown no disco',
  {
    workItemId: z.number().describe('ID do work item (usado no nome do arquivo)'),
    content: z.string().describe('Conteúdo dos casos de teste a exportar'),
    filename: z.string().optional().describe('Nome do arquivo de saída (opcional)'),
  },
  async ({ workItemId, content, filename }) => {
    try {
      const outputPath = exportToMarkdown(content, workItemId, filename);
      return {
        content: [{ type: 'text', text: `Arquivo exportado com sucesso: ${outputPath}` }],
      };
    } catch (err) {
      return {
        content: [{ type: 'text', text: `Erro: ${(err as Error).message}` }],
        isError: true,
      };
    }
  },
);

// ─── post ─────────────────────────────────────────────────────────────────────

server.tool(
  'post',
  'Posta os casos de teste no Azure DevOps: como comentário no work item (padrão) ou como Tasks filhas (uma por caso de teste)',
  {
    workItemId: z.number().describe('ID do work item no Azure DevOps'),
    content: z.string().describe('Conteúdo dos casos de teste a postar'),
    mode: z
      .enum(['comment', 'tasks'])
      .optional()
      .default('comment')
      .describe('"comment" posta tudo como um comentário (padrão); "tasks" cria uma Task filha para cada caso de teste'),
  },
  async ({ workItemId, content, mode }) => {
    try {
      if (mode === 'tasks') {
        const result = await createTestTasks(workItemId, content, config);
        const urlList = result.urls.map((u, i) => `${i + 1}. ${u}`).join('\n');
        return {
          content: [
            {
              type: 'text',
              text: `${result.created} Task(s) criada(s) como filhas do work item #${workItemId}:\n\n${urlList}`,
            },
          ],
        };
      }

      const url = await postToWorkItem(workItemId, content, config);
      return {
        content: [{ type: 'text', text: `Comentário postado com sucesso. URL: ${url}` }],
      };
    } catch (err) {
      return {
        content: [{ type: 'text', text: `Erro: ${(err as Error).message}` }],
        isError: true,
      };
    }
  },
);

// ─── Start ────────────────────────────────────────────────────────────────────

const transport = new StdioServerTransport();
await server.connect(transport);
