import { db } from "@/lib/db";
import { requireRole, ADMIN_ROLES } from "@/lib/guard";
import { Card, Table, Title } from "@/components/ui";
import { ActionForm } from "@/components/action-form";
import { retryJob, resolveError, runQueueNow } from "./actions";
import { currentProvider } from "@/modules/sms/provider";
import { recentSmsFailures, smsStatsSince } from "@/modules/sms/sms.repository";

export const dynamic = "force-dynamic";

const fmt = (d: Date | null) => (d ? d.toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", hour12: false }) : "—");
const STATUS: Record<string, string> = { PENDING: "Đang chờ", RUNNING: "Đang chạy", DONE: "Xong", FAILED: "Thất bại" };
const JOB_TYPE: Record<string, string> = { "import.run": "Nhập câu hỏi bằng AI", "maintenance.cleanup": "Dọn dẹp định kỳ" };

async function dbStats() {
  const t = performance.now();
  const [{ size }] = await db.$queryRaw<{ size: bigint }[]>`SELECT pg_database_size(current_database()) AS size`;
  const ping = Math.round(performance.now() - t);
  const [exists] = await db.$queryRaw<{ ok: boolean }[]>`SELECT to_regclass('"_prisma_migrations"') IS NOT NULL AS ok`;
  const lastMigration = exists.ok ? (await db.$queryRaw<{ migration_name: string; finished_at: Date | null }[]>`SELECT migration_name, finished_at FROM "_prisma_migrations" ORDER BY started_at DESC LIMIT 1`)[0] : null;
  const tables = await db.$queryRaw<{ name: string; rows: bigint; size: bigint; seq: bigint; idx: bigint }[]>`
    SELECT relname AS name, n_live_tup AS rows, pg_total_relation_size(relid) AS size, seq_scan AS seq, COALESCE(idx_scan, 0) AS idx
    FROM pg_stat_user_tables ORDER BY pg_total_relation_size(relid) DESC LIMIT 8`;
  const unused = await db.$queryRaw<{ table: string; index: string; size: bigint }[]>`
    SELECT s.relname AS "table", s.indexrelname AS "index", pg_relation_size(s.indexrelid) AS size
    FROM pg_stat_user_indexes s JOIN pg_index i ON i.indexrelid = s.indexrelid
    WHERE s.idx_scan = 0 AND NOT i.indisunique AND NOT i.indisprimary ORDER BY pg_relation_size(s.indexrelid) DESC LIMIT 6`;
  return { size: Number(size), ping, lastMigration, tables, unused };
}
const mb = (n: number | bigint) => `${(Number(n) / 1048576).toFixed(1)} MB`;

export default async function Operations() {
  await requireRole(...ADMIN_ROLES);
  const smsProvider = currentProvider();
  const [smsStats, smsFailures] = smsProvider ? await Promise.all([smsStatsSince(new Date(Date.now() - 86_400_000)), recentSmsFailures(8)]) : [[], []];
  const smsCount = (purpose: string, status: string) => smsStats.find((r) => r.purpose === purpose && r.status === status)?._count ?? 0;
  const [stats, queue, jobs, errors] = await Promise.all([
    dbStats(),
    db.job.groupBy({ by: ["status"], _count: true }),
    db.job.findMany({ orderBy: { createdAt: "desc" }, take: 15 }),
    db.errorLog.findMany({ where: { status: "OPEN" }, orderBy: { lastSeenAt: "desc" }, take: 30 }),
  ]);
  const count = (s: string) => queue.find((q) => q.status === s)?._count ?? 0;
  const release = process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? process.env.APP_RELEASE ?? "dev";

  return (
    <div className="space-y-6">
      <Title>Vận hành hệ thống</Title>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card><p className="text-xs text-slate-500">Bản phát hành</p><p className="font-mono text-lg">{release}</p></Card>
        <Card><p className="text-xs text-slate-500">Cơ sở dữ liệu</p><p className="text-lg">{mb(stats.size)} · {stats.ping} ms</p></Card>
        <Card><p className="text-xs text-slate-500">Migration gần nhất</p><p className="break-all text-sm">{stats.lastMigration ? `${stats.lastMigration.migration_name}${stats.lastMigration.finished_at ? "" : " (đang dở!)"}` : "Không có lịch sử"}</p></Card>
        <Card><p className="text-xs text-slate-500">Lỗi chưa xử lý</p><p className={`text-lg ${errors.length ? "font-semibold text-red-600" : ""}`}>{errors.length}</p></Card>
      </div>

      <section className="space-y-2">
        <h2 className="font-semibold">SMS cho phụ huynh</h2>
        {smsProvider ? (
          <>
            <p className="text-sm text-slate-600">Đang <b className="text-green-700">bật</b> · nhà cung cấp <code>{smsProvider.name}</code>{process.env.SMS_SANDBOX === "1" ? " · chế độ thử (Sandbox, không gửi thật)" : ""}. 24 giờ qua: thông báo gửi được <b>{smsCount("NOTICE", "SENT")}</b>, lỗi <b className={smsCount("NOTICE", "FAILED") ? "text-red-600" : ""}>{smsCount("NOTICE", "FAILED")}</b>, bỏ qua {smsCount("NOTICE", "SKIPPED")} · mã xác minh gửi được <b>{smsCount("OTP", "SENT")}</b>, lỗi <b className={smsCount("OTP", "FAILED") ? "text-red-600" : ""}>{smsCount("OTP", "FAILED")}</b>.</p>
            {smsFailures.length > 0 && (
              <Table head={["Lúc", "Loại", "Số", "Mã lỗi", "Lý do"]}>
                {smsFailures.map((f) => <tr key={f.id}><td className="whitespace-nowrap text-xs">{fmt(f.createdAt)}</td><td>{f.purpose === "OTP" ? "Mã xác minh" : "Thông báo"}</td><td className="font-mono text-xs">{f.phoneMasked}</td><td className="font-mono text-xs">{f.providerCode}</td><td className="text-xs">{f.error}</td></tr>)}
              </Table>
            )}
          </>
        ) : <p className="text-sm text-slate-600">Chưa bật. Đặt <code>ESMS_API_KEY</code> và <code>ESMS_SECRET_KEY</code> để gửi SMS thông báo và bắt phụ huynh xác minh số điện thoại (xem docs/sms.md).</p>}
      </section>

      <section className="space-y-2">
        <h2 className="font-semibold">Lỗi hệ thống ({errors.length})</h2>
        <p className="text-sm text-slate-500">Mỗi dòng là một loại lỗi (gộp các lần lặp). Người dùng báo “Mã lỗi/Mã tham chiếu” → tìm theo mã trong log (<code>requestId</code>) hoặc Sentry.</p>
        <Table head={["Lần cuối", "Lỗi", "Nơi xảy ra", "Số lần", "Mã", ""]}>
          {errors.map((e) => (
            <tr key={e.id}>
              <td className="whitespace-nowrap text-xs">{fmt(e.lastSeenAt)}</td>
              <td className="max-w-md"><p className="break-words">{e.message}</p>{e.stack && <details><summary className="cursor-pointer text-xs text-slate-500">Stack</summary><pre className="max-h-48 overflow-auto whitespace-pre-wrap text-[11px]">{e.stack}</pre></details>}</td>
              <td className="text-xs">{e.method} {e.route ?? e.source}</td>
              <td>{e.count}</td>
              <td className="font-mono text-[11px]">{e.digest ?? e.requestId?.slice(0, 8) ?? ""}</td>
              <td><ActionForm action={resolveError} submit="Đã xử lý" compact reset={false} className="flex"><input type="hidden" name="id" value={e.id} /></ActionForm></td>
            </tr>
          ))}
          {!errors.length && <tr><td colSpan={6} className="text-center text-slate-500">Không có lỗi nào đang mở.</td></tr>}
        </Table>
      </section>

      <section className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold">Hàng đợi tác vụ nền — chờ {count("PENDING")} · chạy {count("RUNNING")} · lỗi {count("FAILED")}</h2>
          <ActionForm action={runQueueNow} submit="Chạy hàng đợi ngay" compact reset={false} className="flex" />
        </div>
        <Table head={["Tạo lúc", "Loại việc", "Trạng thái", "Lần thử", "Tiến độ", "Lỗi", ""]}>
          {jobs.map((j) => (
            <tr key={j.id}>
              <td className="whitespace-nowrap text-xs">{fmt(j.createdAt)}</td>
              <td>{JOB_TYPE[j.type] ?? j.type}</td>
              <td className={j.status === "FAILED" ? "text-red-600" : ""}>{STATUS[j.status] ?? j.status}</td>
              <td>{j.attempts}/{j.maxAttempts}</td>
              <td>{j.progress}%</td>
              <td className="max-w-xs break-words text-xs text-slate-600">{j.lastError}</td>
              <td>{j.status === "FAILED" && <ActionForm action={retryJob} submit="Thử lại" compact reset={false} className="flex"><input type="hidden" name="id" value={j.id} /></ActionForm>}</td>
            </tr>
          ))}
          {!jobs.length && <tr><td colSpan={7} className="text-center text-slate-500">Chưa có tác vụ nền.</td></tr>}
        </Table>
      </section>

      <section className="space-y-2">
        <h2 className="font-semibold">Cơ sở dữ liệu — bảng lớn nhất</h2>
        <p className="text-sm text-slate-500">“Quét tuần tự” cao so với “quét chỉ mục” trên bảng lớn là dấu hiệu thiếu chỉ mục. Chỉ mục chưa từng dùng (dưới đây) chỉ đáng bỏ sau khi hệ thống chạy đủ lâu để thống kê có ý nghĩa.</p>
        <Table head={["Bảng", "Số dòng (ước tính)", "Dung lượng", "Quét tuần tự", "Quét chỉ mục"]}>
          {stats.tables.map((t) => <tr key={t.name}><td className="font-mono text-xs">{t.name}</td><td>{Number(t.rows).toLocaleString("vi-VN")}</td><td>{mb(t.size)}</td><td>{Number(t.seq).toLocaleString("vi-VN")}</td><td>{Number(t.idx).toLocaleString("vi-VN")}</td></tr>)}
        </Table>
        {stats.unused.length > 0 && <p className="text-xs text-slate-500">Chỉ mục chưa được dùng: {stats.unused.map((u) => `${u.table}.${u.index} (${mb(u.size)})`).join(", ")}</p>}
      </section>
    </div>
  );
}
