const LEVEL = process.env.LOG_LEVEL || 'info';

const log = (level, ...args) => {
    if (['error', 'warn', 'info', 'debug'].includes(level)) {
        // Simple logger — replace with winston/pino if desired
        if (LEVEL === 'debug' || level !== 'debug') {
            // eslint-disable-next-line no-console
            console[level === 'error' ? 'error' : 'log'](`[${level.toUpperCase()}]`, ...args);
        }
    }
};

module.exports = {
    info: (...args) => log('info', ...args),
    warn: (...args) => log('warn', ...args),
    error: (...args) => log('error', ...args),
    debug: (...args) => log('debug', ...args),
};
