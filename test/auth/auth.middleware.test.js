const { authenticate, extractBearerToken } = require('../../src/auth/auth.middleware');
const { ApiError, consts } = require('../../src/utils');

jest.mock('../../src/config/supabase', () => ({
    getSupabaseClient: jest.fn(),
}));

const { getSupabaseClient } = require('../../src/config/supabase');
const { httpStatus } = consts;

describe('extractBearerToken', () => {
    afterEach(() => {
        jest.clearAllMocks();
    });

    it('returns null when header is missing', () => {
        expect(extractBearerToken()).toBeNull();
    });

    it('returns null when header is not a string', () => {
        expect(extractBearerToken({})).toBeNull();
    });

    it('returns null for non-bearer schemes', () => {
        expect(extractBearerToken('Basic token')).toBeNull();
    });

    it('returns trimmed token for valid bearer header', () => {
        expect(extractBearerToken('Bearer   valid-token  ')).toBe('valid-token');
    });
});

describe('authenticate middleware', () => {
    let req;
    let next;
    let res;
    let mockGetUser;

    beforeEach(() => {
        req = { headers: {} };
        res = {};
        next = jest.fn();
        mockGetUser = jest.fn();
        getSupabaseClient.mockReturnValue({ auth: { getUser: mockGetUser } });
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    it('passes ApiError when token is missing', async () => {
        await authenticate(req, res, next);

        expect(getSupabaseClient).not.toHaveBeenCalled();
        expect(next).toHaveBeenCalledWith(expect.any(ApiError));
        const error = next.mock.calls[0][0];

        expect(error.statusCode).toBe(httpStatus.UNAUTHORIZED);
        expect(error.message).toBe('Access token missing');
    });

    it('passes ApiError when token format is invalid', async () => {
        req.headers.authorization = 'Token invalid';

        await authenticate(req, res, next);

        expect(getSupabaseClient).not.toHaveBeenCalled();
        expect(next).toHaveBeenCalledWith(expect.any(ApiError));
        const error = next.mock.calls[0][0];

        expect(error.statusCode).toBe(httpStatus.UNAUTHORIZED);
        expect(error.message).toBe('Access token missing');
    });

    it('passes ApiError when Supabase rejects token', async () => {
        req.headers.authorization = 'Bearer expired-token';
        mockGetUser.mockResolvedValue({ data: { user: null }, error: { message: 'Expired' } });

        await authenticate(req, res, next);

        expect(getSupabaseClient).toHaveBeenCalledTimes(1);
        expect(mockGetUser).toHaveBeenCalledWith('expired-token');
        expect(next).toHaveBeenCalledWith(expect.any(ApiError));
        const error = next.mock.calls[0][0];

        expect(error.statusCode).toBe(httpStatus.UNAUTHORIZED);
        expect(error.message).toBe('Invalid or expired access token');
    });

    it('attaches auth context when token is valid', async () => {
        req.headers.authorization = 'Bearer good-token';
        const user = { id: 'user-1' };

        mockGetUser.mockResolvedValue({ data: { user }, error: null });

        await authenticate(req, res, next);

        expect(getSupabaseClient).toHaveBeenCalledTimes(1);
        expect(mockGetUser).toHaveBeenCalledWith('good-token');
        expect(req.authUser).toEqual(user);
        expect(req.accessToken).toBe('good-token');
        expect(next).toHaveBeenCalledWith();
    });

    it('handles unexpected errors as unauthorized', async () => {
        req.headers.authorization = 'Bearer any-token';
        getSupabaseClient.mockImplementation(() => {
            throw new Error('network');
        });

        await authenticate(req, res, next);

        expect(next).toHaveBeenCalledWith(expect.any(ApiError));
        const error = next.mock.calls[0][0];

        expect(error.statusCode).toBe(httpStatus.UNAUTHORIZED);
        expect(error.message).toBe('Unauthorized');
    });
});
