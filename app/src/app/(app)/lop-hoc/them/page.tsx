import { db } from "@/lib/db";
import { MANAGER_ROLES, requireRole } from "@/lib/guard";
import { Title } from "@/components/ui";
import { currentYear } from "@/lib/catalog";
import { NewClassForm } from "./new-class-form";

export default async function NewClass() {
  await requireRole(...MANAGER_ROLES);
  const [grades, years, teachers, cur, rooms, subjects] = await Promise.all([
    db.gradeLevel.findMany({ orderBy: { sortOrder: "asc" } }),
    db.academicYear.findMany({ orderBy: { startDate: "desc" } }),
    db.teacher.findMany({ orderBy: { fullName: "asc" }, select: { id: true, fullName: true, code: true, homeroomClasses: { select: { className: true, academicYear: { select: { endDate: true } } } } } }),
    currentYear(),
    db.room.findMany({ orderBy: { roomName: "asc" } }),
    db.subject.findMany({ orderBy: { subjectName: "asc" } }),
  ]);
  return (
    <div className="space-y-4">
      <Title>Thêm lớp học</Title>
      <NewClassForm
        grades={grades.map((g) => ({ id: g.id, label: g.gradeName }))}
        years={years.map((y) => ({ id: y.id, label: y.yearName }))}
        teachers={teachers.map((t) => ({ id: t.id, label: t.code ? `${t.fullName} (${t.code})` : t.fullName }))}
        rooms={rooms.map((room) => ({ id: room.id, label: room.roomName }))}
        subjects={subjects.map((subject) => ({ id: subject.id, label: subject.subjectName }))}
        defaultYearId={cur?.id ?? ""}
      />
    </div>
  );
}
