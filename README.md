# Testwise MCP

Servidor [MCP](https://modelcontextprotocol.io/) que transforma work items do Azure DevOps em casos de teste de QA — cruzando critérios de aceite com o código real do repositório.

---

## Por que isso existe

Criar casos de teste a partir de um PBI mal escrito é o trabalho cotidiano de qualquer QA. O problema não é falta de ferramenta — é falta de contexto.

Um CT gerado só com o que está escrito no PBI tende a ser genérico. Um CT gerado olhando para o código do que foi implementado tende a validar o que foi feito, não o que deveria ter sido feito. Os dois extremos têm falhas.

O Testwise parte de uma premissa diferente:

> **O critério de aceite define o que deve funcionar. O código revela como foi implementado (caso você queira). CTs bons precisam dos dois — mas com hierarquia clara entre eles.**

Na prática isso significa:

- O **resultado esperado** de qualquer CT sempre vem do AC ou da regra de negócio, nunca do comportamento atual do código
- O **código do repositório** serve para nomear campos corretamente, identificar chamadas de API, descobrir estados de UI e — principalmente — apontar onde a implementação **diverge** do AC (isso é um bug a sinalizar, não um cenário válido)
- Quando o código contradiz o AC, o Testwise para e avisa em vez de silenciosamente aceitar o que foi implementado como correto

---

## A crítica que esse projeto responde

> *"Se você usa o código para criar os CTs, o que garante que um bug não vira um cenário válido?"*

É uma crítica legítima e ela aponta exatamente para o risco de usar código como **fonte da verdade**. O Testwise foi desenhado para evitar isso: o código é usado como **lupa**, não como **lei**.

A identidade da IA (`src/prompts/system.ts`) deixa essa hierarquia explícita e obrigatória. Você pode e deve customizá-la para o contexto do seu time.

---

## Como funciona

```
Work Item (AC + descrição)
        +
Código do repositório (campos, APIs, estados de UI)
        ↓
    Testwise MCP
        ↓
Casos de teste ancorados no AC, com precisão técnica do código
```

1. Você informa o ID do work item e, opcionalmente, o repositório Git
2. O Testwise busca o work item e lê o código no Azure Repos
3. Monta o prompt com hierarquia clara: AC primeiro, código como contexto
4. A IA gera os CTs — você revisa, ajusta e decide se posta no Azure DevOps

O fluxo intencional é: **gerar → revisar → postar**. O Testwise nunca posta sem solicitação explícita.

---

## Pré-requisitos

- Node.js 18+
- Conta no Azure DevOps com acesso ao projeto
- Cliente MCP: [Claude Code](https://claude.ai/code), Claude Desktop, Cursor, ou qualquer cliente compatível com MCP

---

## Instalação

```bash
git clone https://github.com/lrocon/testwise-mcp.git
cd testwise-mcp
npm install
```

Crie um `.env` na raiz (use `.env.example` como base):

```env
AZURE_PAT=seu_token
AZURE_ORG=https://dev.azure.com/sua-organizacao
AZURE_PROJECT=Nome-Do-Projeto
```

Gere o PAT em: **User Settings → Personal Access Tokens → New Token**
Escopos necessários: `Work Items (Read)` + `Code (Read)`

---

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
    "description": "Descrição da sua aplicação",
    "stack": ["React", "TypeScript"],
    "apiResponses": ["200", "201", "204", "400", "500"]
  },

  "options": {
    "autoPostToAzure": false
  }
}
```

`repositories[].name` deve ser o nome exato do repo no Azure (igual ao segmento após `/_git/` na URL).

---

## Registrar no cliente MCP

### Claude Code (escopo de projeto)

```bash
claude mcp add --transport stdio --scope project testwise -- npx tsx /caminho/absoluto/testwise-mcp/src/index.ts
```

Ou edite o `.mcp.json` do projeto manualmente:

```json
{
  "mcpServers": {
    "testwise": {
      "type": "stdio",
      "command": "npx",
      "args": ["tsx", "src/index.ts"],
      "cwd": "/caminho/absoluto/testwise-mcp"
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
      "args": ["tsx", "/caminho/absoluto/testwise-mcp/src/index.ts"],
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

---

## Tools disponíveis

| Tool | O que faz |
|------|-----------|
| `ping` | Confirma que o servidor está ativo e a config foi carregada |
| `item` | Busca um work item por ID (PBI, Bug, Story) |
| `sprint` | Lista os work items do sprint atual ou de um sprint específico |
| `repo` | Lê todos os arquivos de código de um repositório no Azure Repos |
| `search` | Busca uma palavra-chave nos repositórios configurados |
| `gen` | Monta o prompt completo (work item + código + metodologia) para geração de CTs |
| `save` | Exporta os CTs gerados como arquivo Markdown local |
| `post` | Posta os CTs no Azure DevOps como comentário ou Tasks filhas — **somente quando solicitado** |

---

## Uso básico

```
Analise o PBI 1234 junto do repositório meu-repo e crie casos de teste para o caminho feliz.
```

```
Agora poste os casos de teste no work item como comentário.
```

Formato gerado:

```markdown
## CT-01 — Título do caso de teste

**Pré-condição:** …

**Passos:**
1. …
2. …

**Resultado esperado:** …

**Tipo:** Positivo | Negativo | Edge Case | Regressão
```

---

## Customizando a metodologia

O comportamento da IA está em `src/prompts/system.ts`. É lá que vivem as regras sobre hierarquia de fontes, quando postar e como sinalizar divergências entre AC e código.

Se o seu time tem convenções próprias de QA — formato de CT diferente, critérios de priorização, nomenclatura específica — edite esse arquivo. Ele foi feito para ser customizado.

---

## Scripts

```bash
# Verificar configuração
npm run ping

# Gerar prompt via terminal (sem cliente MCP)
npx tsx --env-file=.env scripts/run-gen.ts <workItemId> [nomeDoRepo]
```

---

## Licença

MIT
