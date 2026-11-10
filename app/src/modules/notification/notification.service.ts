import * as repository from "./notification.repository";

export type NotificationType = "SYSTEM" | "EXAM" | "ASSIGNMENT" | "LIBRARY" | "SCHEDULE" | "GRADE";

export async function createNotification(data: {
  userId: string;
  title: string;
  content: string;
  type?: NotificationType;
  link?: string | null;
}) {
  return repository.insertNotification({ userId: data.userId, title: data.title, content: data.content, type: data.type ?? "SYSTEM", link: data.link ?? null });
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
  return repository.insertNotifications(uniqueIds.map((userId) => ({ userId, title: data.title, content: data.content, type: data.type ?? "SYSTEM", link: data.link ?? null })));
}

export const listUserNotifications = (userId: string, limit = 20) => repository.notificationsForUser(userId, limit);
export const countUnreadNotifications = (userId: string) => repository.unreadForUser(userId);
export const markNotificationRead = (id: string, userId: string) => repository.readOne(id, userId);
export const markAllNotificationsRead = (userId: string) => repository.readAll(userId);
