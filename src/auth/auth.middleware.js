const { ApiError, consts } = require('../utils');
const { getSupabaseClient } = require('../config/supabase');

const { httpStatus } = consts;

const ACCESS_COOKIE_NAME = 'sb-access-token';

const extractBearerToken = (authorizationHeader = '') => {
    if (typeof authorizationHeader !== 'string') {
        return null;
    }

    const match = authorizationHeader.match(/^Bearer\s+(.+)$/i);

    if (!match || !match[1]) {
        return null;
    }

    return match[1].trim();
};

const getAccessTokenFromRequest = (req) => {
    const headerToken = extractBearerToken(req.headers?.authorization);

    if (headerToken) {
        return headerToken;
    }

    const cookieToken = req.cookies?.[ACCESS_COOKIE_NAME];

    if (typeof cookieToken === 'string' && cookieToken.trim().length) {
        return cookieToken.trim();
    }

    return null;
};

const authenticate = async (req, _res, next) => {
    try {
        const token = getAccessTokenFromRequest(req);

        if (!token) {
            throw new ApiError(httpStatus.UNAUTHORIZED, 'Access token missing');
        }

        const client = getSupabaseClient();
        const { data, error } = await client.auth.getUser(token);

        if (error || !data?.user) {
            throw new ApiError(httpStatus.UNAUTHORIZED, 'Invalid or expired access token');
        }

        req.authUser = data.user;
        req.accessToken = token;
        next();
    } catch (error) {
        if (error instanceof ApiError) {
            return next(error);
        }

        next(new ApiError(httpStatus.UNAUTHORIZED, 'Unauthorized'));
    }
};

module.exports = { authenticate, extractBearerToken, getAccessTokenFromRequest };
