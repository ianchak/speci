import { defineConfig } from '@stati/core';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { version } = require('../package.json') as { version: string };

// Canonical URLs, the sitemap and social tags are built from baseUrl.
// Production always uses the custom domain: Netlify sets DEPLOY_PRIME_URL on
// every build, and in production it is the branch URL (master--speci-sdd.netlify.app),
// which Google then treats as the canonical copy of the site.
// Deploy previews and branch deploys use their own URL so internal links work there.
// Fall back to localhost for local development.
const PRODUCTION_URL = 'https://speci.imrecsige.dev';
const baseUrl =
  process.env.CONTEXT === 'production'
    ? PRODUCTION_URL
    : (process.env.DEPLOY_PRIME_URL ?? 'http://localhost:3000');

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
