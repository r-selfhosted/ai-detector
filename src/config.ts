import { z } from 'zod';

const optionalNumber = (defaultValue: number) =>
  z
    .string()
    .optional()
    .transform((value) => {
      if (value === undefined || value === '') {
        return defaultValue;
      }

      const parsed = Number(value);
      if (!Number.isFinite(parsed)) {
        throw new Error(`Expected numeric value, received ${value}`);
      }

      return parsed;
    });

const optionalString = (defaultValue: string) =>
  z
    .string()
    .optional()
    .transform((value) => (value === undefined || value === '' ? defaultValue : value));

const requiredSecret = z.string().min(1);

const schema = z.object({
  OPENROUTER_API_KEY: requiredSecret,
  OPENROUTER_MODEL: requiredSecret,
  REVIEW_SERVICE_TOKEN: requiredSecret,
  PORT: optionalNumber(8080),
  HOST: optionalString('0.0.0.0'),
  CLONE_DEPTH: optionalNumber(50),
  CLONE_TIMEOUT_MS: optionalNumber(60_000),
  MAX_REPO_BYTES: optionalNumber(75 * 1024 * 1024),
  MAX_FILE_BYTES: optionalNumber(256 * 1024),
  MAX_FILES_SCANNED: optionalNumber(2_000),
  MAX_FILES_SAMPLED: optionalNumber(24),
  MAX_SAMPLE_CHARS: optionalNumber(80_000),
  OPENROUTER_TEMPERATURE: optionalNumber(0.1),
  OPENROUTER_MAX_TOKENS: optionalNumber(1_500),
  LOG_LEVEL: optionalString('info')
});

export type AppConfig = z.infer<typeof schema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  return schema.parse(env);
}

export function hasRequiredConfig(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(env.OPENROUTER_API_KEY && env.OPENROUTER_MODEL && env.REVIEW_SERVICE_TOKEN);
}
