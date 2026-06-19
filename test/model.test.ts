import { ReviewServiceError } from '../src/errors.js';
import { parseModelAssessment } from '../src/model.js';

describe('parseModelAssessment', () => {
  it('clamps confidence and keeps string findings', () => {
    const result = parseModelAssessment(JSON.stringify({ confidence: 112.4, findings: ['one', 2, 'two'] }));

    expect(result).toEqual({ confidence: 100, findings: ['one', 'two'] });
  });

  it('throws model_failed for malformed JSON', () => {
    expect(() => parseModelAssessment('{nope')).toThrow(ReviewServiceError);
  });
});
