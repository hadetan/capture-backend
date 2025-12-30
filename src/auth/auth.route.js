const express = require('express');
const rateLimit = require('express-rate-limit');
const authController = require('./auth.controller');
const { validateRegister, validateLogin, validateEmptyBody, validateProfileUpdate } = require('./auth.validation');
const { authenticate } = require('./auth.middleware');

const router = express.Router();

const authRateLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many authentication attempts, please try again later.' },
});

router.post('/register', authRateLimiter, validateRegister, authController.register);
router.post('/login', authRateLimiter, validateLogin, authController.login);
router.post('/logout', validateEmptyBody, authController.logout);
router.post('/refresh', authRateLimiter, validateEmptyBody, authController.refresh);
router.patch('/profile', authenticate, validateProfileUpdate, authController.updateProfile);

module.exports = router;
