const { ApiError, catchAsync, httpResponse, consts } = require('../utils');
const authService = require('./auth.service');

const { httpStatus } = consts;

const DEFAULT_REFRESH_MAX_AGE = 30 * 24 * 60 * 60; // seconds

const buildCookieOptions = () => ({
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/api',
    maxAge: DEFAULT_REFRESH_MAX_AGE * 1000,
});

const setRefreshCookie = (res, refreshToken) => {
    if (!refreshToken) {
        return;
    }
    res.cookie('refresh_token', refreshToken, buildCookieOptions());
};

const clearRefreshCookie = (res) => {
    res.clearCookie('refresh_token', {
        ...buildCookieOptions(),
        maxAge: 0,
    });
};

const createAuthPayload = (session, user, profileComplete) => ({
    user,
    accessToken: session?.access_token || null,
    expiresIn: session?.expires_in || null,
    tokenType: session?.token_type || null,
    profileComplete: Boolean(profileComplete),
});

const getRefreshTokenFromRequest = (req) => {
    const token = req.cookies?.refresh_token;

    if (!token) {
        throw new ApiError(httpStatus.UNAUTHORIZED, 'Refresh token missing');
    }

    return token;
};

const register = catchAsync(async (req, res) => {
    const { user, session, profileComplete } = await authService.register(req.body);

    setRefreshCookie(res, session?.refresh_token);

    httpResponse.created(
        res,
        createAuthPayload(session, user, profileComplete),
        session ? 'Registered' : 'Registered. Verification pending'
    );
});

const login = catchAsync(async (req, res) => {
    const { user, session, profileComplete } = await authService.login(req.body);

    setRefreshCookie(res, session?.refresh_token);

    httpResponse.success(res, createAuthPayload(session, user, profileComplete), 'Logged in');
});

const logout = catchAsync(async (req, res) => {
    const refreshToken = getRefreshTokenFromRequest(req);

    await authService.logout(refreshToken);
    clearRefreshCookie(res);
    httpResponse.success(res, null, 'Logged out');
});

const refresh = catchAsync(async (req, res) => {
    const refreshToken = getRefreshTokenFromRequest(req);
    const { user, session, profileComplete } = await authService.refreshSession(refreshToken);

    setRefreshCookie(res, session?.refresh_token);

    httpResponse.success(res, createAuthPayload(session, user, profileComplete), 'Session refreshed');
});

const updateProfile = catchAsync(async (req, res) => {
    const { user, profileComplete } = await authService.updateProfile(req.authUser, req.body);

    httpResponse.success(res, { user, profileComplete }, 'Profile updated');
});

module.exports = {
    register,
    login,
    logout,
    refresh,
    updateProfile,
};
