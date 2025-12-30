const loadUtils = () => require('../../src/utils');

const setup = (settingsOverrides = {}) => {
    jest.resetModules();

    jest.doMock('../../src/config/supabase', () => ({
        getSupabaseClient: jest.fn(),
    }));

    jest.doMock('../../src/config/prisma', () => ({
        getPrismaClient: jest.fn(),
    }));

    const service = require('../../src/auth/auth.service');
    const { getSupabaseClient } = require('../../src/config/supabase');
    const { getPrismaClient } = require('../../src/config/prisma');

    const defaultSettings = {
        external: { google: { enabled: true } },
        jwt_expiry: 18000,
        refresh_token_expiry: 2592000,
    };

    const mergedSettings = {
        ...defaultSettings,
        ...settingsOverrides,
        external: {
            google: {
                enabled:
                    settingsOverrides?.external?.google?.enabled ?? defaultSettings.external.google.enabled,
            },
        },
    };

    const mockGetSettings = jest.fn().mockResolvedValue({ data: { settings: mergedSettings }, error: null });
    const mockGetUser = jest.fn();
    const mockRefreshSession = jest.fn();
    const mockAdminSignOut = jest.fn().mockResolvedValue({ error: null });

    getSupabaseClient.mockReturnValue({
        auth: {
            getUser: mockGetUser,
            refreshSession: mockRefreshSession,
            admin: {
                getSettings: mockGetSettings,
                signOut: mockAdminSignOut,
            },
        },
    });

    const mockPrisma = {
        user: {
            findUnique: jest.fn(),
            upsert: jest.fn(),
            update: jest.fn(),
        },
    };

    getPrismaClient.mockReturnValue(mockPrisma);

    return {
        service,
        getSupabaseClient,
        getPrismaClient,
        mockGetSettings,
        mockGetUser,
        mockAdminSignOut,
        mockPrisma,
        mockRefreshSession,
    };
};

