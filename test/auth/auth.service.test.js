const { register, login, logout, refreshSession, updateProfile } = require('../../src/auth/auth.service');
const { ApiError } = require('../../src/utils');

jest.mock('../../src/config/supabase', () => ({
    getSupabaseClient: jest.fn(),
}));

jest.mock('../../src/config/prisma', () => ({
    getPrismaClient: jest.fn(),
}));

const { getSupabaseClient } = require('../../src/config/supabase');
const { getPrismaClient } = require('../../src/config/prisma');

describe('Auth Service', () => {
    let mockAuth;
    let mockPrisma;

    beforeEach(() => {
        mockAuth = {
            signUp: jest.fn(),
            signInWithPassword: jest.fn(),
            signOut: jest.fn(),
            refreshSession: jest.fn(),
            admin: {
                updateUserById: jest.fn(),
            },
        };

        getSupabaseClient.mockReturnValue({ auth: mockAuth });

        mockPrisma = {
            user: {
                upsert: jest.fn(),
                findUnique: jest.fn(),
            },
        };

        getPrismaClient.mockReturnValue(mockPrisma);
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('register', () => {
        it('registers a user and returns session data', async () => {
            const response = {
                user: { id: 'user-123', email: 'user@example.com' },
                session: { refresh_token: 'refresh', access_token: 'access', expires_in: 3600, token_type: 'bearer' },
            };
            const persistedUser = { id: 'user-123', email: 'user@example.com', name: 'Test' };

            mockAuth.signUp.mockResolvedValue({ data: response, error: null });
            mockPrisma.user.upsert.mockResolvedValue(persistedUser);

            const result = await register({ email: 'user@example.com', password: 'Password123', metadata: { name: 'Test' } });

            expect(mockAuth.signUp).toHaveBeenCalledWith({
                email: 'user@example.com',
                password: 'Password123',
                options: { data: { name: 'Test' } },
            });
            expect(mockPrisma.user.upsert).toHaveBeenCalledWith({
                where: { id: 'user-123' },
                create: { id: 'user-123', email: 'user@example.com', name: 'Test' },
                update: { email: 'user@example.com', name: 'Test' },
            });
            expect(result).toMatchObject({ user: persistedUser, session: response.session, profileComplete: false });
        });

        it('throws ApiError when Supabase returns error', async () => {
            mockAuth.signUp.mockResolvedValue({ data: null, error: { message: 'Invalid', status: 400 } });

            await expect(register({ email: 'user@example.com', password: 'Password123' })).rejects.toBeInstanceOf(ApiError);
            expect(mockAuth.signUp).toHaveBeenCalled();
        });
    });

    describe('login', () => {
        it('logs in a user with valid credentials', async () => {
            const response = {
                user: { id: 'user-123', email: 'user@example.com', user_metadata: { name: 'Login User' } },
                session: { refresh_token: 'refresh', access_token: 'access', expires_in: 3600, token_type: 'bearer' },
            };
            const persistedUser = { id: 'user-123', email: 'user@example.com', name: 'Login User' };

            mockAuth.signInWithPassword.mockResolvedValue({ data: response, error: null });
            mockPrisma.user.upsert.mockResolvedValue(persistedUser);

            const result = await login({ email: 'user@example.com', password: 'Password123' });

            expect(mockAuth.signInWithPassword).toHaveBeenCalledWith({
                email: 'user@example.com',
                password: 'Password123',
            });
            expect(mockPrisma.user.upsert).toHaveBeenCalledWith({
                where: { id: 'user-123' },
                create: { id: 'user-123', email: 'user@example.com', name: 'Login User' },
                update: { email: 'user@example.com', name: 'Login User' },
            });
            expect(result).toMatchObject({ user: persistedUser, session: response.session, profileComplete: false });
        });

        it('uses existing profile when upsert returns nothing', async () => {
            const response = {
                user: { id: 'user-456', email: 'persisted@example.com', user_metadata: { name: 'Existing' } },
                session: { refresh_token: 'refresh', access_token: 'access', expires_in: 3600, token_type: 'bearer' },
            };
            const existingProfile = { id: 'user-456', email: 'persisted@example.com', name: 'Existing' };

            mockAuth.signInWithPassword.mockResolvedValue({ data: response, error: null });
            mockPrisma.user.upsert.mockResolvedValue(null);
            mockPrisma.user.findUnique.mockResolvedValue(existingProfile);

            const result = await login({ email: 'persisted@example.com', password: 'Password123' });

            expect(mockPrisma.user.findUnique).toHaveBeenCalledWith({ where: { id: 'user-456' } });
            expect(result).toMatchObject({ user: existingProfile, session: response.session, profileComplete: false });
        });

        it('throws ApiError when profile is missing after login', async () => {
            const response = {
                user: { id: 'user-789', email: 'missing@example.com', user_metadata: {} },
                session: { refresh_token: 'refresh', access_token: 'access', expires_in: 3600, token_type: 'bearer' },
            };

            mockAuth.signInWithPassword.mockResolvedValue({ data: response, error: null });
            mockPrisma.user.upsert.mockResolvedValue(null);
            mockPrisma.user.findUnique.mockResolvedValue(null);

            await expect(login({ email: 'missing@example.com', password: 'Password123' })).rejects.toBeInstanceOf(ApiError);
        });

        it('throws ApiError on invalid credentials', async () => {
            mockAuth.signInWithPassword.mockResolvedValue({ data: null, error: { message: 'Invalid login', status: 401 } });

            await expect(login({ email: 'user@example.com', password: 'wrong' })).rejects.toBeInstanceOf(ApiError);
        });
    });

    describe('logout', () => {
        it('logs out via Supabase with refresh token', async () => {
            mockAuth.signOut.mockResolvedValue({ error: null });

            await expect(logout('refresh-token')).resolves.toBeUndefined();
            expect(mockAuth.signOut).toHaveBeenCalledWith({ refreshToken: 'refresh-token' });
        });

        it('throws ApiError when Supabase logout fails', async () => {
            mockAuth.signOut.mockResolvedValue({ error: { message: 'Failed to logout', status: 400 } });

            await expect(logout('refresh-token')).rejects.toBeInstanceOf(ApiError);
        });
    });

    describe('refreshSession', () => {
        it('refreshes a session using refresh token', async () => {
            const response = {
                user: { id: 'user-123', email: 'user@example.com', user_metadata: { name: 'User' } },
                session: { refresh_token: 'refresh-2', access_token: 'access-2', expires_in: 3600, token_type: 'bearer' },
            };
            const persistedUser = { id: 'user-123', email: 'user@example.com', name: 'User' };

            mockAuth.refreshSession.mockResolvedValue({ data: response, error: null });
            mockPrisma.user.findUnique.mockResolvedValue(persistedUser);

            const result = await refreshSession('refresh');

            expect(mockAuth.refreshSession).toHaveBeenCalledWith({ refresh_token: 'refresh' });
            expect(mockPrisma.user.findUnique).toHaveBeenCalledWith({ where: { id: 'user-123' } });
            expect(result).toMatchObject({ user: persistedUser, session: response.session, profileComplete: false });
        });

        it('throws ApiError when refreshed profile is missing', async () => {
            const response = {
                user: { id: 'user-999', email: 'user@example.com', user_metadata: {} },
                session: { refresh_token: 'refresh-2', access_token: 'access-2', expires_in: 3600, token_type: 'bearer' },
            };

            mockAuth.refreshSession.mockResolvedValue({ data: response, error: null });
            mockPrisma.user.findUnique.mockResolvedValue(null);
            mockPrisma.user.upsert = jest.fn().mockResolvedValue(null);

            await expect(refreshSession('refresh')).rejects.toBeInstanceOf(ApiError);
        });

        it('throws ApiError on refresh failure', async () => {
            mockAuth.refreshSession.mockResolvedValue({ data: null, error: { message: 'Expired', status: 401 } });

            await expect(refreshSession('bad-token')).rejects.toBeInstanceOf(ApiError);
        });
    });

    describe('updateProfile', () => {
        const authUser = {
            id: 'user-123',
            email: 'user@example.com',
            user_metadata: {
                name: 'Existing User',
                gender: 'male',
                dob: '1990-01-01',
                heightFeet: 5,
                heightInches: 6,
                religion: 'hindu',
                caste: 'brahmin',
                rashi: 'aries',
            },
        };

        const payload = {
            name: 'Updated User',
            gender: 'female',
            dob: '1991-02-02',
            heightFeet: 0,
            heightInches: 5,
            religion: 'jain',
            caste: 'brahmin',
            rashi: 'taurus',
            education: 'B.Tech',
        };

        it('merges metadata and upserts profile', async () => {
            const updatedProfile = {
                id: 'user-123',
                email: 'user@example.com',
                name: 'Updated User',
                gender: 'female',
                dob: new Date('1991-02-02T00:00:00.000Z'),
                heightFeet: 0,
                heightInches: 5,
                religion: 'jain',
                caste: 'brahmin',
                rashi: 'taurus',
                education: 'B.Tech',
            };

            mockAuth.admin.updateUserById.mockResolvedValue({ error: null });
            mockPrisma.user.upsert.mockResolvedValue(updatedProfile);

            const result = await updateProfile(authUser, payload);

            expect(mockAuth.admin.updateUserById).toHaveBeenCalledWith('user-123', {
                user_metadata: expect.objectContaining({
                    name: 'Updated User',
                    gender: 'female',
                    rashi: 'taurus',
                    education: 'B.Tech',
                }),
            });
            expect(mockPrisma.user.upsert).toHaveBeenCalledWith({
                where: { id: 'user-123' },
                create: expect.objectContaining({
                    id: 'user-123',
                    email: 'user@example.com',
                    name: 'Updated User',
                    gender: 'female',
                    heightFeet: 0,
                    heightInches: 5,
                    religion: 'jain',
                    caste: 'brahmin',
                    rashi: 'taurus',
                }),
                update: expect.objectContaining({
                    email: 'user@example.com',
                    name: 'Updated User',
                    gender: 'female',
                    heightFeet: 0,
                    heightInches: 5,
                    religion: 'jain',
                    caste: 'brahmin',
                    rashi: 'taurus',
                }),
            });
            expect(result).toMatchObject({ user: updatedProfile, session: null, profileComplete: true });
        });

        it('throws when no metadata provided', async () => {
            await expect(updateProfile(authUser, {})).rejects.toBeInstanceOf(ApiError);
            expect(mockAuth.admin.updateUserById).not.toHaveBeenCalled();
        });

        it('throws when Supabase update fails', async () => {
            mockAuth.admin.updateUserById.mockResolvedValue({ error: { message: 'failure', status: 400 } });

            await expect(updateProfile(authUser, payload)).rejects.toBeInstanceOf(ApiError);
            expect(mockPrisma.user.upsert).not.toHaveBeenCalled();
        });
    });
});
