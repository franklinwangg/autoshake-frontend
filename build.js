#!/usr/bin/env node
// esbuild build script — reads SUPABASE_URL and SUPABASE_ANON_KEY from environment.
// Usage: node build.js [--debug] [--watch]

const { build, context } = require('esbuild');

const isDebug = process.argv.includes('--debug');
const isWatch = process.argv.includes('--watch');

const supabaseUrl = process.env.SUPABASE_URL ?? '';
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY ?? '';

const entryPoints = [
  'src/scripts/content.ts',
  'src/scripts/popup.ts',
  'src/scripts/background.ts',
  'src/scripts/inject.ts',
];

const config = {
  entryPoints,
  bundle: true,
  outdir: 'dist',
  platform: 'browser',
  define: {
    DEBUG_GRAPHQL_VIEW: String(isDebug),
    SUPABASE_URL: JSON.stringify(supabaseUrl),
    SUPABASE_ANON_KEY: JSON.stringify(supabaseAnonKey),
  },
};

if (isWatch) {
  context(config).then((ctx) => ctx.watch());
} else {
  build(config)
    .then((result) => {
      console.log('Build complete.', result.errors.length === 0 ? 'No errors.' : result.errors);
    })
    .catch(() => process.exit(1));
}
