import { publicApi } from "@/lib/public-api/handler";
import * as svc from "@/modules/public-api/public-api.service";
import { setStudentClass } from "@/modules/public-api/write/student-write";
import { studentClass } from "@/modules/public-api/write/schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Xếp hoặc chuyển lớp theo đúng quy tắc của nhà trường (cần lý do và số quyết định/căn cứ, ngày hiệu lực trong năm học, sĩ số). */
export const PUT = publicApi(["students:write"], async ({ json, params, auth }) => {
  await setStudentClass(auth.key, params.id, json(studentClass));
  return { data: await svc.studentById(params.id, new URLSearchParams(), auth.scopes) };
});
