const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const config = require('./config');
const logger = require('./config/logger');
const { consts, httpResponse } = require('./utils');
const { registerRoutes } = require('./routes');

const { httpStatus } = consts;

const app = express();

const allowedOrigins = config.CORS_ORIGINS;

if (!config.CORS_ORIGINS.length) {
    logger.warn('CORS_ORIGINS not set; defaulting to local development origins for CORS.');
}

app.use(
    cors({
        origin: (origin, callback) => {
            if (!origin || allowedOrigins.includes(origin)) {
                return callback(null, true);
            }

            return callback(null, false);
        },
        credentials: true,
    })
);
app.use(express.json());
app.use(cookieParser());

registerRoutes(app);

// Centralized error handler to normalize ApiError responses
app.use((err, _req, res, next) => {
    if (res.headersSent) {
        return next(err);
    }

    const statusCode = err.statusCode || httpStatus.INTERNAL_SERVER_ERROR;
    const message = err.message || 'Internal Server Error';

    httpResponse.error(res, message, statusCode);
});

module.exports = app;
