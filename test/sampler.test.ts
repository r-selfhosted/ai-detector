import { detectLanguage, shouldIgnorePath } from '../src/sampler.js';

describe('sampler helpers', () => {
  it('ignores dependency dirs and lockfiles', () => {
    expect(shouldIgnorePath('node_modules/pkg/index.js')).toBe(true);
    expect(shouldIgnorePath('package-lock.json')).toBe(true);
    expect(shouldIgnorePath('src/index.ts')).toBe(false);
  });

  it('detects common source and docs languages', () => {
    expect(detectLanguage('README.md')).toBe('Markdown');
    expect(detectLanguage('src/server.ts')).toBe('TypeScript');
    expect(detectLanguage('Dockerfile')).toBe('Dockerfile');
    expect(detectLanguage('image.png')).toBeNull();
  });
});
