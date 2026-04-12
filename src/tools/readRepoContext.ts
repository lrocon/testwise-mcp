import { extname } from 'path';
import type { Config, RepoContext, RepoFile } from '../types.js';

const SUPPORTED_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.css']);
const MAX_FILE_SIZE_BYTES = 100 * 1024; // 100KB por arquivo
const CONCURRENCY = 5;

interface AzureItem {
  path: string;
  gitObjectType: 'blob' | 'tree';
  size?: number;
}

function basicAuth(pat: string): string {
  return `Basic ${Buffer.from(`:${pat}`).toString('base64')}`;
}

async function getRepoId(repoName: string, config: Config): Promise<string> {
  const { organization, project, pat } = config;
  const url = `${organization}/${project}/_apis/git/repositories/${encodeURIComponent(repoName)}?api-version=7.1`;
  const response = await fetch(url, {
    headers: { Authorization: basicAuth(pat), Accept: 'application/json' },
  });
  if (!response.ok) {
    throw new Error(
      `Repositório '${repoName}' não encontrado no Azure DevOps: ${response.status} ${response.statusText}`,
    );
  }
  const data = (await response.json()) as { id: string };
  return data.id;
}

async function listFilesInPath(
  repoId: string,
  scopePath: string,
  config: Config,
): Promise<AzureItem[]> {
  const { organization, project, pat } = config;
  const normalizedPath = scopePath.startsWith('/') ? scopePath : `/${scopePath}`;
  const url = `${organization}/${project}/_apis/git/repositories/${repoId}/items?scopePath=${encodeURIComponent(normalizedPath)}&recursionLevel=Full&api-version=7.1`;
  const response = await fetch(url, {
    headers: { Authorization: basicAuth(pat), Accept: 'application/json' },
  });
  if (!response.ok) return []; // entry point pode não existir neste repo
  const data = (await response.json()) as { value: AzureItem[] };
  return data.value ?? [];
}

async function fetchFileContent(
  repoId: string,
  filePath: string,
  config: Config,
): Promise<string> {
  const { organization, project, pat } = config;
  const url = `${organization}/${project}/_apis/git/repositories/${repoId}/items?path=${encodeURIComponent(filePath)}&api-version=7.1`;
  const response = await fetch(url, {
    headers: { Authorization: basicAuth(pat), Accept: 'text/plain' },
  });
  if (!response.ok) return '';
  return response.text();
}

async function fetchBatch(
  repoId: string,
  filePaths: string[],
  config: Config,
): Promise<RepoFile[]> {
  const results: RepoFile[] = [];
  for (let i = 0; i < filePaths.length; i += CONCURRENCY) {
    const batch = filePaths.slice(i, i + CONCURRENCY);
    const contents = await Promise.all(
      batch.map(async path => ({ path, content: await fetchFileContent(repoId, path, config) })),
    );
    results.push(...contents.filter(f => f.content.length > 0));
  }
  return results;
}

export async function readRepoContext(moduleName: string, config: Config): Promise<RepoContext[]> {
  const matchingRepos = config.repositories.filter(
    repo => repo.module.toLowerCase() === moduleName.toLowerCase(),
  );

  if (matchingRepos.length === 0) {
    const available = config.repositories.map(r => r.module).join(', ');
    throw new Error(
      `Módulo '${moduleName}' não encontrado na configuração. Módulos disponíveis: ${available}`,
    );
  }

  const results: RepoContext[] = [];

  for (const repo of matchingRepos) {
    const repoId = await getRepoId(repo.name, config);
    const allFiles: RepoFile[] = [];

    for (const entryPoint of repo.entryPoints) {
      const items = await listFilesInPath(repoId, entryPoint, config);
      const filePaths = items
        .filter(item => item.gitObjectType === 'blob')
        .filter(item => SUPPORTED_EXTENSIONS.has(extname(item.path).toLowerCase()))
        .filter(item => !item.size || item.size <= MAX_FILE_SIZE_BYTES)
        .map(item => item.path);

      const files = await fetchBatch(repoId, filePaths, config);
      allFiles.push(...files);
    }

    results.push({ name: repo.name, module: repo.module, files: allFiles });
  }

  return results;
}
