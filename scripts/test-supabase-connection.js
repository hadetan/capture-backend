const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function main() {
    try {
        const result = await prisma.$queryRaw`SELECT 1 AS ok`;

        process.stdout.write(`Connection test query result: ${JSON.stringify(result)}\n`);
        process.stdout.write('✅ Prisma connected to Supabase Postgres successfully.\n');
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);

        process.stderr.write(`❌ Prisma connection test failed: ${message}\n`);
        process.exitCode = 1;
    } finally {
        await prisma.$disconnect();
    }
}

main();
