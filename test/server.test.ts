import { buildServer } from '../src/server.js';
import { AppConfig } from '../src/config.js';
import { Dependencies } from '../src/types.js';

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

function deps(overrides: Partial<Dependencies> = {}): Dependencies {
  return {
    cloneRepository: vi.fn(async () => '/tmp/repo'),
    cleanupRepository: vi.fn(async () => undefined),
    analyzeMetadata: vi.fn(async () => ({
      commit_count: 1,
      contributor_count: 1,
      activity_span_minutes: 0,
      first_commit_at: '2026-01-01T00:00:00.000Z',
      last_commit_at: '2026-01-01T00:00:00.000Z',
      generic_commit_messages: true,
      generic_commit_message_count: 1,
      single_session_clustering: false,
      few_giant_commits: false,
      recent_commit_count: 1
    })),
    sampleRepository: vi.fn(async () => [
      { path: 'README.md', language: 'Markdown', bytes: 10, priority: 100, content: 'hello', truncated: false }
    ]),
    assessWithModel: vi.fn(async () => ({ confidence: 72, findings: ['README is generic'] })),
    ...overrides
  };
}

describe('server', () => {
  it('rejects missing bearer token', async () => {
    const app = buildServer({ config, dependencies: deps() });
    const response = await app.inject({ method: 'POST', url: '/review', payload: { repo_url: 'https://github.com/a/b' } });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ error: 'unauthorized' });
  });

  it('returns a completed review and cleans up', async () => {
    const dependencies = deps();
    const app = buildServer({ config, dependencies });
    const response = await app.inject({
      method: 'POST',
      url: '/review',
      headers: { authorization: 'Bearer secret' },
      payload: {
        repo_url: 'https://github.com/a/b',
        comment_id: 'abc123'
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      confidence: 72,
      findings: ['README is generic'],
      repo_url: 'https://github.com/a/b',
      comment_id: 'abc123'
    });
    expect(dependencies.cleanupRepository).toHaveBeenCalledWith('/tmp/repo');
  });
});
