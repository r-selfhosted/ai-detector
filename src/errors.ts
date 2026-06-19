export class ReviewServiceError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly statusCode: number = 500
  ) {
    super(message);
    this.name = 'ReviewServiceError';
  }
}

export function toReviewError(error: unknown): ReviewServiceError {
  if (error instanceof ReviewServiceError) {
    return error;
  }

  if (error instanceof Error) {
    return new ReviewServiceError('internal_error', error.message, 500);
  }

  return new ReviewServiceError('internal_error', 'Unexpected internal error', 500);
}
