import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

const clients = new WeakMap<DatabaseContext, Prisma.TransactionClient>();
/** Opaque transaction handle: application code cannot access ORM models through it. */
export type DatabaseContext = Readonly<{ transaction: true }>;
export function contextFor(client: Prisma.TransactionClient): DatabaseContext {
  const context = { transaction: true } as const;
  clients.set(context, client);
  return context;
}
/** Persistence-only API. Import this function from repositories, never controllers/services. */
export function databaseFor(context?: DatabaseContext) {
  if (!context) return prisma;
  const client = clients.get(context);
  if (!client) throw new Error("Transaction context không hợp lệ");
  return client;
}
export function withTransaction<T>(work: (context: DatabaseContext) => Promise<T>, options?: { timeout?: number }) {
  return prisma.$transaction((client) => work(contextFor(client)), options);
}
