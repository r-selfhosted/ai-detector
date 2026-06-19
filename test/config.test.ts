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

  it('rejects invalid OpenRouter temperature values', () => {
    expect(() =>
      loadConfig({
        OPENROUTER_API_KEY: 'or-key',
        OPENROUTER_MODEL: 'test/model',
        REVIEW_SERVICE_TOKEN: 'token',
        OPENROUTER_TEMPERATURE: '1500'
      })
    ).toThrow();
  });

  it('parses OpenRouter tuning values', () => {
    const config = loadConfig({
      OPENROUTER_API_KEY: 'or-key',
      OPENROUTER_MODEL: 'test/model',
      REVIEW_SERVICE_TOKEN: 'token',
      OPENROUTER_TEMPERATURE: '0',
      OPENROUTER_MAX_TOKENS: '1500'
    });

    expect(config.OPENROUTER_TEMPERATURE).toBe(0);
    expect(config.OPENROUTER_MAX_TOKENS).toBe(1500);
  });
});
