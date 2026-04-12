import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { loadConfig } from './config.js';
import { fetchWorkItem } from './tools/fetchWorkItem.js';
import { listSprintItems } from './tools/listSprintItems.js';
import { readRepoContext } from './tools/readRepoContext.js';
import { searchRepoByKeyword } from './tools/searchRepoByKeyword.js';
import { buildUserPrompt } from './prompts/user.js';
import { exportToMarkdown } from './tools/exportToMarkdown.js';
import { postToWorkItem } from './tools/postToWorkItem.js';

const config = loadConfig();

const server = new McpServer({
  name: 'testwise',
  version: '1.0.0',
});

// ─── ping ────────────────────────────────────────────────────────────────────

server.tool(
  'ping',
  'Verifica se o Spectr MCP está ativo e a configuração foi carregada corretamente',
  {},
  async () => ({
    content: [
      {
        type: 'text',
        text: `Spectr MCP ativo ✓\nOrganização: ${config.organization}\nProjeto: ${config.project}\nRepositórios configurados: ${config.repositories.length}`,
      },
    ],
  }),
);

// ─── fetch_work_item ──────────────────────────────────────────────────────────

server.tool(
  'fetch_work_item',
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

// ─── list_sprint_items ────────────────────────────────────────────────────────

server.tool(
  'list_sprint_items',
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

// ─── read_repo_context ────────────────────────────────────────────────────────

server.tool(
  'read_repo_context',
  'Lê os arquivos dos repositórios configurados para um módulo específico',
  { module: z.string().describe('Nome do módulo conforme definido em testwise.config.json') },
  async ({ module }) => {
    try {
      const contexts = await readRepoContext(module, config);
      const totalFiles = contexts.reduce((acc, ctx) => acc + ctx.files.length, 0);
      const summary = contexts.map(ctx => `• ${ctx.name} — ${ctx.files.length} arquivo(s)`).join('\n');
      return {
        content: [
          {
            type: 'text',
            text: `Módulo "${module}" — ${totalFiles} arquivo(s) carregado(s):\n${summary}\n\n${JSON.stringify(contexts, null, 2)}`,
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

// ─── search_repo_by_keyword ───────────────────────────────────────────────────

server.tool(
  'search_repo_by_keyword',
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

// ─── generate_test_cases ──────────────────────────────────────────────────────

server.tool(
  'generate_test_cases',
  'Busca o work item e o contexto de código do repositório para que você gere os casos de teste',
  {
    workItemId: z.number().describe('ID do work item no Azure DevOps'),
    module: z
      .string()
      .optional()
      .describe('Nome do módulo conforme definido em testwise.config.json (opcional)'),
  },
  async ({ workItemId, module }) => {
    try {
      const workItem = await fetchWorkItem(workItemId, config);

      let repoContexts: Awaited<ReturnType<typeof readRepoContext>> = [];
      if (module) {
        try {
          repoContexts = await readRepoContext(module, config);
        } catch {
          // Continua sem contexto de código se o módulo não for encontrado
        }
      }

      return {
        content: [{ type: 'text', text: buildUserPrompt(workItem, repoContexts) }],
      };
    } catch (err) {
      return {
        content: [{ type: 'text', text: `Erro: ${(err as Error).message}` }],
        isError: true,
      };
    }
  },
);

// ─── export_to_markdown ───────────────────────────────────────────────────────

server.tool(
  'export_to_markdown',
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

// ─── post_to_work_item ────────────────────────────────────────────────────────

server.tool(
  'post_to_work_item',
  'Posta os casos de teste como comentário no work item do Azure DevOps',
  {
    workItemId: z.number().describe('ID do work item no Azure DevOps'),
    content: z.string().describe('Conteúdo dos casos de teste a postar como comentário'),
  },
  async ({ workItemId, content }) => {
    try {
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
