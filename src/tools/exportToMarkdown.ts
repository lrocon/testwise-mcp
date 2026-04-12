import { writeFileSync } from 'fs';
import { resolve } from 'path';

export function exportToMarkdown(
  content: string,
  workItemId: number,
  filename?: string,
): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const outputFilename = filename ?? `CT-WI${workItemId}-${timestamp}.md`;
  const outputPath = resolve(process.cwd(), outputFilename);

  writeFileSync(outputPath, content, 'utf-8');
  return outputPath;
}
