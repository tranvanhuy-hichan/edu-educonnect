import { db } from "@/lib/db";
import { requireParentSession } from "@/lib/auth/parent-session";
import { getSchoolSetting } from "@/lib/school-setting";
import { currentTerm } from "@/lib/catalog";
import { hiddenTermIds } from "@/server/grade-visibility";
import { loadScheduleSlots } from "@/modules/scheduling/schedule-slots";
import { effectiveSlots } from "@/modules/scheduling/effective";
import { fmtDate, fmtTime } from "@/lib/format";
import { ParentHeader, type ChildSummary } from "./parent-header";
import { ParentPortalView, type ChildData, type TermOption } from "./portal-view";
import { AlertCircle } from "lucide-react";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const brand = await getSchoolSetting();
  const icon = brand.logoUrl || "/favicon.svg";
  return {
    title: `Sổ liên lạc điện tử Phụ huynh · ${brand.schoolName}`,
    icons: {
      icon: [{ url: icon }],
      shortcut: [icon],
      apple: [{ url: icon }],
    },
  };
}

export default async function ParentPortalPage({
  searchParams,
}: {
  searchParams: Promise<{ child?: string; tab?: string; yearId?: string; period?: string; termId?: string }>;
}) {
  const [parent, brand, curTerm, allTerms] = await Promise.all([
    requireParentSession(),
    getSchoolSetting(),
    currentTerm(),
    db.academicTerm.findMany({
      include: { academicYear: true },
      orderBy: { startDate: "desc" },
    }),
  ]);

  const sp = await searchParams;
  const tab = ["grades", "schedule", "absences", "exams", "library"].includes(sp.tab ?? "") ? sp.tab! : "grades";
  const gradeYearId = allTerms.some((t) => t.academicYearId === sp.yearId) ? sp.yearId! : curTerm?.academicYearId ?? allTerms[0]?.academicYearId ?? "-";
  const gradePeriod = ["HK1", "HK2", "YEAR"].includes(sp.period ?? "") ? sp.period! : (curTerm?.termName === "HK1" || curTerm?.termName === "HK2" ? curTerm.termName : "YEAR");
  const selectedTermId = sp.termId === "ALL" || allTerms.some((t) => t.id === sp.termId) ? sp.termId! : curTerm?.id ?? allTerms[0]?.id ?? "-";
  const gradeTermIds = allTerms.filter((t) => t.academicYearId === gradeYearId && (gradePeriod === "YEAR" || t.termName === gradePeriod) && !t.gradesHidden).map((t) => t.id);
  // Học kỳ khóa xem điểm: server không đưa điểm của kỳ đó sang trình duyệt phụ huynh
  const hiddenTerms = await hiddenTermIds();
  const hiddenYearIds = new Set(allTerms.filter((t) => hiddenTerms.includes(t.id)).map((t) => t.academicYearId));
  const visible = (termId: string) => !hiddenTerms.includes(termId);

  // Lấy toàn bộ học sinh liên kết với SĐT của phụ huynh
  const cleanedDigits = parent.phone.replace(/\D/g, "");
  const childWhere = {
      OR: [
        { guardianPhone: parent.phone },
        { guardianPhone: { startsWith: parent.phone } },
        ...(cleanedDigits.length >= 7
          ? [{ guardianPhone: { contains: cleanedDigits.slice(-9) } }]
          : []),
      ],
    };
  const childrenSummary = await db.student.findMany({ where: childWhere, orderBy: { id: "asc" }, select: {
    id: true, fullName: true, code: true,
    enrollments: { orderBy: { academicYear: { startDate: "desc" } }, take: 1, select: { schoolClass: { select: { className: true } } } },
  } });
  const selectedChildId = childrenSummary.find((c) => c.id === sp.child)?.id ?? childrenSummary[0]?.id ?? "-";
  const rawStudents = await db.student.findMany({
    where: { ...childWhere, id: selectedChildId },
    select: {
      id: true, fullName: true, code: true, dob: true, guardianName: true, guardianPhone: true,
      _count: { select: { periodAbsences: { where: selectedTermId === "ALL" ? {} : { log: { timetableSlot: { academicTermId: selectedTermId } } } }, examSeats: { where: { paper: { event: { status: "PUBLISHED" } } } }, loans: { where: { status: { in: ["BORROWED", "PARTIALLY_RETURNED", "OVERDUE"] } } } } },
      enrollments: {
        include: {
          academicYear: true,
          schoolClass: {
            include: {
              homeroomTeacher: { select: { fullName: true, phone: true } },
              gradeLevel: true,
              room: true,
            },
          },
        },
        orderBy: { academicYear: { startDate: "desc" } },
        take: 1,
      },
      yearEndResults: {
        where: { reviewStatus: "APPROVED" },
        include: { academicYear: true },
        orderBy: { academicYear: { startDate: "desc" } },
        take: 1,
      },
      assessments: { where: { assignment: { academicTermId: { in: tab === "grades" ? gradeTermIds : [] } } }, include: { assignment: { include: { subject: true, academicTerm: true } } } },
      subjectAverages: {
        where: { academicTermId: { in: tab === "grades" ? gradeTermIds : [] } },
        include: {
          academicTerm: { include: { academicYear: true } },
          assignment: { include: { subject: true, teacher: { select: { id: true, fullName: true } } } },
        },
      },
      scoreEntries: {
        where: { academicTermId: { in: tab === "grades" && gradePeriod !== "YEAR" ? gradeTermIds : [] } },
        include: {
          academicTerm: true,
          assignment: { include: { subject: true, teacher: { select: { id: true, fullName: true } } } },
        },
        orderBy: { createdAt: "asc" },
      },
      loans: {
        where: { ...(tab === "library" ? {} : { id: "-" }), status: { in: ["BORROWED", "PARTIALLY_RETURNED", "OVERDUE"] } },
        include: {
          items: {
            include: { bookCopy: { include: { bookTitle: true } } },
          },
        },
        orderBy: { dueDate: "asc" },
      },
      examSeats: {
        where: { ...(tab === "exams" ? {} : { id: "-" }), paper: { event: { status: "PUBLISHED" } } },
        include: {
          paper: {
            include: {
              event: true,
              subject: true,
            },
          },
          examRoom: {
            include: {
              room: true,
            },
          },
        },
      },
    },
  });

  if (!rawStudents.length) {
    return (
      <div className="parent-portal min-h-screen theme-bg text-[var(--fg)]">
        <ParentHeader
          brandName={brand.schoolName}
          brandLogo={brand.logoUrl}
          parentPhone={parent.phone}
          parentName={parent.fullName}
          childrenList={[]}
          selectedChildId=""
        />
        <main className="mx-auto max-w-3xl px-4 py-20 text-center">
          <div className="mx-auto size-16 grid place-items-center rounded-2xl bg-amber-100 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 mb-4 shadow-xs">
            <AlertCircle className="size-8" />
          </div>
          <h2 className="text-xl font-bold">Chưa tìm thấy hồ sơ học sinh liên kết</h2>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-400 max-w-md mx-auto">
            Số điện thoại <strong>{parent.phone}</strong> hiện chưa trùng khớp với hồ sơ học sinh nào trong cơ sở dữ liệu nhà trường.
          </p>
          <p className="mt-2 text-xs text-slate-500">
            Vui lòng liên hệ với Giáo viên chủ nhiệm để kiểm tra và cập nhật Số điện thoại người giám hộ chính xác.
          </p>
        </main>
      </div>
    );
  }

  // Chỉ tải lịch học; không đưa sổ đầu bài và thống kê vắng của lớp sang cổng phụ huynh.
  const classIds = [
    ...new Set(
      rawStudents
        .map((s) => s.enrollments[0]?.schoolClassId)
        .filter((id): id is string => Boolean(id))
    ),
  ];

  const allSchedules = await Promise.all((tab === "schedule" ? classIds : []).map((cid) =>
    loadScheduleSlots({ ...effectiveSlots(), schoolClassId: cid, ...(selectedTermId === "ALL" ? {} : { academicTermId: selectedTermId }) })
  ));
  const scheduleMap = new Map(classIds.map((cid, i) => [cid, allSchedules[i]]));

  // Chỉ các tiết CHÍNH CON MÌNH vắng (do giáo viên điểm danh trong sổ đầu bài); không đưa dữ liệu của lớp hay bạn khác.
  const absenceRows = await db.classPeriodAbsence.findMany({
    where: { studentId: selectedChildId, ...((tab === "absences" && selectedTermId === "ALL") ? {} : { OR: [ ...(tab === "absences" ? [{ log: { timetableSlot: { academicTermId: selectedTermId } } }] : []), { log: { logDate: { gte: new Date(new Date().getTime() - 7 * 86400_000) } } } ] }) },
    include: { log: { include: { timetableSlot: { include: { assignment: { include: { subject: true } } } } } } },
    orderBy: { log: { logDate: "desc" } },
  });
  const absencesOf = (studentId: string) => absenceRows.filter((a) => a.studentId === studentId).map((a) => ({
    id: a.id,
    isoDate: a.log.logDate.toISOString().slice(0, 10),
    date: fmtDate(a.log.logDate),
    termId: a.log.timetableSlot.academicTermId,
    periodNo: a.log.timetableSlot.periodNo,
    subjectName: a.log.timetableSlot.assignment.subject.subjectName,
    excused: a.excused,
    recent: a.log.logDate.getTime() >= Date.now() - 7 * 86400_000, // tính ở server
  }));

  // Chuẩn bị dữ liệu từng con
  const childrenData: ChildData[] = rawStudents.map((s) => {
    const latestEnr = s.enrollments[0];
    const cls = latestEnr?.schoolClass;
    const yearEnd = s.yearEndResults[0];
    const slots = cls ? scheduleMap.get(cls.id) ?? [] : [];

    return {
      counts: { absences: s._count.periodAbsences, exams: s._count.examSeats, library: s._count.loans },
      id: s.id,
      fullName: s.fullName,
      code: s.code,
      dob: s.dob ? fmtDate(s.dob) : null,
      guardianName: s.guardianName,
      guardianPhone: s.guardianPhone,
      schoolClass: cls
        ? {
            id: cls.id,
            className: cls.className,
            gradeName: cls.gradeLevel?.gradeName ?? "",
            roomName: cls.room?.roomName ?? "Chưa xếp phòng",
            homeroomTeacher: cls.homeroomTeacher
              ? {
                  fullName: cls.homeroomTeacher.fullName,
                  phone: cls.homeroomTeacher.phone,
                }
              : null,
          }
        : null,
      yearName: latestEnr?.academicYear?.yearName ?? "2026-2027",
      yearEnd: yearEnd && !hiddenYearIds.has(yearEnd.academicYearId)
        ? {
            overallAverage: yearEnd.overallAverage,
            conductRank: yearEnd.conductRank,
            result: yearEnd.result,
          }
        : null,
      absences: absencesOf(s.id),
      assessments: s.assessments.filter((review) => visible(review.assignment.academicTermId)).map((review) => ({ id: review.id, academicTermId: review.assignment.academicTermId, subjectName: review.assignment.subject.subjectName, outcome: review.outcome, isExempt: review.isExempt, comment: review.comment })),
      subjectAverages: s.subjectAverages.filter((avg) => visible(avg.academicTermId) && !s.assessments.some((review) => review.assignmentId === avg.assignmentId && review.isExempt)).map((avg) => ({
        assignmentId: avg.assignmentId,
        subjectId: avg.assignment.subjectId,
        termName: avg.academicTerm.termName,
        id: avg.id,
        academicTermId: avg.academicTermId,
        averageValue: avg.averageValue,
        subjectName: avg.assignment.subject.subjectName,
        teacherName: avg.assignment.teacher.fullName,
      })),
      scoreEntries: s.scoreEntries.filter((e) => visible(e.academicTermId)).map((e) => ({
        id: e.id,
        academicTermId: e.academicTermId,
        assignmentId: e.assignmentId,
        scoreType: e.scoreType,
        value: e.value,
      })),
      scheduleSlots: slots.map((x) => ({
        id: x.id,
        academicTermId: x.academicTermId,
        dayOfWeek: x.dayOfWeek,
        periodNo: x.periodNo,
        subjectName: x.assignment.subject.subjectName,
        teacherName: x.assignment.teacher.fullName,
        roomName: x.room.roomName,
      })),
      examSeats: s.examSeats.map((seat) => ({
        id: seat.id,
        eventTitle: seat.paper.event.title,
        subjectName: seat.paper.subject.subjectName,
        roomName: seat.examRoom.room?.roomName ?? seat.examRoom.label ?? "Phòng thi",
        registrationNo: seat.registrationNo,
        seatNo: seat.seatNo,
        startsAt: seat.paper.startsAt ? fmtTime(seat.paper.startsAt) : "",
        endsAt: seat.paper.endsAt ? fmtTime(seat.paper.endsAt) : "",
      })),
      loans: s.loans.map((loan) => ({
        id: loan.id,
        bookTitle: loan.items.map((it) => it.bookCopy.bookTitle.title).join(", "),
        borrowedDate: fmtDate(loan.borrowedDate),
        dueDate: fmtDate(loan.dueDate),
        isOverdue: loan.status === "OVERDUE" || new Date(loan.dueDate) < new Date(),
      })),
    };
  });

  const termOptions: TermOption[] = allTerms.map((t) => ({
    id: t.id,
    termName: t.termName,
    yearId: t.academicYearId,
    yearName: t.academicYear.yearName,
    isCurrent: t.id === curTerm?.id,
  }));

  const initialChildId =
    childrenData.find((c) => c.id === sp.child)?.id ?? childrenData[0].id;
  const defaultTermId = curTerm?.id ?? allTerms[0]?.id ?? "";

  const childrenListSummary: ChildSummary[] = childrenSummary.map((c) => ({
    id: c.id, fullName: c.fullName, code: c.code, className: c.enrollments[0]?.schoolClass.className ?? "Chưa xếp lớp",
  }));

  return (
    <div className="parent-portal min-h-screen theme-bg text-[var(--fg)] pb-12">
      <ParentHeader
        brandName={brand.schoolName}
        brandLogo={brand.logoUrl}
        parentPhone={parent.phone}
        parentName={parent.fullName}
        childrenList={childrenListSummary}
        selectedChildId={initialChildId}
      />

      <main className="w-full px-3 py-4 md:px-6">
        <ParentPortalView
          key={`${initialChildId}:${tab}:${sp.yearId ?? ""}:${sp.period ?? ""}:${sp.termId ?? ""}`}
          childrenList={childrenListSummary}
          activeTab={tab}
          initialYearId={gradeYearId}
          initialPeriod={gradePeriod}
          initialTermId={selectedTermId}
          childrenData={childrenData}
          initialChildId={initialChildId}
          allTerms={termOptions}
          defaultTermId={defaultTermId}
          hiddenTermIds={hiddenTerms}
        />
      </main>
    </div>
  );
}
