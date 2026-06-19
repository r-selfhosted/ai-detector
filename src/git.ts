import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AppConfig } from './config.js';
import { ReviewServiceError } from './errors.js';
import { runCommand } from './process.js';

export function validateRepoUrl(repoUrl: string): void {
  let parsed: URL;
  try {
    parsed = new URL(repoUrl);
  } catch {
    throw new ReviewServiceError('invalid_request', 'repo_url must be a valid URL', 400);
  }

  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new ReviewServiceError('invalid_request', 'repo_url must use http or https', 400);
  }

  if (parsed.username || parsed.password) {
    throw new ReviewServiceError('invalid_request', 'repo_url must not include credentials', 400);
  }
}

export function normalizeRepoUrlForClone(repoUrl: string): string {
  validateRepoUrl(repoUrl);

  const parsed = new URL(repoUrl);
  const host = parsed.hostname.toLowerCase().replace(/^www\./, '');
  const parts = parsed.pathname.split('/').filter(Boolean);

  if (['github.com', 'gitlab.com', 'codeberg.org'].includes(host) && parts.length >= 2) {
    const repo = parts[1].replace(/\.git$/i, '');
    return `${parsed.protocol}//${parsed.host}/${parts[0]}/${repo}`;
  }

  if (host === 'git.sr.ht' && parts.length >= 2) {
    const repo = parts[1].replace(/\.git$/i, '');
    return `${parsed.protocol}//${parsed.host}/${parts[0]}/${repo}`;
  }

  return repoUrl;
}

export async function cloneRepository(repoUrl: string, config: AppConfig): Promise<string> {
  const cloneUrl = normalizeRepoUrlForClone(repoUrl);

  const baseDir = await mkdtemp(join(tmpdir(), 'ai-detector-'));
  const targetDir = join(baseDir, 'repo');

  try {
    await runCommand('git', ['clone', '--depth', String(config.CLONE_DEPTH), cloneUrl, targetDir], {
      timeoutMs: config.CLONE_TIMEOUT_MS
    });
    await assertRepoWithinLimit(targetDir, config.MAX_REPO_BYTES);
    return targetDir;
  } catch (error) {
    await cleanupRepository(baseDir);

    if (error instanceof Error && error.message.includes('timed out')) {
      throw new ReviewServiceError('clone_timeout', 'Repository clone timed out', 408);
    }

    if (error instanceof ReviewServiceError) {
      throw error;
    }

    throw new ReviewServiceError('clone_failed', 'Repository unreachable, private, or not cloneable', 502);
  }
}

export async function cleanupRepository(repoPath: string): Promise<void> {
  const cleanupRoot = repoPath.endsWith('/repo') ? join(repoPath, '..') : repoPath;
  await rm(cleanupRoot, { recursive: true, force: true });
}

async function assertRepoWithinLimit(repoPath: string, maxBytes: number): Promise<void> {
  const result = await runCommand('git', ['ls-files', '-z'], { cwd: repoPath });
  const files = result.stdout.split('\0').filter(Boolean);
  let total = 0;

  for (const file of files) {
    const fileStat = await stat(join(repoPath, file));
    total += fileStat.size;
    if (total > maxBytes) {
      throw new ReviewServiceError('repo_too_large', 'Repository exceeds configured size limit', 413);
    }
  }
}