describe('Auth Service', () => {
    afterEach(() => {
        jest.clearAllMocks();
    });

    const buildSupabaseUser = (overrides = {}) => ({
        id: 'supabase-user-id',
        email: 'user@example.com',
        app_metadata: { provider: 'google', provider_id: 'google|sub-123' },
        user_metadata: {
            full_name: 'Test User',
            avatar_url: 'https://example.com/avatar.png',
            locale: 'IN',
        },
        last_sign_in_at: '2025-12-30T00:00:00.000Z',
        identities: [
            {
                provider: 'google',
                identity_data: { sub: 'sub-123' },
            },
        ],
        ...overrides,
    });

    describe('consumeGoogleSession', () => {
        it('upserts user and returns normalized payload', async () => {
            const {
                service: { consumeGoogleSession },
                mockGetUser,
                mockPrisma,
                mockGetSettings,
            } = setup();

            const supabaseUser = buildSupabaseUser();
            const prismaUser = {
                id: 'local-user-id',
                email: supabaseUser.email,
                fullName: 'Test User',
                avatarUrl: 'https://example.com/avatar.png',
                countryCode: 'IN',
                trialStatus: 'ELIGIBLE',
                trialEndsAt: null,
                trialUsageSeconds: 0,
                trialUsageCapSeconds: null,
                nextUsageResetAt: null,
                subscription: null,
                lastLoginAt: new Date('2025-12-30T00:00:00.000Z'),
            };

            mockGetUser.mockResolvedValue({ data: { user: supabaseUser }, error: null });
            mockPrisma.user.findUnique.mockResolvedValue(null);
            mockPrisma.user.upsert.mockResolvedValue(prismaUser);

            const result = await consumeGoogleSession({
                accessToken: 'access-token',
                refreshToken: 'refresh-token',
                expiresIn: 3600,
                tokenType: 'bearer',
            });

            expect(mockGetSettings).toHaveBeenCalledTimes(1);
            expect(mockGetUser).toHaveBeenCalledWith('access-token');
            expect(mockPrisma.user.upsert).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: { supabaseUserId: supabaseUser.id },
                    include: { subscription: true },
                })
            );
            expect(result).toEqual({
                user: {
                    id: 'local-user-id',
                    email: 'user@example.com',
                    fullName: 'Test User',
                    avatarUrl: 'https://example.com/avatar.png',
                    countryCode: 'IN',
                    trialStatus: 'ELIGIBLE',
                    trialEndsAt: null,
                    trialUsageSeconds: 0,
                    trialUsageCapSeconds: null,
                    nextUsageResetAt: null,
                    subscription: null,
                    lastLoginAt: prismaUser.lastLoginAt,
                },
                supabaseUser,
                session: {
                    accessToken: 'access-token',
                    refreshToken: 'refresh-token',
                    expiresIn: 3600,
                    refreshExpiresIn: 2592000,
                    tokenType: 'bearer',
                },
                profileComplete: true,
                isNewUser: true,
            });
        });

        it('flags returning users correctly', async () => {
            const {
                service: { consumeGoogleSession },
                mockGetUser,
                mockPrisma,
            } = setup();

            const supabaseUser = buildSupabaseUser();
            const existingUser = { id: 'existing', fullName: 'Old User', subscription: null };

            mockGetUser.mockResolvedValue({ data: { user: supabaseUser }, error: null });
            mockPrisma.user.findUnique.mockResolvedValue(existingUser);
            mockPrisma.user.upsert.mockResolvedValue({ ...existingUser, email: supabaseUser.email });

            const result = await consumeGoogleSession({
                accessToken: 'access',
                refreshToken: 'refresh',
                expiresIn: 3600,
                tokenType: 'bearer',
            });

            expect(result.session.refreshExpiresIn).toBe(2592000);
            expect(result.isNewUser).toBe(false);
        });

        it('throws when Google provider disabled', async () => {
            const {
                service: { consumeGoogleSession },
                mockGetUser,
            } = setup({ external: { google: { enabled: false } } });

            mockGetUser.mockResolvedValue({ data: { user: buildSupabaseUser() }, error: null });

            await expect(
                consumeGoogleSession({ accessToken: 'token', refreshToken: 'refresh', expiresIn: 3600, tokenType: 'bearer' })
            ).rejects.toThrow('Google authentication is not enabled in Supabase');
        });

        it('rejects when token ttl exceeds maximum', async () => {
            const {
                service: { consumeGoogleSession },
                mockGetUser,
            } = setup();

            mockGetUser.mockResolvedValue({ data: { user: buildSupabaseUser() }, error: null });

            await expect(
                consumeGoogleSession({ accessToken: 'token', refreshToken: 'refresh', expiresIn: 19000, tokenType: 'bearer' })
            ).rejects.toThrow('Access token lifetime exceeds supported maximum');
        });

        it('rejects non-Google providers', async () => {
            const {
                service: { consumeGoogleSession },
                mockGetUser,
            } = setup();

            mockGetUser.mockResolvedValue({ data: { user: buildSupabaseUser({ app_metadata: { provider: 'github' } }) }, error: null });

            await expect(
                consumeGoogleSession({ accessToken: 'token', refreshToken: 'refresh', expiresIn: 3600, tokenType: 'bearer' })
            ).rejects.toThrow('Only Google sign-ins are supported');
        });

        it('rejects when Google identity missing', async () => {
            const {
                service: { consumeGoogleSession },
                mockGetUser,
            } = setup();

            mockGetUser.mockResolvedValue({ data: { user: buildSupabaseUser({ identities: [] }) }, error: null });

            await expect(
                consumeGoogleSession({ accessToken: 'token', refreshToken: 'refresh', expiresIn: 3600, tokenType: 'bearer' })
            ).rejects.toThrow('Google identity is not linked to this user');
        });

        it('propagates Supabase getUser failures', async () => {
            const {
                service: { consumeGoogleSession },
                mockGetUser,
            } = setup();

            mockGetUser.mockResolvedValue({ data: { user: null }, error: { message: 'Expired', status: 401 } });

            await expect(
                consumeGoogleSession({ accessToken: 'token', refreshToken: 'refresh', expiresIn: 3600, tokenType: 'bearer' })
            ).rejects.toThrow('Invalid or expired Supabase access token');
        });
    });

    describe('logout', () => {
        it('signs out user via Supabase admin', async () => {
            const {
                service: { logout },
                mockAdminSignOut,
            } = setup();

            await expect(logout({ id: 'supabase-user-id' })).resolves.toBeUndefined();
            expect(mockAdminSignOut).toHaveBeenCalledWith('supabase-user-id');
        });

        it('throws when user context missing', async () => {
            const {
                service: { logout },
            } = setup();

            await expect(logout(null)).rejects.toBeInstanceOf(loadUtils().ApiError);
        });
    });

    describe('getProfile', () => {
        it('returns prisma user payload', async () => {
            const {
                service: { getProfile },
                mockPrisma,
            } = setup();

            const prismaUser = {
                id: 'local-user',
                email: 'user@example.com',
                fullName: 'Test User',
                avatarUrl: 'https://example.com/avatar.png',
                countryCode: 'IN',
                trialStatus: 'ELIGIBLE',
                trialEndsAt: null,
                trialUsageSeconds: 0,
                trialUsageCapSeconds: null,
                nextUsageResetAt: null,
                subscription: null,
                lastLoginAt: new Date(),
            };

            mockPrisma.user.findUnique.mockResolvedValue(prismaUser);

            const result = await getProfile({ id: 'supabase-user-id' });

            expect(mockPrisma.user.findUnique).toHaveBeenCalledWith({
                where: { supabaseUserId: 'supabase-user-id' },
                include: { subscription: true },
            });
            expect(result).toEqual({
                user: {
                    id: 'local-user',
                    email: 'user@example.com',
                    fullName: 'Test User',
                    avatarUrl: 'https://example.com/avatar.png',
                    countryCode: 'IN',
                    trialStatus: 'ELIGIBLE',
                    trialEndsAt: null,
                    trialUsageSeconds: 0,
                    trialUsageCapSeconds: null,
                    nextUsageResetAt: null,
                    subscription: null,
                    lastLoginAt: prismaUser.lastLoginAt,
                },
                profileComplete: true,
            });
        });

        it('throws when profile missing', async () => {
            const {
                service: { getProfile },
                mockPrisma,
            } = setup();

            mockPrisma.user.findUnique.mockResolvedValue(null);

            await expect(getProfile({ id: 'missing' })).rejects.toBeInstanceOf(loadUtils().ApiError);
        });

        it('throws when auth context missing', async () => {
            const {
                service: { getProfile },
            } = setup();

            await expect(getProfile(null)).rejects.toBeInstanceOf(loadUtils().ApiError);
        });
    });

    describe('isProfileComplete', () => {
        it('returns true when fullName present', () => {
            const {
                service: { isProfileComplete },
            } = setup();

            expect(isProfileComplete({ fullName: 'Name' })).toBe(true);
            expect(isProfileComplete({})).toBe(false);
        });
    });

    describe('refreshSession', () => {
        it('refreshes session and updates user record', async () => {
            const {
                service: { refreshSession },
                mockRefreshSession,
                mockPrisma,
                mockGetSettings,
            } = setup();

            const supabaseUser = buildSupabaseUser();
            const prismaUser = {
                id: 'local-user-id',
                email: supabaseUser.email,
                fullName: 'Test User',
                avatarUrl: 'https://example.com/avatar.png',
                countryCode: 'IN',
                trialStatus: 'ELIGIBLE',
                trialEndsAt: null,
                trialUsageSeconds: 0,
                trialUsageCapSeconds: null,
                nextUsageResetAt: null,
                subscription: null,
                lastLoginAt: new Date(),
            };

            mockPrisma.user.findUnique.mockResolvedValue(prismaUser);
            mockPrisma.user.update.mockResolvedValue(prismaUser);
            mockRefreshSession.mockResolvedValue({
                data: {
                    session: {
                        access_token: 'new-access',
                        refresh_token: 'new-refresh',
                        expires_in: 1800,
                        token_type: 'bearer',
                        user: supabaseUser,
                    },
                },
                error: null,
            });

            const result = await refreshSession({ refreshToken: 'refresh-token' });

            expect(mockGetSettings).toHaveBeenCalledTimes(1);
            expect(mockRefreshSession).toHaveBeenCalledWith({ refresh_token: 'refresh-token' });
            expect(mockPrisma.user.update).toHaveBeenCalledWith(
                expect.objectContaining({ where: { supabaseUserId: supabaseUser.id } })
            );
            expect(result.session).toEqual({
                accessToken: 'new-access',
                refreshToken: 'new-refresh',
                expiresIn: 1800,
                refreshExpiresIn: 2592000,
                tokenType: 'bearer',
            });
            expect(result.isNewUser).toBe(false);
        });

        it('throws when refresh token missing', async () => {
            const {
                service: { refreshSession },
            } = setup();

            await expect(refreshSession({})).rejects.toBeInstanceOf(loadUtils().ApiError);
        });

        it('throws when prisma record missing', async () => {
            const {
                service: { refreshSession },
                mockRefreshSession,
                mockPrisma,
            } = setup();

            mockPrisma.user.findUnique.mockResolvedValue(null);
            mockRefreshSession.mockResolvedValue({
                data: {
                    session: {
                        access_token: 'new-access',
                        refresh_token: 'new-refresh',
                        expires_in: 1800,
                        token_type: 'bearer',
                        user: buildSupabaseUser(),
                    },
                },
                error: null,
            });

            await expect(refreshSession({ refreshToken: 'refresh-token' })).rejects.toThrow(
                'User profile not found for refresh token'
            );
        });
    });
});
