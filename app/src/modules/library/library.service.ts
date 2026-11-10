import { canManageLibrary, type SessionUser } from "@/lib/auth/session";
import { ConflictError, ForbiddenError } from "@/shared/errors";
import * as libraryRepository from "@/modules/library/library.repository";
import { createNotification } from "@/modules/notification/notification.service";
import type {
  CreateBookCopyInput,
  CreateBookTitleInput,
  CreateLoanInput,
  ExtendLoanInput,
  ReturnLoanInput,
  ReturnLoanItemInput,
  UpdateBookTitleInput,
} from "@/modules/library/library.schema";

function assertCanManageLibrary(user: SessionUser) {
  if (!canManageLibrary(user)) {
    throw new ForbiddenError("Chỉ Thủ thư/Hiệu trưởng/Hiệu phó được quản lý thư viện");
  }
}

export async function createBookTitle(
  user: SessionUser,
  input: CreateBookTitleInput,
) {
  assertCanManageLibrary(user);
  return libraryRepository.createBookTitle(input);
}

export async function updateBookTitle(
  user: SessionUser,
  input: UpdateBookTitleInput,
) {
  assertCanManageLibrary(user);
  const { id, ...data } = input;
  return libraryRepository.updateBookTitle(id, data);
}

export async function deleteBookTitle(user: SessionUser, id: string) {
  assertCanManageLibrary(user);
  return libraryRepository.deleteBookTitle(id);
}

export function listBookTitles() {
  return libraryRepository.listBookTitles();
}

export async function createBookCopy(
  user: SessionUser,
  input: CreateBookCopyInput,
) {
  assertCanManageLibrary(user);

  const existing = await libraryRepository.findBookCopyByCode(input.copyCode);
  if (existing) {
    throw new ConflictError("Mã vạch bản sao sách này đã tồn tại");
  }

  return libraryRepository.createBookCopy(input);
}

export async function updateBookCopy(
  user: SessionUser,
  id: string,
  data: { condition?: string | null; status?: "AVAILABLE" | "BORROWED" | "LOST" },
) {
  assertCanManageLibrary(user);
  return libraryRepository.updateBookCopy(id, data);
}

/** Thủ thư lập phiếu mượn sách: mỗi phiếu có thể mượn nhiều sách. */
export async function createLoan(user: SessionUser, input: CreateLoanInput) {
  assertCanManageLibrary(user);

  if (!input.bookCopyIds.length) {
    throw new ConflictError("Cần chọn ít nhất một cuốn sách để lập phiếu");
  }

  // 1. Kiểm tra tài khoản học sinh
  const student = await libraryRepository.findStudentWithUser(input.studentId);
  if (!student) {
    throw new ConflictError("Học sinh không tồn tại");
  }
  if (student.user && !student.user.isActive) {
    throw new ConflictError("Tài khoản học sinh này đã bị khóa hoặc ngừng hoạt động");
  }

  // 2. Kiểm tra sách nợ quá hạn
  const overdueLoans = await libraryRepository.findOverdueLoansByStudent(input.studentId);
  if (overdueLoans.length > 0) {
    const overdueBookCount = overdueLoans.reduce((sum, l) => sum + l.items.length, 0);
    throw new ConflictError(
      `Học sinh đang có ${overdueLoans.length} phiếu mượn quá hạn (${overdueBookCount} cuốn sách chưa trả). Cần thu hồi sách quá hạn trước khi cho mượn tiếp!`
    );
  }

  // 3. Kiểm tra hạn mức số lượng sách đang mượn (tối đa 5 cuốn/học sinh)
  const MAX_BORROW_LIMIT = 5;
  const currentHoldingCount = await libraryRepository.countActiveBorrowedItems(input.studentId);
  if (currentHoldingCount + input.bookCopyIds.length > MAX_BORROW_LIMIT) {
    throw new ConflictError(
      `Học sinh hiện đang giữ ${currentHoldingCount} cuốn sách. Mượn thêm ${input.bookCopyIds.length} cuốn sẽ vượt quá hạn mức tối đa (${MAX_BORROW_LIMIT} cuốn/học sinh).`
    );
  }

  // Kiểm tra trùng lặp sách trong cùng phiếu
  const uniqueCopies = new Set(input.bookCopyIds);
  if (uniqueCopies.size !== input.bookCopyIds.length) {
    throw new ConflictError("Không thể chọn trùng một bản sao sách nhiều lần trong cùng một phiếu");
  }

  // Kiểm tra tất cả bản sao có sẵn sàng
  for (const copyId of input.bookCopyIds) {
    const copy = await libraryRepository.findBookCopy(copyId);
    if (!copy) {
      throw new ConflictError(`Bản sao sách (ID: ${copyId}) không tồn tại`);
    }
    if (copy.status !== "AVAILABLE") {
      throw new ConflictError(`Sách "${copy.bookTitle?.title}" (${copy.copyCode}) hiện không sẵn sàng cho mượn`);
    }
  }

  const loan = await libraryRepository.createLoan(input);

  // Gửi thông báo đến học sinh mượn sách
  try {
    if (student.userId) {
      await createNotification({
        userId: student.userId,
        title: "Phiếu mượn sách thư viện",
        content: `Bạn đã mượn thành công ${input.bookCopyIds.length} cuốn sách. Hạn trả: ${new Date(input.dueDate).toLocaleDateString("vi-VN")}. Vui lòng trả sách đúng hạn.`,
        type: "LIBRARY",
        link: "/thu-vien?tab=my-loans",
      });
    }
  } catch {
    // Không làm gián đoạn
  }

  return loan;
}

/** Thủ thư xác nhận trả toàn bộ phiếu mượn. */
export async function returnLoan(user: SessionUser, input: ReturnLoanInput) {
  assertCanManageLibrary(user);

  const loan = await libraryRepository.findLoan(input.loanId);
  if (!loan) {
    throw new ConflictError("Phiếu mượn không tồn tại");
  }
  if (loan.status === "RETURNED") {
    throw new ConflictError("Phiếu mượn này đã được trả đủ trước đó");
  }

  return libraryRepository.markLoanReturned(input.loanId, input.note);
}

/** Trả hoặc báo mất từng cuốn sách cụ thể trong phiếu mượn. */
export async function returnLoanItem(user: SessionUser, input: ReturnLoanItemInput) {
  assertCanManageLibrary(user);
  return libraryRepository.returnLoanItem(input.loanItemId, input.status, input.note);
}

/** Gia hạn ngày trả của phiếu mượn. */
export async function extendLoan(user: SessionUser, input: ExtendLoanInput) {
  assertCanManageLibrary(user);

  const loan = await libraryRepository.findLoan(input.loanId);
  if (!loan) {
    throw new ConflictError("Phiếu mượn không tồn tại");
  }
  if (loan.status === "RETURNED") {
    throw new ConflictError("Không thể gia hạn phiếu mượn đã hoàn tất");
  }
  if (input.newDueDate <= loan.borrowedDate) {
    throw new ConflictError("Hạn trả mới phải sau ngày mượn sách");
  }

  return libraryRepository.extendLoanDueDate(input.loanId, input.newDueDate);
}

export async function listMyLoans(user: SessionUser) {
  if (!user.studentId) {
    throw new ForbiddenError("Chỉ học sinh mới có phiếu mượn sách cá nhân");
  }
  return libraryRepository.listLoansByStudent(user.studentId);
}
