import { ReviewServiceError } from '../src/errors.js';
import { parseModelAssessment, sanitizeOpenRouterError } from '../src/model.js';

describe('parseModelAssessment', () => {
  it('clamps confidence and keeps string findings', () => {
    const result = parseModelAssessment(
      JSON.stringify({
        confidence: 112.4,
        risk_level: 'moderate',
        review_recommendation: 'review_recommended',
        ai_assistance_likelihood: 86.2,
        disclosed_ai_use: 'unknown',
        disclosure_evidence: ['none found'],
        findings: ['one', 2, 'two'],
        limitations: ['limited sample', 3]
      })
    );

    expect(result).toEqual({
      confidence: 100,
      risk_level: 'moderate',
      review_recommendation: 'review_recommended',
      ai_assistance_likelihood: 86,
      disclosed_ai_use: 'unknown',
      disclosure_evidence: ['none found'],
      findings: ['one', 'two'],
      limitations: ['limited sample']
    });
  });

  it('throws model_failed for malformed JSON', () => {
    expect(() => parseModelAssessment('{nope')).toThrow(ReviewServiceError);
  });

  it('sanitizes OpenRouter error details', () => {
    const result = sanitizeOpenRouterError('Bad key sk-or-secret-token\nwith extra   whitespace');

    expect(result).toBe('Bad key sk-or-[redacted] with extra whitespace');
  });
});
