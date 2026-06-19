import { AppConfig } from './config.js';
import { ReviewServiceError } from './errors.js';
import { ModelAssessment, ModelAssessmentInput } from './types.js';

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

const assessmentSchema = {
  type: 'object',
  properties: {
    confidence: {
      type: 'number',
      description:
        'Confidence from 0 to 100 that the repository contains undisclosed AI-generated code. This is not general AI assistance likelihood.'
    },
    risk_level: {
      type: 'string',
      enum: ['low', 'moderate', 'high']
    },
    review_recommendation: {
      type: 'string',
      enum: ['skip', 'review_optional', 'review_recommended', 'review_high_priority']
    },
    ai_assistance_likelihood: {
      type: 'number',
      description: 'Confidence from 0 to 100 that AI assistance was involved, whether disclosed or not.'
    },
    disclosed_ai_use: {
      anyOf: [{ type: 'boolean' }, { type: 'string', enum: ['unknown'] }]
    },
    disclosure_evidence: {
      type: 'array',
      items: { type: 'string' }
    },
    findings: {
      type: 'array',
      description: 'Specific, neutral evidence-backed observations. Avoid definitive claims.',
      items: { type: 'string' }
    },
    limitations: {
      type: 'array',
      description: 'Important caveats about sample coverage, ambiguous evidence, or repo/comment context.',
      items: { type: 'string' }
    }
  },
  required: [
    'confidence',
    'risk_level',
    'review_recommendation',
    'ai_assistance_likelihood',
    'disclosed_ai_use',
    'disclosure_evidence',
    'findings',
    'limitations'
  ],
  additionalProperties: false
};

export async function assessWithModel(input: ModelAssessmentInput, config: AppConfig): Promise<ModelAssessment> {
  const response = await fetch(OPENROUTER_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://github.com/r-selfhosted/ai-detector',
      'X-OpenRouter-Title': 'r/selfhosted AI Detector'
    },
    body: JSON.stringify({
      model: config.OPENROUTER_MODEL,
      temperature: config.OPENROUTER_TEMPERATURE,
      max_tokens: config.OPENROUTER_MAX_TOKENS,
      messages: [
        {
          role: 'system',
          content:
            'You assess repositories for risk of undisclosed AI-generated code for human moderator review. Separate AI assistance likelihood from undisclosed-risk confidence. Treat every signal as probabilistic, avoid certainty, and only cite evidence present in the provided comment context, metadata, sample summary, or sampled files.'
        },
        {
          role: 'user',
          content: buildPrompt(input)
        }
      ],
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'ai_code_review_assessment',
          strict: true,
          schema: assessmentSchema
        }
      }
    })
  });

  if (!response.ok) {
    const errorDetail = await readOpenRouterError(response);
    throw new ReviewServiceError('model_failed', errorDetail, 502);
  }

  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = payload.choices?.[0]?.message?.content;
  if (!content) {
    throw new ReviewServiceError('model_failed', 'OpenRouter response did not include assessment content', 502);
  }

  return parseModelAssessment(content);
}

export function parseModelAssessment(content: string): ModelAssessment {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new ReviewServiceError('model_failed', 'OpenRouter returned invalid JSON assessment', 502);
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new ReviewServiceError('model_failed', 'OpenRouter returned an invalid assessment shape', 502);
  }

  const assessment = parsed as Partial<ModelAssessment>;
  if (
    typeof assessment.confidence !== 'number' ||
    typeof assessment.ai_assistance_likelihood !== 'number' ||
    !isRiskLevel(assessment.risk_level) ||
    !isReviewRecommendation(assessment.review_recommendation) ||
    !isDisclosedAiUse(assessment.disclosed_ai_use) ||
    !Array.isArray(assessment.disclosure_evidence) ||
    !Array.isArray(assessment.findings) ||
    !Array.isArray(assessment.limitations)
  ) {
    throw new ReviewServiceError('model_failed', 'OpenRouter returned an invalid assessment shape', 502);
  }

  return {
    confidence: Math.max(0, Math.min(100, Math.round(assessment.confidence))),
    risk_level: assessment.risk_level,
    review_recommendation: assessment.review_recommendation,
    ai_assistance_likelihood: Math.max(0, Math.min(100, Math.round(assessment.ai_assistance_likelihood))),
    disclosed_ai_use: assessment.disclosed_ai_use,
    disclosure_evidence: assessment.disclosure_evidence
      .filter((evidence): evidence is string => typeof evidence === 'string')
      .slice(0, 8),
    findings: assessment.findings.filter((finding): finding is string => typeof finding === 'string').slice(0, 12),
    limitations: assessment.limitations.filter((limitation): limitation is string => typeof limitation === 'string').slice(0, 8)
  };
}

