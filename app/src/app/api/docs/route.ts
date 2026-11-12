import { NextResponse } from "next/server";
import { getMe } from "@/lib/guard";
import { isSystemAdmin } from "@/lib/auth/session";
import { buildOpenApi } from "@/lib/openapi/spec";

export const dynamic = "force-dynamic";
const esc = (s: unknown) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

/** Trang tài liệu API tự dựng từ spec (không tải script ngoài nên hợp CSP). */
export async function GET() {
  const me = await getMe();
  if (!me || !isSystemAdmin(me)) return NextResponse.json({ error: "Chỉ quản trị hệ thống" }, { status: 403 });
  const spec = buildOpenApi();
  const rows = Object.entries(spec.paths).flatMap(([path, ops]) => Object.entries(ops as Record<string, { summary: string; description?: string; tags: string[]; requestBody?: { content: Record<string, { schema: unknown }> }; responses: Record<string, { description: string }> }>).map(([method, op]) => `
    <section><h3><span class="m ${esc(method)}">${esc(method.toUpperCase())}</span> <code>${esc(path)}</code></h3>
    <p><b>${esc(op.summary)}</b>${op.description ? `<br>${esc(op.description)}` : ""}</p>
    ${op.requestBody?.content?.["application/json"] ? `<details><summary>Body (JSON Schema)</summary><pre>${esc(JSON.stringify(op.requestBody.content["application/json"].schema, null, 2))}</pre></details>` : ""}
    <ul>${Object.entries(op.responses).map(([code, r]) => `<li><code>${esc(code)}</code> ${esc(r.description)}</li>`).join("")}</ul></section>`)).join("");
  const html = `<!doctype html><html lang="vi"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>EduConnect API</title>
<style>body{font:15px/1.5 system-ui,sans-serif;max-width:860px;margin:24px auto;padding:0 16px;color:#0f172a}section{border:1px solid #e2e8f0;border-radius:8px;padding:4px 16px;margin:12px 0}h3{margin:12px 0 4px}.m{font-size:12px;padding:2px 8px;border-radius:4px;color:#fff;background:#475569}.m.get{background:#0d9488}.m.post{background:#ea580c}pre{background:#f1f5f9;padding:12px;overflow:auto;border-radius:6px;font-size:12px}</style>
<h1>EduConnect API</h1><p>${esc(spec.info.description)} · Bản phát hành <code>${esc(spec.info.version)}</code> · <a href="/api/openapi.json">openapi.json</a></p>${rows}</html>`;
  return new Response(html, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
}
