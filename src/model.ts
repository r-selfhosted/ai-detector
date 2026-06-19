import { AppConfig } from './config.js';
import { ReviewServiceError } from './errors.js';
import { ModelAssessment, ModelAssessmentInput } from './types.js';

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

const assessmentSchema = {
  type: 'object',
  properties: {
    confidence: {
      type: 'number',
      description: 'Confidence from 0 to 100 that the repository contains undisclosed AI-generated code.'
    },
    findings: {
      type: 'array',
      description: 'Specific, neutral evidence-backed observations. Avoid definitive claims.',
      items: { type: 'string' }
    }
  },
  required: ['confidence', 'findings'],
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
            'You assess repositories for signs of undisclosed AI-generated code. Treat every signal as probabilistic, avoid certainty, and only cite evidence present in the provided metadata or samples.'
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
    throw new ReviewServiceError('model_failed', `OpenRouter request failed with status ${response.status}`, 502);
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
  if (typeof assessment.confidence !== 'number' || !Array.isArray(assessment.findings)) {
    throw new ReviewServiceError('model_failed', 'OpenRouter returned an invalid assessment shape', 502);
  }

  return {
    confidence: Math.max(0, Math.min(100, Math.round(assessment.confidence))),
    findings: assessment.findings.filter((finding): finding is string => typeof finding === 'string').slice(0, 12)
  };
}

function buildPrompt(input: ModelAssessmentInput): string {
  const files = input.sampledFiles.map((file) => ({
    path: file.path,
    language: file.language,
    bytes: file.bytes,
    truncated: file.truncated,
    content: file.content
  }));

  return JSON.stringify(
    {
      task:
        'Review these repository metadata signals and sampled files for signs consistent with AI-generated code. Return only confidence and findings.',
      repo_url: input.repoUrl,
      context: input.context,
      metadata_signals: input.metadata,
      sampled_files: files,
      guidance: [
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
