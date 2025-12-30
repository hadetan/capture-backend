const { ApiError, consts } = require('../utils');
const { getSupabaseClient } = require('../config/supabase');
const { getPrismaClient } = require('../config/prisma');
const { validateSchema } = require('../utils/custom.validation');
const { metadataSchema } = require('./auth.validation');

const { httpStatus } = consts;

const hasNonEmptyString = (value) => typeof value === 'string' && value.trim().length > 0;

const hasValidDate = (value) => value instanceof Date || (typeof value === 'string' && value.trim().length > 0);

const hasNonNegativeInteger = (value) => Number.isInteger(value) && value >= 0;

const isProfileComplete = (profile = {}) => {
    if (!profile || typeof profile !== 'object') {
        return false;
    }

    const hasName = hasNonEmptyString(profile.name);
    const hasGender = hasNonEmptyString(profile.gender);
    const hasDob = hasValidDate(profile.dob);
    const hasHeightFeet = hasNonNegativeInteger(profile.heightFeet);
    const hasHeightInches = hasNonNegativeInteger(profile.heightInches);
    const hasHeight =
        hasHeightFeet &&
        hasHeightInches &&
        ((profile.heightFeet ?? 0) > 0 || (profile.heightInches ?? 0) > 0);
    const hasReligion = hasNonEmptyString(profile.religion);
    const hasCaste = hasNonEmptyString(profile.caste);
    const hasRashi = hasNonEmptyString(profile.rashi);

    return hasName && hasGender && hasDob && hasHeight && hasReligion && hasCaste && hasRashi;
};

const sanitizeMetadata = (metadata = {}) => {
    if (!metadata || typeof metadata !== 'object') {
        return {};
    }

    return validateSchema(metadataSchema, metadata);
};

const buildUserPayload = (user = {}, metadata = {}) => {
    if (!user?.id || !user?.email) {
        return null;
    }

    const sanitizedMetadata = sanitizeMetadata(metadata);

    const payload = {
        id: user.id,
        email: user.email,
        ...sanitizedMetadata,
    };

    return payload;
};

const upsertUserProfile = async (user, metadata = {}) => {
    const prisma = getPrismaClient();
    const payload = buildUserPayload(user, metadata);

    if (!payload) {
        return null;
    }

    const { id, ...rest } = payload;

    try {
        return await prisma.user.upsert({
            where: { id },
            create: payload,
            update: rest,
        });
    } catch (error) {
        if (error instanceof ApiError) {
            throw error;
        }
        throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Failed to synchronize user profile');
    }
};

const getUserProfile = async (id) => {
    if (!id) {
        return null;
    }
    const prisma = getPrismaClient();

    return prisma.user.findUnique({ where: { id } });
};

const toApiError = (error, fallbackStatus) => {
    const status = error?.status || fallbackStatus || httpStatus.BAD_REQUEST;
    const message = error?.message || 'Supabase request failed';

    return new ApiError(status, message);
};

const normalizeAuthResponse = (session = null, userProfile = null) => ({
    user: userProfile,
    session,
    profileComplete: isProfileComplete(userProfile),
});

const register = async ({ email, password, metadata }) => {
    const sanitizedMetadata = sanitizeMetadata(metadata);
    const client = getSupabaseClient();
    const { data, error } = await client.auth.signUp({
        email,
        password,
        options: Object.keys(sanitizedMetadata).length ? { data: sanitizedMetadata } : undefined,
    });

    if (error) {
        throw toApiError(error, httpStatus.BAD_REQUEST);
    }

    const profile = await upsertUserProfile(data?.user, sanitizedMetadata);

    if (!profile) {
        throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Failed to create user profile');
    }

    return normalizeAuthResponse(data?.session ?? null, profile);
};

const login = async ({ email, password }) => {
    const client = getSupabaseClient();
    const { data, error } = await client.auth.signInWithPassword({
        email,
        password,
    });

    if (error) {
        throw toApiError(error, httpStatus.UNAUTHORIZED);
    }

    if (!data?.user) {
        throw new ApiError(httpStatus.NOT_FOUND, 'User account not found');
    }

    const metadata = data?.user?.user_metadata || {};
    const profile = await upsertUserProfile(data.user, metadata);
    const existingProfile = profile ?? (await getUserProfile(data.user.id));

    if (!existingProfile) {
        throw new ApiError(httpStatus.NOT_FOUND, 'User profile not found');
    }

    return normalizeAuthResponse(data.session ?? null, existingProfile);
};

const logout = async (refreshToken) => {
    const client = getSupabaseClient();
    const { error } = await client.auth.signOut({ refreshToken });

    if (error) {
        throw toApiError(error, httpStatus.BAD_REQUEST);
    }
};

const refreshSession = async (refreshToken) => {
    const client = getSupabaseClient();
    const { data, error } = await client.auth.refreshSession({ refresh_token: refreshToken });

    if (error) {
        throw toApiError(error, httpStatus.UNAUTHORIZED);
    }

    const metadata = data?.user?.user_metadata || {};
    const profile = (await getUserProfile(data?.user?.id)) || (await upsertUserProfile(data?.user, metadata));

    if (!profile) {
        throw new ApiError(httpStatus.NOT_FOUND, 'User profile not found');
    }

    return normalizeAuthResponse(data?.session ?? null, profile);
};

const updateProfile = async (authUser, metadata = {}) => {
    if (!authUser?.id || !authUser?.email) {
        throw new ApiError(httpStatus.UNAUTHORIZED, 'User context missing');
    }

    const sanitizedMetadata = sanitizeMetadata(metadata);

    if (!Object.keys(sanitizedMetadata).length) {
        throw new ApiError(httpStatus.BAD_REQUEST, 'No profile data provided');
    }

    const client = getSupabaseClient();
    const mergedMetadata = {
        ...(authUser.user_metadata || {}),
        ...sanitizedMetadata,
    };

    const { error } = await client.auth.admin.updateUserById(authUser.id, {
        user_metadata: mergedMetadata,
    });

    if (error) {
        throw toApiError(error, httpStatus.BAD_REQUEST);
    }

    const updatedProfile = await upsertUserProfile(
        {
            id: authUser.id,
            email: authUser.email,
        },
        mergedMetadata
    );

    if (!updatedProfile) {
        throw new ApiError(httpStatus.NOT_FOUND, 'User profile not found');
    }

    return normalizeAuthResponse(null, updatedProfile);
};

module.exports = {
    register,
    login,
    logout,
    refreshSession,
    updateProfile,
    isProfileComplete,
};
