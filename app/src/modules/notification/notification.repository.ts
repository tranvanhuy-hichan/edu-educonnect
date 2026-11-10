import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
export const insertNotification = (data: Prisma.NotificationCreateManyInput) => prisma.notification.create({ data });
export const insertNotifications = (data: Prisma.NotificationCreateManyInput[]) => prisma.notification.createMany({ data });
export const notificationsForUser = (userId: string, limit: number) => prisma.notification.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: limit });
export const unreadForUser = (userId: string) => prisma.notification.count({ where: { userId, isRead: false } });
export const readOne = (id: string, userId: string) => prisma.notification.updateMany({ where: { id, userId }, data: { isRead: true } });
export const readAll = (userId: string) => prisma.notification.updateMany({ where: { userId, isRead: false }, data: { isRead: true } });
