import { prisma } from "@/lib/prisma";
import type {
  CreateBookCopyInput,
  CreateBookTitleInput,
  CreateLoanInput,
  UpdateBookTitleInput,
} from "@/modules/library/library.schema";

export function createBookTitle(input: CreateBookTitleInput) {
  return prisma.libraryBookTitle.create({ data: input });
}

export function updateBookTitle(id: string, input: Omit<UpdateBookTitleInput, "id">) {
  return prisma.libraryBookTitle.update({
    where: { id },
    data: input,
  });
}

export async function deleteBookTitle(id: string) {
  const copiesCount = await prisma.libraryBookCopy.count({ where: { bookTitleId: id } });
  if (copiesCount > 0) {
    throw new Error(`Không thể xóa đầu sách đang có ${copiesCount} bản sao.`);
  }
  return prisma.libraryBookTitle.delete({ where: { id } });
}

export function listBookTitles() {
  return prisma.libraryBookTitle.findMany({
    include: { copies: true },
    orderBy: { title: "asc" },
  });
}

export function findBookCopyByCode(copyCode: string) {
  return prisma.libraryBookCopy.findUnique({ where: { copyCode } });
}

export function createBookCopy(input: CreateBookCopyInput) {
  return prisma.libraryBookCopy.create({ data: input });
}

export function findBookCopy(id: string) {
  return prisma.libraryBookCopy.findUnique({
    where: { id },
    include: { bookTitle: true },
  });
}

export function setBookCopyStatus(
  id: string,
  status: "AVAILABLE" | "BORROWED" | "LOST",
) {
  return prisma.libraryBookCopy.update({ where: { id }, data: { status } });
}

export function updateBookCopy(
  id: string,
  data: { condition?: string | null; status?: "AVAILABLE" | "BORROWED" | "LOST" },
) {
  return prisma.libraryBookCopy.update({ where: { id }, data });
}

export async function createLoan(input: CreateLoanInput) {
  return prisma.$transaction(async (tx) => {
    // Tự sinh mã phiếu nếu chưa có: PM-YYYYMMDD-XXXX
    let code = input.loanCode;
    if (!code) {
      const todayStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");
      const countToday = await tx.libraryLoan.count({
        where: {
          loanCode: { startsWith: `PM-${todayStr}` },
        },
      });
      code = `PM-${todayStr}-${String(countToday + 1).padStart(3, "0")}`;
    }

    const loan = await tx.libraryLoan.create({
      data: {
        loanCode: code,
        studentId: input.studentId,
        dueDate: input.dueDate,
        note: input.note,
        status: "BORROWED",
        items: {
          create: input.bookCopyIds.map((copyId) => ({
            bookCopyId: copyId,
            status: "BORROWED",
          })),
        },
      },
      include: {
        items: { include: { bookCopy: { include: { bookTitle: true } } } },
        student: true,
      },
    });

    // Cập nhật trạng thái các bản sao sách thành BORROWED
    await tx.libraryBookCopy.updateMany({
      where: { id: { in: input.bookCopyIds } },
      data: { status: "BORROWED" },
    });

    return loan;
  });
}

export function findLoan(id: string) {
  return prisma.libraryLoan.findUnique({
    where: { id },
    include: {
      student: true,
      items: {
        include: {
          bookCopy: { include: { bookTitle: true } },
        },
      },
    },
  });
}

export async function markLoanReturned(id: string, note?: string) {
  const now = new Date();
  return prisma.$transaction(async (tx) => {
    const loan = await tx.libraryLoan.findUniqueOrThrow({
      where: { id },
      include: { items: true },
    });

    // Đánh dấu tất cả các item chưa trả thành RETURNED
    const copyIdsToFree: string[] = [];
    for (const item of loan.items) {
      if (item.status === "BORROWED") {
        await tx.libraryLoanItem.update({
          where: { id: item.id },
          data: { status: "RETURNED", returnedDate: now },
        });
        copyIdsToFree.push(item.bookCopyId);
      }
    }

    if (copyIdsToFree.length > 0) {
      await tx.libraryBookCopy.updateMany({
        where: { id: { in: copyIdsToFree } },
        data: { status: "AVAILABLE" },
      });
    }

    return tx.libraryLoan.update({
      where: { id },
      data: {
        status: "RETURNED",
        returnedDate: now,
        note: note ? (loan.note ? `${loan.note} | ${note}` : note) : loan.note,
      },
      include: {
        items: { include: { bookCopy: { include: { bookTitle: true } } } },
      },
    });
  });
}

export async function returnLoanItem(
  loanItemId: string,
  status: "RETURNED" | "LOST" = "RETURNED",
  note?: string,
) {
  const now = new Date();
  return prisma.$transaction(async (tx) => {
    const item = await tx.libraryLoanItem.findUniqueOrThrow({
      where: { id: loanItemId },
      include: { loan: { include: { items: true } } },
    });

    if (item.status !== "BORROWED") {
      throw new Error("Cuốn sách này đã được ghi nhận trả hoặc mất trước đó");
    }

    // Cập nhật trạng thái item
    await tx.libraryLoanItem.update({
      where: { id: loanItemId },
      data: {
        status,
        returnedDate: now,
        note,
      },
    });

    // Cập nhật trạng thái bản sao sách
    await tx.libraryBookCopy.update({
      where: { id: item.bookCopyId },
      data: { status: status === "LOST" ? "LOST" : "AVAILABLE" },
    });

    // Kiểm tra tất cả các item trong phiếu mượn
    const siblingItems = await tx.libraryLoanItem.findMany({
      where: { loanId: item.loanId },
    });

    const hasBorrowing = siblingItems.some(
      (si) => (si.id === item.id ? status : si.status) === "BORROWED",
    );
    const hasReturnedOrLost = siblingItems.some(
      (si) => (si.id === item.id ? status : si.status) !== "BORROWED",
    );

    let nextLoanStatus: "BORROWED" | "PARTIALLY_RETURNED" | "RETURNED" = "BORROWED";
    if (!hasBorrowing) {
      nextLoanStatus = "RETURNED";
    } else if (hasReturnedOrLost) {
      nextLoanStatus = "PARTIALLY_RETURNED";
    }

    return tx.libraryLoan.update({
      where: { id: item.loanId },
      data: {
        status: nextLoanStatus,
        returnedDate: nextLoanStatus === "RETURNED" ? now : null,
      },
    });
  });
}

export function extendLoanDueDate(id: string, newDueDate: Date) {
  return prisma.libraryLoan.update({
    where: { id },
    data: { dueDate: newDueDate },
  });
}

export function listLoansByStudent(studentId: string) {
  return prisma.libraryLoan.findMany({
    where: { studentId },
    include: {
      items: {
        include: {
          bookCopy: { include: { bookTitle: true } },
        },
      },
    },
    orderBy: { borrowedDate: "desc" },
  });
}
