import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://gghrlmbtklwwfyowiwjv.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_xunbz4YlRixAJ3FqJpweDA_i-9gef50';

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
