const express = require('express');
const rateLimit = require('express-rate-limit');
const authController = require('./auth.controller');
const { validateGoogleSession, validateEmptyBody, validateRefreshSession } = require('./auth.validation');
const { authenticate } = require('./auth.middleware');

const router = express.Router();

const authRateLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many authentication attempts, please try again later.' },
});

router.post('/google/session', authRateLimiter, validateGoogleSession, authController.exchangeGoogleSession);
router.post('/google/session/refresh', authRateLimiter, validateRefreshSession, authController.refreshSession);
router.post('/logout', authenticate, validateEmptyBody, authController.logout);
router.get('/me', authenticate, authController.getProfile);

module.exports = router;
