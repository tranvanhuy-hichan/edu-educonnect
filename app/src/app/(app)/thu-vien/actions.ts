"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { assertRole, LIBRARY_ROLES } from "@/lib/guard";
import { wrap, str, int, opt } from "@/lib/action";
import { audit } from "@/lib/audit";
import {
  createBookCopy,
  createBookTitle,
  updateBookTitle,
  deleteBookTitle,
  createLoan,
  returnLoan,
  returnLoanItem,
  extendLoan,
  updateBookCopy,
} from "@/modules/library/library.service";

const pad = (n: number) => String(n).padStart(2, "0");

/** Thêm đầu sách kèm số bản sao ban đầu; mã bản sao sinh theo "<tiền tố>-01, -02...". */
export const addBookTitle = wrap(async (fd) => {
  const me = await assertRole(...LIBRARY_ROLES);
  const title = str(fd, "title");
  if (!title) throw new Error("Nhập tên sách");
  const copies = Math.min(int(fd, "copies", 1), 200);
  const prefix = str(fd, "prefix").toUpperCase().replace(/\s+/g, "");
  if (copies > 0 && !prefix) {
    throw new Error("Nhập mã tiền tố để sinh mã bản sao (vd TOAN10)");
  }

  const codes = Array.from({ length: copies }, (_, i) => `${prefix}-${pad(i + 1)}`);
  if (codes.length) {
    const existing = await db.libraryBookCopy.findFirst({ where: { copyCode: { in: codes } } });
    if (existing) {
      throw new Error(`Mã tiền tố này đã có bản sao trùng mã (${existing.copyCode}), hãy dùng tiền tố khác`);
    }
  }

  const code = opt(fd, "code")?.toUpperCase() ?? undefined;
  if (code) {
    const dupCode = await db.libraryBookTitle.findUnique({ where: { code } });
    if (dupCode) throw new Error(`Mã đầu sách "${code}" đã tồn tại`);
  }

  const t = await createBookTitle(me, {
    title,
    code,
    author: opt(fd, "author") ?? undefined,
    publisher: opt(fd, "publisher") ?? undefined,
    publishYear: fd.get("publishYear") ? int(fd, "publishYear") : undefined,
    category: opt(fd, "category") ?? undefined,
    shelfLocation: opt(fd, "shelfLocation") ?? undefined,
    description: opt(fd, "description") ?? undefined,
    isbn: opt(fd, "isbn") ?? undefined,
    totalCopies: copies,
  });

  for (const copyCode of codes) {
    await createBookCopy(me, { bookTitleId: t.id, copyCode, condition: "Mới" });
  }

  await audit(me.email, "create_book_title", "LibraryBookTitle", t.id);
  revalidatePath("/thu-vien");
  return `Đã thêm "${title}" với ${copies} bản sao`;
});

/** Chỉnh sửa thông tin đầu sách. */
export const editBookTitle = wrap(async (fd) => {
  const me = await assertRole(...LIBRARY_ROLES);
  const id = str(fd, "id");
  const title = str(fd, "title");
  if (!id || !title) throw new Error("Thiếu thông tin sách cần sửa");

  const code = opt(fd, "code")?.toUpperCase() ?? undefined;
  if (code) {
    const dup = await db.libraryBookTitle.findFirst({ where: { code, NOT: { id } } });
    if (dup) throw new Error(`Mã đầu sách "${code}" đã được dùng bởi sách khác`);
  }

  await updateBookTitle(me, {
    id,
    title,
    code,
    author: opt(fd, "author") ?? undefined,
    publisher: opt(fd, "publisher") ?? undefined,
    publishYear: fd.get("publishYear") ? int(fd, "publishYear") : undefined,
    category: opt(fd, "category") ?? undefined,
    shelfLocation: opt(fd, "shelfLocation") ?? undefined,
    description: opt(fd, "description") ?? undefined,
    isbn: opt(fd, "isbn") ?? undefined,
  });

  await audit(me.email, "update_book_title", "LibraryBookTitle", id);
  revalidatePath("/thu-vien");
  return `Đã cập nhật thông tin sách "${title}"`;
});

/** Xóa đầu sách nếu chưa có bản sao nào được mượn hoặc chưa có bản sao */
export const removeBookTitle = wrap(async (fd) => {
  const me = await assertRole(...LIBRARY_ROLES);
  const id = str(fd, "id");
  await deleteBookTitle(me, id);
  await audit(me.email, "delete_book_title", "LibraryBookTitle", id);
  revalidatePath("/thu-vien");
  return "Đã xóa đầu sách";
});

/** Thêm bản sao lẻ cho đầu sách. */
export const addBookCopy = wrap(async (fd) => {
  const me = await assertRole(...LIBRARY_ROLES);
  const bookTitleId = str(fd, "bookTitleId");
  const copyCode = str(fd, "copyCode").toUpperCase().trim();
  const condition = opt(fd, "condition") ?? "Bình thường";
  if (!copyCode) throw new Error("Nhập mã bản sao");

  await createBookCopy(me, { bookTitleId, copyCode, condition });
  await db.libraryBookTitle.update({
    where: { id: bookTitleId },
    data: { totalCopies: { increment: 1 } },
  });

  await audit(me.email, "create_book_copy", "LibraryBookCopy", copyCode);
  revalidatePath("/thu-vien");
  return `Đã thêm bản sao "${copyCode}"`;
});

