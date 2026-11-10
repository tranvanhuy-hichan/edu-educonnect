ALTER TABLE "SchoolClass" ADD COLUMN "roomId" TEXT;
ALTER TABLE "SchoolClass" ADD CONSTRAINT "SchoolClass_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- Reuse an existing room only when the class has always used exactly one room.
UPDATE "SchoolClass" c SET "roomId" = s."roomId"
FROM (SELECT "schoolClassId", MIN("roomId") AS "roomId" FROM "TimetableSlot" GROUP BY "schoolClassId" HAVING COUNT(DISTINCT "roomId") = 1) s
WHERE c."id" = s."schoolClassId";
