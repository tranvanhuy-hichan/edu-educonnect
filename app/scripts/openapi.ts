import { writeFileSync } from "node:fs";
import { buildOpenApi } from "../src/lib/openapi/spec";

// Chạy: npm run openapi  → docs/openapi.json (commit để bàn giao/diff khi API đổi)
writeFileSync(new URL("../../docs/openapi.json", import.meta.url), JSON.stringify(buildOpenApi(), null, 2) + "\n");
console.log("Đã ghi docs/openapi.json");
