import { createClient } from '@supabase/supabase-js';

// These constants are injected at build time by esbuild's --define flag.
// They are never read from process.env at runtime (Chrome extensions have no Node env).
declare const SUPABASE_URL: string;
declare const SUPABASE_ANON_KEY: string;

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
