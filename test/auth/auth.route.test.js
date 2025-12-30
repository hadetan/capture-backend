const request = require('supertest');
const app = require('../../src/app');

jest.mock('../../src/auth/auth.service', () => ({
    consumeGoogleSession: jest.fn(),
    logout: jest.fn(),
    getProfile: jest.fn(),
    refreshSession: jest.fn(),
}));

jest.mock('../../src/auth/auth.middleware', () => ({
    authenticate: jest.fn((req, _res, next) => {
        req.authUser = {
            id: 'user-123',
            email: 'user@example.com',
            user_metadata: {},
        };
        next();
    }),
}));

const authService = require('../../src/auth/auth.service');
const { authenticate } = require('../../src/auth/auth.middleware');
const { ApiError } = require('../../src/utils');
const { httpStatus } = require('../../src/utils/const');

describe('Auth Routes', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('POST /api/auth/google/session', () => {
        const payload = {
            accessToken: 'access-token',
            refreshToken: 'refresh-token',
            expiresIn: 3600,
            tokenType: 'bearer',
            refreshExpiresIn: 2592000,
        };

        it('creates new user session and sets cookie', async () => {
            authService.consumeGoogleSession.mockResolvedValue({
                user: { id: 'user-123' },
                session: payload,
                profileComplete: false,
                isNewUser: true,
            });

            const res = await request(app).post('/api/auth/google/session').send(payload);

            expect(res.status).toBe(201);
            expect(res.body).toEqual({
                success: true,
                message: 'Registered with Google',
                data: {
                    user: { id: 'user-123' },
                    session: {
                        accessToken: 'access-token',
                        expiresIn: 3600,
                        refreshExpiresIn: 2592000,
                        tokenType: 'bearer',
                    },
                    profileComplete: false,
                    isNewUser: true,
                },
            });
            expect(res.headers['set-cookie']).toEqual(
                expect.arrayContaining([
                    expect.stringMatching(/sb-access-token=;/),
                    expect.stringMatching(/sb-refresh-token=refresh-token/),
                ])
            );
            expect(authService.consumeGoogleSession).toHaveBeenCalledWith({
                accessToken: 'access-token',
                refreshToken: 'refresh-token',
                expiresIn: 3600,
                tokenType: 'bearer',
            });
        });

        it('returns 200 when existing user signs in', async () => {
            authService.consumeGoogleSession.mockResolvedValue({
                user: { id: 'user-456' },
                session: payload,
                profileComplete: true,
                isNewUser: false,
            });

            const res = await request(app).post('/api/auth/google/session').send(payload);

            expect(res.status).toBe(200);
            expect(res.body.message).toBe('Authenticated with Google');
        });

        it('returns 422 when payload invalid', async () => {
            const res = await request(app).post('/api/auth/google/session').send({});

            expect(res.status).toBe(422);
            expect(res.body.success).toBe(false);
            expect(authService.consumeGoogleSession).not.toHaveBeenCalled();
        });
    });

    describe('POST /api/auth/logout', () => {
        it('clears cookie and returns success', async () => {
            authService.logout.mockResolvedValue();

            const res = await request(app).post('/api/auth/logout').send({});

            expect(res.status).toBe(200);
            expect(res.body.message).toBe('Logged out');
            expect(res.headers['set-cookie']).toEqual(
                expect.arrayContaining([
                    expect.stringMatching(/sb-access-token=;/),
                    expect.stringMatching(/sb-refresh-token=;/),
                ])
            );
            expect(authService.logout).toHaveBeenCalledWith(
                expect.objectContaining({
                    id: 'user-123',
                })
            );
        });

        it('propagates auth errors before logout handler', async () => {
            const error = new ApiError(httpStatus.UNAUTHORIZED, 'Unauthorized');

            authenticate.mockImplementationOnce((_req, _res, next) => next(error));

            const res = await request(app).post('/api/auth/logout').send({});

            expect(res.status).toBe(401);
            expect(res.body.success).toBe(false);
            expect(authService.logout).not.toHaveBeenCalled();
        });
    });

    describe('GET /api/auth/me', () => {
        it('returns authenticated profile payload', async () => {
            authService.getProfile.mockResolvedValue({
                user: { id: 'user-123', fullName: 'Test User' },
                profileComplete: true,
            });

            const res = await request(app).get('/api/auth/me');

            expect(res.status).toBe(200);
            expect(res.body).toEqual({
                success: true,
                message: 'Profile retrieved',
                data: {
                    user: { id: 'user-123', fullName: 'Test User' },
                    profileComplete: true,
                },
            });
            expect(authService.getProfile).toHaveBeenCalledWith(
                expect.objectContaining({ id: 'user-123' })
            );
        });

        it('propagates upstream errors', async () => {
            const error = new ApiError(httpStatus.NOT_FOUND, 'Not found');

            authService.getProfile.mockRejectedValue(error);

            const res = await request(app).get('/api/auth/me');

            expect(res.status).toBe(404);
            expect(res.body.success).toBe(false);
            expect(res.body.message).toBe('Not found');
        });
    });

    describe('POST /api/auth/google/session/refresh', () => {
        it('refreshes session and sets cookies', async () => {
            authService.refreshSession.mockResolvedValue({
                user: { id: 'user-123' },
                session: {
                    accessToken: 'new-access',
                    refreshToken: 'new-refresh',
                    expiresIn: 1800,
                    refreshExpiresIn: 2592000,
                    tokenType: 'bearer',
                },
                profileComplete: true,
                isNewUser: false,
            });

            const res = await request(app)
                .post('/api/auth/google/session/refresh')
                .send({ refreshToken: 'refresh-token' });

            expect(res.status).toBe(200);
            expect(res.body).toEqual({
                success: true,
                message: 'Session refreshed',
                data: {
                    user: { id: 'user-123' },
                    session: {
                        accessToken: 'new-access',
                        expiresIn: 1800,
                        refreshExpiresIn: 2592000,
                        tokenType: 'bearer',
                    },
                    profileComplete: true,
                    isNewUser: false,
                },
            });
            expect(res.headers['set-cookie']).toEqual(
                expect.arrayContaining([
                    expect.stringMatching(/sb-access-token=;/),
                    expect.stringMatching(/sb-refresh-token=new-refresh/),
                ])
            );
            expect(authService.refreshSession).toHaveBeenCalledWith({ refreshToken: 'refresh-token' });
        });

        it('allows using refresh token from cookie', async () => {
            authService.refreshSession.mockResolvedValue({
                user: { id: 'user-123' },
                session: {
                    accessToken: 'cookie-access',
                    refreshToken: 'cookie-refresh',
                    expiresIn: 1800,
                    refreshExpiresIn: 2592000,
                    tokenType: 'bearer',
                },
                profileComplete: false,
                isNewUser: false,
            });

            const res = await request(app)
                .post('/api/auth/google/session/refresh')
                .set('Cookie', ['sb-refresh-token=existing-refresh'])
                .send({});

            expect(authService.refreshSession).toHaveBeenCalledWith({ refreshToken: 'existing-refresh' });
            expect(res.status).toBe(200);
        });
    });
});
