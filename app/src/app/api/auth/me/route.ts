import { NextResponse } from "next/server";
import { observe } from "@/lib/observability/observe";
import { withAuth } from "@/lib/api/handler";

export const GET = observe(withAuth(async (_request, user) => {
  return NextResponse.json({ data: user });
}));
