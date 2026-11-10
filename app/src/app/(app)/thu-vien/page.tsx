import Link from "next/link";
import { AlertTriangle, BarChart3, BookOpen, Calendar, CheckCircle2, Clock, Eye, FileText, Layers, Library, Plus, Search, Tag } from "lucide-react";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requireRole, LIBRARY_ROLES } from "@/lib/guard";
import { ActionForm } from "@/components/action-form";
import { AutoForm } from "@/components/auto-form";
import { DialogButton } from "@/components/dialog";
import { MobileCollapse } from "@/components/mobile-collapse";
import { ViewToggle, pickView } from "@/components/view-toggle";
import { Card, Field, inputCls, Table, Tabs, Title } from "@/components/ui";
import { Pagination } from "@/components/pagination";
import { getPaging } from "@/lib/paging";
import { addDays, fmtDate, isoDate, todayUTC } from "@/lib/format";
import { SearchableSelect, MultiSearchableSelect } from "@/components/searchable-select";
import {
  addBookCopy,
  addBookTitle,
  editBookTitle,
  removeBookTitle,
  lendBook,
  markCopyLost,
  receiveBook,
  returnSingleBookItem,
  reportItemLost,
  extendLoanDays,
} from "./actions";

type SP = {
  tab?: string;
  q?: string;
  status?: string;
  category?: string;
  page?: string;
  size?: string;
  v?: string;
};

const COPY_LABEL = {
  AVAILABLE: "Sẵn sàng",
  BORROWED: "Đang mượn",
  LOST: "Mất",
} as const;

const COPY_TONE = {
  AVAILABLE: "bg-green-100 text-green-800",
  BORROWED: "bg-blue-100 text-blue-800",
  LOST: "bg-red-100 text-red-800",
} as const;

const LOAN_LABEL = {
  BORROWED: "Đang mượn",
  PARTIALLY_RETURNED: "Trả một phần",
  RETURNED: "Đã trả đủ",
  OVERDUE: "Quá hạn",
  LOST: "Mất sách",
} as const;

const LOAN_TONE = {
  BORROWED: "bg-blue-100 text-blue-800",
  PARTIALLY_RETURNED: "bg-amber-100 text-amber-800",
  RETURNED: "bg-green-100 text-green-800",
  OVERDUE: "bg-red-100 text-red-800",
  LOST: "bg-slate-200 text-slate-700",
} as const;

const CATEGORIES = [
  "Sách giáo khoa",
  "Sách tham khảo",
  "Văn học - Nghệ thuật",
  "Khoa học - Tự nhiên",
  "Lịch sử - Địa lý",
  "Ngoại ngữ",
  "Kỹ năng sống",
  "Truyện tranh / Thiếu nhi",
  "Khác",
];

