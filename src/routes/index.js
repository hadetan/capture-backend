const express = require('express');
const authRoutes = require('../auth/auth.route');
const { catchAsync, httpResponse } = require('../utils');

const registerRoutes = (app) => {
    const apiRouter = express.Router();

    apiRouter.get(
        '/health',
        catchAsync((_req, res) => {
            httpResponse.success(res, { status: 'ok' }, 'OK');
        })
    );

    apiRouter.use('/auth', authRoutes);

    app.use('/api', apiRouter);
};

module.exports = { registerRoutes };
