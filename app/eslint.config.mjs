import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: ["src/modules/**/*.service.ts", "src/modules/**/service.ts"],
    rules: {
      "no-restricted-imports": ["error", {
        paths: [
          { name: "@/lib/prisma", message: "Service phải truy cập dữ liệu qua repository." },
          { name: "@/lib/db", message: "Service phải truy cập dữ liệu qua repository." },
          { name: "@/infrastructure/database/unit-of-work", importNames: ["databaseFor", "contextFor"], message: "Service chỉ nhận DatabaseContext và dùng withTransaction; ORM dành cho repository." },
        ],
        patterns: [{ group: ["next", "next/*"], message: "HTTP, cookie và điều hướng thuộc controller Next.js." }],
      }],
    },
  },
  {
    files: [
      "src/app/(app)/nhap-diem/*actions.ts", "src/app/(app)/len-lop/actions.ts",
      "src/app/(app)/bai-hoc/actions.ts", "src/app/(app)/giao-an/actions.ts",
      "src/app/api/uploads/route.ts", "src/app/api/files/**/route.ts",
      "src/components/attachment-upload.tsx", "src/components/academic/year-results.tsx",
    ],
    rules: {
      "no-restricted-imports": ["error", {
        paths: ["@/lib/prisma", "@/lib/db", "@prisma/client"],
        patterns: [{ group: ["@/modules/**/*.repository", "@/modules/**/*.repository.ts"], message: "Controller và UI phải gọi service." }],
      }],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
