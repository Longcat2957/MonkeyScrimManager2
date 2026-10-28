import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { extname, join, relative } from 'node:path';

const projectRoot = fileURLToPath(new URL('../', import.meta.url));
const sourceRoot = join(projectRoot, 'apps/web/src');
const namesRequiringConstant = /\b(?:MonkeyScrimManager2?|MSM[12]|Monkeybot|Monketbot)\b/i;
const violations = [];

async function checkDirectory(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      await checkDirectory(path);
    } else if (['.svelte', '.html'].includes(extname(path))) {
      const lines = (await readFile(path, 'utf8')).split('\n');
      for (const [index, line] of lines.entries()) {
        const match = line.match(namesRequiringConstant);
        if (match) {
          violations.push(`${relative(projectRoot, path)}:${index + 1}: ${match[0]}`);
        }
      }
    }
  }
}

await checkDirectory(sourceRoot);

if (violations.length > 0) {
  console.error('UI 표시명 Monkeybot은 #lib/branding.ts의 SERVICE_NAME을 사용하세요.');
  console.error(violations.join('\n'));
  process.exitCode = 1;
} else {
  console.log('Branding check passed.');
}
