import { loadConfig } from './config.js';
import { buildServer } from './server.js';

const config = loadConfig();
const app = buildServer({ config });

try {
  await app.listen({ port: config.PORT, host: config.HOST });
} catch (error) {
  app.log.error(error, 'Failed to start review service');
  process.exit(1);
}
