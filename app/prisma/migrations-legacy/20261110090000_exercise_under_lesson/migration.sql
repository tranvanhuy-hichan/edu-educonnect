-- Bài tập trở thành phần đính kèm của bài học (Exercise thuộc LessonPost).
CREATE TABLE "Exercise" (
  "id" TEXT NOT NULL,
  "lessonPostId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "attachments" JSONB,
  "dueDate" TIMESTAMP(3),
  "quizMode" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Exercise_pkey" PRIMARY KEY ("id")
);

-- Mỗi bài tập cũ (postType = ASSIGNMENT) giữ nguyên id; gắn vào bài học mới nhất cùng lớp-môn, nếu chưa có bài học thì chính nó thành bài học chứa.
INSERT INTO "Exercise" ("id","lessonPostId","title","content","attachments","dueDate","quizMode","createdAt")
SELECT p."id",
       COALESCE((SELECT l."id" FROM "LessonPost" l WHERE l."assignmentId" = p."assignmentId" AND l."postType" = 'LESSON' ORDER BY l."createdAt" DESC LIMIT 1), p."id"),
       p."title", p."content", p."attachments", p."dueDate", p."quizMode", p."createdAt"
FROM "LessonPost" p WHERE p."postType" = 'ASSIGNMENT';

ALTER TABLE "Question" DROP CONSTRAINT "Question_lessonPostId_fkey";
ALTER TABLE "Question" RENAME COLUMN "lessonPostId" TO "exerciseId";
ALTER TABLE "AssignmentSubmission" DROP CONSTRAINT "AssignmentSubmission_lessonPostId_fkey";
ALTER TABLE "AssignmentSubmission" RENAME COLUMN "lessonPostId" TO "exerciseId";
ALTER INDEX "AssignmentSubmission_lessonPostId_studentId_key" RENAME TO "AssignmentSubmission_exerciseId_studentId_key";

-- Bài tập đã gắn vào bài học khác: bỏ bản ghi LessonPost thừa.
DELETE FROM "LessonPostView" v WHERE v."lessonPostId" IN (SELECT e."id" FROM "Exercise" e WHERE e."lessonPostId" <> e."id");
DELETE FROM "LessonPost" p WHERE p."id" IN (SELECT e."id" FROM "Exercise" e WHERE e."lessonPostId" <> e."id");

ALTER TABLE "LessonPost" DROP COLUMN "postType", DROP COLUMN "dueDate", DROP COLUMN "quizMode";
DROP TYPE "PostType";

ALTER TABLE "Exercise" ADD CONSTRAINT "Exercise_lessonPostId_fkey" FOREIGN KEY ("lessonPostId") REFERENCES "LessonPost"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Question" ADD CONSTRAINT "Question_exerciseId_fkey" FOREIGN KEY ("exerciseId") REFERENCES "Exercise"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AssignmentSubmission" ADD CONSTRAINT "AssignmentSubmission_exerciseId_fkey" FOREIGN KEY ("exerciseId") REFERENCES "Exercise"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
