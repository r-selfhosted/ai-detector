import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AppConfig } from '../src/config.js';
import { runCommand } from '../src/process.js';
import { categorizeFile, detectLanguage, prioritizeCandidates, sampleRepository, shouldIgnorePath } from '../src/sampler.js';

const config: AppConfig = {
  OPENROUTER_API_KEY: 'or-key',
  OPENROUTER_MODEL: 'model',
  REVIEW_SERVICE_TOKEN: 'secret',
  PORT: 8080,
  HOST: '127.0.0.1',
  CLONE_DEPTH: 50,
  CLONE_TIMEOUT_MS: 60_000,
  MAX_REPO_BYTES: 1_000_000,
  MAX_FILE_BYTES: 100_000,
  MAX_FILES_SCANNED: 100,
  MAX_FILES_SAMPLED: 5,
  MAX_SAMPLE_CHARS: 10_000,
  OPENROUTER_TEMPERATURE: 0.1,
  OPENROUTER_MAX_TOKENS: 1_000,
  LOG_LEVEL: 'silent'
};

describe('sampler helpers', () => {
  it('ignores dependency dirs and lockfiles', () => {
    expect(shouldIgnorePath('node_modules/pkg/index.js')).toBe(true);
    expect(shouldIgnorePath('package-lock.json')).toBe(true);
    expect(shouldIgnorePath('src/index.ts')).toBe(false);
  });

  it('detects common source and docs languages', () => {
    expect(detectLanguage('README.md')).toBe('Markdown');
    expect(detectLanguage('src/server.ts')).toBe('TypeScript');
    expect(detectLanguage('podman-version-updater.sh')).toBe('Shell');
    expect(detectLanguage('install', Buffer.from('#!/usr/bin/env bash\nset -e'))).toBe('Shell');
    expect(detectLanguage('entrypoint', Buffer.from('#!/bin/sh\nset -e'))).toBe('Shell');
    expect(detectLanguage('Dockerfile')).toBe('Dockerfile');
    expect(detectLanguage('image.png')).toBeNull();
  });

  it('categorizes reviewable files', () => {
    expect(categorizeFile('README.md', 'Markdown')).toBe('documentation');
    expect(categorizeFile('docker-compose.yml', 'YAML')).toBe('config');
    expect(categorizeFile('podman-version-updater.sh', 'Shell')).toBe('source');
    expect(categorizeFile('src/server.ts', 'TypeScript')).toBe('source');
  });

  it('prioritizes source files when high-priority docs exist', () => {
    const prioritized = prioritizeCandidates(
      [
        { path: 'README.md', language: 'Markdown', category: 'documentation', bytes: 100, priority: 100 },
        { path: 'package.json', language: 'JSON', category: 'config', bytes: 100, priority: 100 },
        { path: 'src/index.ts', language: 'TypeScript', category: 'source', bytes: 100, priority: 38 },
        { path: 'src/server.ts', language: 'TypeScript', category: 'source', bytes: 100, priority: 38 }
      ],
      2
    );

    expect(prioritized.some((file) => file.category === 'source')).toBe(true);
  });

  it('skips tracked gitlink directories', async () => {
    const repoPath = await mkdtemp(join(tmpdir(), 'ai-detector-sampler-'));

    try {
      await runCommand('git', ['init'], { cwd: repoPath });
      await writeFile(join(repoPath, 'README.md'), '# Test\n');
      await mkdir(join(repoPath, 'submodule'));
      await runCommand('git', ['add', 'README.md'], { cwd: repoPath });
      await runCommand(
        'git',
        ['update-index', '--add', '--cacheinfo', '160000,0123456789012345678901234567890123456789,submodule'],
        { cwd: repoPath }
      );

      const sample = await sampleRepository(repoPath, config);

      expect(sample.files.map((file) => file.path)).toEqual(['README.md']);
    } finally {
      await rm(repoPath, { recursive: true, force: true });
    }
  });
});
