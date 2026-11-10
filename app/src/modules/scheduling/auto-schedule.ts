/**
 * Xếp thời khóa biểu tự động — logic thuần (không gọi DB/UI), dễ kiểm thử.
 *
 * Ràng buộc cứng: một lớp, một giáo viên, một phòng không được có 2 tiết cùng (thứ, tiết).
 * Mục tiêu mềm: môn trên 2 tiết/tuần ưu tiên tiết đôi cùng buổi, rải đều các buổi trong tuần,
 * xếp dồn liền từ tiết đầu để lớp không bị "lỗ" giữa buổi, luôn dùng đúng phòng cố định của lớp.
 * Thuật toán: tham lam theo độ khó (môn nhiều tiết / giáo viên dạy nhiều lớp xếp trước),
 * có quay lui giới hạn số nút để luôn dừng và cho kết quả xác định (cùng đầu vào → cùng đầu ra).
 */

export const DAYS = [2, 3, 4, 5, 6, 7] as const; // Thứ 2 .. Thứ 7
export const PERIODS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const;

export type AutoAssignment = { id: string; schoolClassId: string; teacherId: string; periodsPerWeek: number; roomId: string | null; preferPairs?: boolean };
export type AutoRoom = { id: string; capacity: number };
export type AutoSlot = { assignmentId: string; schoolClassId: string; teacherId: string; roomId: string; dayOfWeek: number; periodNo: number };
export type Placement = { assignmentId: string; schoolClassId: string; teacherId: string; roomId: string; dayOfWeek: number; periodNo: number };
export type Unplaced = { assignmentId: string; missing: number; reason: string };
export type AutoResult = { placements: Placement[]; unplaced: Unplaced[] };

type Unit = { assignment: AutoAssignment; index: number; size: number };

const NODE_BUDGET = 20000;
const TOP_CANDIDATES = 8;

