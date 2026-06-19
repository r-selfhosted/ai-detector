import { buildDiscordSummary, DISCORD_CONTENT_LIMIT, DISCORD_SUMMARY_LIMIT } from '../src/discord-summary.js';
import { ReviewSuccess } from '../src/types.js';

function review(overrides: Partial<Omit<ReviewSuccess, 'discord_summary'>> = {}): Omit<ReviewSuccess, 'discord_summary'> {
  return {
    confidence: 62,
    risk_level: 'moderate',
    review_recommendation: 'review_recommended',
    ai_assistance_likelihood: 82,
    disclosed_ai_use: 'unknown',
    disclosure_evidence: [],
    findings: ['Finding one', 'Finding two'],
    limitations: ['Limitation one'],
    metadata_signals: {
      commit_count: 1,
      contributor_count: 1,
      activity_span_minutes: 0,
      first_commit_at: null,
      last_commit_at: null,
      generic_commit_messages: false,
      generic_commit_message_count: 0,
      single_session_clustering: false,
      few_giant_commits: false,
      recent_commit_count: 1
    },
    sample_summary: {
      sampled_file_count: 2,
      sampled_source_file_count: 1,
      reviewable_file_count: 4,
      reviewable_source_file_count: 2,
      docs_only_sample: false,
      sampled_files: ['README.md', 'src/index.ts']
    },
    disclosure: 'Automated probabilistic assessment.',
    repo_url: 'https://github.com/example/project',
    ...overrides
  };
}

describe('buildDiscordSummary', () => {
  it('builds a moderator summary under Discord content limits', () => {
    const summary = buildDiscordSummary(review());

    expect(summary).toContain('AI Detector: https://github.com/example/project');
    expect(summary).toContain('Undisclosed-risk: 62%');
    expect(summary.length).toBeLessThanOrEqual(DISCORD_SUMMARY_LIMIT);
    expect(summary.length).toBeLessThan(DISCORD_CONTENT_LIMIT);
  });

  it('truncates long findings and limitations', () => {
    const summary = buildDiscordSummary(
      review({
        findings: Array.from({ length: 20 }, (_, index) => `Finding ${index} ${'x'.repeat(500)}`),
        limitations: Array.from({ length: 10 }, (_, index) => `Limitation ${index} ${'y'.repeat(500)}`)
      })
    );

    expect(summary.length).toBeLessThanOrEqual(DISCORD_SUMMARY_LIMIT);
    expect(summary).toContain('Findings:');
    expect(summary).toContain('Limitations:');
  });
});
