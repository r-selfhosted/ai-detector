import { readFile, stat } from 'node:fs/promises';
import { basename, extname, join } from 'node:path';
import { AppConfig } from './config.js';
import { ReviewServiceError } from './errors.js';
import { runCommand } from './process.js';
import { RepositorySample, SampledFile } from './types.js';

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

const MINIFIED_ASSET_RE = /\.min\.(?:css|js)$/i;
const CENTRAL_SOURCE_RE = /^(?:app|cli|core|server|src|tasks|web)\//i;
const TASK_FILE_RE = /(^|\/)(tasks?|worker|jobs?|commands?)\.[^.]+$/i;

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
  '.sh': 'Shell',
  '.bash': 'Shell',
  '.zsh': 'Shell',
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

type CandidateFile = Omit<SampledFile, 'content' | 'truncated'>;

export async function sampleRepository(repoPath: string, config: AppConfig): Promise<RepositorySample> {
  const result = await runCommand('git', ['ls-files', '-z'], { cwd: repoPath });
  const trackedFiles = result.stdout.split('\0').filter(Boolean);
  const candidates: CandidateFile[] = [];
  let scanned = 0;

  for (const path of trackedFiles) {
    if (scanned >= config.MAX_FILES_SCANNED) {
      break;
    }
    scanned += 1;

    if (shouldIgnorePath(path)) {
      continue;
    }

    const absolutePath = join(repoPath, path);
    const fileStat = await stat(absolutePath);
    if (!fileStat.isFile()) {
      continue;
    }

    const buffer = await readFile(absolutePath);
    const language = detectLanguage(path, buffer);
    if (!language) {
      continue;
    }

    if (fileStat.size > config.MAX_FILE_BYTES) {
      continue;
    }

    if (isLikelyBinary(buffer)) {
      continue;
    }

    candidates.push({
      path,
      language,
      category: categorizeFile(path, language),
      bytes: fileStat.size,
      priority: scorePath(path)
    });
  }

  const sampled: SampledFile[] = [];
  let totalChars = 0;
  const prioritized = prioritizeCandidates(candidates, config.MAX_FILES_SAMPLED);

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

  const sampledSourceFileCount = sampled.filter((file) => file.category === 'source').length;
  const reviewableSourceFileCount = candidates.filter((file) => file.category === 'source').length;

  return {
    files: sampled,
    summary: {
      sampled_file_count: sampled.length,
      sampled_source_file_count: sampledSourceFileCount,
      reviewable_file_count: candidates.length,
      reviewable_source_file_count: reviewableSourceFileCount,
      docs_only_sample: sampledSourceFileCount === 0,
      sampled_files: sampled.map((file) => file.path)
    }
  };
}

export function shouldIgnorePath(path: string): boolean {
  const parts = path.split('/');
  if (parts.some((part) => IGNORED_DIRS.has(part))) {
    return true;
  }

  if (MINIFIED_ASSET_RE.test(basename(path))) {
    return true;
  }

  return IGNORED_BASENAMES.has(basename(path));
}

export function detectLanguage(path: string, content?: Buffer): string | null {
  const base = basename(path);
  if (/^README/i.test(base)) {
    return 'Markdown';
  }

  if (base === 'Dockerfile') {
    return 'Dockerfile';
  }

  const language = LANGUAGE_BY_EXT[extname(path)];
  if (language) {
    return language;
  }

  if (content && hasScriptShebang(content)) {
    return 'Shell';
  }

  return null;
}

function scorePath(path: string): number {
  if (ENTRYPOINT_RE.test(path)) {
    return 95;
  }

  const language = detectLanguage(path);
  const isSource = language && !['Markdown', 'JSON', 'YAML', 'TOML', 'Dockerfile'].includes(language);
  if (isSource && (CENTRAL_SOURCE_RE.test(path) || TASK_FILE_RE.test(path))) {
    return 90;
  }

  if (MANIFEST_RE.test(path)) {
    return 85;
  }

  const depthPenalty = path.split('/').length;
  const sourceBonus = isSource ? 60 : 20;
  return sourceBonus - depthPenalty;
}

function hasScriptShebang(buffer: Buffer): boolean {
  const firstLine = buffer.subarray(0, Math.min(buffer.length, 128)).toString('utf8').split('\n')[0] ?? '';
  return /^#!\s*\/(?:(?:usr\/bin\/env\s+)|(?:usr\/bin\/)|(?:bin\/))?(?:ba|z|k)?sh\b/.test(firstLine);
}

export function categorizeFile(path: string, language: string): SampledFile['category'] {
  if (language === 'Markdown') {
    return 'documentation';
  }

  if (MANIFEST_RE.test(path) || ['JSON', 'YAML', 'TOML', 'Dockerfile'].includes(language)) {
    return 'config';
  }

  return 'source';
}

export function prioritizeCandidates(candidates: CandidateFile[], maxFilesSampled: number): CandidateFile[] {
  const byPriority = [...candidates].sort((a, b) => b.priority - a.priority || a.path.localeCompare(b.path));
  const selectedSources = new Map<string, CandidateFile>();
  const selectedRemainder = new Map<string, CandidateFile>();
  const sourceCandidates = byPriority.filter((file) => file.category === 'source');
  const minimumSourceFiles = Math.min(sourceCandidates.length, Math.max(1, Math.floor(maxFilesSampled / 2)));

  for (const file of sourceCandidates.slice(0, minimumSourceFiles)) {
    selectedSources.set(file.path, file);
  }

  for (const file of byPriority) {
    if (selectedSources.size + selectedRemainder.size >= maxFilesSampled) {
      break;
    }
    if (!selectedSources.has(file.path)) {
      selectedRemainder.set(file.path, file);
    }
  }

  return [...selectedSources.values(), ...selectedRemainder.values()];
}

function isLikelyBinary(buffer: Buffer): boolean {
  if (buffer.length === 0) {
    return false;
  }

  const sample = buffer.subarray(0, Math.min(buffer.length, 8_000));
  return sample.includes(0);
}
