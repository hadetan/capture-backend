const { catchAsync, httpResponse } = require('../utils');
const authService = require('./auth.service');

const ACCESS_COOKIE_NAME = 'sb-access-token';
const REFRESH_COOKIE_NAME = 'sb-refresh-token';

const buildCookieOptions = (maxAgeMs) => ({
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/api',
    maxAge: maxAgeMs,
});

const clearAccessCookie = (res) => {
    res.clearCookie(ACCESS_COOKIE_NAME, {
        ...buildCookieOptions(0),
        maxAge: 0,
    });
};

const setRefreshCookie = (res, refreshToken, expiresInSeconds) => {
    if (!refreshToken || !expiresInSeconds) {
        return;
    }

    const maxAgeMs = Math.max(1000, Number(expiresInSeconds) * 1000);

    res.cookie(REFRESH_COOKIE_NAME, refreshToken, buildCookieOptions(maxAgeMs));
};

const clearRefreshCookie = (res) => {
    res.clearCookie(REFRESH_COOKIE_NAME, {
        ...buildCookieOptions(0),
        maxAge: 0,
    });
};

const setSessionCookies = (res, session) => {
    clearAccessCookie(res);
    setRefreshCookie(res, session?.refreshToken, session?.refreshExpiresIn);
};

const buildAuthResponse = ({ user, session, profileComplete, isNewUser }) => ({
    user,
    session: {
        accessToken: session?.accessToken ?? null,
        expiresIn: session?.expiresIn ?? null,
        refreshExpiresIn: session?.refreshExpiresIn ?? null,
        tokenType: session?.tokenType ?? null,
    },
    profileComplete: Boolean(profileComplete),
    isNewUser: Boolean(isNewUser),
});

const exchangeGoogleSession = catchAsync(async (req, res) => {
    const result = await authService.consumeGoogleSession(req.body);

    setSessionCookies(res, result.session);

    const responder = result.isNewUser ? httpResponse.created : httpResponse.success;
    const message = result.isNewUser ? 'Registered with Google' : 'Authenticated with Google';

    responder(res, buildAuthResponse(result), message);
});

const refreshSession = catchAsync(async (req, res) => {
    const refreshToken = req.body?.refreshToken || req.cookies?.[REFRESH_COOKIE_NAME];
    const result = await authService.refreshSession({ refreshToken });

    setSessionCookies(res, result.session);

    httpResponse.success(res, buildAuthResponse(result), 'Session refreshed');
});

const logout = catchAsync(async (req, res) => {
    const refreshToken = req.cookies?.[REFRESH_COOKIE_NAME];

    await authService.logout({
        authUser: req.authUser,
        accessToken: req.accessToken,
        refreshToken,
    });
    clearAccessCookie(res);
    clearRefreshCookie(res);
    httpResponse.success(res, null, 'Logged out');
});

const getProfile = catchAsync(async (req, res) => {
    const payload = await authService.getProfile(req.authUser);

    httpResponse.success(res, payload, 'Profile retrieved');
});

module.exports = {
    exchangeGoogleSession,
    logout,
    getProfile,
    refreshSession,
};
