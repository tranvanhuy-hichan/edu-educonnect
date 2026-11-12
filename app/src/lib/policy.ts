import { cache } from "react";
import { getSchoolSetting } from "@/lib/school-setting";
import { normalizePolicy, type Policy } from "@/lib/policy-schema";

/** Quy chế hiện hành của trường (dùng chung bộ nhớ đệm với cấu hình trường). Chưa cấu hình → mặc định. */
export const getPolicy = cache(async (): Promise<Policy> => {
  const s = await getSchoolSetting();
  return normalizePolicy((s as { policy?: unknown }).policy);
});
