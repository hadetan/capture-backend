const { httpStatus } = require('./const');

/* Standardized HTTP response helpers */

const success = (res, data = null, message = 'Success', statusCode = httpStatus.OK) =>
    res.status(statusCode).json({ success: true, message, data });

const created = (res, data = null, message = 'Created') =>
    success(res, data, message, httpStatus.CREATED);

const error = (res, message = 'Error', statusCode = httpStatus.INTERNAL_SERVER_ERROR) =>
    res.status(statusCode).json({ success: false, message });

const paginated = (res, data = [], meta = {}, message = 'Success') =>
    res.status(httpStatus.OK).json({ success: true, message, meta, data });

module.exports = {
    success,
    created,
    error,
    paginated,
};
