const Joi = require('joi');
const { validateSchema } = require('../utils/custom.validation');

const googleSessionSchema = Joi.object({
    accessToken: Joi.string().trim().required(),
    refreshToken: Joi.string().trim().required(),
    expiresIn: Joi.number().integer().positive().required(),
    tokenType: Joi.string().trim().default('bearer'),
}).required();

const refreshSessionSchema = Joi.object({
    refreshToken: Joi.string().trim(),
}).unknown(false);

const validateRefreshSession = (req, _res, next) => {
    try {
        req.body = validateSchema(refreshSessionSchema, req.body || {});
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
    validateRefreshSession
};
