import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

type WindmillUrlHelpers = {
  extractRepoUrls: (body: string) => string[];
  stripHtml: (html: string) => string;
};

function loadWindmillUrlHelpers(): WindmillUrlHelpers {
  const source = readFileSync(resolve('windmill-scripts/r-selfhosted-ai-detector.ts'), 'utf8');

  const helperSource = ['extractRepoUrls', 'stripHtml', 'cleanRepoUrl']
    .map((name) => {
      const start = source.indexOf(`function ${name}`);
      const next = source.indexOf('\nfunction ', start + 1);
      return source.slice(start, next === -1 ? source.length : next);
    })
    .join('\n')
    .replace(/: string\[\]/g, '')
    .replace(/: string/g, '');

  return new Function(`${helperSource}\nreturn { extractRepoUrls, stripHtml };`)() as WindmillUrlHelpers;
}

describe('Windmill script URL extraction', () => {
  it('normalizes Reddit-escaped GitHub URLs to the repository root', () => {
    const { extractRepoUrls, stripHtml } = loadWindmillUrlHelpers();
    const redditHtml =
      '<p><a href="https://github.com/ray910408/Universal%5C_Clipboard/releases">https://github.com/ray910408/Universal\\_Clipboard/releases</a></p>';

    expect(extractRepoUrls(stripHtml(redditHtml))).toEqual(['https://github.com/ray910408/Universal_Clipboard']);
    expect(extractRepoUrls('https://github.com/ray910408/Universal\\_Clipboard/releases')).toEqual([
      'https://github.com/ray910408/Universal_Clipboard'
    ]);
  });
});
