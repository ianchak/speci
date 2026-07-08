import { defineConfig } from '@stati/core';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { version } = require('../package.json') as { version: string };

// In Netlify deploy previews, DEPLOY_PRIME_URL is set to the preview URL.
// In production builds, DEPLOY_URL is the production URL.
// URL is the primary site URL (typically the production domain).
// Fall back to localhost for local development.
const baseUrl =
  process.env.DEPLOY_PRIME_URL ??
  process.env.DEPLOY_URL ??
  process.env.URL ??
  'http://localhost:3000';

export default defineConfig({
  site: {
    title: 'Speci',
    baseUrl,
    description:
      'AI-powered implementation loop orchestrator for GitHub Copilot. Automate plan → task → implement → review workflows with quality gate validation.',
    defaultLocale: 'en-US',
  },

  seo: {
    // autoInject is disabled because SEO tags are managed explicitly
    // via stati.generateSEO() in site/_partials/head.eta.
    autoInject: false,
  },

  sitemap: {
    enabled: true,
    defaultChangeFreq: 'monthly',
  },

  robots: {
    enabled: true,
  },

  eta: {
    filters: {
      // Expose CLI version to every template as: <%= stati.cliVersion %>
      cliVersion: () => version,
    },
  },
});
