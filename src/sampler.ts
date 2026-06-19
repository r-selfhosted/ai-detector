import { readFile, stat } from 'node:fs/promises';
import { basename, extname, join } from 'node:path';
import { AppConfig } from './config.js';
import { ReviewServiceError } from './errors.js';
import { runCommand } from './process.js';
import { SampledFile } from './types.js';

const IGNORED_DIRS = new Set([
  '.git',
  'node_modules',
  'vendor',
  'dist',
  'build',
  'out',
  'coverage',
  '.next',
  '.nuxt',
  '.cache',
  'target',
  '__pycache__'
]);

const IGNORED_BASENAMES = new Set([
  'package-lock.json',
  'pnpm-lock.yaml',
  'yarn.lock',
  'composer.lock',
  'Cargo.lock',
  'Gemfile.lock',
  'poetry.lock'
]);

const LANGUAGE_BY_EXT: Record<string, string> = {
  '.js': 'JavaScript',
  '.jsx': 'JavaScript',
  '.ts': 'TypeScript',
  '.tsx': 'TypeScript',
  '.mjs': 'JavaScript',
  '.cjs': 'JavaScript',
  '.py': 'Python',
  '.go': 'Go',
  '.rs': 'Rust',
  '.php': 'PHP',
  '.rb': 'Ruby',
  '.java': 'Java',
  '.kt': 'Kotlin',
  '.swift': 'Swift',
  '.cs': 'C#',
  '.cpp': 'C++',
  '.c': 'C',
  '.h': 'C/C++ Header',
  '.css': 'CSS',
  '.scss': 'SCSS',
  '.html': 'HTML',
  '.vue': 'Vue',
  '.svelte': 'Svelte',
  '.md': 'Markdown',
  '.json': 'JSON',
  '.yaml': 'YAML',
  '.yml': 'YAML',
  '.toml': 'TOML'
};

const ENTRYPOINT_RE = /(^|\/)(index|main|app|server|api|routes?|handlers?|cli)\.[^.]+$/i;
const MANIFEST_RE = /(^|\/)(package\.json|composer\.json|pyproject\.toml|Cargo\.toml|go\.mod|Dockerfile|docker-compose\.ya?ml|README[^/]*)$/i;

export async function sampleRepository(repoPath: string, config: AppConfig): Promise<SampledFile[]> {
  const result = await runCommand('git', ['ls-files', '-z'], { cwd: repoPath });
  const trackedFiles = result.stdout.split('\0').filter(Boolean);
  const candidates: Array<Omit<SampledFile, 'content' | 'truncated'>> = [];
  let scanned = 0;

  for (const path of trackedFiles) {
    if (scanned >= config.MAX_FILES_SCANNED) {
      break;
    }
    scanned += 1;

    if (shouldIgnorePath(path)) {
      continue;
    }

    const language = detectLanguage(path);
    if (!language) {
      continue;
    }

    const absolutePath = join(repoPath, path);
    const fileStat = await stat(absolutePath);
    if (fileStat.size > config.MAX_FILE_BYTES) {
      continue;
    }

    const buffer = await readFile(absolutePath);
    if (isLikelyBinary(buffer)) {
      continue;
    }

    candidates.push({
      path,
      language,
      bytes: fileStat.size,
      priority: scorePath(path)
    });
  }

  const sampled: SampledFile[] = [];
  let totalChars = 0;
  const prioritized = candidates.sort((a, b) => b.priority - a.priority || a.path.localeCompare(b.path));

  for (const candidate of prioritized) {
    if (sampled.length >= config.MAX_FILES_SAMPLED || totalChars >= config.MAX_SAMPLE_CHARS) {
      break;
    }

    const raw = (await readFile(join(repoPath, candidate.path))).toString('utf8');
    const remainingChars = config.MAX_SAMPLE_CHARS - totalChars;
    const content = raw.slice(0, Math.min(raw.length, remainingChars));
    totalChars += content.length;
    sampled.push({
      ...candidate,
      content,
      truncated: content.length < raw.length
    });
  }

  if (sampled.length === 0) {
    throw new ReviewServiceError('non_code_repo', 'No reviewable source, documentation, or config files found', 422);
  }

  return sampled;
}

export function shouldIgnorePath(path: string): boolean {
  const parts = path.split('/');
  if (parts.some((part) => IGNORED_DIRS.has(part))) {
    return true;
  }

  return IGNORED_BASENAMES.has(basename(path));
}

export function detectLanguage(path: string): string | null {
  const base = basename(path);
  if (/^README/i.test(base)) {
    return 'Markdown';
  }

  if (base === 'Dockerfile') {
    return 'Dockerfile';
  }

  return LANGUAGE_BY_EXT[extname(path)] ?? null;
}

function scorePath(path: string): number {
  if (MANIFEST_RE.test(path)) {
    return 100;
  }

  if (ENTRYPOINT_RE.test(path)) {
    return 80;
  }

  const depthPenalty = path.split('/').length;
  const language = detectLanguage(path);
  const sourceBonus = language && !['Markdown', 'JSON', 'YAML', 'TOML'].includes(language) ? 40 : 20;
  return sourceBonus - depthPenalty;
}

function isLikelyBinary(buffer: Buffer): boolean {
  if (buffer.length === 0) {
    return false;
  }

  const sample = buffer.subarray(0, Math.min(buffer.length, 8_000));
  return sample.includes(0);
}
