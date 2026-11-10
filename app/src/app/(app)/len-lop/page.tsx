import { YearResults } from "@/components/academic/year-results";
import Link from "next/link";
import { db } from "@/lib/db";
import { requireRole, MANAGER_ROLES } from "@/lib/guard";
import { ActionForm } from "@/components/action-form";
import { AutoForm } from "@/components/auto-form";
import { DialogButton } from "@/components/dialog";
import { Card, Field, inputCls, Table, Tabs, Title } from "@/components/ui";
import { fmtDate } from "@/lib/format";
import { resolveReExamResult, runPromotion } from "./actions";

type SP = { tab?: string; yearId?: string; toYearId?: string; classId?: string; q?: string; result?: string; page?: string; size?: string };
const RESULT_TONE = { CHUA_DU_DIEU_KIEN: "bg-slate-100 text-slate-600", LEN_LOP: "bg-green-100 text-green-800", O_LAI: "bg-red-100 text-red-800", THI_LAI: "bg-yellow-100 text-yellow-800" } as const;
const JOB_LABEL: Record<string, string> = { PENDING: "Chờ chạy", RUNNING: "Đang chạy", DONE: "Hoàn tất", FAILED: "Thất bại" };

export default async function Promotion({ searchParams }: { searchParams: Promise<SP> }) {
  await requireRole(...MANAGER_ROLES);
  const sp = await searchParams;
  const tab = sp.tab === "run" ? "run" : sp.tab === "re-exam" ? "re-exam" : "results";
  const years = await db.academicYear.findMany({ orderBy: { startDate: "desc" } });
  const yearId = sp.yearId && years.some((y) => y.id === sp.yearId) ? sp.yearId : years[0]?.id;
  const yearIdx = years.findIndex((y) => y.id === yearId);
  const toYearId = sp.toYearId && years.some((y) => y.id === sp.toYearId) ? sp.toYearId : (yearIdx > 0 ? years[yearIdx - 1].id : "");
  const yearName = (id: string) => years.find((y) => y.id === id)?.yearName ?? "-";

  if (!yearId) {
    return <div className="space-y-4"><Title>Xét lên lớp</Title><Card className="py-10 text-center text-sm text-slate-500">Chưa có năm học nào. Quản trị viên tạo năm học ở mục Cấu hình.</Card></div>;
  }

  const classes = await db.schoolClass.findMany({ where: { academicYearId: yearId }, orderBy: { className: "asc" }, include: { gradeLevel: true } });
  const [nEnrolled, nResults, nRetake] = await Promise.all([
    db.studentClassEnrollment.count({ where: { academicYearId: yearId } }),
    db.yearEndResult.count({ where: { academicYearId: yearId } }),
    db.yearEndResult.count({ where: { academicYearId: yearId, result: "THI_LAI" } }),
  ]);
  const tabItems: [string, string][] = [
    [`?tab=results&yearId=${yearId}`, `Kết quả cuối năm (${nResults}/${nEnrolled})`],
    [`?tab=re-exam&yearId=${yearId}`, `Xử lý thi lại (${nRetake})`],
    [`?tab=run&yearId=${yearId}`, "Chạy lên lớp"],
  ];

  return (
    <div className="space-y-4">
      <Title>{tab === "results" && classes.some((c) => c.id === sp.classId) ? <><Link href={`?tab=results&yearId=${yearId}`} className="text-slate-500 hover:text-orange-700">Xét lên lớp</Link><span className="mx-2 text-slate-400">/</span>Lớp {classes.find((c) => c.id === sp.classId)!.className}</> : "Xét lên lớp"}</Title>
      <Tabs current={`?tab=${tab}&yearId=${yearId}`} items={tabItems} />

      {/* ===================== KẾT QUẢ CUỐI NĂM ===================== */}
      {tab === "results" && !classes.some((c) => c.id === sp.classId) && await (async () => {
        const q = (sp.q ?? "").trim().toLowerCase();
        const enr = await db.studentClassEnrollment.findMany({ where: { academicYearId: yearId }, select: { schoolClassId: true, student: { select: { yearEndResults: { where: { academicYearId: yearId }, select: { result: true } } } } } });
        const stat = new Map<string, { n: number; up: number; stay: number; retake: number }>();
        for (const e of enr) {
          const st = stat.get(e.schoolClassId) ?? { n: 0, up: 0, stay: 0, retake: 0 };
          st.n++;
          const r = e.student.yearEndResults[0]?.result;
          if (r === "LEN_LOP") st.up++; else if (r === "O_LAI") st.stay++; else if (r === "THI_LAI") st.retake++;
          stat.set(e.schoolClassId, st);
        }
        const list = classes.filter((c) => !q || c.className.toLowerCase().includes(q));
        return (
          <div className="space-y-3">
            <AutoForm className="flex flex-wrap items-center gap-2">
              <input type="hidden" name="tab" value="results" />
              <select name="yearId" defaultValue={yearId} className={inputCls}>{years.map((y) => <option key={y.id} value={y.id}>Năm học {y.yearName}</option>)}</select>
              <input name="q" defaultValue={sp.q} placeholder="Tìm lớp..." className={inputCls + " min-w-0 flex-1 md:min-w-48"} />
            </AutoForm>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
              {list.map((c) => {
                const st = stat.get(c.id) ?? { n: 0, up: 0, stay: 0, retake: 0 };
                const done = st.up + st.stay + st.retake;
                const pct = st.n ? Math.round((done / st.n) * 100) : 0;
                return (
                  <Link key={c.id} href={`?tab=results&yearId=${yearId}&classId=${c.id}`} className="block rounded-xl border bg-white p-4 shadow-sm transition-colors hover:border-orange-400">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0"><div className="text-lg font-semibold text-orange-700">{c.className}</div><div className="text-xs text-slate-500">{c.gradeLevel.gradeName}</div></div>
                      <span className="shrink-0 text-sm"><b>{st.n}</b> <span className="text-xs text-slate-500">học sinh</span></span>
                    </div>
                    <div className="mt-3 flex gap-1.5 text-xs">
                      <span className={`rounded-full px-2 py-0.5 font-medium ${RESULT_TONE.LEN_LOP}`}>Lên lớp {st.up}</span>
                      <span className={`rounded-full px-2 py-0.5 font-medium ${RESULT_TONE.O_LAI}`}>Ở lại {st.stay}</span>
                      <span className={`rounded-full px-2 py-0.5 font-medium ${RESULT_TONE.THI_LAI}`}>Thi lại {st.retake}</span>
                    </div>
                    <div className="mt-3 border-t pt-3">
                      <div className="flex justify-between text-xs"><span className="text-slate-500">Đã ghi kết quả · {done}/{st.n}</span><b>{pct}%</b></div>
                      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-200"><div className="h-1.5 rounded-full" style={{ width: `${pct}%`, background: pct >= 100 ? "#22c55e" : "var(--color-orange-500)" }} /></div>
                    </div>
                  </Link>
                );
              })}
              {!list.length && <p className="text-sm text-slate-500">Không có lớp nào.</p>}
            </div>
          </div>
        );
      })()}

      {/* Một lớp: danh sách học sinh, bấm tên để ghi kết quả + hạnh kiểm một lần */}
      {tab === "results" && classes.some((c) => c.id === sp.classId) && <YearResults classId={sp.classId!} academicYearId={yearId} manager />}

      {/* ===================== XỬ LÝ THI LẠI ===================== */}
      {tab === "re-exam" && await (async () => {
        const reExams = await db.yearEndResult.findMany({
          where: { academicYearId: yearId, result: "THI_LAI" },
          include: {
            student: {
              include: {
                enrollments: {
                  where: { academicYearId: yearId },
                  include: { schoolClass: true },
                },
              },
            },
          },
          orderBy: { student: { fullName: "asc" } },
        });

        return (
          <div className="space-y-3">
            <AutoForm className="flex flex-wrap items-center gap-2">
              <input type="hidden" name="tab" value="re-exam" />
              <select name="yearId" defaultValue={yearId} className={inputCls}>
                {years.map((y) => <option key={y.id} value={y.id}>Năm học {y.yearName}</option>)}
              </select>
            </AutoForm>

            <div className="rounded-xl border bg-white p-4">
              <h3 className="text-base font-semibold text-slate-800">Danh sách học sinh thi lại trong hè</h3>
              <p className="mt-1 text-xs text-slate-500">
                Sau khi tổ chức kiểm tra lại trong dịp hè, nhập điểm thi lại và quyết định công nhận &ldquo;Lên lớp&rdquo; hoặc &ldquo;Ở lại lớp&rdquo; trước khi chạy chuyển lớp.
              </p>

              <div className="mt-4">
                <Table head={["Học sinh", "Lớp", "ĐTB cũ", "Hạnh kiểm", "Trạng thái", ""]}>
                  {reExams.map((r) => {
                    const cls = r.student.enrollments[0]?.schoolClass?.className ?? "-";
                    return (
                      <tr key={r.id} className="align-middle [&>td]:!py-3">
                        <td>
                          <div className="font-semibold">{r.student.fullName}</div>
                          <div className="text-xs text-slate-500">{r.student.code ?? "-"}</div>
                        </td>
                        <td>{cls}</td>
                        <td><b>{r.overallAverage}</b></td>
                        <td>{r.conductRank ?? "-"}</td>
                        <td><span className="rounded-full bg-yellow-100 px-2 py-0.5 text-xs font-semibold text-yellow-800">Thi lại</span></td>
                        <td>
                          <DialogButton label="Nhập điểm thi lại" title={`Cập nhật thi lại · ${r.student.fullName}`} size="sm" variant="secondary">
                            <ActionForm action={resolveReExamResult} submit="Lưu kết quả" className="flex flex-col gap-3 [&>button]:self-start">
                              <input type="hidden" name="studentId" value={r.studentId} />
                              <input type="hidden" name="academicYearId" value={yearId} />
                              <Field label="Điểm trung bình sau thi lại (thang 10)">
                                <input name="score" type="text" inputMode="decimal" defaultValue={String(r.overallAverage)} required className={inputCls + " w-full"} />
                              </Field>
                              <Field label="Quyết định công nhận">
                                <select name="result" className={inputCls + " w-full"} required defaultValue="">
                                  <option value="">Chọn đề xuất</option>
                                  <option value="LEN_LOP">Lên lớp</option>
                                  <option value="O_LAI">Ở lại lớp</option>
                                </select>
                              </Field>
                            </ActionForm>
                          </DialogButton>
                        </td>
                      </tr>
                    );
                  })}
                  {!reExams.length && (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-slate-500">
                        Không có học sinh nào cần thi lại trong năm học này.
                      </td>
                    </tr>
                  )}
                </Table>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ===================== CHẠY LÊN LỚP ===================== */}
      {tab === "run" && await (async () => {
        const [toClasses, results, jobs] = await Promise.all([
          toYearId ? db.schoolClass.findMany({ where: { academicYearId: toYearId }, orderBy: { className: "asc" }, include: { gradeLevel: true } }) : Promise.resolve([]),
          db.yearEndResult.findMany({ where: { academicYearId: yearId, reviewStatus: "APPROVED" }, select: { result: true, student: { select: { enrollments: { where: { academicYearId: yearId }, select: { schoolClassId: true } } } } } }),
          db.classPromotionJob.findMany({ orderBy: { createdAt: "desc" }, take: 10 }),
        ]);
        const stat = new Map<string, { up: number; stay: number; retake: number; resulted: number }>();
        for (const r of results) {
          const cid = r.student.enrollments[0]?.schoolClassId;
          if (!cid) continue;
          const s = stat.get(cid) ?? { up: 0, stay: 0, retake: 0, resulted: 0 };
          s.resulted++;
          if (r.result === "LEN_LOP") s.up++; else if (r.result === "O_LAI") s.stay++; else s.retake++;
          stat.set(cid, s);
        }
        const sizes = await db.studentClassEnrollment.groupBy({ by: ["schoolClassId"], where: { academicYearId: yearId }, _count: { _all: true } });
        const sizeOf = new Map(sizes.map((s) => [s.schoolClassId, s._count._all]));
        const opts = toClasses.map((c) => <option key={c.id} value={c.id}>{c.className} · {c.gradeLevel.gradeName}</option>);
        return (
          <div className="space-y-4">
            <AutoForm className="flex flex-wrap items-center gap-2">
              <input type="hidden" name="tab" value="run" />
              <select name="yearId" defaultValue={yearId} className={inputCls}>{years.map((y) => <option key={y.id} value={y.id}>Từ năm học {y.yearName}</option>)}</select>
              <select name="toYearId" defaultValue={toYearId} className={inputCls}><option value="">-- năm học đích --</option>{years.filter((y) => y.id !== yearId).map((y) => <option key={y.id} value={y.id}>Sang năm học {y.yearName}</option>)}</select>
            </AutoForm>
            {!toYearId ? <Card className="py-10 text-center text-sm text-slate-500">Chọn năm học đích để chọn lớp đích cho từng lớp.</Card>
              : !toClasses.length ? <Card className="py-10 text-center text-sm text-slate-500">Năm học {yearName(toYearId)} chưa có lớp nào. Tạo các lớp mới ở mục Lớp học trước khi chạy lên lớp.</Card>
              : (
                <ActionForm action={runPromotion} submit="Chạy lên lớp" reset={false} confirmText={`Chạy lên lớp từ năm học ${yearName(yearId)} sang ${yearName(toYearId)}? Học sinh sẽ được xếp vào lớp mới.`} className="flex flex-col gap-3 [&>button]:self-start">
                  <input type="hidden" name="fromYearId" value={yearId} />
                  <input type="hidden" name="toYearId" value={toYearId} />
                  <Table head={["Lớp (năm " + yearName(yearId) + ")", "Lên lớp", "Ở lại", "Thi lại · chưa có KQ", "Lớp đích cho học sinh lên lớp", "Lớp cho học sinh ở lại"]}>
                    {classes.map((c) => {
                      const s = stat.get(c.id) ?? { up: 0, stay: 0, retake: 0, resulted: 0 };
                      return (
                        <tr key={c.id} className="align-middle [&>td]:!py-3">
                          <td><span className="font-semibold">{c.className}</span><div className="text-xs text-slate-500">{c.gradeLevel.gradeName} · {sizeOf.get(c.id) ?? 0} học sinh</div></td>
                          <td><b className="text-green-700">{s.up}</b></td><td><b className="text-red-700">{s.stay}</b></td>
                          <td>{s.retake} · {(sizeOf.get(c.id) ?? 0) - s.resulted}</td>
                          <td><select name={`up_${c.id}`} defaultValue="" className={inputCls + " w-full"}><option value="">-- chọn lớp đích --</option>{opts}</select></td>
                          <td><select name={`stay_${c.id}`} defaultValue="" className={inputCls + " w-full"}><option value="">Không xếp (xử lý sau)</option>{opts}</select></td>
                        </tr>
                      );
                    })}
                    {!classes.length && <tr><td colSpan={6} className="py-8 text-center text-slate-500">Năm học nguồn chưa có lớp.</td></tr>}
                  </Table>
                  <p className="text-xs text-slate-500">Chỉ học sinh đã có kết quả cuối năm được phê duyệt mới được chuyển. Học sinh &ldquo;Thi lại&rdquo; và chưa có kết quả được giữ nguyên để xử lý sau.</p>
                </ActionForm>
              )}
            <Card className="p-0">
              <div className="border-b px-4 py-3 font-semibold">Lịch sử chạy lên lớp</div>
              <Table head={["Thời gian", "Từ năm học", "Sang năm học", "Trạng thái", "Ghi chú"]} bare>
                {jobs.map((j) => (
                  <tr key={j.id}>
                    <td>{fmtDate(j.createdAt)}</td><td>{yearName(j.academicYearFromId)}</td><td>{yearName(j.academicYearToId)}</td>
                    <td><span className={`rounded-full px-2 py-0.5 text-xs font-medium ${j.status === "DONE" ? "bg-green-100 text-green-800" : j.status === "FAILED" ? "bg-red-100 text-red-800" : "bg-slate-100 text-slate-700"}`}>{JOB_LABEL[j.status] ?? j.status}</span></td>
                    <td>{j.log ?? "-"}</td>
                  </tr>
                ))}
                {!jobs.length && <tr><td colSpan={5} className="py-8 text-center text-slate-500">Chưa chạy lần nào.</td></tr>}
              </Table>
            </Card>
          </div>
        );
      })()}
    </div>
  );
}
