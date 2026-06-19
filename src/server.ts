import Fastify, { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { AppConfig } from './config.js';
import { toReviewError } from './errors.js';
import { runCommand } from './process.js';
import { createDependencies, reviewRepository } from './reviewer.js';
import { Dependencies, ReviewRequestBody } from './types.js';

const reviewRequestSchema = z.object({
  repo_url: z.string().min(1),
  comment_id: z.string().optional(),
  comment_permalink: z.string().optional(),
  author: z.string().optional()
});

interface BuildServerOptions {
  config: AppConfig;
  dependencies?: Dependencies;
}

export function buildServer({ config, dependencies = createDependencies(config) }: BuildServerOptions): FastifyInstance {
  const app = Fastify({
    logger: {
      level: config.LOG_LEVEL,
      redact: ['req.headers.authorization', 'OPENROUTER_API_KEY', 'REVIEW_SERVICE_TOKEN']
    }
  });

  app.get('/healthz', async () => {
    const gitAvailable = await runCommand('git', ['--version'])
      .then(() => true)
      .catch(() => false);

    return {
      status: 'ok',
      git_available: gitAvailable,
      required_config_present: Boolean(config.OPENROUTER_API_KEY && config.OPENROUTER_MODEL && config.REVIEW_SERVICE_TOKEN)
    };
  });

  app.post('/review', async (request, reply) => {
    const authHeader = request.headers.authorization;
    if (authHeader !== `Bearer ${config.REVIEW_SERVICE_TOKEN}`) {
      request.log.warn({ event: 'review_unauthorized' }, 'Unauthorized review request');
      return reply.status(401).send({
        error: 'unauthorized',
        detail: 'Missing or invalid bearer token'
      });
    }

    const parsed = reviewRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: 'invalid_request',
        detail: parsed.error.issues.map((issue) => issue.message).join('; ')
      });
    }

    const body: ReviewRequestBody = parsed.data;
    const startedAt = Date.now();
    request.log.info(
      {
        event: 'review_started',
        repo_url: body.repo_url,
        comment_id: body.comment_id,
        comment_permalink: body.comment_permalink,
        author: body.author
      },
      'Review started'
    );

    try {
      const result = await reviewRepository(body, dependencies);
      request.log.info(
        {
          event: 'review_completed',
          repo_url: result.repo_url,
          comment_id: result.comment_id,
          comment_permalink: result.comment_permalink,
          author: result.author,
          duration_ms: Date.now() - startedAt,
          confidence: result.confidence,
          findings: result.findings,
          metadata_signals: result.metadata_signals
        },
        'Review completed'
      );
      return result;
    } catch (error) {
      const reviewError = toReviewError(error);
      request.log.error(
        {
          event: 'review_failed',
          repo_url: body.repo_url,
          comment_id: body.comment_id,
          duration_ms: Date.now() - startedAt,
          error: reviewError.code,
          detail: reviewError.message
        },
        'Review failed'
      );
      return reply.status(reviewError.statusCode).send({
        error: reviewError.code,
        detail: reviewError.message,
        repo_url: body.repo_url,
        ...(body.comment_id ? { comment_id: body.comment_id } : {})
      });
    }
  });

  return app;
}
