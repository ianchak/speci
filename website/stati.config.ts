import { defineConfig } from '@stati/core';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { version } = require('../package.json') as { version: string };

// In Netlify deploy previews, DEPLOY_PRIME_URL is set to the preview URL.
// In production builds, DEPLOY_URL is the production URL.
// Fall back to localhost for local development.
const baseUrl =
  process.env.URL ?? process.env.DEPLOY_PRIME_URL ?? 'http://localhost:3000';

export default defineConfig({
  site: {
    title: 'Speci',
    baseUrl,
    description:
      'AI-powered implementation loop orchestrator for GitHub Copilot. Automate plan → task → implement → review workflows with quality gate validation.',
    defaultLocale: 'en-US',
  },

  eta: {
    filters: {
      // Expose CLI version to every template as: <%= stati.cliVersion %>
      cliVersion: () => version,
    },
  },
});
