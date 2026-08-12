// Prisma 7 config — DATABASE_URL must be a PostgreSQL connection string.
import "dotenv/config";
import { defineConfig } from "prisma/config";

const url =
  process.env.DATABASE_URL ??
  "postgresql://tfw:tfw@localhost:5433/tfw?schema=public";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url,
  },
});
