const path = require('path');
const fs = require('fs');
const dotenv = require('dotenv');
const logger = require('./logger');

const envFile = path.resolve(process.cwd(), '.env');

if (fs.existsSync(envFile)) {
    dotenv.config({ path: envFile });
}

const parseCsv = (value = '') =>
    value
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);

const requiredEnv = ['DATABASE_URL', 'SUPABASE_URL'];
const missing = requiredEnv.filter((key) => !process.env[key]);

if (!process.env.SUPABASE_SERVICE_ROLE_KEY && !process.env.SUPABASE_KEY) {
    missing.push('SUPABASE_SERVICE_ROLE_KEY/SUPABASE_KEY');
}

if (missing.length) {
    logger.warn(
        `Missing environment variables: ${missing.join(', ')}. Prisma and Supabase connectivity may fail.`
    );
}

module.exports = {
    PORT: process.env.PORT,
    DATABASE_URL: process.env.DATABASE_URL,
    SUPABASE_URL: process.env.SUPABASE_URL,
    SUPABASE_KEY: process.env.SUPABASE_KEY,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    CORS_ORIGINS: parseCsv(process.env.CORS_ORIGINS || process.env.ALLOWED_ORIGINS),
};
