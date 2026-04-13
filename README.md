# Testwise MCP

Servidor [MCP](https://modelcontextprotocol.io/) que automatiza a criação de casos de teste de QA a partir de work items do Azure DevOps.

## Como funciona

1. Informe o ID do work item (e opcionalmente o nome do repositório Git).
2. O Testwise busca o item e lê o código no Azure Repos.
3. Monta o prompt e a IA gera os casos de teste no padrão configurado.

## Pré-requisitos

- Node.js 18+
- Conta no Azure DevOps com acesso ao projeto
- Cliente MCP (Cursor, Claude Desktop, Claude Code, etc.)

## Instalação

```bash
git clone https://github.com/lrocon/testwise-mcp.git
cd testwise-mcp
npm install
```

Crie um `.env` na raiz:

```env
AZURE_PAT=seu_token
AZURE_ORG=https://dev.azure.com/sua-organizacao
AZURE_PROJECT=Nome-Do-Projeto
```

Gere o PAT em: **User Settings → Personal Access Tokens → New Token** (escopos: Work Items Read + Code Read).

## Configuração (`testwise.config.json`)

```json
{
  "organization": "${AZURE_ORG}",
  "project": "${AZURE_PROJECT}",
  "pat": "${AZURE_PAT}",
  "repositories": [
    { "name": "nome-do-repo-azure" }
  ],
  "template": {
    "language": "pt-BR",
    "prefix": "CT",
    "fields": ["precondition", "steps", "expectedResult", "type"]
  },
  "platformContext": {
    "description": "Descrição da aplicação",
    "stack": ["React", "TypeScript"],
    "apiResponses": ["200", "201", "204", "400", "500"]
  },
  "options": {
    "autoPostToAzure": false
  }
}
```

O campo `repositories[].name` deve ser o nome exato do repo no Azure (igual à URL `/_git/(nome)`).

## Adicionar o MCP ao cliente

### Claude Code (por projeto)

```bash
claude mcp add --transport stdio --scope project testwise -- npx tsx C:/caminho/absoluto/testwise-mcp/src/index.ts
```

O caminho absoluto por exemplo pode ser `C:/*pasta*/*projeto*/testwise-mcp/src/index.ts`.

Ou edite manualmente o `.mcp.json` do projeto com `cwd`:

```json
{
  "mcpServers": {
    "testwise": {
      "type": "stdio",
      "command": "npx",
      "args": ["tsx", "src/index.ts"],
      "cwd": "C:/*pasta*/*projeto*/testwise-mcp/",
      "env": {}
    }
  }
}
```

### Claude Desktop

- **Windows:** `%APPDATA%\Claude\claude_desktop_config.json`
- **macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "testwise": {
      "command": "npx",
      "args": ["tsx", "C:\\caminho\\absoluto\\testwise-mcp\\src\\index.ts"],
      "env": {
        "AZURE_PAT": "seu_token",
        "AZURE_ORG": "https://dev.azure.com/sua-organizacao",
        "AZURE_PROJECT": "Nome-Do-Projeto"
      }
    }
  }
}
```

Reinicie o cliente após salvar.

## Tools disponíveis

| Tool | Descrição |
|------|-----------|
| `ping` | Confirma servidor ativo e config carregada |
| `item` | Busca work item por ID |
| `sprint` | Lista itens do sprint atual |
| `repo` | Lê o repositório informado |
| `search` | Busca palavra-chave nos repositórios |
| `gen` | Gera prompt com `workItemId` e `repository` |
| `save` | Exporta CTs para arquivo Markdown |
| `post` | Comenta CTs no work item |

## Uso

```text
Use gen com workItemId 1234 e repository nome-do-repo para gerar casos de teste em pt-BR.
```

Formato gerado:

```markdown
---
**CT-01 — Título**
- **Pré-condição:** …
- **Passos:** …
- **Resultado esperado:** …
- **Tipo:** Positivo | Negativo | Edge Case | Regressão
---
```

## Scripts

```bash
npm run ping
npx tsx --env-file=.env scripts/run-gen.ts <id> [repo...]
```
