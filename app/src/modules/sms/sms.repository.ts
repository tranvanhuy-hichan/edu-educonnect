import { prisma } from "@/lib/prisma";

export type SmsLogRow = { purpose: "OTP" | "NOTICE"; phoneHash: string; phoneMasked: string; status: "SENT" | "FAILED" | "SKIPPED"; provider: string; providerCode?: string; providerRef?: string; error?: string };

export const insertSmsLog = (row: SmsLogRow) => prisma.smsLog.create({ data: row });
export const countSentSince = (since: Date) => prisma.smsLog.count({ where: { status: "SENT", createdAt: { gte: since } } });
export const countNoticesToPhoneSince = (phoneHash: string, since: Date) => prisma.smsLog.count({ where: { phoneHash, purpose: "NOTICE", status: "SENT", createdAt: { gte: since } } });
export const smsStatsSince = (since: Date) => prisma.smsLog.groupBy({ by: ["purpose", "status"], where: { createdAt: { gte: since } }, _count: true });
export const recentSmsFailures = (take: number) => prisma.smsLog.findMany({ where: { status: "FAILED" }, orderBy: { createdAt: "desc" }, take, select: { id: true, createdAt: true, purpose: true, phoneMasked: true, providerCode: true, error: true } });
