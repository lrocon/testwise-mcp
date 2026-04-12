export interface WorkItem {
  id: number;
  type: string;
  title: string;
  description: string;
  acceptanceCriteria: string;
  state: string;
  sprint: string;
  assignedTo: string;
  priority: number;
  tags: string[];
  url: string;
}

export interface RepoFile {
  path: string;
  content: string;
}

export interface RepoContext {
  name: string;
  module: string;
  files: RepoFile[];
}

export interface ParsedTestCase {
  number: number;
  title: string;
  precondition: string;
  steps: string[];
  expectedResult: string;
  type: 'Positivo' | 'Negativo' | 'Edge Case' | 'Regressão';
  raw: string;
}

export interface RepositoryConfig {
  name: string;
  module: string;
  entryPoints: string[];
}

export interface Config {
  organization: string;
  project: string;
  pat: string;
  repositories: RepositoryConfig[];
  template: {
    language: string;
    prefix: string;
    fields: string[];
  };
  platformContext: {
    description: string;
    stack: string[];
    apiResponses: string[];
  };
  options: {
    autoPostToAzure: boolean;
    saveHistory: boolean;
  };
}
