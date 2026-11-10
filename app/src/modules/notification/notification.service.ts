import { db } from "@/lib/db";

export type NotificationType = "SYSTEM" | "EXAM" | "ASSIGNMENT" | "LIBRARY" | "SCHEDULE" | "GRADE";

export async function createNotification(data: {
  userId: string;
  title: string;
  content: string;
  type?: NotificationType;
  link?: string | null;
}) {
  return db.notification.create({
    data: {
      userId: data.userId,
      title: data.title,
      content: data.content,
      type: data.type ?? "SYSTEM",
      link: data.link ?? null,
    },
  });
}

export async function notifyUsers(
  userIds: string[],
  data: {
    title: string;
    content: string;
    type?: NotificationType;
    link?: string | null;
  },
) {
  if (!userIds.length) return { count: 0 };
  const uniqueIds = Array.from(new Set(userIds.filter(Boolean)));
  return db.notification.createMany({
    data: uniqueIds.map((userId) => ({
      userId,
      title: data.title,
      content: data.content,
      type: data.type ?? "SYSTEM",
      link: data.link ?? null,
    })),
  });
}

export async function listUserNotifications(userId: string, limit = 20) {
  return db.notification.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}

export async function countUnreadNotifications(userId: string) {
  return db.notification.count({
    where: { userId, isRead: false },
  });
}

export async function markNotificationRead(id: string, userId: string) {
  return db.notification.updateMany({
    where: { id, userId },
    data: { isRead: true },
  });
}

export async function markAllNotificationsRead(userId: string) {
  return db.notification.updateMany({
    where: { userId, isRead: false },
    data: { isRead: true },
  });
}
