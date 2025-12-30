const Joi = require('joi');
const { Gender, Religion, Rashi, MaritalStatus, IndianState } = require('@prisma/client');
const { validateSchema } = require('../utils/custom.validation');

const ensureHeightNotZero = (value, helpers) => {
    const feet = value.heightFeet;
    const inches = value.heightInches;

    if (feet === undefined && inches === undefined) {
        return value;
    }

    if ((feet ?? 0) === 0 && (inches ?? 0) === 0) {
        return helpers.error('metadata.height.nonZero');
    }

    return value;
};

const metadataSchema = Joi.object({
    name: Joi.string().trim().min(1).optional(),
    gender: Joi.string().valid(...Object.values(Gender)).optional(),
    dob: Joi.date().iso().optional(),
    heightFeet: Joi.number().integer().min(0).max(8).optional(),
    heightInches: Joi.number().integer().min(0).max(11).optional(),
    religion: Joi.string().valid(...Object.values(Religion)).optional(),
    caste: Joi.string().trim().optional(),
    rashi: Joi.string().valid(...Object.values(Rashi)).optional(),
    education: Joi.string().trim().optional(),
    occupation: Joi.string().trim().optional(),
    annualIncome: Joi.number().integer().min(0).optional(),
    maritalStatus: Joi.string().valid(...Object.values(MaritalStatus)).optional(),
    homeAddress: Joi.string().trim().optional(),
    expectation: Joi.string().trim().optional(),
    city: Joi.string().trim().optional(),
    pincode: Joi.number().integer().min(100000).max(999999).optional(),
    state: Joi.string().valid(...Object.values(IndianState)).optional(),
    contactNumber: Joi.string().trim().optional(),
})
    .default({})
    .custom(ensureHeightNotZero, 'height must not be zero')
    .messages({
        'object.base': 'metadata must be an object',
        'metadata.height.nonZero': 'provide height in feet and/or inches',
    });

const requiredProfileFields = ['name', 'gender', 'dob', 'heightFeet', 'heightInches', 'religion', 'caste', 'rashi'];

const profileUpdateSchema = metadataSchema.fork(requiredProfileFields, (schema) => schema.required());

const registerSchema = Joi.object({
    email: Joi.string().email().required(),
    password: Joi.string().min(8).required(),
    metadata: metadataSchema,
});

const loginSchema = Joi.object({
    email: Joi.string().email().required(),
    password: Joi.string().min(8).required(),
});

const emptyBodySchema = Joi.object({}).max(0);

const validateRegister = (req, _res, next) => {
    try {
        req.body = validateSchema(registerSchema, req.body);
        next();
    } catch (error) {
        next(error);
    }
};

const validateLogin = (req, _res, next) => {
    try {
        req.body = validateSchema(loginSchema, req.body);
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

const validateProfileUpdate = (req, _res, next) => {
    try {
        req.body = validateSchema(profileUpdateSchema, req.body || {});
        next();
    } catch (error) {
        next(error);
    }
};

module.exports = {
    validateRegister,
    validateLogin,
    validateEmptyBody,
    metadataSchema,
    validateProfileUpdate,
};
