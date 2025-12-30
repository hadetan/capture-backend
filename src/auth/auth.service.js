const { ApiError, consts } = require('../utils');
const { getSupabaseClient } = require('../config/supabase');
const { getPrismaClient } = require('../config/prisma');

const { httpStatus } = consts;

const MAX_ACCESS_TOKEN_TTL_SECONDS = 5 * 60 * 60;
const MAX_REFRESH_TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60;

let googleProviderValidated = false;
let supabaseAuthSettings = null;

const toApiError = (error, fallbackStatus) => {
    const status = error?.status || fallbackStatus || httpStatus.BAD_REQUEST;
    const message = error?.message || 'Supabase request failed';

    return new ApiError(status, message);
};

const ensureGoogleProviderConfigured = async () => {
    if (googleProviderValidated) {
        return;
    }

    const client = getSupabaseClient();

    if (!client?.auth?.admin?.getSettings) {
        googleProviderValidated = true;

        return;
    }

    const { data, error } = await client.auth.admin.getSettings();

    if (error) {
        throw new ApiError(httpStatus.SERVICE_UNAVAILABLE, 'Unable to verify Supabase auth settings');
    }

    const settings = data?.settings || data || {};
    const googleEnabled = Boolean(settings?.external?.google?.enabled);

    if (!googleEnabled) {
        throw new ApiError(httpStatus.SERVICE_UNAVAILABLE, 'Google authentication is not enabled in Supabase');
    }

    const jwtExpiry = Number(settings?.jwt_expiry || settings?.jwtExpiry || 0);

    if (jwtExpiry && jwtExpiry > MAX_ACCESS_TOKEN_TTL_SECONDS) {
        throw new ApiError(httpStatus.SERVICE_UNAVAILABLE, 'Supabase access token lifetime exceeds 5 hours');
    }

    const refreshExpiry = Number(settings?.refresh_token_expiry || settings?.refreshTokenExpiry || 0);

    if (refreshExpiry && refreshExpiry > MAX_REFRESH_TOKEN_TTL_SECONDS) {
        throw new ApiError(httpStatus.SERVICE_UNAVAILABLE, 'Supabase refresh token lifetime exceeds 30 days');
    }

    supabaseAuthSettings = settings;
    googleProviderValidated = true;
};

const getRefreshTokenTtlSeconds = () => {
    const configuredTtl =
        Number(supabaseAuthSettings?.refresh_token_expiry ?? supabaseAuthSettings?.refreshTokenExpiry) ||
        MAX_REFRESH_TOKEN_TTL_SECONDS;

    return Math.min(configuredTtl, MAX_REFRESH_TOKEN_TTL_SECONDS);
};

const extractGoogleIdentity = (supabaseUser) => {
    const identities = Array.isArray(supabaseUser?.identities) ? supabaseUser.identities : [];

    return identities.find((identity) => identity?.provider === 'google') || null;
};

const extractGoogleSub = (supabaseUser, googleIdentity) => {
    return (
        googleIdentity?.identity_data?.sub ||
        supabaseUser?.app_metadata?.provider_id ||
        supabaseUser?.user_metadata?.sub ||
        null
    );
};

const deriveFullName = (metadata = {}) => {
    if (metadata.full_name) {
        return metadata.full_name;
    }

    if (metadata.name) {
        return metadata.name;
    }

    const given = metadata.given_name || metadata.first_name;
    const family = metadata.family_name || metadata.last_name;

    if (given && family) {
        return `${given} ${family}`.trim();
    }

    if (given) {
        return given;
    }

    if (family) {
        return family;
    }

    return null;
};

const mapUserForPersistence = (supabaseUser, googleIdentity) => {
    if (!supabaseUser?.id || !supabaseUser?.email) {
        throw new ApiError(httpStatus.UNAUTHORIZED, 'Supabase user payload incomplete');
    }

    const googleSub = extractGoogleSub(supabaseUser, googleIdentity);

    if (!googleSub) {
        throw new ApiError(httpStatus.UNAUTHORIZED, 'Google identity is missing a subject identifier');
    }

    const metadata = supabaseUser.user_metadata || {};

    return {
        supabaseUserId: supabaseUser.id,
        email: supabaseUser.email,
        googleSub,
        fullName: deriveFullName(metadata),
        avatarUrl: metadata.avatar_url || metadata.picture || null,
        countryCode: metadata.locale || metadata.country || null,
        lastLoginAt: supabaseUser.last_sign_in_at ? new Date(supabaseUser.last_sign_in_at) : new Date(),
    };
};

const presentUser = (user) => {
    if (!user) {
        return null;
    }

    const {
        id,
        email,
        fullName,
        avatarUrl,
        countryCode,
        trialStatus,
        trialEndsAt,
        trialUsageSeconds,
        trialUsageCapSeconds,
        subscription,
        lastLoginAt,
        nextUsageResetAt,
    } = user;

    return {
        id,
        email,
        fullName,
        avatarUrl,
        countryCode,
        trialStatus,
        trialEndsAt,
        trialUsageSeconds,
        trialUsageCapSeconds,
        nextUsageResetAt,
        subscription,
        lastLoginAt,
    };
};

const isProfileComplete = (user) => Boolean(user?.fullName);

