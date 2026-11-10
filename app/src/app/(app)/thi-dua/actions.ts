"use server";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { assertRole, ADMIN_ROLES, MANAGER_ROLES } from "@/lib/guard";
import { wrap, str } from "@/lib/action";
import { audit } from "@/lib/audit";
import { parseDate } from "@/lib/format";
import { ConflictError } from "@/shared/errors";
import { createCriteria as createCriteriaSvc, recalculateEmulationForTerm } from "@/modules/emulation/emulation.service";

const optDate = (fd: FormData, k: string) => (/^\d{4}-\d{2}-\d{2}$/.test(str(fd, k)) ? parseDate(str(fd, k)) : undefined);

/** Tổng hợp điểm thi đua cho một lớp hoặc tất cả lớp theo kỳ (tuần/tháng/học kỳ). */
export const recalculate = wrap(async (fd) => {
  const me = await assertRole(...MANAGER_ROLES);
  const r = await recalculateEmulationForTerm(me, {
    academicTermId: str(fd, "termId"),
    periodLabel: str(fd, "label"),
    schoolClassId: str(fd, "classId") || undefined,
    from: optDate(fd, "from"),
    to: optDate(fd, "to"),
  });
  await audit(me.email, "recalculate_emulation", "ClassEmulationScore", r.periodLabel);
  revalidatePath("/thi-dua");
  return `Đã tổng hợp thi đua "${r.periodLabel}" cho ${r.classes} lớp`;
});

export const createCriteria = wrap(async (fd) => {
  const me = await assertRole(...MANAGER_ROLES);
  const weight = Number(str(fd, "weight").replace(",", "."));
  if (!Number.isFinite(weight)) throw new ConflictError("Trọng số phải là số");
  const c = await createCriteriaSvc(me, { criteriaName: str(fd, "name"), weight });
  await audit(me.email, "create_criteria", "EmulationCriteria", c.id);
  revalidatePath("/thi-dua");
  return "Đã thêm tiêu chí";
});

export const updateCriteria = wrap(async (fd) => {
  const me = await assertRole(...MANAGER_ROLES);
  const id = str(fd, "id");
  const name = str(fd, "name");
  const weight = Number(str(fd, "weight").replace(",", "."));
  if (!name) throw new Error("Nhập tên tiêu chí");
  if (!Number.isFinite(weight)) throw new Error("Trọng số phải là số");
  await db.emulationCriteria.update({ where: { id }, data: { criteriaName: name, weight } });
  await audit(me.email, "update_criteria", "EmulationCriteria", id);
  revalidatePath("/thi-dua");
  return "Đã lưu tiêu chí";
});

export const deleteCriteria = wrap(async (fd) => {
  const me = await assertRole(...ADMIN_ROLES);
  const id = str(fd, "id");
  await db.emulationCriteria.delete({ where: { id } });
  await audit(me.email, "delete_criteria", "EmulationCriteria", id);
  revalidatePath("/thi-dua");
  return "Đã xoá tiêu chí";
});

/** Xoá cả một kỳ thi đua (mọi lớp). Chỉ ADMIN. */
export const deletePeriod = wrap(async (fd) => {
  const me = await assertRole(...ADMIN_ROLES);
  const termId = str(fd, "termId");
  const label = str(fd, "label");
  const r = await db.classEmulationScore.deleteMany({ where: { academicTermId: termId, periodLabel: label } });
  await audit(me.email, "delete_emulation_period", "ClassEmulationScore", label);
  revalidatePath("/thi-dua");
  return `Đã xoá kỳ "${label}" (${r.count} bản ghi)`;
});
