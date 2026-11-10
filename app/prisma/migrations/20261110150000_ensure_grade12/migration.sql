INSERT INTO "GradeLevel" ("id", "gradeName", "sortOrder")
VALUES ('grade-level-12', 'Khối 12', 12)
ON CONFLICT ("gradeName") DO NOTHING;
