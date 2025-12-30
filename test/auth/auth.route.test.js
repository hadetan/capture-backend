const request = require('supertest');
const app = require('../../src/app');

jest.mock('../../src/auth/auth.service', () => ({
    register: jest.fn(),
    login: jest.fn(),
    logout: jest.fn(),
    refreshSession: jest.fn(),
    updateProfile: jest.fn(),
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

    describe('POST /api/auth/register', () => {
        it('returns 201 with tokens and sets refresh cookie', async () => {
            authService.register.mockResolvedValue({
                user: { id: 'user-123' },
                session: {
                    refresh_token: 'refresh-token',
                    access_token: 'access-token',
                    expires_in: 3600,
                    token_type: 'bearer',
                },
                profileComplete: false,
            });

            const res = await request(app)
                .post('/api/auth/register')
                .send({ email: 'user@example.com', password: 'Password123', metadata: { name: 'Tester' } });

            expect(res.status).toBe(201);
            expect(res.body).toEqual({
                success: true,
                message: 'Registered',
                data: {
                    user: { id: 'user-123' },
                    accessToken: 'access-token',
                    expiresIn: 3600,
                    tokenType: 'bearer',
                    profileComplete: false,
                },
            });
            expect(res.headers['set-cookie'][0]).toMatch(/refresh_token=refresh-token/);
            expect(authService.register).toHaveBeenCalledWith({
                email: 'user@example.com',
                password: 'Password123',
                metadata: { name: 'Tester' },
            });
        });

        it('returns 422 when payload invalid', async () => {
            const res = await request(app).post('/api/auth/register').send({});

            expect(res.status).toBe(422);
            expect(res.body.success).toBe(false);
            expect(res.body.message).toBeDefined();
        });
    });

    describe('POST /api/auth/login', () => {
        it('returns 200 with tokens and sets cookie', async () => {
            authService.login.mockResolvedValue({
                user: { id: 'user-123' },
                session: {
                    refresh_token: 'refresh-token',
                    access_token: 'access-token',
                    expires_in: 3600,
                    token_type: 'bearer',
                },
                profileComplete: true,
            });

            const res = await request(app)
                .post('/api/auth/login')
                .send({ email: 'user@example.com', password: 'Password123' });

            expect(res.status).toBe(200);
            expect(res.body.message).toBe('Logged in');
            expect(res.headers['set-cookie'][0]).toMatch(/refresh_token=refresh-token/);
            expect(authService.login).toHaveBeenCalledWith({
                email: 'user@example.com',
                password: 'Password123',
            });
        });
    });

    describe('POST /api/auth/logout', () => {
        it('clears cookie and returns success', async () => {
            authService.logout.mockResolvedValue();

            const res = await request(app)
                .post('/api/auth/logout')
                .set('Cookie', ['refresh_token=refresh-token'])
                .send({});

            expect(res.status).toBe(200);
            expect(res.body.message).toBe('Logged out');
            expect(res.headers['set-cookie'][0]).toMatch(/refresh_token=;/);
            expect(res.headers['set-cookie'][0]).toMatch(/Max-Age=0/);
            expect(authService.logout).toHaveBeenCalledWith('refresh-token');
        });

        it('returns 401 when refresh cookie missing', async () => {
            const res = await request(app).post('/api/auth/logout').send({});

            expect(res.status).toBe(401);
            expect(res.body.success).toBe(false);
            expect(res.body.message).toBe('Refresh token missing');
            expect(authService.logout).not.toHaveBeenCalled();
        });
    });

    describe('POST /api/auth/refresh', () => {
        it('refreshes session, sets cookie, and returns payload', async () => {
            authService.refreshSession.mockResolvedValue({
                user: { id: 'user-123' },
                session: {
                    refresh_token: 'refresh-token-2',
                    access_token: 'access-token-2',
                    expires_in: 3600,
                    token_type: 'bearer',
                },
                profileComplete: true,
            });

            const res = await request(app)
                .post('/api/auth/refresh')
                .set('Cookie', ['refresh_token=refresh-token'])
                .send({});

            expect(res.status).toBe(200);
            expect(res.body.message).toBe('Session refreshed');
            expect(res.headers['set-cookie'][0]).toMatch(/refresh_token=refresh-token-2/);
            expect(authService.refreshSession).toHaveBeenCalledWith('refresh-token');
        });

        it('returns 401 when cookie missing', async () => {
            const res = await request(app).post('/api/auth/refresh').send({});

            expect(res.status).toBe(401);
            expect(res.body.success).toBe(false);
            expect(res.body.message).toBe('Refresh token missing');
            expect(authService.refreshSession).not.toHaveBeenCalled();
        });
    });
    describe('PATCH /api/auth/profile', () => {
        const validPayload = {
            name: 'Test User',
            gender: 'male',
            dob: '1990-01-01',
            heightFeet: 5,
            heightInches: 8,
            religion: 'hindu',
            caste: 'brahmin',
            rashi: 'aries',
        };

        it('updates profile and returns status', async () => {
            authService.updateProfile.mockResolvedValue({
                user: { id: 'user-123', name: 'Test User' },
                profileComplete: true,
            });
            const res = await request(app).patch('/api/auth/profile').send(validPayload);

            expect(res.status).toBe(200);
            expect(res.body).toEqual({
                success: true,
                message: 'Profile updated',
                data: {
                    user: { id: 'user-123', name: 'Test User' },
                    profileComplete: true,
                },
            });
            expect(authService.updateProfile).toHaveBeenCalledWith(
                {
                    id: 'user-123',
                    email: 'user@example.com',
                    user_metadata: {},
                },
                expect.objectContaining({
                    name: 'Test User',
                    gender: 'male',
                    dob: expect.any(Date),
                    heightFeet: 5,
                    heightInches: 8,
                    religion: 'hindu',
                    caste: 'brahmin',
                    rashi: 'aries',
                })
            );
        });

        it('returns 422 when payload invalid', async () => {
            const res = await request(app).patch('/api/auth/profile').send({});

            expect(res.status).toBe(422);
            expect(authService.updateProfile).not.toHaveBeenCalled();
        });

        it('propagates auth failures', async () => {

            const error = new ApiError(httpStatus.UNAUTHORIZED, 'Unauthorized');

            authenticate.mockImplementationOnce((_req, _res, next) => next(error));
            const res = await request(app).patch('/api/auth/profile').send(validPayload);

            expect(res.status).toBe(401);
            expect(res.body.success).toBe(false);
            expect(authService.updateProfile).not.toHaveBeenCalled();
        });
    });
});
