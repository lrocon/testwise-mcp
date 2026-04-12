import { extname } from 'path';
import type { Config } from '../types.js';

export interface KeywordMatch {
  repo: string;
  path: string;
  lineNumber: number;
  context: string;
}

const SUPPORTED_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.json', '.css']);
const MAX_FILE_SIZE_BYTES = 100 * 1024;
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
    throw new Error(`Repositório '${repoName}' não encontrado: ${response.status} ${response.statusText}`);
  }
  const data = (await response.json()) as { id: string };
  return data.id;
}

async function listAllFiles(repoId: string, config: Config): Promise<AzureItem[]> {
  const { organization, project, pat } = config;
  const url = `${organization}/${project}/_apis/git/repositories/${repoId}/items?recursionLevel=Full&api-version=7.1`;
  const response = await fetch(url, {
    headers: { Authorization: basicAuth(pat), Accept: 'application/json' },
  });
  if (!response.ok) return [];
  const data = (await response.json()) as { value: AzureItem[] };
  return data.value ?? [];
}

async function fetchFileContent(repoId: string, filePath: string, config: Config): Promise<string> {
  const { organization, project, pat } = config;
  const url = `${organization}/${project}/_apis/git/repositories/${repoId}/items?path=${encodeURIComponent(filePath)}&api-version=7.1`;
  const response = await fetch(url, {
    headers: { Authorization: basicAuth(pat), Accept: 'text/plain' },
  });
  if (!response.ok) return '';
  return response.text();
}

function findMatches(
  content: string,
  keyword: string,
  filePath: string,
  repoName: string,
): KeywordMatch[] {
  const lines = content.split('\n');
  const lower = keyword.toLowerCase();
  const matches: KeywordMatch[] = [];

  lines.forEach((line, index) => {
    if (line.toLowerCase().includes(lower)) {
      const start = Math.max(0, index - 2);
      const end = Math.min(lines.length - 1, index + 2);
      const context = lines
        .slice(start, end + 1)
        .map((l, i) => `${start + i + 1}: ${l}`)
        .join('\n');
      matches.push({ repo: repoName, path: filePath, lineNumber: index + 1, context });
    }
  });

  return matches;
}

export async function searchRepoByKeyword(
  keyword: string,
  config: Config,
): Promise<KeywordMatch[]> {
  const allMatches: KeywordMatch[] = [];

  for (const repo of config.repositories) {
    const repoId = await getRepoId(repo.name, config);
    const items = await listAllFiles(repoId, config);

    const filePaths = items
      .filter(item => item.gitObjectType === 'blob')
      .filter(item => SUPPORTED_EXTENSIONS.has(extname(item.path).toLowerCase()))
      .filter(item => !item.size || item.size <= MAX_FILE_SIZE_BYTES)
      .map(item => item.path);

    for (let i = 0; i < filePaths.length; i += CONCURRENCY) {
      const batch = filePaths.slice(i, i + CONCURRENCY);
      const contents = await Promise.all(
        batch.map(p => fetchFileContent(repoId, p, config)),
      );
      batch.forEach((filePath, idx) => {
        allMatches.push(...findMatches(contents[idx], keyword, filePath, repo.name));
      });
    }
  }

  return allMatches;
}
