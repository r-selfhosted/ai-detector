import { AppConfig } from './config.js';
import { cloneRepository, cleanupRepository } from './git.js';
import { analyzeMetadata } from './metadata.js';
import { assessWithModel } from './model.js';
import { sampleRepository } from './sampler.js';
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
    const [metadata, sampledFiles] = await Promise.all([
      dependencies.analyzeMetadata(repoPath),
      dependencies.sampleRepository(repoPath)
    ]);
    const assessment = await dependencies.assessWithModel({
      repoUrl: body.repo_url,
      context: {
        comment_id: body.comment_id,
        comment_permalink: body.comment_permalink,
        author: body.author
      },
      metadata,
      sampledFiles
    });

    return {
      confidence: assessment.confidence,
      findings: assessment.findings,
      metadata_signals: metadata,
      disclosure: DISCLOSURE,
      repo_url: body.repo_url,
      ...(body.comment_id ? { comment_id: body.comment_id } : {}),
      ...(body.comment_permalink ? { comment_permalink: body.comment_permalink } : {}),
      ...(body.author ? { author: body.author } : {})
    };
  } finally {
    if (repoPath) {
      await dependencies.cleanupRepository(repoPath);
    }
  }
}
