import { ReviewServiceError } from '../src/errors.js';
import { normalizeRepoUrlForClone } from '../src/git.js';

describe('normalizeRepoUrlForClone', () => {
  it('strips GitHub tree and blob paths to the repository root', () => {
    expect(normalizeRepoUrlForClone('https://github.com/lallero-dev/pappice/tree/main/deploy')).toBe(
      'https://github.com/lallero-dev/pappice'
    );
    expect(normalizeRepoUrlForClone('https://github.com/lallero-dev/pappice/blob/main/README.md')).toBe(
      'https://github.com/lallero-dev/pappice'
    );
  });

  it('normalizes supported Git hosts and removes .git suffixes', () => {
    expect(normalizeRepoUrlForClone('https://gitlab.com/group/project.git/-/tree/main')).toBe('https://gitlab.com/group/project');
    expect(normalizeRepoUrlForClone('https://codeberg.org/user/project/src/branch/main')).toBe('https://codeberg.org/user/project');
    expect(normalizeRepoUrlForClone('https://git.sr.ht/~user/project/tree/main/item')).toBe('https://git.sr.ht/~user/project');
  });

  it('normalizes Reddit-escaped underscores in repository names', () => {
    expect(normalizeRepoUrlForClone('https://github.com/ray910408/Universal%5C_Clipboard/releases')).toBe(
      'https://github.com/ray910408/Universal_Clipboard'
    );
  });

  it('rejects URLs with credentials', () => {
    expect(() => normalizeRepoUrlForClone('https://user:pass@github.com/owner/repo')).toThrow(ReviewServiceError);
  });
});
