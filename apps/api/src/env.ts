import { config as loadEnv } from 'dotenv';
import path from 'node:path';

/** Ensure DATABASE_URL etc. are ready before PrismaService constructs. */
loadEnv({ path: path.resolve(__dirname, '../.env') });
loadEnv();
