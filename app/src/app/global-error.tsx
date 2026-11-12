"use client";

/** Lỗi nghiêm trọng ở khung ngoài cùng (hiếm): vẫn có trang báo lỗi thay vì màn hình trắng. */
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="vi">
      <body style={{ fontFamily: "system-ui, sans-serif", display: "grid", placeItems: "center", minHeight: "100vh", margin: 0, background: "#f3f6f5" }}>
        <div style={{ maxWidth: 420, textAlign: "center", padding: 24 }}>
          <h2>Hệ thống đang gặp sự cố</h2>
          <p style={{ color: "#475569" }}>Vui lòng thử lại sau ít phút.</p>
          <button onClick={reset} style={{ height: 38, padding: "0 18px", borderRadius: 6, border: 0, background: "#ea580c", color: "#fff", fontWeight: 600, cursor: "pointer" }}>Thử lại</button>
        </div>
      </body>
    </html>
  );
}
