import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export type ChangeKind = "STUDENT_CREATE" | "STUDENT_UPDATE" | "STUDENT_CLASS" | "YOUTH_UPDATE" | "TEACHER_CREATE" | "TEACHER_UPDATE" | "CLASS_CREATE" | "CLASS_UPDATE";
export type NewChange = { keyId: string; kind: ChangeKind; entityType: string; entityId: string; label: string; before?: unknown; after?: unknown; meta?: unknown };

const json = (v: unknown) => (v === undefined || v === null ? undefined : (JSON.parse(JSON.stringify(v)) as Prisma.InputJsonValue));
export const recordChange = (c: NewChange) => prisma.apiChange.create({ data: { keyId: c.keyId, kind: c.kind, entityType: c.entityType, entityId: c.entityId, label: c.label, before: json(c.before), after: json(c.after), meta: json(c.meta) } });
export const listChanges = (take = 60) => prisma.apiChange.findMany({ orderBy: { createdAt: "desc" }, take, include: { key: { select: { name: true } } } });
export const findChange = (id: string) => prisma.apiChange.findUnique({ where: { id } });
export const markReverted = (id: string, by: string) => prisma.apiChange.updateMany({ where: { id, revertedAt: null }, data: { revertedAt: new Date(), revertedBy: by } });
