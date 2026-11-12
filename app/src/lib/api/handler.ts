import { resolveSessionIdentity } from "@/modules/auth/auth.service";
import { NextResponse, type NextRequest } from "next/server";
import { ZodError } from "zod";
import { getSessionUser } from "@/lib/auth/request-session";
import type { SessionUser } from "@/lib/auth/session";
import { reportError } from "@/lib/observability/report-error";
import { getRequestContext, setRequestUser } from "@/lib/observability/request-context";
import { ConflictError, ForbiddenError } from "@/shared/errors";
import { AccountDisabledError, AccountLockedError, InvalidCredentialsError } from "@/modules/auth/auth.service";

type AuthedHandler<Ctx> = (
  request: NextRequest,
  user: SessionUser,
  ctx: Ctx,
) => Promise<Response>;

/** Bọc route handler: bắt buộc đăng nhập, map lỗi service/schema sang HTTP status chuẩn.
 *  Ctx là RouteContext<'...'> của Next.js — luôn có dạng { params: Promise<...> },
 *  rỗng khi route không có dynamic segment. */
export function withAuth<Ctx = { params: Promise<Record<string, never>> }>(
  handler: AuthedHandler<Ctx>,
) {
  return async (request: NextRequest, ctx: Ctx): Promise<Response> => {
    const tokenUser = getSessionUser(request);
    const user = tokenUser ? await resolveSessionIdentity(tokenUser.userId, tokenUser.credentialTag, { sid: tokenUser.sid, iat: tokenUser.iat }) : null;
    if (!user) {
      return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
    }

    setRequestUser(user.userId);
    try {
      return await handler(request, user, ctx);
    } catch (error) {
      return mapErrorToResponse(error);
    }
  };
}

export function mapErrorToResponse(error: unknown): Response {
  if (error instanceof ZodError) {
    return NextResponse.json(
      { error: "Dữ liệu không hợp lệ", details: error.issues },
      { status: 400 },
    );
  }
  if (error instanceof ForbiddenError) {
    return NextResponse.json({ error: error.message }, { status: 403 });
  }
  if (error instanceof ConflictError) {
    return NextResponse.json({ error: error.message }, { status: 409 });
  }
  if (error instanceof InvalidCredentialsError) {
    return NextResponse.json({ error: error.message }, { status: 401 });
  }
  if (error instanceof AccountLockedError) {
    return NextResponse.json({ error: error.message }, { status: 429 });
  }
  if (error instanceof AccountDisabledError) {
    return NextResponse.json({ error: error.message }, { status: 403 });
  }

  const requestId = getRequestContext()?.requestId;
  void reportError(error, { source: "route", route: getRequestContext()?.path, method: getRequestContext()?.method });
  return NextResponse.json({ error: "Lỗi hệ thống", requestId }, { status: 500 });
}
