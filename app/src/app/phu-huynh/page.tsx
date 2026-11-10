import { db } from "@/lib/db";
import { requireParentSession } from "@/lib/auth/parent-session";
import { getSchoolSetting } from "@/lib/school-setting";
import { currentTerm } from "@/lib/catalog";
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
  searchParams: Promise<{ child?: string }>;
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

  // Lấy toàn bộ học sinh liên kết với SĐT của phụ huynh
  const cleanedDigits = parent.phone.replace(/\D/g, "");
  const rawStudents = await db.student.findMany({
    where: {
      OR: [
        { guardianPhone: parent.phone },
        { guardianPhone: { startsWith: parent.phone } },
        ...(cleanedDigits.length >= 7
          ? [{ guardianPhone: { contains: cleanedDigits.slice(-9) } }]
          : []),
      ],
    },
    include: {
      enrollments: {
        include: {
          academicYear: true,
          schoolClass: {
            include: {
              homeroomTeacher: true,
              gradeLevel: true,
              room: true,
            },
          },
        },
        orderBy: { academicYear: { startDate: "desc" } },
      },
      yearEndResults: {
        where: { reviewStatus: "APPROVED" },
        include: { academicYear: true },
        orderBy: { academicYear: { startDate: "desc" } },
      },
      assessments: { include: { assignment: { include: { subject: true, academicTerm: true } } } },
      subjectAverages: {
        include: {
          academicTerm: { include: { academicYear: true } },
          assignment: { include: { subject: true, teacher: true } },
        },
      },
      scoreEntries: {
        include: {
          academicTerm: true,
          assignment: { include: { subject: true, teacher: true } },
        },
        orderBy: { createdAt: "asc" },
      },
      loans: {
        where: { status: { in: ["BORROWED", "PARTIALLY_RETURNED", "OVERDUE"] } },
        include: {
          items: {
            include: { bookCopy: { include: { bookTitle: true } } },
          },
        },
        orderBy: { dueDate: "asc" },
      },
      examSeats: {
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
      <div className="min-h-screen theme-bg text-[var(--fg)]">
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

  const allSchedules = await Promise.all(classIds.map((cid) =>
    loadScheduleSlots({ ...effectiveSlots(), schoolClassId: cid })
  ));
  const scheduleMap = new Map(classIds.map((cid, i) => [cid, allSchedules[i]]));

  // Chuẩn bị dữ liệu từng con
  const childrenData: ChildData[] = rawStudents.map((s) => {
    const latestEnr = s.enrollments[0];
    const cls = latestEnr?.schoolClass;
    const yearEnd = s.yearEndResults[0];
    const slots = cls ? scheduleMap.get(cls.id) ?? [] : [];

    return {
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
      yearEnd: yearEnd
        ? {
            overallAverage: yearEnd.overallAverage,
            conductRank: yearEnd.conductRank,
            result: yearEnd.result,
          }
        : null,
      assessments: s.assessments.map((review) => ({ id: review.id, academicTermId: review.assignment.academicTermId, subjectName: review.assignment.subject.subjectName, outcome: review.outcome, isExempt: review.isExempt, comment: review.comment })),
      subjectAverages: s.subjectAverages.filter((avg) => !s.assessments.some((review) => review.assignmentId === avg.assignmentId && review.isExempt)).map((avg) => ({
        assignmentId: avg.assignmentId,
        id: avg.id,
        academicTermId: avg.academicTermId,
        averageValue: avg.averageValue,
        subjectName: avg.assignment.subject.subjectName,
        teacherName: avg.assignment.teacher.fullName,
      })),
      scoreEntries: s.scoreEntries.map((e) => ({
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
    yearName: t.academicYear.yearName,
    isCurrent: t.id === curTerm?.id,
  }));

  const initialChildId =
    childrenData.find((c) => c.id === sp.child)?.id ?? childrenData[0].id;
  const defaultTermId = curTerm?.id ?? allTerms[0]?.id ?? "";

  const childrenListSummary: ChildSummary[] = childrenData.map((c) => ({
    id: c.id,
    fullName: c.fullName,
    code: c.code,
    className: c.schoolClass?.className ?? "Chưa xếp lớp",
  }));

  return (
    <div className="min-h-screen theme-bg text-[var(--fg)] pb-12">
      <ParentHeader
        brandName={brand.schoolName}
        brandLogo={brand.logoUrl}
        parentPhone={parent.phone}
        parentName={parent.fullName}
        childrenList={childrenListSummary}
        selectedChildId={initialChildId}
      />

      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
        <ParentPortalView
          childrenData={childrenData}
          initialChildId={initialChildId}
          allTerms={termOptions}
          defaultTermId={defaultTermId}
        />
      </main>
    </div>
  );
}