export default async function LibraryPage({ searchParams }: { searchParams: Promise<SP> }) {
  const me = await requireRole(...LIBRARY_ROLES, "STUDENT");
  const sp = await searchParams;
  const manage = me.roles.some((r) => LIBRARY_ROLES.includes(r));
  const allowed = manage
    ? ["titles", "copies", "loans", "overdue", "stats"]
    : ["titles", "loans", "overdue"];
  const tab = allowed.includes(sp.tab ?? "") ? sp.tab! : "titles";
  const view = pickView(sp.v, "table");
  const pg = getPaging(sp, 20);
  const now = new Date();
  const today = todayUTC();

  const mineLoan: Prisma.LibraryLoanWhereInput = manage ? {} : { studentId: me.studentId ?? "-" };
  const overdueWhere: Prisma.LibraryLoanWhereInput = {
    ...mineLoan,
    status: { in: ["BORROWED", "PARTIALLY_RETURNED"] },
    dueDate: { lt: now },
  };

  const [nTitles, nCopies, nLoans, nOverdue] = await Promise.all([
    db.libraryBookTitle.count(),
    manage ? db.libraryBookCopy.count() : Promise.resolve(0),
    db.libraryLoan.count({ where: mineLoan }),
    db.libraryLoan.count({ where: overdueWhere }),
  ]);

  const tabItems: [string, string][] = [
    ["?tab=titles", `Đầu sách (${nTitles})`],
    ...(manage ? [["?tab=copies", `Bản sao (${nCopies})`] as [string, string]] : []),
    ["?tab=loans", `${manage ? "Phiếu mượn" : "Phiếu mượn của tôi"} (${nLoans})`],
    ["?tab=overdue", `Quá hạn (${nOverdue})`],
    ...(manage ? [["?tab=stats", "Thống kê"] as [string, string]] : []),
  ];

  // Dữ liệu cho modal lập phiếu mượn (searchable dropdown)
  const [freeCopies, students] = manage
    ? await Promise.all([
        db.libraryBookCopy.findMany({
          where: { status: "AVAILABLE" },
          orderBy: [{ bookTitle: { title: "asc" } }, { copyCode: "asc" }],
          include: { bookTitle: true },
          take: 2000,
        }),
        db.student.findMany({
          orderBy: { fullName: "asc" },
          select: {
            id: true,
            fullName: true,
            code: true,
            enrollments: {
              take: 1,
              orderBy: { academicYear: { startDate: "desc" } },
              select: { schoolClass: { select: { className: true } } },
            },
          },
          take: 3000,
        }),
      ])
    : [[], []];

  // Chuẩn bị dữ liệu cho SelectOption
  const studentOptions = students.map((s) => ({
    value: s.id,
    label: s.fullName,
    subtext: s.enrollments[0]?.schoolClass?.className
      ? `Lớp ${s.enrollments[0].schoolClass.className}`
      : undefined,
    badge: s.code ?? undefined,
  }));

  const copyOptions = freeCopies.map((c) => ({
    value: c.id,
    label: c.bookTitle.title,
    subtext: c.bookTitle.author ? `Tác giả: ${c.bookTitle.author}` : undefined,
    badge: c.copyCode,
  }));

  const actionBtns = manage ? (
    <>
      <DialogButton
        label={
          <span className="flex items-center gap-1.5">
            <Plus className="size-4" /> Lập phiếu mượn
          </span>
        }
        title="Lập phiếu mượn sách (Nhiều sách)"
        variant="primary"
        wide
      >
        <ActionForm action={lendBook} submit="Lập phiếu mượn" className="flex flex-col gap-4 [&>button]:self-start">
          <Field label="Học sinh mượn sách">
            <SearchableSelect
              name="studentId"
              options={studentOptions}
              placeholder="-- Gõ tên hoặc mã học sinh để tìm --"
              required
            />
          </Field>

          <Field label="Chọn sách mượn (Có thể chọn nhiều cuốn)">
            <MultiSearchableSelect
              name="bookCopyIds"
              options={copyOptions}
              placeholder="Gõ tên sách hoặc mã bản sao để tìm kiếm và thêm vào phiếu..."
              required
            />
          </Field>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Hạn trả sách">
              <input
                name="dueDate"
                type="date"
                defaultValue={isoDate(addDays(today, 14))}
                className={inputCls + " w-full"}
                required
              />
            </Field>
            <Field label="Ghi chú phiếu mượn (tùy chọn)">
              <input
                name="note"
                placeholder="Vd: Mượn phục vụ ôn thi HK1..."
                className={inputCls + " w-full"}
              />
            </Field>
          </div>
        </ActionForm>
      </DialogButton>

      <DialogButton
        label={
          <span className="flex items-center gap-1.5">
            <Plus className="size-4" /> Thêm đầu sách
          </span>
        }
        title="Thêm đầu sách mới vào thư viện"
        variant="secondary"
        wide
      >
        <ActionForm action={addBookTitle} submit="Lưu đầu sách" className="flex flex-col gap-3 [&>button]:self-start">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Tên sách *">
              <input name="title" placeholder="Vd: Toán học 10 Kết nối tri thức" className={inputCls + " w-full"} required />
            </Field>
            <Field label="Mã đầu sách">
              <input name="code" placeholder="Vd: SGK-TOAN-10" className={inputCls + " w-full uppercase"} />
            </Field>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Field label="Thể loại">
              <select name="category" className={inputCls + " w-full"}>
                <option value="">-- Chọn thể loại --</option>
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </Field>
            <Field label="Tác giả">
              <input name="author" placeholder="Vd: GS. Nguyễn Văn A..." className={inputCls + " w-full"} />
            </Field>
            <Field label="Nhà xuất bản">
              <input name="publisher" placeholder="Vd: NXB Giáo Dục" className={inputCls + " w-full"} />
            </Field>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Field label="Năm xuất bản">
              <input name="publishYear" type="number" min={1900} max={2100} placeholder="Vd: 2024" className={inputCls + " w-full"} />
            </Field>
            <Field label="Vị trí giá sách">
              <input name="shelfLocation" placeholder="Vd: Kệ A2 - Ngăn 3" className={inputCls + " w-full"} />
            </Field>
            <Field label="Mã ISBN">
              <input name="isbn" placeholder="Vd: 978-604-0-12345-6" className={inputCls + " w-full"} />
            </Field>
          </div>

          <Field label="Mô tả / Tóm tắt nội dung">
            <textarea name="description" rows={2} placeholder="Nội dung tóm tắt..." className="w-full rounded-md border p-2 text-sm bg-white" />
          </Field>

          <div className="grid grid-cols-1 gap-3 rounded-lg border bg-slate-50 p-3 sm:grid-cols-2">
            <Field label="Tiền tố mã bản sao (vd TOAN10 → TOAN10-01, -02...)">
              <input name="prefix" placeholder="TOAN10" className={inputCls + " w-full uppercase bg-white"} required />
            </Field>
            <Field label="Số lượng bản sao tạo ban đầu">
              <input name="copies" type="number" min={1} max={200} defaultValue={1} className={inputCls + " w-full bg-white"} required />
            </Field>
          </div>
        </ActionForm>
      </DialogButton>
    </>
  ) : null;

  const search = (
    <div className="flex flex-wrap items-center gap-2">
      <AutoForm className="contents">
        <input type="hidden" name="tab" value={tab} />
        <input type="hidden" name="v" value={view} />
        <input
          name="q"
          defaultValue={sp.q}
          placeholder={
            tab === "titles"
              ? "Tìm tên sách, mã sách, tác giả, ISBN, vị trí kệ..."
              : tab === "copies"
              ? "Tìm mã bản sao, tên sách..."
              : "Tìm mã phiếu, tên sách, học sinh..."
          }
          className={inputCls + " min-w-0 flex-1 md:min-w-64"}
        />

        {tab === "titles" && (
          <select name="category" defaultValue={sp.category ?? ""} className={inputCls}>
            <option value="">Tất cả thể loại</option>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        )}

        {(tab === "copies" || tab === "loans") && (
          <MobileCollapse active={[sp.status].filter(Boolean).length}>
            <select name="status" defaultValue={sp.status ?? ""} className={inputCls}>
              <option value="">Tất cả trạng thái</option>
              {tab === "copies"
                ? Object.entries(COPY_LABEL).map(([k, l]) => (
                    <option key={k} value={k}>{l}</option>
                  ))
                : Object.entries(LOAN_LABEL).map(([k, l]) => (
                    <option key={k} value={k}>{l}</option>
                  ))}
            </select>
          </MobileCollapse>
        )}

        {tab === "titles" && <ViewToggle path="/thu-vien" params={{ tab, q: sp.q, category: sp.category, size: sp.size }} view={view} />}
      </AutoForm>
      {actionBtns && <div className="ml-auto flex items-center gap-2">{actionBtns}</div>}
    </div>
  );

  const pager = (total: number) => (
    <Pagination
      total={total}
      page={pg.page}
      size={pg.size}
      path="/thu-vien"
      params={{ tab, q: sp.q, status: sp.status, category: sp.category, size: sp.size, v: sp.v }}
    />
  );

  const tabContent = (
    <>
      {/* ===================== TAB 1: ĐẦU SÁCH ===================== */}
      {tab === "titles" && (
        await (async () => {
          const where: Prisma.LibraryBookTitleWhereInput = {
            ...(sp.category ? { category: sp.category } : {}),
            ...(sp.q
              ? {
                  OR: [
                    { title: { contains: sp.q, mode: "insensitive" } },
                    { code: { contains: sp.q, mode: "insensitive" } },
                    { author: { contains: sp.q, mode: "insensitive" } },
                    { publisher: { contains: sp.q, mode: "insensitive" } },
                    { shelfLocation: { contains: sp.q, mode: "insensitive" } },
                    { isbn: { contains: sp.q, mode: "insensitive" } },
                  ],
                }
              : {}),
          };

          const [total, titles] = await Promise.all([
            db.libraryBookTitle.count({ where }),
            db.libraryBookTitle.findMany({
              where,
              orderBy: { title: "asc" },
              skip: pg.skip,
              take: pg.take,
              include: { copies: { select: { status: true, copyCode: true, condition: true } } },
            }),
          ]);

          const free = (t: (typeof titles)[number]) =>
            t.copies.filter((c) => c.status === "AVAILABLE").length;

          return (
            <div className="space-y-3">
              {view === "cards" ? (
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                  {titles.map((t) => {
                    const avail = free(t);
                    return (
                      <Card key={t.id} className="flex h-full flex-col gap-3">
                        <div className="flex items-start gap-3">
                          <span className="grid size-11 shrink-0 place-items-center rounded-lg bg-orange-100 text-orange-700">
                            <BookOpen className="size-6" />
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5">
                              {t.code && (
                                <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] font-bold text-slate-700">
                                  {t.code}
                                </span>
                              )}
                              {t.category && (
                                <span className="rounded bg-orange-50 px-1.5 py-0.5 text-[10px] text-orange-700">
                                  {t.category}
                                </span>
                              )}
                            </div>
                            <div className="mt-1 text-base font-semibold leading-snug">{t.title}</div>
                            <div className="text-xs text-slate-500">
                              {t.author ?? "Chưa rõ tác giả"}
                              {t.publisher ? ` · ${t.publisher}` : ""}
                            </div>
                            {t.shelfLocation && (
                              <div className="mt-1 text-xs text-slate-600">
                                📍 Vị trí: <b className="text-slate-800">{t.shelfLocation}</b>
                              </div>
                            )}
                          </div>
                        </div>

                        {t.description && (
                          <p className="line-clamp-2 text-xs text-slate-600 italic">
                            {t.description}
                          </p>
                        )}

                        <div className="mt-auto flex items-center justify-between gap-2 border-t pt-3 text-sm">
                          <span>
                            Sẵn sàng: <b className={avail ? "text-green-700" : "text-red-600"}>{avail}</b>
                            /{t.copies.length} cuốn
                          </span>

                          {manage && (
                            <div className="flex items-center gap-1">
                              <DialogButton label="+ Bản sao" title={`Thêm bản sao · ${t.title}`} size="sm" variant="secondary">
                                <ActionForm action={addBookCopy} submit="Thêm bản sao" className="flex flex-col gap-3 [&>button]:self-start">
                                  <input type="hidden" name="bookTitleId" value={t.id} />
                                  <Field label="Mã bản sao (duy nhất, vd TOAN10-05)">
                                    <input name="copyCode" className={inputCls + " w-full uppercase"} required />
                                  </Field>
                                  <Field label="Tình trạng sách">
                                    <select name="condition" className={inputCls + " w-full"}>
                                      <option value="Mới">Mới</option>
                                      <option value="Bình thường">Bình thường</option>
                                      <option value="Cũ">Cũ</option>
                                    </select>
                                  </Field>
                                </ActionForm>
                              </DialogButton>

                              <DialogButton label="Sửa" title={`Sửa đầu sách · ${t.title}`} size="sm" variant="ghost">
                                <ActionForm action={editBookTitle} submit="Lưu thay đổi" className="flex flex-col gap-3 [&>button]:self-start">
                                  <input type="hidden" name="id" value={t.id} />
                                  <Field label="Tên sách *">
                                    <input name="title" defaultValue={t.title} className={inputCls + " w-full"} required />
                                  </Field>
                                  <div className="grid grid-cols-2 gap-2">
                                    <Field label="Mã đầu sách">
                                      <input name="code" defaultValue={t.code ?? ""} className={inputCls + " w-full uppercase"} />
                                    </Field>
                                    <Field label="Thể loại">
                                      <select name="category" defaultValue={t.category ?? ""} className={inputCls + " w-full"}>
                                        <option value="">-- Chọn --</option>
                                        {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                                      </select>
                                    </Field>
                                  </div>
                                  <div className="grid grid-cols-2 gap-2">
                                    <Field label="Tác giả">
                                      <input name="author" defaultValue={t.author ?? ""} className={inputCls + " w-full"} />
                                    </Field>
                                    <Field label="Nhà xuất bản">
                                      <input name="publisher" defaultValue={t.publisher ?? ""} className={inputCls + " w-full"} />
                                    </Field>
                                  </div>
                                  <div className="grid grid-cols-2 gap-2">
                                    <Field label="Năm xuất bản">
                                      <input name="publishYear" type="number" defaultValue={t.publishYear ?? ""} className={inputCls + " w-full"} />
                                    </Field>
                                    <Field label="Vị trí giá sách">
                                      <input name="shelfLocation" defaultValue={t.shelfLocation ?? ""} className={inputCls + " w-full"} />
                                    </Field>
                                  </div>
                                  <Field label="ISBN">
                                    <input name="isbn" defaultValue={t.isbn ?? ""} className={inputCls + " w-full"} />
                                  </Field>
                                  <Field label="Mô tả">
                                    <textarea name="description" rows={2} defaultValue={t.description ?? ""} className="w-full rounded-md border p-2 text-sm bg-white" />
                                  </Field>
                                </ActionForm>
                              </DialogButton>
                            </div>
                          )}
                        </div>
                      </Card>
                    );
                  })}
                  {!titles.length && <p className="text-sm text-slate-500">Không có đầu sách phù hợp.</p>}
                </div>
              ) : (
                <Table head={["Mã sách", "Tên sách", "Thể loại", "Tác giả", "Vị trí kệ", "Tổng bản", "Sẵn sàng", ...(manage ? ["Thao tác"] : [])]}>
                  {titles.map((t) => {
                    const avail = free(t);
                    return (
                      <tr key={t.id} className="align-middle [&>td]:!py-3">
                        <td className="font-mono text-xs font-semibold text-slate-700">{t.code ?? "-"}</td>
                        <td>
                          <div className="font-semibold text-slate-900">{t.title}</div>
                          <div className="text-xs text-slate-500">
                            {t.publisher ? `${t.publisher}` : ""}
                            {t.isbn ? ` · ISBN ${t.isbn}` : ""}
                          </div>
                        </td>
                        <td>
                          {t.category ? (
                            <span className="rounded bg-orange-50 px-2 py-0.5 text-xs text-orange-800">
                              {t.category}
                            </span>
                          ) : (
                            <span className="text-slate-400">-</span>
                          )}
                        </td>
                        <td>{t.author ?? "-"}</td>
                        <td className="font-medium">{t.shelfLocation ?? "-"}</td>
                        <td>{t.copies.length}</td>
                        <td>
                          <b className={avail ? "text-green-700" : "text-red-600"}>{avail}</b>
                        </td>
                        {manage && (
                          <td>
                            <div className="flex items-center gap-1.5">
                              <DialogButton label="+ Bản sao" title={`Thêm bản sao · ${t.title}`} size="sm" variant="secondary">
                                <ActionForm action={addBookCopy} submit="Thêm bản sao" className="flex flex-col gap-3 [&>button]:self-start">
                                  <input type="hidden" name="bookTitleId" value={t.id} />
                                  <Field label="Mã bản sao (duy nhất, vd TOAN10-05)">
                                    <input name="copyCode" className={inputCls + " w-full uppercase"} required />
                                  </Field>
                                  <Field label="Tình trạng sách ban đầu">
                                    <select name="condition" className={inputCls + " w-full"}>
                                      <option value="Mới">Mới</option>
                                      <option value="Bình thường">Bình thường</option>
                                      <option value="Cũ">Cũ</option>
                                    </select>
                                  </Field>
                                </ActionForm>
                              </DialogButton>

                              <DialogButton label="Sửa" title={`Sửa đầu sách · ${t.title}`} size="sm" variant="ghost">
                                <ActionForm action={editBookTitle} submit="Lưu thay đổi" className="flex flex-col gap-3 [&>button]:self-start">
                                  <input type="hidden" name="id" value={t.id} />
                                  <Field label="Tên sách *">
                                    <input name="title" defaultValue={t.title} className={inputCls + " w-full"} required />
                                  </Field>
                                  <div className="grid grid-cols-2 gap-2">
                                    <Field label="Mã đầu sách">
                                      <input name="code" defaultValue={t.code ?? ""} className={inputCls + " w-full uppercase"} />
                                    </Field>
                                    <Field label="Thể loại">
                                      <select name="category" defaultValue={t.category ?? ""} className={inputCls + " w-full"}>
                                        <option value="">-- Chọn --</option>
                                        {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                                      </select>
                                    </Field>
                                  </div>
                                  <div className="grid grid-cols-2 gap-2">
                                    <Field label="Tác giả">
                                      <input name="author" defaultValue={t.author ?? ""} className={inputCls + " w-full"} />
                                    </Field>
                                    <Field label="Nhà xuất bản">
                                      <input name="publisher" defaultValue={t.publisher ?? ""} className={inputCls + " w-full"} />
                                    </Field>
                                  </div>
                                  <div className="grid grid-cols-2 gap-2">
                                    <Field label="Năm xuất bản">
                                      <input name="publishYear" type="number" defaultValue={t.publishYear ?? ""} className={inputCls + " w-full"} />
                                    </Field>
                                    <Field label="Vị trí giá sách">
                                      <input name="shelfLocation" defaultValue={t.shelfLocation ?? ""} className={inputCls + " w-full"} />
                                    </Field>
                                  </div>
                                  <Field label="ISBN">
                                    <input name="isbn" defaultValue={t.isbn ?? ""} className={inputCls + " w-full"} />
                                  </Field>
                                  <Field label="Mô tả">
                                    <textarea name="description" rows={2} defaultValue={t.description ?? ""} className="w-full rounded-md border p-2 text-sm bg-white" />
                                  </Field>
                                </ActionForm>
                              </DialogButton>

                              {t.copies.length === 0 && (
                                <ActionForm
                                  action={removeBookTitle}
                                  submit="Xóa"
                                  compact
                                  danger
                                  confirmText={`Xóa đầu sách "${t.title}"?`}
                                  className="inline-flex"
                                >
                                  <input type="hidden" name="id" value={t.id} />
                                </ActionForm>
                              )}
                            </div>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                  {!titles.length && (
                    <tr>
                      <td colSpan={manage ? 8 : 7} className="py-8 text-center text-slate-500">
                        {sp.q ? "Không có đầu sách phù hợp." : manage ? 'Chưa có đầu sách nào. Bấm "+ Thêm đầu sách" để thêm.' : "Thư viện chưa có sách."}
                      </td>
                    </tr>
                  )}
                </Table>
              )}
              {pager(total)}
            </div>
          );
        })()
      )}

      {/* ===================== TAB 2: BẢN SAO ===================== */}
      {tab === "copies" && manage && (
        await (async () => {
          const where: Prisma.LibraryBookCopyWhereInput = {
            ...(sp.status && sp.status in COPY_LABEL
              ? { status: sp.status as keyof typeof COPY_LABEL }
              : {}),
            ...(sp.q
              ? {
                  OR: [
                    { copyCode: { contains: sp.q, mode: "insensitive" } },
                    { bookTitle: { title: { contains: sp.q, mode: "insensitive" } } },
                    { bookTitle: { shelfLocation: { contains: sp.q, mode: "insensitive" } } },
                  ],
                }
              : {}),
          };

          const [total, copies] = await Promise.all([
            db.libraryBookCopy.count({ where }),
            db.libraryBookCopy.findMany({
              where,
              orderBy: [{ bookTitle: { title: "asc" } }, { copyCode: "asc" }],
              skip: pg.skip,
              take: pg.take,
              include: {
                bookTitle: true,
                loanItems: {
                  where: { status: "BORROWED" },
                  include: { loan: { include: { student: true } } },
                  take: 1,
                },
                loans: {
                  where: { status: "BORROWED" },
                  include: { student: true },
                  take: 1,
                },
              },
            }),
          ]);

          return (
            <div className="space-y-3">
              <Table head={["Mã bản sao", "Đầu sách", "Tình trạng", "Vị trí", "Trạng thái", "Người đang mượn", "Thao tác"]}>
                {copies.map((c) => {
                  const activeBorrower =
                    c.loanItems[0]?.loan?.student ?? c.loans[0]?.student;
                  const activeDueDate =
                    c.loanItems[0]?.loan?.dueDate ?? c.loans[0]?.dueDate;

                  return (
                    <tr key={c.id} className="align-middle [&>td]:!py-3">
                      <td className="font-mono text-xs font-bold text-slate-800">{c.copyCode}</td>
                      <td>
                        <div className="font-semibold">{c.bookTitle.title}</div>
                        {c.bookTitle.category && (
                          <div className="text-xs text-slate-500">{c.bookTitle.category}</div>
                        )}
                      </td>
                      <td>
                        <span className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-700">
                          {c.condition ?? "Bình thường"}
                        </span>
                      </td>
                      <td>{c.bookTitle.shelfLocation ?? "-"}</td>
                      <td>
                        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${COPY_TONE[c.status]}`}>
                          {COPY_LABEL[c.status]}
                        </span>
                      </td>
                      <td>
                        {activeBorrower ? (
                          <div>
                            <span className="font-medium text-slate-800">{activeBorrower.fullName}</span>
                            {activeDueDate && (
                              <div className="text-xs text-slate-500">Hạn: {fmtDate(activeDueDate)}</div>
                            )}
                          </div>
                        ) : (
                          <span className="text-slate-400">-</span>
                        )}
                      </td>
                      <td className="whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          {c.status === "AVAILABLE" && (
                            <DialogButton
                              label="Cho mượn"
                              title={`Cho mượn · ${c.bookTitle.title} (${c.copyCode})`}
                              size="sm"
                              variant="secondary"
                            >
                              <ActionForm action={lendBook} submit="Lập phiếu" className="flex flex-col gap-3 [&>button]:self-start">
                                <input type="hidden" name="bookCopyIds" value={c.id} />
                                <Field label="Học sinh mượn">
                                  <SearchableSelect
                                    name="studentId"
                                    options={studentOptions}
                                    placeholder="-- Gõ để tìm học sinh --"
                                    required
                                  />
                                </Field>
                                <Field label="Hạn trả">
                                  <input
                                    name="dueDate"
                                    type="date"
                                    defaultValue={isoDate(addDays(today, 14))}
                                    className={inputCls + " w-full"}
                                    required
                                  />
                                </Field>
                                <Field label="Ghi chú">
                                  <input name="note" placeholder="Ghi chú..." className={inputCls + " w-full"} />
                                </Field>
                              </ActionForm>
                            </DialogButton>
                          )}

                          {c.status !== "BORROWED" && (
                            <ActionForm
                              action={markCopyLost}
                              submit={c.status === "LOST" ? "Khôi phục" : "Báo mất"}
                              compact
                              danger={c.status !== "LOST"}
                              confirmText={c.status === "LOST" ? undefined : `Đánh dấu bản sao ${c.copyCode} là mất?`}
                              className="inline-flex"
                            >
                              <input type="hidden" name="id" value={c.id} />
                            </ActionForm>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {!copies.length && (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-slate-500">
                      Không có bản sao phù hợp.
                    </td>
                  </tr>
                )}
              </Table>
              {pager(total)}
            </div>
          );
        })()
      )}

      {/* ===================== TAB 3 & 4: PHIẾU MƯỢN / QUÁ HẠN ===================== */}
      {(tab === "loans" || tab === "overdue") && (
        await (async () => {
          const searchWhere: Prisma.LibraryLoanWhereInput = sp.q
            ? {
                OR: [
                  { loanCode: { contains: sp.q, mode: "insensitive" } },
                  { student: { fullName: { contains: sp.q, mode: "insensitive" } } },
                  { student: { code: { contains: sp.q, mode: "insensitive" } } },
                  {
                    items: {
                      some: {
                        OR: [
                          { bookCopy: { copyCode: { contains: sp.q, mode: "insensitive" } } },
                          { bookCopy: { bookTitle: { title: { contains: sp.q, mode: "insensitive" } } } },
                        ],
                      },
                    },
                  },
                ],
              }
            : {};

          const where: Prisma.LibraryLoanWhereInput =
            tab === "overdue"
              ? { AND: [overdueWhere, searchWhere] }
              : {
                  AND: [
                    mineLoan,
                    searchWhere,
                    sp.status && sp.status in LOAN_LABEL ? { status: sp.status as keyof typeof LOAN_LABEL } : {},
                  ],
                };

          const [total, loans] = await Promise.all([
            db.libraryLoan.count({ where }),
            db.libraryLoan.findMany({
              where,
              orderBy: tab === "overdue" ? { dueDate: "asc" } : { borrowedDate: "desc" },
              skip: pg.skip,
              take: pg.take,
              include: {
                student: {
                  select: {
                    id: true,
                    fullName: true,
                    code: true,
                    enrollments: {
                      take: 1,
                      orderBy: { academicYear: { startDate: "desc" } },
                      select: { schoolClass: { select: { className: true } } },
                    },
                  },
                },
                bookCopy: { include: { bookTitle: true } },
                items: {
                  include: {
                    bookCopy: { include: { bookTitle: true } },
                  },
                },
              },
            }),
          ]);

          const head = [
            ...(tab === "overdue" ? ["Quá hạn"] : []),
            "Mã phiếu",
            ...(manage ? ["Học sinh"] : []),
            "Sách trong phiếu (Số lượng)",
            "Ngày mượn",
            "Hạn trả",
            "Trạng thái",
            ...(manage ? ["Thao tác"] : []),
          ];

          return (
            <div className="space-y-3">
              <Table head={head}>
                {loans.map((l) => {
                  const late =
                    (l.status === "BORROWED" || l.status === "PARTIALLY_RETURNED") && l.dueDate < now;
                  const st = late ? "OVERDUE" : l.status;
                  const days = late
                    ? Math.max(1, Math.ceil((today.getTime() - l.dueDate.getTime()) / 86400_000))
                    : 0;

                  // Danh sách các cuốn sách trong phiếu
                  const loanItems = l.items.length > 0 ? l.items : (l.bookCopy ? [{
                    id: `legacy-${l.id}`,
                    bookCopy: l.bookCopy,
                    status: l.status,
                    returnedDate: l.returnedDate,
                    note: l.note,
                  }] : []);

                  const totalBooksCount = loanItems.length;
                  const borrowingCount = loanItems.filter((i) => i.status === "BORROWED").length;

                  return (
                    <tr key={l.id} className="align-middle [&>td]:!py-3">
                      {tab === "overdue" && (
                        <td>
                          <b className="rounded bg-red-50 px-2 py-0.5 text-red-600 font-bold">
                            {days} ngày
                          </b>
                        </td>
                      )}
                      <td className="font-mono text-xs font-semibold text-slate-800">
                        {l.loanCode ?? "PM-" + l.id.slice(-6).toUpperCase()}
                      </td>
                      {manage && (
                        <td>
                          <Link data-row href={`/hoc-sinh/${l.studentId}`} className="font-medium text-orange-700 hover:underline">
                            {l.student.fullName}
                          </Link>
                          <div className="text-xs text-slate-500">
                            {l.student.code ?? ""}{l.student.enrollments[0]?.schoolClass?.className ? ` · Lớp ${l.student.enrollments[0].schoolClass.className}` : ""}
                          </div>
                        </td>
                      )}
                      <td>
                        <div className="max-w-xs space-y-1">
                          <div className="text-xs font-semibold text-slate-700">
                            {totalBooksCount} cuốn {borrowingCount < totalBooksCount && `(còn ${borrowingCount} cuốn đang mượn)`}
                          </div>
                          <div className="space-y-0.5">
                            {loanItems.slice(0, 3).map((it, idx) => (
                              <div key={idx} className="flex items-center gap-1.5 text-xs text-slate-800 truncate">
                                <span className="font-mono text-[10px] text-slate-500">[{it.bookCopy.copyCode}]</span>
                                <span className="truncate">{it.bookCopy.bookTitle.title}</span>
                                {it.status === "RETURNED" && (
                                  <span className="text-[10px] text-green-600 font-medium">(Đã trả)</span>
                                )}
                                {it.status === "LOST" && (
                                  <span className="text-[10px] text-red-600 font-medium">(Mất)</span>
                                )}
                              </div>
                            ))}
                            {loanItems.length > 3 && (
                              <div className="text-[11px] text-slate-500 italic">
                                + {loanItems.length - 3} cuốn khác...
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td>{fmtDate(l.borrowedDate)}</td>
                      <td className={late ? "font-semibold text-red-600" : ""}>{fmtDate(l.dueDate)}</td>
                      <td>
                        <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${LOAN_TONE[st]}`}>
                          {LOAN_LABEL[st]}
                        </span>
                      </td>

                      {manage && (
                        <td className="whitespace-nowrap">
                          <div className="flex items-center gap-1.5">
                            {/* Nút Chi tiết & Trả sách */}
                            <DialogButton
                              label={
                                <span className="flex items-center gap-1">
                                  <Eye className="size-3.5" /> Chi tiết & Trả
                                </span>
                              }
                              title={`Chi tiết phiếu mượn ${l.loanCode ?? ""} · ${l.student.fullName}`}
                              size="sm"
                              variant="secondary"
                              wide
                            >
                              <div className="space-y-4">
                                <div className="grid grid-cols-2 gap-3 rounded-md bg-slate-50 p-3 text-xs sm:grid-cols-4">
                                  <div>
                                    <span className="text-slate-500">Học sinh:</span>
                                    <div className="font-semibold text-slate-900">{l.student.fullName}</div>
                                  </div>
                                  <div>
                                    <span className="text-slate-500">Ngày mượn:</span>
                                    <div className="font-semibold text-slate-900">{fmtDate(l.borrowedDate)}</div>
                                  </div>
                                  <div>
                                    <span className="text-slate-500">Hạn trả:</span>
                                    <div className={`font-semibold ${late ? "text-red-600" : "text-slate-900"}`}>{fmtDate(l.dueDate)}</div>
                                  </div>
                                  <div>
                                    <span className="text-slate-500">Trạng thái:</span>
                                    <div><span className={`rounded px-1.5 py-0.5 font-medium ${LOAN_TONE[st]}`}>{LOAN_LABEL[st]}</span></div>
                                  </div>
                                </div>

                                {l.note && (
                                  <div className="text-xs text-slate-600 italic">
                                    Ghi chú phiếu: {l.note}
                                  </div>
                                )}

                                <div className="space-y-2">
                                  <h3 className="text-sm font-semibold text-slate-800">
                                    Danh sách sách trong phiếu mượn:
                                  </h3>
                                  <div className="divide-y rounded-md border">
                                    {loanItems.map((item) => (
                                      <div key={item.id} className="flex flex-wrap items-center justify-between gap-3 p-3 text-xs">
                                        <div className="min-w-0 flex-1">
                                          <div className="flex items-center gap-2">
                                            <span className="font-mono text-xs font-bold text-slate-700">
                                              {item.bookCopy.copyCode}
                                            </span>
                                            <span className="text-sm font-medium text-slate-900">
                                              {item.bookCopy.bookTitle.title}
                                            </span>
                                          </div>
                                          <div className="text-slate-500">
                                            Tác giả: {item.bookCopy.bookTitle.author ?? "Chưa rõ"}
                                            {item.bookCopy.bookTitle.shelfLocation && ` · Kệ: ${item.bookCopy.bookTitle.shelfLocation}`}
                                          </div>
                                          {item.note && (
                                            <div className="mt-0.5 text-slate-600 italic">
                                              Ghi chú: {item.note}
                                            </div>
                                          )}
                                        </div>

                                        <div className="flex items-center gap-2">
                                          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${LOAN_TONE[item.status as keyof typeof LOAN_TONE]}`}>
                                            {LOAN_LABEL[item.status as keyof typeof LOAN_LABEL]}
                                          </span>

                                          {item.status === "BORROWED" && !item.id.startsWith("legacy-") && (
                                            <>
                                              <ActionForm
                                                action={returnSingleBookItem}
                                                submit="Trả cuốn này"
                                                compact
                                                confirmText={`Xác nhận trả cuốn "${item.bookCopy.bookTitle.title}" (${item.bookCopy.copyCode})?`}
                                                className="inline-flex"
                                              >
                                                <input type="hidden" name="loanItemId" value={item.id} />
                                              </ActionForm>
                                              <ActionForm
                                                action={reportItemLost}
                                                submit="Báo mất"
                                                compact
                                                danger
                                                confirmText={`Báo mất cuốn "${item.bookCopy.bookTitle.title}" (${item.bookCopy.copyCode})?`}
                                                className="inline-flex"
                                              >
                                                <input type="hidden" name="loanItemId" value={item.id} />
                                              </ActionForm>
                                            </>
                                          )}
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                </div>

                                {borrowingCount > 0 && (
                                  <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3">
                                    <ActionForm
                                      action={receiveBook}
                                      submit="✓ Nhận trả toàn bộ phiếu"
                                      confirmText="Xác nhận học sinh đã trả đủ tất cả các cuốn sách trong phiếu này?"
                                      className="inline-flex"
                                    >
                                      <input type="hidden" name="id" value={l.id} />
                                    </ActionForm>
                                  </div>
                                )}
                              </div>
                            </DialogButton>

                            {/* Nút Gia hạn */}
                            {(l.status === "BORROWED" || l.status === "PARTIALLY_RETURNED") && (
                              <DialogButton label="Gia hạn" title={`Gia hạn phiếu mượn ${l.loanCode ?? ""}`} size="sm" variant="ghost">
                                <ActionForm action={extendLoanDays} submit="Lưu gia hạn" className="flex flex-col gap-3 [&>button]:self-start">
                                  <input type="hidden" name="loanId" value={l.id} />
                                  <p className="text-xs text-slate-600">
                                    Hạn trả hiện tại: <b>{fmtDate(l.dueDate)}</b>
                                  </p>
                                  <Field label="Chọn hạn trả mới">
                                    <input
                                      name="newDueDate"
                                      type="date"
                                      defaultValue={isoDate(addDays(new Date(l.dueDate), 7))}
                                      className={inputCls + " w-full"}
                                      required
                                    />
                                  </Field>
                                </ActionForm>
                              </DialogButton>
                            )}

                            {/* Nút Trả nhanh toàn bộ phiếu */}
                            {(l.status === "BORROWED" || l.status === "PARTIALLY_RETURNED") && (
                              <ActionForm
                                action={receiveBook}
                                submit="Trả hết"
                                compact
                                confirmText="Xác nhận học sinh đã trả toàn bộ sách trong phiếu này?"
                                className="inline-flex"
                              >
                                <input type="hidden" name="id" value={l.id} />
                              </ActionForm>
                            )}
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
                {!loans.length && (
                  <tr>
                    <td colSpan={head.length} className="py-8 text-center text-slate-500">
                      {tab === "overdue"
                        ? "Tuyệt vời! Không có phiếu mượn nào bị quá hạn."
                        : manage
                        ? "Chưa có phiếu mượn nào phù hợp."
                        : "Bạn chưa mượn cuốn sách nào."}
                    </td>
                  </tr>
                )}
              </Table>
              {pager(total)}
            </div>
          );
        })()
      )}

      {/* ===================== TAB 5: THỐNG KÊ THƯ VIỆN ===================== */}
      {tab === "stats" && manage && (
        await (async () => {
          const [
            totalTitles,
            totalCopies,
            borrowedCopies,
            lostCopies,
            activeLoans,
            overdueLoans,
            categoriesList,
          ] = await Promise.all([
            db.libraryBookTitle.count(),
            db.libraryBookCopy.count(),
            db.libraryBookCopy.count({ where: { status: "BORROWED" } }),
            db.libraryBookCopy.count({ where: { status: "LOST" } }),
            db.libraryLoan.count({ where: { status: { in: ["BORROWED", "PARTIALLY_RETURNED"] } } }),
            db.libraryLoan.count({ where: overdueWhere }),
            db.libraryBookTitle.groupBy({
              by: ["category"],
              _count: { id: true },
            }),
          ]);

          const availableCopies = totalCopies - borrowedCopies - lostCopies;

          return (
            <div className="space-y-6">
              {/* Thẻ thống kê tổng quan */}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
                <Card className="flex flex-col gap-1 p-3">
                  <span className="text-xs text-slate-500">Tổng đầu sách</span>
                  <div className="text-2xl font-bold text-slate-900">{totalTitles}</div>
                </Card>
                <Card className="flex flex-col gap-1 p-3">
                  <span className="text-xs text-slate-500">Tổng bản sao</span>
                  <div className="text-2xl font-bold text-slate-900">{totalCopies}</div>
                </Card>
                <Card className="flex flex-col gap-1 p-3">
                  <span className="text-xs text-slate-500">Đang cho mượn</span>
                  <div className="text-2xl font-bold text-blue-600">{borrowedCopies}</div>
                </Card>
                <Card className="flex flex-col gap-1 p-3">
                  <span className="text-xs text-slate-500">Sẵn sàng trong kho</span>
                  <div className="text-2xl font-bold text-green-600">{availableCopies}</div>
                </Card>
                <Card className="flex flex-col gap-1 p-3">
                  <span className="text-xs text-slate-500">Phiếu đang mượn</span>
                  <div className="text-2xl font-bold text-sky-700">{activeLoans}</div>
                </Card>
                <Card className="flex flex-col gap-1 p-3">
                  <span className="text-xs text-slate-500">Phiếu quá hạn</span>
                  <div className="text-2xl font-bold text-red-600">{overdueLoans}</div>
                </Card>
              </div>

              {/* Bảng phân bổ thể loại */}
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <Card className="space-y-3">
                  <h3 className="font-semibold text-slate-800">Phân loại sách theo thể loại</h3>
                  <div className="space-y-2">
                    {categoriesList.map((cat, idx) => {
                      const count = cat._count.id;
                      const pct = totalTitles > 0 ? Math.round((count / totalTitles) * 100) : 0;
                      return (
                        <div key={idx} className="space-y-1 text-xs">
                          <div className="flex justify-between font-medium">
                            <span>{cat.category ?? "Chưa phân loại"}</span>
                            <span>{count} đầu sách ({pct}%)</span>
                          </div>
                          <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
                            <div className="h-full bg-orange-500" style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      );
                    })}
                    {!categoriesList.length && <p className="text-xs text-slate-400">Chưa có dữ liệu.</p>}
                  </div>
                </Card>

                <Card className="space-y-3">
                  <h3 className="font-semibold text-slate-800">Tình trạng sách trong thư viện</h3>
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="rounded-lg bg-green-50 p-3">
                      <div className="text-xl font-bold text-green-700">{availableCopies}</div>
                      <div className="text-xs text-green-800 font-medium">Sẵn sàng</div>
                    </div>
                    <div className="rounded-lg bg-blue-50 p-3">
                      <div className="text-xl font-bold text-blue-700">{borrowedCopies}</div>
                      <div className="text-xs text-blue-800 font-medium">Đang mượn</div>
                    </div>
                    <div className="rounded-lg bg-red-50 p-3">
                      <div className="text-xl font-bold text-red-700">{lostCopies}</div>
                      <div className="text-xs text-red-800 font-medium">Báo mất</div>
                    </div>
                  </div>

                  <div className="rounded-md border p-3 text-xs text-slate-600">
                    <p className="font-medium text-slate-800">Ghi chú vận hành thư viện:</p>
                    <ul className="mt-1 list-disc pl-4 space-y-1">
                      <li>Học sinh được mượn nhiều cuốn sách trong cùng 1 phiếu mượn.</li>
                      <li>Có thể nhận trả lẻ từng cuốn sách hoặc nhận trả toàn bộ phiếu cùng lúc.</li>
                      <li>Khi học sinh có nhu cầu đọc thêm, thủ thư có thể bấm "Gia hạn" để tăng thêm ngày hẹn trả.</li>
                    </ul>
                  </div>
                </Card>
              </div>
            </div>
          );
        })()
      )}

      {!manage && tab === "titles" && (
        <p className="flex items-center gap-1.5 text-xs text-slate-500">
          <Library className="size-3.5" />
          Muốn mượn sách, hãy đến thư viện gặp thủ thư để được quét mã và lập phiếu mượn.
        </p>
      )}
    </>
  );

  return (
    <div className="space-y-4">
      <Title>Thư viện</Title>
      <Tabs current={`?tab=${tab}`} items={tabItems} />
      {tab !== "stats" && search}
      {tabContent}
    </div>
  );
}
