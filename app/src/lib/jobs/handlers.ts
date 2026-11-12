import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { registerJob } from "./queue";
import { objectDownloadUrl } from "@/lib/storage/adapters";
import { sendSms } from "@/modules/sms/sms.service";
import { runDailyReminders } from "@/modules/reminders/reminders.service";
import { purgeExpiredTrash } from "@/modules/trash/trash.repository";
import { resolveWorkerIdentity } from "@/modules/auth/auth.service";
import { runImportJob } from "@/modules/importer/importer.service";

let registered = false;

/** Nơi duy nhất đăng ký các loại việc nền. Thêm loại mới: registerJob("ten.viec", async (job, ctx) => {...}). */
export function ensureHandlers() {
  if (registered) return;
  registered = true;

  // Đọc tệp nhập bằng AI. Tệp gốc đã nằm trong kho lưu trữ nên worker (cron, instance khác) vẫn lấy lại được.
  registerJob("import.run", async (job, ctx) => {
    const { importJobId, userId } = job.payload as { importJobId: string; userId: string };
    const record = await prisma.importJob.findUnique({ where: { id: importJobId } });
    if (!record) throw new Error("Phiên nhập không còn tồn tại");
    if (record.status === "DONE" || record.status === "FAILED") return { skipped: record.status };
    const user = await resolveWorkerIdentity(userId);
    if (!user) throw new Error("Tài khoản người nhập đã bị khoá hoặc xoá");
    const file = await prisma.storedFile.findUnique({ where: { id: record.fileId } });
    if (!file || (file.provider !== "cloudinary" && file.provider !== "minio")) throw new Error("Không tìm thấy tệp gốc trong kho lưu trữ");
    await ctx.setProgress(10);
    const response = await fetch(await objectDownloadUrl({ provider: file.provider, key: file.storageKey, bucket: file.bucket }, file.fileName));
    if (!response.ok) throw new Error(`Không tải được tệp gốc (HTTP ${response.status})`);
    await runImportJob(user, importJobId, Buffer.from(await response.arrayBuffer()));
    const after = await prisma.importJob.findUnique({ where: { id: importJobId }, select: { status: true } });
    return { importStatus: after?.status ?? "UNKNOWN" };
  });

  // Gửi SMS thông báo cho phụ huynh theo lô. Từng tin tự ghi nhật ký (SmsLog) và KHÔNG ném lỗi ra ngoài, nên việc thử lại
  // của hàng đợi không bao giờ gửi trùng những tin đã đi. Gặp nhiều lỗi liên tiếp (hết tiền, sai khoá...) thì dừng lô để khỏi gọi vô ích.
  registerJob("sms.send", async (job) => {
    const { items } = job.payload as { items: { phone: string; text: string }[] };
    let sent = 0, failed = 0, skipped = 0, streak = 0;
    for (const item of items) {
      if (streak >= 5) { skipped++; continue; }
      const r = await sendSms("NOTICE", item.phone, item.text);
      if (r.status === "SENT") { sent++; streak = 0; } else if (r.status === "FAILED") { failed++; streak++; } else skipped++;
    }
    logger.info({ sent, failed, skipped }, "sms_batch_done");
    return { sent, failed, skipped };
  });

  // Nhắc việc hằng ngày (sách đến hạn, bài tập hết hạn, lịch thi ngày mai) + nhắc rà soát tài khoản đầu tháng.
  registerJob("reminders.daily", async () => runDailyReminders());

  // Dọn dẹp định kỳ: bảng giới hạn tốc độ, việc/lỗi cũ.
  registerJob("maintenance.cleanup", async () => {
    const throttle = await prisma.$executeRaw`DELETE FROM "LoginThrottle" WHERE "expiresAt" <= NOW()`;
    const jobs = await prisma.$executeRaw`DELETE FROM "Job" WHERE "status" IN ('DONE','FAILED') AND "finishedAt" < NOW() - INTERVAL '30 days'`;
    const errors = await prisma.$executeRaw`DELETE FROM "ErrorLog" WHERE "status" = 'RESOLVED' AND "lastSeenAt" < NOW() - INTERVAL '90 days'`;
    const otps = await prisma.$executeRaw`DELETE FROM "ParentOtp" WHERE "createdAt" < NOW() - INTERVAL '1 day'`;
    const smsLogs = await prisma.$executeRaw`DELETE FROM "SmsLog" WHERE "createdAt" < NOW() - INTERVAL '90 days'`;
    const trash = await purgeExpiredTrash();
    const apiLogs = await prisma.$executeRaw`DELETE FROM "ApiRequestLog" WHERE "createdAt" < NOW() - INTERVAL '30 days'`;
    await prisma.$executeRaw`DELETE FROM "ApiIdempotency" WHERE "createdAt" < NOW() - INTERVAL '7 days'`;
    await prisma.$executeRaw`DELETE FROM "ApiChange" WHERE "createdAt" < NOW() - INTERVAL '365 days'`;
    const sessions = await prisma.$executeRaw`DELETE FROM "UserSession" WHERE "createdAt" < NOW() - INTERVAL '30 days'`;
    const reminders = await prisma.$executeRaw`DELETE FROM "ReminderSent" WHERE "createdAt" < NOW() - INTERVAL '60 days'`;
    logger.info({ throttle, jobs, errors, otps, smsLogs, trash, sessions, reminders, apiLogs }, "maintenance_cleanup");
    return { throttle, jobs, errors, otps, smsLogs, trash, sessions, reminders, apiLogs };
  });
}
