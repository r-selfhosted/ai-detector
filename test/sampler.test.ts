import { categorizeFile, detectLanguage, prioritizeCandidates, shouldIgnorePath } from '../src/sampler.js';

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
});
