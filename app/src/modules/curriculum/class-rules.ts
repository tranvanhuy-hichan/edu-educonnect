import { db } from "@/lib/db";

/**
 * Quy tắc khi tạo/sửa lớp, dùng chung cho giao diện quản trị và API ngoài (một nguồn sự thật):
 * phòng học phải tồn tại, tên lớp không trùng trong năm học, một phòng không có 2 lớp cùng ca trong cùng năm học.
 */
export async function assertClassRules(d: { className: string; academicYearId: string; roomId: string; shift: "MORNING" | "AFTERNOON" }, exceptId?: string) {
  if (!await db.room.findUnique({ where: { id: d.roomId } })) throw new Error("Phòng học không tồn tại");
  if (await db.schoolClass.findFirst({ where: { className: d.className, academicYearId: d.academicYearId, ...(exceptId ? { id: { not: exceptId } } : {}) } })) throw new Error(`Lớp ${d.className} đã có trong năm học này`);
  // Trong cùng một năm học và ca học (sáng hoặc chiều), một phòng chỉ có tối đa 1 lớp học
  const roomConflict = await db.schoolClass.findFirst({ where: { academicYearId: d.academicYearId, roomId: d.roomId, shift: d.shift, ...(exceptId ? { id: { not: exceptId } } : {}) }, include: { room: true } });
  if (roomConflict) {
    const shiftText = d.shift === "MORNING" ? "buổi sáng (tiết 1–5)" : "buổi chiều (tiết 6–10)";
    throw new Error(`Phòng ${roomConflict.room?.roomName || ""} đã được xếp cho lớp ${roomConflict.className} học vào ${shiftText} trong năm học này. Trong cùng một buổi, không thể có 2 lớp học chung 1 phòng. Vui lòng chọn phòng khác hoặc đổi ca học.`);
  }
}