/** Đánh dấu bản sao là mất hoặc khôi phục lại sẵn sàng. */
export const markCopyLost = wrap(async (fd) => {
  const me = await assertRole(...LIBRARY_ROLES);
  const copy = await db.libraryBookCopy.findUniqueOrThrow({ where: { id: str(fd, "id") } });
  if (copy.status === "BORROWED") {
    throw new Error("Bản sao đang được mượn trong phiếu, hãy xử lý trong phiếu mượn");
  }
  const nextStatus = copy.status === "LOST" ? "AVAILABLE" : "LOST";
  await db.libraryBookCopy.update({
    where: { id: copy.id },
    data: { status: nextStatus },
  });
  await audit(me.email, "toggle_copy_lost", "LibraryBookCopy", copy.id);
  revalidatePath("/thu-vien");
  return nextStatus === "LOST" ? "Đã đánh dấu mất bản sao" : "Đã khôi phục bản sao về sẵn sàng";
});

/** Lập phiếu mượn sách: Cho phép mượn NHIỀU sách trong 1 phiếu! */
export const lendBook = wrap(async (fd) => {
  const me = await assertRole(...LIBRARY_ROLES);
  const studentId = str(fd, "studentId");
  if (!studentId) throw new Error("Chọn học sinh mượn sách");

  const due = str(fd, "dueDate");
  if (!due) throw new Error("Chọn hạn trả");

  // Hỗ trợ cả chọn nhiều sách (bookCopyIds) hoặc 1 sách lẻ (bookCopyId)
  let rawCopies = fd.getAll("bookCopyIds").map(String).filter(Boolean);
  if (!rawCopies.length && fd.get("bookCopyId")) {
    rawCopies = [str(fd, "bookCopyId")];
  }

  if (!rawCopies.length) {
    throw new Error("Vui lòng chọn ít nhất 1 cuốn sách để lập phiếu mượn");
  }

  const note = opt(fd, "note") ?? undefined;
  const loan = await createLoan(me, {
    studentId,
    bookCopyIds: rawCopies,
    dueDate: new Date(due),
    note,
  });

  await audit(me.email, "create_loan", "LibraryLoan", loan.id);
  revalidatePath("/thu-vien");
  return `Đã lập phiếu mượn ${loan.loanCode} với ${rawCopies.length} cuốn sách`;
});

/** Xác nhận trả toàn bộ phiếu mượn. */
export const receiveBook = wrap(async (fd) => {
  const me = await assertRole(...LIBRARY_ROLES);
  const loanId = str(fd, "id") || str(fd, "loanId");
  const note = opt(fd, "note") ?? undefined;
  const loan = await returnLoan(me, { loanId, note });
  await audit(me.email, "return_loan", "LibraryLoan", loan.id);
  revalidatePath("/thu-vien");
  return `Đã nhận trả toàn bộ sách trong phiếu ${loan.loanCode ?? ""}`;
});

/** Nhận trả từng cuốn sách trong phiếu mượn. */
export const returnSingleBookItem = wrap(async (fd) => {
  const me = await assertRole(...LIBRARY_ROLES);
  const loanItemId = str(fd, "loanItemId");
  const note = opt(fd, "note") ?? undefined;
  await returnLoanItem(me, { loanItemId, status: "RETURNED", note });
  await audit(me.email, "return_loan_item", "LibraryLoanItem", loanItemId);
  revalidatePath("/thu-vien");
  return "Đã ghi nhận trả cuốn sách này";
});

/** Báo mất một cuốn sách cụ thể trong phiếu mượn. */
export const reportItemLost = wrap(async (fd) => {
  const me = await assertRole(...LIBRARY_ROLES);
  const loanItemId = str(fd, "loanItemId");
  const note = opt(fd, "note") ?? "Học sinh báo mất";
  await returnLoanItem(me, { loanItemId, status: "LOST", note });
  await audit(me.email, "report_lost_item", "LibraryLoanItem", loanItemId);
  revalidatePath("/thu-vien");
  return "Đã ghi nhận mất cuốn sách này";
});

/** Gia hạn ngày trả cho phiếu mượn sách. */
export const extendLoanDays = wrap(async (fd) => {
  const me = await assertRole(...LIBRARY_ROLES);
  const loanId = str(fd, "loanId");
  const newDueDate = str(fd, "newDueDate");
  if (!newDueDate) throw new Error("Chọn hạn trả mới");

  await extendLoan(me, { loanId, newDueDate: new Date(newDueDate) });
  await audit(me.email, "extend_loan", "LibraryLoan", loanId);
  revalidatePath("/thu-vien");
  return "Đã gia hạn thành công hạn trả sách";
});