export function autoSchedule(input: {
  assignments: AutoAssignment[];
  rooms: AutoRoom[];
  /** Các tiết đã có sẵn (giữ nguyên, tránh đè lên). */
  fixed?: AutoSlot[];
  periodsPerDay?: number;
  allowedPeriods?: Record<string, Record<number, number[]>>;
  blocked?: { schoolClassId: string; dayOfWeek: number; periodNo: number }[];
}): AutoResult {
  const periods = PERIODS.filter((p) => p <= (input.periodsPerDay ?? 10));
  const fixed = input.fixed ?? [];
  const rooms = [...input.rooms].sort((a, b) => a.id.localeCompare(b.id));

  const busyClass = new Set<string>(); // classId|day|period
  const busyTeacher = new Set<string>();
  const busyRoom = new Set<string>();
  const occupiedSubject = new Set<string>();
  const dayLoad = new Map<string, number>(); // classId|day -> số tiết
  const subjectDay = new Map<string, number>(); // assignmentId|day -> số tiết
  const key = (a: string, d: number, p: number) => `${a}|${d}|${p}`;

  const occupy = (s: Placement, on: boolean) => {
    const op = on ? "add" : "delete";
    occupiedSubject[op](`${s.assignmentId}|${s.dayOfWeek}|${s.periodNo}|${s.roomId}`);
    busyClass[op](key(s.schoolClassId, s.dayOfWeek, s.periodNo));
    busyTeacher[op](key(s.teacherId, s.dayOfWeek, s.periodNo));
    busyRoom[op](key(s.roomId, s.dayOfWeek, s.periodNo));
    const dl = `${s.schoolClassId}|${s.dayOfWeek}`;
    const sd = `${s.assignmentId}|${s.dayOfWeek}`;
    dayLoad.set(dl, (dayLoad.get(dl) ?? 0) + (on ? 1 : -1));
    subjectDay.set(sd, (subjectDay.get(sd) ?? 0) + (on ? 1 : -1));
  };
  for (const f of fixed) occupy(f, true);
  for (const blocked of input.blocked ?? []) busyClass.add(key(blocked.schoolClassId, blocked.dayOfWeek, blocked.periodNo));

  // Độ khó: số tiết của môn + tải của giáo viên (tổng tiết/tuần giáo viên đó phải dạy).
  const teacherLoad = new Map<string, number>();
  for (const a of input.assignments) teacherLoad.set(a.teacherId, (teacherLoad.get(a.teacherId) ?? 0) + a.periodsPerWeek);
  const units: Unit[] = [];
  for (const a of input.assignments) {
    for (let i = 0; i < a.periodsPerWeek;) {
      const size = (a.preferPairs ?? a.periodsPerWeek > 2) && i + 1 < a.periodsPerWeek ? 2 : 1;
      units.push({ assignment: a, index: i, size });
      i += size;
    }
  }
  units.sort((x, y) => {
    const dx = (teacherLoad.get(x.assignment.teacherId) ?? 0) * 100 + x.assignment.periodsPerWeek;
    const dy = (teacherLoad.get(y.assignment.teacherId) ?? 0) * 100 + y.assignment.periodsPerWeek;
    return dy - dx || x.assignment.id.localeCompare(y.assignment.id) || x.index - y.index;
  });

  const candidates = (u: Unit): Placement[][] => {
    const a = u.assignment;
    const out: { placements: Placement[]; score: number }[] = [];
    for (const d of DAYS) {
      const sameSubject = subjectDay.get(`${a.id}|${d}`) ?? 0;
      const load = dayLoad.get(`${a.schoolClassId}|${d}`) ?? 0;
      for (const p of periods) {
        const group = Array.from({ length: u.size }, (_, i) => p + i);
        if (input.allowedPeriods && group.some((period) => !input.allowedPeriods![a.schoolClassId]?.[d]?.includes(period))) continue;
        // A double lesson must stay within a session, never periods 5 and 6.
        if (group.some((period) => !periods.includes(period as typeof periods[number])) || (p <= 5 && group.at(-1)! > 5)) continue;
        if (group.some((period) => busyClass.has(key(a.schoolClassId, d, period)) || busyTeacher.has(key(a.teacherId, d, period)))) continue;
        const room = a.roomId && rooms.some((room) => room.id === a.roomId) && group.every((period) => !busyRoom.has(key(a.roomId!, d, period))) ? a.roomId : null;
        if (!room) continue;
        const startPeriod = p > 5 ? 6 : 1;
        const gap = Math.abs(p - (startPeriod + load));
        const adjacent = u.size === 1 && sameSubject === 1 && (a.preferPairs ?? a.periodsPerWeek > 2) && [p - 1, p + 1].some((neighbor) => neighbor >= 1 && neighbor <= 10 && Math.floor((neighbor - 1) / 5) === Math.floor((p - 1) / 5) && occupiedSubject.has(`${a.id}|${d}|${neighbor}|${room}`));
        const score = sameSubject * 1000 + load * 20 + gap * 5 + p - (adjacent ? 1600 : 0);
        out.push({ placements: group.map((periodNo) => ({ assignmentId: a.id, schoolClassId: a.schoolClassId, teacherId: a.teacherId, roomId: room, dayOfWeek: d, periodNo })), score });
      }
    }
    return out.sort((x, y) => x.score - y.score || x.placements[0].dayOfWeek - y.placements[0].dayOfWeek || x.placements[0].periodNo - y.placements[0].periodNo).slice(0, TOP_CANDIDATES).map((candidate) => candidate.placements);
  };

  const placed: Placement[] = [];
  let nodes = 0;
  let deepest = 0;
  let best: Placement[] = [];

  const solve = (i: number): boolean => {
    if (i === units.length) return true;
    if (++nodes > NODE_BUDGET) return false;
    if (placed.length > deepest) { deepest = placed.length; best = [...placed]; }
    for (const c of candidates(units[i])) {
      placed.push(...c); c.forEach((slot) => occupy(slot, true));
      if (solve(i + 1)) return true;
      placed.splice(placed.length - c.length, c.length); c.forEach((slot) => occupy(slot, false));
      if (nodes > NODE_BUDGET) return false;
    }
    return false;
  };

  const complete = solve(0);
  const placements = complete ? [...placed] : [...best];
  if (!complete) {
    // Preserve all successful double lessons, then fill remaining available single periods.
    placements.forEach((slot) => occupy(slot, true));
    for (const assignment of input.assignments) {
      const missing = assignment.periodsPerWeek - placements.filter((slot) => slot.assignmentId === assignment.id).length;
      for (let index = 0; index < missing; index++) {
        const candidate = candidates({ assignment, index, size: 1 })[0];
        if (!candidate) break;
        placements.push(...candidate);
        candidate.forEach((slot) => occupy(slot, true));
      }
    }
  }

  // Tiết không xếp được: đếm theo phân công + nêu lý do chung.
  const got = new Map<string, number>();
  for (const p of placements) got.set(p.assignmentId, (got.get(p.assignmentId) ?? 0) + 1);
  const unplaced: Unplaced[] = [];
  for (const a of input.assignments) {
    const missing = a.periodsPerWeek - (got.get(a.id) ?? 0);
    if (missing > 0) unplaced.push({ assignmentId: a.id, missing, reason: a.roomId ? "Không còn khung giờ trống chung cho lớp, giáo viên và phòng cố định" : "Lớp chưa được phân công phòng học cố định" });
  }
  return { placements, unplaced };
}
