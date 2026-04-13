import type { Config } from './types.js';

export function formatPingMessage(config: Config): string {
  return `Testwise MCP ativo ✓\nOrganização: ${config.organization}\nProjeto: ${config.project}\nRepositórios configurados: ${config.repositories.length}`;
}
