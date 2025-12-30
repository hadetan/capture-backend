const Joi = require('joi');
const { validateSchema } = require('../utils/custom.validation');

const googleSessionSchema = Joi.object({
    accessToken: Joi.string().trim().required(),
    refreshToken: Joi.string().trim().required(),
    expiresIn: Joi.number().integer().positive().required(),
    tokenType: Joi.string().trim().default('bearer'),
}).required();

const REFRESH_COOKIE_NAME = 'sb-refresh-token';

const refreshSessionSchema = Joi.object({
    refreshToken: Joi.string().trim().required(),
}).unknown(false);

const validateRefreshSession = (req, _res, next) => {
    try {
        const body = req.body || {};
        const hasBodyToken = typeof body.refreshToken === 'string' && body.refreshToken.trim().length > 0;
        const hasCookieToken = typeof req.cookies?.[REFRESH_COOKIE_NAME] === 'string';

        if (!hasBodyToken && hasCookieToken) {
            req.body = {};

            return next();
        }

        req.body = validateSchema(refreshSessionSchema, body);
        next();
    } catch (error) {
        next(error);
    }
};

const emptyBodySchema = Joi.object({}).max(0);

const validateGoogleSession = (req, _res, next) => {
    try {
        req.body = validateSchema(googleSessionSchema, req.body);
        next();
    } catch (error) {
        next(error);
    }
};

const validateEmptyBody = (req, _res, next) => {
    try {
        req.body = validateSchema(emptyBodySchema, req.body || {});
        next();
    } catch (error) {
        next(error);
    }
};

module.exports = {
    validateGoogleSession,
    validateEmptyBody,
    validateRefreshSession,
};
