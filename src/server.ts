import 'dotenv/config';
import app from './app';
import { prisma } from './prisma';

const PORT = parseInt(process.env.PORT ?? '3000', 10);

async function bootstrap() {
  // Verify DB connection before starting
  try {
    await prisma.$queryRaw`SELECT 1`;
    console.log('✓ Database connected');
  } catch (err) {
    console.error('✗ Database connection failed:', err);
    process.exit(1);
  }

  const server = app.listen(PORT, () => {
    console.log(`\n🚀  StockSys API running on http://localhost:${PORT}`);
    console.log(`    Environment: ${process.env.NODE_ENV ?? 'development'}`);
    console.log(`    Health:      http://localhost:${PORT}/health\n`);
  });

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    console.log(`\n${signal} received — shutting down…`);
    server.close(async () => {
      await prisma.$disconnect();
      console.log('DB disconnected. Bye.');
      process.exit(0);
    });
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT',  () => shutdown('SIGINT'));
}

bootstrap();