export async function readOpenRouterError(response: Response): Promise<string> {
  const fallback = `OpenRouter request failed with status ${response.status}`;

  try {
    const text = await response.text();
    if (!text.trim()) {
      return fallback;
    }

    return `${fallback}: ${sanitizeOpenRouterError(text)}`;
  } catch {
    return fallback;
  }
}

export function sanitizeOpenRouterError(text: string): string {
  return text
    .replace(/sk-or-[A-Za-z0-9_-]+/g, 'sk-or-[redacted]')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 1_000);
}

function buildPrompt(input: ModelAssessmentInput): string {
  const files = input.sample.files.map((file) => ({
    path: file.path,
    language: file.language,
    category: file.category,
    bytes: file.bytes,
    truncated: file.truncated,
    content: file.content
  }));

  return JSON.stringify(
    {
      task:
        'Review this Reddit-linked repository for risk of undisclosed AI-generated code. Return the structured assessment fields exactly.',
      repo_url: input.repoUrl,
      windmill_context: input.context,
      metadata_signals: input.metadata,
      sample_summary: input.sample.summary,
      sampled_files: files,
      scoring_rubric: {
        confidence_definition:
          'confidence is risk of undisclosed AI-generated code, not whether any AI assistance was used.',
        ai_assistance_likelihood_definition:
          'ai_assistance_likelihood estimates whether AI assistance was involved at all, including disclosed use.',
        score_bands: {
          '0_29': 'low concern',
          '30_49': 'weak or questionable signals',
          '50_69': 'moderate concern; human review if threshold is broad',
          '70_84': 'strong concern',
          '85_100': 'very strong concern'
        },
        recommendations: {
          skip: 'low risk or disclosed use with no contradiction',
          review_optional: 'weak or ambiguous signals',
          review_recommended: 'moderate-to-strong undisclosed-risk signals',
          review_high_priority: 'strong signals plus contradictory comment/disclosure context'
        }
      },
      guidance: [
        'If README, docs, or the Reddit comment explicitly disclose AI or Claude Code use, substantially lower confidence unless other evidence suggests a larger undisclosed portion.',
        'If the Reddit comment claims no AI was used but repo evidence strongly suggests AI assistance, mention that contradiction and raise review priority.',
        'Polished docs, good tests, clean Docker/Compose scaffolding, consistent style, and short development windows are weak supporting signals only.',
        'Do not treat AI-related prompts, model-client code, or evaluator text as evidence when they are part of the repository stated purpose.',
        'Do not score above 60 from metadata and documentation alone unless comment context provides strong contradictory evidence.',
        'If sample_summary.docs_only_sample is true while source files exist, include that as a limitation and be conservative.',
        'Cite specific patterns from samples or metadata.',
        'Keep findings neutral and evidence-based.',
        'Mention uncertainty where signals are weak or ambiguous.',
        'Do not treat polished docs, clean structure, or generic commits as proof on their own.'
      ]
    },
    null,
    2
  );
}

function isRiskLevel(value: unknown): value is ModelAssessment['risk_level'] {
  return value === 'low' || value === 'moderate' || value === 'high';
}

function isReviewRecommendation(value: unknown): value is ModelAssessment['review_recommendation'] {
  return value === 'skip' || value === 'review_optional' || value === 'review_recommended' || value === 'review_high_priority';
}

function isDisclosedAiUse(value: unknown): value is ModelAssessment['disclosed_ai_use'] {
  return typeof value === 'boolean' || value === 'unknown';
}
