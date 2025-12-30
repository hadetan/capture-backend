const app = require('./app');
const config = require('./config');
const logger = require('./config/logger');
const { disconnectPrisma } = require('./config/prisma');

let server;

function start(customPort = config.PORT) {
    const port = Number(customPort) || 3000;

    server = app.listen(port, () => {
        logger.info(`Server listening on port ${port}`);
    });

    return server;
}

const exitHandler = () => {
    if (server) {
        server.close(() => {
            logger.info('Server closed');
            disconnectPrisma()
                .catch((error) => {
                    logger.error('Failed to disconnect Prisma client', error);
                })
                .finally(() => {
                    process.exit(1);
                });
        });
    } else {
        disconnectPrisma()
            .catch((error) => {
                logger.error('Failed to disconnect Prisma client', error);
            })
            .finally(() => {
                process.exit(1);
            });
    }
};

const unexpectedErrorHandler = (error) => {
    logger.error(error);
    exitHandler();
};

process.on('uncaughtException', unexpectedErrorHandler);
process.on('unhandledRejection', unexpectedErrorHandler);

process.on('SIGTERM', () => {
    logger.info('SIGTERM received');
    exitHandler();
});

if (require.main === module) {
    start();
}

module.exports = { app, start };
