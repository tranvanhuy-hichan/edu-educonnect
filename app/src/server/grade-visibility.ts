import { db } from "@/lib/db";
import type { Me } from "@/lib/guard";

/** Chỉ Admin và Hiệu trưởng được khóa/công bố điểm cho học sinh và phụ huynh. */
export const canManageGradeVisibility = (me: { roles: readonly string[] }) => me.roles.includes("ADMIN") || me.roles.includes("PRINCIPAL");
export type GradeVisibilityUser = Pick<Me, "roles">;

/** Các học kỳ đang khóa xem điểm với học sinh/phụ huynh. Giáo viên và quản lý không bị ảnh hưởng. */
export async function hiddenTermIds(): Promise<string[]> {
  return (await db.academicTerm.findMany({ where: { gradesHidden: true }, select: { id: true } })).map((t) => t.id);
}
