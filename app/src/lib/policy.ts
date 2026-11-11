import { cache } from "react";
import { db } from "@/lib/db";
import { normalizePolicy, type Policy } from "@/lib/policy-schema";

/** Quy chế hiện hành của trường (1 lần/request). Chưa cấu hình → mặc định. */
export const getPolicy = cache(async (): Promise<Policy> => {
  const s = await db.schoolSetting.findUnique({ where: { id: "school" }, select: { policy: true } });
  return normalizePolicy(s?.policy);
});
