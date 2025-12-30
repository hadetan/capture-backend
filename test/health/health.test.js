jest.mock('@prisma/client', () => ({
    PrismaClient: jest.fn().mockImplementation(() => ({
        $disconnect: jest.fn(),
    })),
}));

const request = require('supertest');
const { app } = require('../../src/index');

describe('GET /health', () => {
    it('returns ok status', async () => {
        const response = await request(app).get('/api/health');

        expect(response.status).toBe(200);
        expect(response.body).toEqual({ success: true, message: 'OK', data: { status: 'ok' } });
    });
});
