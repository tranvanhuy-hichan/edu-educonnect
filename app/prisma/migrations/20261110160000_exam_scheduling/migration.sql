-- CreateEnum
CREATE TYPE "ExamStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ExamGrouping" AS ENUM ('CLASS', 'ALPHABET');

-- CreateTable
CREATE TABLE "ExamEvent" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "academicTermId" TEXT NOT NULL,
    "gradeLevelId" TEXT NOT NULL,
    "status" "ExamStatus" NOT NULL DEFAULT 'DRAFT',
    "notes" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExamEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExamPaper" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "grouping" "ExamGrouping" NOT NULL,
    "roomCount" INTEGER,
    "maxPerRoom" INTEGER,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "excludedStudentIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "reportMinutes" INTEGER NOT NULL DEFAULT 15,

    CONSTRAINT "ExamPaper_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExamRoom" (
    "id" TEXT NOT NULL,
    "paperId" TEXT NOT NULL,
    "groupKey" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "roomId" TEXT,

    CONSTRAINT "ExamRoom_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExamSeat" (
    "id" TEXT NOT NULL,
    "paperId" TEXT NOT NULL,
    "examRoomId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "registrationNo" TEXT NOT NULL,
    "seatNo" INTEGER NOT NULL,
    "fullName" TEXT NOT NULL,
    "studentCode" TEXT NOT NULL,
    "className" TEXT NOT NULL,

    CONSTRAINT "ExamSeat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExamInvigilation" (
    "examRoomId" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,

    CONSTRAINT "ExamInvigilation_pkey" PRIMARY KEY ("examRoomId","teacherId")
);

-- CreateIndex
CREATE INDEX "ExamEvent_academicTermId_gradeLevelId_status_idx" ON "ExamEvent"("academicTermId", "gradeLevelId", "status");

-- CreateIndex
CREATE INDEX "ExamPaper_startsAt_endsAt_idx" ON "ExamPaper"("startsAt", "endsAt");

-- CreateIndex
CREATE UNIQUE INDEX "ExamPaper_eventId_subjectId_key" ON "ExamPaper"("eventId", "subjectId");

-- CreateIndex
CREATE INDEX "ExamRoom_roomId_idx" ON "ExamRoom"("roomId");

-- CreateIndex
CREATE UNIQUE INDEX "ExamRoom_paperId_groupKey_key" ON "ExamRoom"("paperId", "groupKey");

-- CreateIndex
CREATE INDEX "ExamSeat_studentId_idx" ON "ExamSeat"("studentId");

-- CreateIndex
CREATE UNIQUE INDEX "ExamSeat_paperId_studentId_key" ON "ExamSeat"("paperId", "studentId");

-- CreateIndex
CREATE UNIQUE INDEX "ExamSeat_paperId_registrationNo_key" ON "ExamSeat"("paperId", "registrationNo");

-- CreateIndex
CREATE UNIQUE INDEX "ExamSeat_examRoomId_seatNo_key" ON "ExamSeat"("examRoomId", "seatNo");

-- AddForeignKey
ALTER TABLE "ExamEvent" ADD CONSTRAINT "ExamEvent_academicTermId_fkey" FOREIGN KEY ("academicTermId") REFERENCES "AcademicTerm"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExamEvent" ADD CONSTRAINT "ExamEvent_gradeLevelId_fkey" FOREIGN KEY ("gradeLevelId") REFERENCES "GradeLevel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExamPaper" ADD CONSTRAINT "ExamPaper_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "ExamEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExamPaper" ADD CONSTRAINT "ExamPaper_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExamRoom" ADD CONSTRAINT "ExamRoom_paperId_fkey" FOREIGN KEY ("paperId") REFERENCES "ExamPaper"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExamRoom" ADD CONSTRAINT "ExamRoom_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExamSeat" ADD CONSTRAINT "ExamSeat_paperId_fkey" FOREIGN KEY ("paperId") REFERENCES "ExamPaper"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExamSeat" ADD CONSTRAINT "ExamSeat_examRoomId_fkey" FOREIGN KEY ("examRoomId") REFERENCES "ExamRoom"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExamSeat" ADD CONSTRAINT "ExamSeat_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExamInvigilation" ADD CONSTRAINT "ExamInvigilation_examRoomId_fkey" FOREIGN KEY ("examRoomId") REFERENCES "ExamRoom"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExamInvigilation" ADD CONSTRAINT "ExamInvigilation_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "Teacher"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

