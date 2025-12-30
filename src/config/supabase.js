const { createClient } = require('@supabase/supabase-js');
const config = require('./index');

let supabaseClient;

const getSupabaseClient = () => {
    if (supabaseClient) {
        return supabaseClient;
    }

    const url = config.SUPABASE_URL;
    const key = config.SUPABASE_SERVICE_ROLE_KEY || config.SUPABASE_KEY;

    if (!url || !key) {
        throw new Error('Supabase credentials are not configured');
    }

    supabaseClient = createClient(url, key, {
        auth: {
            persistSession: false,
            autoRefreshToken: false,
            detectSessionInUrl: false,
        },
    });

    return supabaseClient;
};

module.exports = { getSupabaseClient };
