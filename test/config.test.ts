import { loadConfig } from '../src/config.js';

describe('loadConfig', () => {
  it('requires OpenRouter and service auth configuration', () => {
    expect(() => loadConfig({})).toThrow();
  });

  it('loads defaults for optional limits', () => {
    const config = loadConfig({
      OPENROUTER_API_KEY: 'or-key',
      OPENROUTER_MODEL: 'test/model',
      REVIEW_SERVICE_TOKEN: 'token'
    });

    expect(config.PORT).toBe(8080);
    expect(config.CLONE_DEPTH).toBe(50);
    expect(config.MAX_FILES_SAMPLED).toBe(24);
  });
});
