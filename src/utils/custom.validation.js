const ApiError = require('./ApiError');
const { httpStatus } = require('./const');

/* Helper to validate Joi schemas and throw ApiError with combined message */
const validateSchema = (schema, payload = {}) => {
    // Accepts a Joi schema and payload; throws ApiError on validation failure
    const { error, value } = schema.validate(payload, { abortEarly: false, stripUnknown: true });

    if (error) {
        const message = error.details.map((d) => d.message).join(', ');

        throw new ApiError(httpStatus.UNPROCESSABLE_ENTITY, message);
    }

    return value;
};

module.exports = { validateSchema };
