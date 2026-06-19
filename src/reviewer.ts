import { AppConfig } from './config.js';
import { cloneRepository, cleanupRepository } from './git.js';
import { analyzeMetadata } from './metadata.js';
import { assessWithModel } from './model.js';
import { sampleRepository } from './sampler.js';
import { buildDiscordSummary } from './discord-summary.js';
import { Dependencies, ReviewRequestBody, ReviewSuccess } from './types.js';

export const DISCLOSURE =
  'This is an automated, probabilistic assessment intended for human moderator review. It is not definitive proof of AI-generated code; false positives are common, and clean human-written code can resemble AI output.';

export function createDependencies(config: AppConfig): Dependencies {
  return {
    cloneRepository: (repoUrl) => cloneRepository(repoUrl, config),
    cleanupRepository,
    analyzeMetadata,
    sampleRepository: (repoPath) => sampleRepository(repoPath, config),
    assessWithModel: (input) => assessWithModel(input, config)
  };
}

export async function reviewRepository(body: ReviewRequestBody, dependencies: Dependencies): Promise<ReviewSuccess> {
  let repoPath: string | null = null;

  try {
    repoPath = await dependencies.cloneRepository(body.repo_url);
    const [metadata, sample] = await Promise.all([
      dependencies.analyzeMetadata(repoPath),
      dependencies.sampleRepository(repoPath)
    ]);
    const assessment = await dependencies.assessWithModel({
      repoUrl: body.repo_url,
      context: {
        comment_id: body.comment_id,
        comment_permalink: body.comment_permalink,
        comment_body: body.comment_body,
        comment_claimed_no_ai: body.comment_claimed_no_ai,
        author: body.author
      },
      metadata,
      sample
    });

    const reviewWithoutSummary: Omit<ReviewSuccess, 'discord_summary'> = {
      confidence: assessment.confidence,
      risk_level: assessment.risk_level,
      review_recommendation: assessment.review_recommendation,
      ai_assistance_likelihood: assessment.ai_assistance_likelihood,
      disclosed_ai_use: assessment.disclosed_ai_use,
      disclosure_evidence: assessment.disclosure_evidence,
      findings: assessment.findings,
      limitations: assessment.limitations,
      metadata_signals: metadata,
      sample_summary: sample.summary,
      disclosure: DISCLOSURE,
      repo_url: body.repo_url,
      ...(body.comment_id ? { comment_id: body.comment_id } : {}),
      ...(body.comment_permalink ? { comment_permalink: body.comment_permalink } : {}),
      ...(body.comment_body ? { comment_body: body.comment_body } : {}),
      ...(body.comment_claimed_no_ai !== undefined ? { comment_claimed_no_ai: body.comment_claimed_no_ai } : {}),
      ...(body.author ? { author: body.author } : {})
    };

    return {
      ...reviewWithoutSummary,
      discord_summary: buildDiscordSummary(reviewWithoutSummary)
    };
  } finally {
    if (repoPath) {
      await dependencies.cleanupRepository(repoPath);
    }
  }
}
