import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function getClient(): PrismaClient {
  const existing = globalForPrisma.prisma;
  if (existing && "parentAccount" in existing && (existing as unknown as Record<string, unknown>).parentAccount != null) {
    return existing;
  }
  const client = new PrismaClient();
  if (process.env.NODE_ENV !== "production") {
    globalForPrisma.prisma = client;
  }
  return client;
}

export const prisma = getClient();
