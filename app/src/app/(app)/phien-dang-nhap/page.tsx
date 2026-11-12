import { Laptop, Smartphone } from "lucide-react";
import { requireRole } from "@/lib/guard";
import { Card, Table, Title } from "@/components/ui";
import { ActionForm } from "@/components/action-form";
import * as sessions from "@/modules/auth/session.repository";
import { currentSessionId, logoutEverywhere, revokeMyOtherSessions, revokeMySession } from "./actions";

export const dynamic = "force-dynamic";
const fmt = (d: Date) => d.toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", hour12: false });
const isPhone = (device: string) => /Android|iOS/.test(device);

export default async function MySessions() {
  const me = await requireRole();
  const [list, current] = await Promise.all([sessions.listLiveSessions(me.id), currentSessionId()]);
  return (
    <div className="space-y-4">
      <Title>Phiên đăng nhập</Title>
      <Card className="space-y-3 text-sm">
        <p className="text-slate-600">Đây là các thiết bị đang đăng nhập tài khoản của bạn. Thấy thiết bị lạ hoặc làm mất điện thoại: đăng xuất thiết bị đó, hoặc đăng xuất mọi nơi rồi <b>đổi mật khẩu ngay</b>.</p>
        <div className="flex flex-wrap gap-2">
          <ActionForm action={revokeMyOtherSessions} submit="Đăng xuất các thiết bị khác" compact reset={false} className="flex" confirmText="Đăng xuất mọi thiết bị khác ngoài thiết bị này?" />
          <ActionForm action={logoutEverywhere} submit="Đăng xuất mọi nơi" compact danger reset={false} className="flex" confirmText="Đăng xuất khỏi MỌI thiết bị, kể cả thiết bị này?" />
        </div>
      </Card>
      <Table head={["Thiết bị", "Địa chỉ", "Đăng nhập lúc", "Hoạt động gần nhất", ""]}>
        {list.map((s) => (
          <tr key={s.id}>
            <td><span className="inline-flex items-center gap-2 font-medium">{isPhone(s.device) ? <Smartphone className="size-4 text-slate-500" /> : <Laptop className="size-4 text-slate-500" />}{s.device}{s.id === current && <span className="rounded bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-700">Thiết bị này</span>}</span></td>
            <td className="font-mono text-xs">{s.ipMasked}</td>
            <td className="whitespace-nowrap text-xs">{fmt(s.createdAt)}</td>
            <td className="whitespace-nowrap text-xs">{fmt(s.lastSeenAt)}</td>
            <td>{s.id !== current && <ActionForm action={revokeMySession} submit="Đăng xuất" compact danger reset={false} className="flex"><input type="hidden" name="id" value={s.id} /></ActionForm>}</td>
          </tr>
        ))}
        {!list.length && <tr><td colSpan={5} className="text-center text-slate-500">Chưa có phiên nào được ghi nhận (phiên đăng nhập cũ trước khi có tính năng này sẽ hiện sau lần đăng nhập kế tiếp).</td></tr>}
      </Table>
    </div>
  );
}
