import type { Prisma } from "@prisma/client";
import { mondayOf, todayUTC } from "@/lib/format";

/** A version applies to whole weeks; the next version's start is exclusive. */
export function effectiveSlots(date: Date = todayUTC()): Prisma.TimetableSlotWhereInput {
  const week = mondayOf(date);
  return { version: { startsOn: { lte: week }, OR: [{ endsOn: null }, { endsOn: { gt: week } }] } };
}

export function isVersionEffective(version: { startsOn: Date; endsOn: Date | null }, date: Date) {
  const week = mondayOf(date);
  return version.startsOn <= week && (!version.endsOn || week < version.endsOn);
}
