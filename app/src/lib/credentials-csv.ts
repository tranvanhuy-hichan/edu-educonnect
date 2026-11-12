export type CredentialRow = { fullName: string; username: string; password: string; status?: string };

export function downloadCredentials(rows: CredentialRow[], filename = "tai-khoan") {
  const quote = (value: string) => `"${(/^[=+@\-\t\r]/.test(value) ? "'" : "") + value.replace(/"/g, '""')}"`;
  const lines = [
    ["Họ tên", "Tài khoản", "Mật khẩu ban đầu", "Kết quả"],
    ...rows.map((row) => [row.fullName, row.username, row.password, row.status ?? "Đã tạo — đổi mật khẩu khi đăng nhập lần đầu"]),
  ];
  const url = URL.createObjectURL(new Blob(["\uFEFF" + lines.map((line) => line.map(quote).join(",")).join("\r\n")], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `${filename}-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/** CSV tổng quát (UTF-8 có BOM để Excel đọc đúng tiếng Việt). Ô bắt đầu bằng = + - @ được vô hiệu hoá để tránh chèn công thức. */
export function downloadCsv(header: string[], rows: string[][], filename: string) {
  const quote = (value: string) => `"${(/^[=+@\-\t\r]/.test(value) ? "'" : "") + value.replace(/"/g, '""')}"`;
  const url = URL.createObjectURL(new Blob(["\uFEFF" + [header, ...rows].map((line) => line.map(quote).join(",")).join("\r\n")], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `${filename}-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
