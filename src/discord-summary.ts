import { ReviewSuccess } from './types.js';

export const DISCORD_CONTENT_LIMIT = 2_000;
export const DISCORD_SUMMARY_LIMIT = 1_900;

type ReviewForDiscord = Omit<ReviewSuccess, 'discord_summary'>;

export function buildDiscordSummary(review: ReviewForDiscord): string {
  const lines = [
    `AI Detector: ${review.repo_url}`,
    `Undisclosed-risk: ${review.confidence}% (${review.risk_level}, ${review.review_recommendation})`,
    `AI assistance likelihood: ${review.ai_assistance_likelihood}% | Disclosed AI use: ${String(review.disclosed_ai_use)}`,
    review.comment_permalink ? `Comment: ${review.comment_permalink}` : null,
    `Sample: ${review.sample_summary.sampled_file_count}/${review.sample_summary.reviewable_file_count} files, ${review.sample_summary.sampled_source_file_count}/${review.sample_summary.reviewable_source_file_count} source`,
    '',
    ...formatSection('Findings', review.findings, 4),
    ...formatSection('Limitations', review.limitations, 2)
  ].filter((line): line is string => line !== null);

  return enforceDiscordLimit(lines.join('\n'));
}

function formatSection(title: string, items: string[], maxItems: number): string[] {
  if (items.length === 0) {
    return [];
  }

  return [`${title}:`, ...items.slice(0, maxItems).map((item) => `- ${truncateLine(item, 260)}`)];
}

function truncateLine(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength - 1)}…`;
}

function enforceDiscordLimit(content: string): string {
  if (content.length <= DISCORD_SUMMARY_LIMIT) {
    return content;
  }

  const suffix = '\n… truncated; see full review JSON for complete findings.';
  return `${content.slice(0, DISCORD_SUMMARY_LIMIT - suffix.length)}${suffix}`;
}
