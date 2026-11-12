import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { registerJob } from "./queue";
import { objectDownloadUrl } from "@/lib/storage/adapters";
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

  // Dọn dẹp định kỳ: bảng giới hạn tốc độ, việc/lỗi cũ.
  registerJob("maintenance.cleanup", async () => {
    const throttle = await prisma.$executeRaw`DELETE FROM "LoginThrottle" WHERE "expiresAt" <= NOW()`;
    const jobs = await prisma.$executeRaw`DELETE FROM "Job" WHERE "status" IN ('DONE','FAILED') AND "finishedAt" < NOW() - INTERVAL '30 days'`;
    const errors = await prisma.$executeRaw`DELETE FROM "ErrorLog" WHERE "status" = 'RESOLVED' AND "lastSeenAt" < NOW() - INTERVAL '90 days'`;
    logger.info({ throttle, jobs, errors }, "maintenance_cleanup");
    return { throttle, jobs, errors };
  });
}