const consumeGoogleSession = async ({ accessToken, refreshToken, expiresIn, tokenType }) => {
    await ensureGoogleProviderConfigured();

    if (Number(expiresIn) > MAX_ACCESS_TOKEN_TTL_SECONDS) {
        throw new ApiError(httpStatus.BAD_REQUEST, 'Access token lifetime exceeds supported maximum');
    }

    const client = getSupabaseClient();
    const { data, error } = await client.auth.getUser(accessToken);

    if (error || !data?.user) {
        throw new ApiError(httpStatus.UNAUTHORIZED, 'Invalid or expired Supabase access token');
    }

    const supabaseUser = data.user;

    if (supabaseUser?.app_metadata?.provider !== 'google') {
        throw new ApiError(httpStatus.UNAUTHORIZED, 'Only Google sign-ins are supported');
    }

    const googleIdentity = extractGoogleIdentity(supabaseUser);

    if (!googleIdentity) {
        throw new ApiError(httpStatus.UNAUTHORIZED, 'Google identity is not linked to this user');
    }

    const prisma = getPrismaClient();
    const existingUser = await prisma.user.findUnique({
        where: { supabaseUserId: supabaseUser.id },
        include: { subscription: true },
    });

    const persistencePayload = mapUserForPersistence(supabaseUser, googleIdentity);

    const userRecord = await prisma.user.upsert({
        where: { supabaseUserId: supabaseUser.id },
        create: persistencePayload,
        update: {
            email: persistencePayload.email,
            googleSub: persistencePayload.googleSub,
            fullName: persistencePayload.fullName,
            avatarUrl: persistencePayload.avatarUrl,
            countryCode: persistencePayload.countryCode,
            lastLoginAt: persistencePayload.lastLoginAt,
        },
        include: { subscription: true },
    });

    return {
        user: presentUser(userRecord),
        supabaseUser,
        session: {
            accessToken,
            refreshToken,
            expiresIn,
            refreshExpiresIn: getRefreshTokenTtlSeconds(),
            tokenType: tokenType || 'bearer',
        },
        profileComplete: isProfileComplete(userRecord),
        isNewUser: !existingUser,
    };
};

const refreshSession = async ({ refreshToken }) => {
    await ensureGoogleProviderConfigured();

    if (!refreshToken || typeof refreshToken !== 'string' || !refreshToken.trim()) {
        throw new ApiError(httpStatus.UNAUTHORIZED, 'Refresh token missing');
    }

    const client = getSupabaseClient();
    const { data, error } = await client.auth.refreshSession({ refresh_token: refreshToken });

    if (error || !data?.session?.access_token || !data?.session?.user) {
        throw new ApiError(httpStatus.UNAUTHORIZED, 'Invalid or expired refresh token');
    }

    const session = data.session;
    const supabaseUser = session.user;

    if (Number(session.expires_in) > MAX_ACCESS_TOKEN_TTL_SECONDS) {
        throw new ApiError(httpStatus.BAD_REQUEST, 'Access token lifetime exceeds supported maximum');
    }

    if (supabaseUser?.app_metadata?.provider !== 'google') {
        throw new ApiError(httpStatus.UNAUTHORIZED, 'Only Google sign-ins are supported');
    }

    const googleIdentity = extractGoogleIdentity(supabaseUser);

    if (!googleIdentity) {
        throw new ApiError(httpStatus.UNAUTHORIZED, 'Google identity is not linked to this user');
    }

    const prisma = getPrismaClient();
    const existingUser = await prisma.user.findUnique({
        where: { supabaseUserId: supabaseUser.id },
        include: { subscription: true },
    });

    if (!existingUser) {
        throw new ApiError(httpStatus.UNAUTHORIZED, 'User profile not found for refresh token');
    }

    const persistencePayload = mapUserForPersistence(
        { ...supabaseUser, last_sign_in_at: new Date().toISOString() },
        googleIdentity
    );

    const userRecord = await prisma.user.update({
        where: { supabaseUserId: supabaseUser.id },
        data: {
            email: persistencePayload.email,
            googleSub: persistencePayload.googleSub,
            fullName: persistencePayload.fullName,
            avatarUrl: persistencePayload.avatarUrl,
            countryCode: persistencePayload.countryCode,
            lastLoginAt: persistencePayload.lastLoginAt,
        },
        include: { subscription: true },
    });

    return {
        user: presentUser(userRecord),
        supabaseUser,
        session: {
            accessToken: session.access_token,
            refreshToken: session.refresh_token || refreshToken,
            expiresIn: session.expires_in,
            refreshExpiresIn: getRefreshTokenTtlSeconds(),
            tokenType: session.token_type || 'bearer',
        },
        profileComplete: isProfileComplete(userRecord),
        isNewUser: false,
    };
};

const logout = async (context = {}) => {
    const { id, accessToken, refreshToken } = context || {};
    const supabaseUserId = typeof id === 'string' ? id.trim() : '';

    if (!supabaseUserId) {
        throw new ApiError(httpStatus.UNAUTHORIZED, 'User context missing');
    }

    const client = getSupabaseClient();
    const { error } = await client.auth.admin.signOut(supabaseUserId);

    if (error) {
        throw toApiError(error, httpStatus.BAD_REQUEST);
    }

    const hasToken = [accessToken, refreshToken].some((value) => typeof value === 'string' && value.trim().length);

    if (hasToken && client?.auth?.signOut) {
        try {
            await client.auth.signOut();
        } catch (signOutError) {
            // Swallow client-side sign out errors; admin signOut already succeeded.
        }
    }
};

const getProfile = async (authUser) => {
    if (!authUser?.id) {
        throw new ApiError(httpStatus.UNAUTHORIZED, 'User context missing');
    }

    const prisma = getPrismaClient();
    const user = await prisma.user.findUnique({
        where: { supabaseUserId: authUser.id },
        include: { subscription: true },
    });

    if (!user) {
        throw new ApiError(httpStatus.NOT_FOUND, 'User profile not found');
    }

    return {
        user: presentUser(user),
        profileComplete: isProfileComplete(user),
    };
};

module.exports = {
    consumeGoogleSession,
    logout,
    getProfile,
    isProfileComplete,
    refreshSession,
};
