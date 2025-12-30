const { PrismaClient } = require('@prisma/client');

let prismaClient;

const getPrismaClient = () => {
    if (!prismaClient) {
        prismaClient = new PrismaClient();
    }

    return prismaClient;
};

const disconnectPrisma = async () => {
    if (prismaClient) {
        await prismaClient.$disconnect();
        prismaClient = null;
    }
};

module.exports = {
    getPrismaClient,
    disconnectPrisma,
};
