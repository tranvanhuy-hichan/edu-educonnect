import Link from "next/link";
import { PageCrumbs } from "@/components/page-crumbs";
import { redirect } from "next/navigation";
import { requireRole, MANAGER_ROLES, TEACHING_ROLES } from "@/lib/guard";
import { Card, Table, Title } from "@/components/ui";
import { fmtTime } from "@/lib/format";
import { listImportJobs } from "@/modules/importer/importer.service";
import { AutoRefresh } from "./auto-refresh";
import { KIND_LABEL, StatusBadge } from "./status";

export default async function ImportJobs() {
  const me = await requireRole(...MANAGER_ROLES, ...TEACHING_ROLES);
  if (!me.teacherId) redirect("/ngan-hang-cau-hoi");
  const jobs = await listImportJobs(me);
  const busy = jobs.some((j) => j.status === "PENDING" || j.status === "RUNNING");

  return (
    <div className="space-y-4">
      <AutoRefresh active={busy} />
      <PageCrumbs items={[{ label: "Ngân hàng câu hỏi", href: "/ngan-hang-cau-hoi" }, { label: "Phiên nhập AI" }]} />
      <Title right={<Link href="/ngan-hang-cau-hoi" className="inline-flex h-9 items-center rounded-md border bg-white px-4 text-sm font-medium hover:bg-slate-50">Ngân hàng câu hỏi</Link>}>Nhập câu hỏi bằng AI ({jobs.length})</Title>
      <Card className="text-sm text-slate-600">
        Tải tệp Word, PDF hoặc ảnh chứa câu hỏi/đề kiểm tra, AI sẽ đọc và lưu vào ngân hàng. Câu nào AI không chắc chắn (thiếu đáp án, có hình vẽ, tự giải…) được gắn nhãn <b>Chờ kiểm tra</b>
        và chưa dùng được trong bài tập cho đến khi bạn duyệt. Nút nhập nằm ở trang Ngân hàng câu hỏi.
      </Card>
      <Table mobileLayout="compact" head={["Tệp", "Loại", "Môn · khối", "Trạng thái", "Số câu", "Cần kiểm tra", "Thời gian"]}>
        {jobs.map((j) => (
          <tr key={j.id} className="align-middle [&>td]:!py-3">
            <td className="min-w-48 max-w-xs"><Link data-row href={`/ngan-hang-cau-hoi/nhap/${j.id}`} className="line-clamp-2 break-all font-medium text-orange-700 hover:underline">{j.fileName}</Link></td>
            <td>{KIND_LABEL[j.kind] ?? j.kind}</td>
            <td className="text-sm">{j.subject.subjectName} · {j.gradeLevel.gradeName}</td>
            <td><StatusBadge status={j.status} /></td>
            <td>{j.status === "DONE" ? j.questionCount : <span className="text-slate-400">-</span>}</td>
            <td>{j.status === "DONE" ? (j.flaggedCount ? <b className="text-amber-700">{j.flaggedCount}</b> : <span className="text-green-700">0</span>) : <span className="text-slate-400">-</span>}</td>
            <td className="whitespace-nowrap text-sm text-slate-600">{fmtTime(j.createdAt)}</td>
          </tr>
        ))}
        {!jobs.length && <tr><td colSpan={7} className="py-8 text-center text-slate-500">Chưa có phiên nhập nào. Vào Ngân hàng câu hỏi, bấm &quot;Nhập từ tệp bằng AI&quot;.</td></tr>}
      </Table>
    </div>
  );
}
