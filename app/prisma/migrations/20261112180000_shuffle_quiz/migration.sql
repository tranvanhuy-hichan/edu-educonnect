-- Xáo trộn thứ tự câu hỏi / đáp án theo từng học sinh. Chỉ THÊM cột có giá trị mặc định false, bài đang có giữ nguyên thứ tự cũ.
ALTER TABLE "Exercise" ADD COLUMN "shuffleQuestions" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "shuffleOptions" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "LibraryExercise" ADD COLUMN "shuffleQuestions" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "shuffleOptions" BOOLEAN NOT NULL DEFAULT false;
