ALTER TABLE "QuizAttempt" ADD COLUMN "snapshot" JSONB;
ALTER TABLE "AssignmentSubmission" ADD COLUMN "extraAttempts" INTEGER NOT NULL DEFAULT 0;
CREATE TABLE "LoginThrottle" (
  "key" TEXT PRIMARY KEY, "count" INTEGER NOT NULL, "expiresAt" TIMESTAMP(3) NOT NULL
);
CREATE INDEX "LoginThrottle_expiresAt_idx" ON "LoginThrottle"("expiresAt");
-- Recover only the surviving answers from older data; older overwritten answers cannot be reconstructed.
UPDATE "QuizAttempt" a SET "snapshot" = jsonb_build_object('legacy', true, 'answers',
  COALESCE((SELECT jsonb_agg(to_jsonb(ans)) FROM "StudentAnswer" ans WHERE ans."submissionId" = s.id), '[]'::jsonb))
FROM "AssignmentSubmission" s WHERE a."exerciseId" = s."exerciseId" AND a."studentId" = s."studentId" AND a."attemptNo" = s."attemptNo";
