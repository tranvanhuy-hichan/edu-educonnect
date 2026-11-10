This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

### Phiên bản thời khóa biểu theo tuần

Ở **Lịch học → Tạo thời khóa biểu mới**, xem trước lịch tự động dưới dạng ma trận (hàng là thứ, mỗi lớp gồm 5 cột tiết trong một buổi), chọn tuần bắt đầu rồi tạo phiên bản mới. Môn trên 2 tiết/tuần được ưu tiên ghép tiết đôi cùng buổi, cùng phòng. Chỉ lưu khi đã xếp đủ số tiết; không thêm, đổi hoặc xóa tiết thủ công trên trang lịch. Nhãn phiên bản hiện bên cạnh tiêu đề; nút biểu tượng tải xuống dùng để xuất Excel.

Không nhập ngày kết thúc: lịch trước tự hết hiệu lực trước tuần của lịch kế tiếp, trong phạm vi học kỳ. Chọn tuần trên lịch để xem phiên bản tương ứng; xuất Excel và sổ đầu bài dùng cùng phiên bản. Lịch hiện có được giữ thành phiên bản đầu tiên khi chạy migration. Không thể tạo hai phiên bản bắt đầu cùng tuần hoặc làm mất hiệu lực những ngày đã ghi sổ đầu bài.

Kiểm thử (chạy trong thư mục `app`):

```sh
node --import tsx --test tests/timetable-versions.test.ts tests/auto-schedule.test.ts
RUN_DATABASE_TESTS=1 node --env-file=.env --import tsx --test tests/timetable-versions.test.ts
```

Kiểm thử database tạo dữ liệu riêng trong một transaction và rollback toàn bộ khi kết thúc.

### Phòng cố định của lớp

Chọn phòng học cố định khi tạo hoặc sửa lớp. Mọi môn trong thời khóa biểu mới dùng đúng phòng này; hệ thống không tự đổi sang phòng khác khi phòng bận. Lớp chưa có phòng cần được phân công trước khi tạo TKB. Đổi phòng của lớp áp dụng cho các TKB tạo sau đó, giữ nguyên lịch và sổ đầu bài đã có.

### Cấu hình trước khi xếp thời khóa biểu

Trong Tạo thời khóa biểu mới, cấu hình số tiết sáng (1–5) và chiều (6–10) riêng cho từng ngày, từng khối; chọn 0 để nghỉ buổi đó. Thêm tiết cố định theo toàn trường, khối hoặc từng lớp. Danh sách cấu hình buổi học lấy toàn bộ danh mục khối, kể cả khối chưa có lớp trong học kỳ. Hoạt động chung như chào cờ giữ chỗ nhưng không tính vào số tiết môn học, có thể nằm ngoài buổi học thường lệ; môn cố định phải có phân công giáo viên, nằm trong buổi đã cấu hình và tính vào số tiết/tuần. Bấm Xếp lịch & xem trước rồi chọn tuần áp dụng và lưu. Thay đổi cấu hình cần tính lại bản xem trước. Cấu hình được lưu theo phiên bản và dùng làm gợi ý cho lần tạo tiếp theo. Hoạt động chung xuất hiện trong lịch và Excel, không yêu cầu sổ đầu bài.

### Lịch thi

Menu Thời khóa biểu dùng tên thống nhất cho các vai trò. Vào **Lịch thi → Tạo lịch thi** để chọn học kỳ/khối và thêm các môn. Mỗi môn chia theo lớp hoặc alphabet; nhập tối đa thí sinh/phòng để tự tính số phòng, hoặc nhập trực tiếp số phòng. Kiểm tra danh sách rồi gán phòng học, giờ thi, thời lượng, giờ có mặt và giám thị; lưu nháp và công bố khi đã đủ thông tin. Có thể bỏ chọn thí sinh trong danh sách xem trước (ví dụ thi lại) rồi chia lại.

Học sinh xem đúng lịch, SBD, chỗ ngồi của bản thân và tải ICS; giáo viên xem toàn bộ lịch công khai, lọc lịch mình coi thi và xuất Excel; quản lý có thêm sửa nháp, công bố, thu hồi và hủy. Lịch từng công bố sau khi hủy hiển thị trạng thái hủy cho người liên quan. Danh sách phòng có bản in và Excel kèm cột ký tên.

Phân tích chi tiết: [Nghiệp vụ lịch thi](../docs/lich-thi-nghiep-vu.md).

```sh
RUN_DATABASE_TESTS=1 node --env-file=.env --import tsx --test tests/exam-planning.test.ts tests/exams.integration.test.ts
```

Kiểm thử trang đã render: chạy bản production ở localhost:3101 rồi chạy `node --env-file=.env --import tsx scripts/check-exam-pages.ts`. Script chỉ đọc tài khoản có sẵn, tạo phiên kiểm thử trong bộ nhớ và không ghi dữ liệu.

### Danh sách môn học chính thức của lớp

Chọn ít nhất một môn khi tạo lớp; sửa tại Lớp học → Thông tin → Môn học của lớp. Mỗi lớp trong năm học có một danh sách môn dùng chung. Dữ liệu lớp cũ được chuyển từ các phân công hiện có.

Phân công giảng dạy hiển thị sẵn từng môn của lớp theo học kỳ, đánh dấu môn chưa có giáo viên và cho phân công trực tiếp. Không có ô chọn thêm một môn ngoài danh sách lớp; server và khóa ngoại database cũng chặn việc này. Thời khóa biểu yêu cầu phân công đủ giáo viên cho các môn đã chọn. Lịch thi lấy đúng học sinh của những lớp chọn môn đó, kể cả khi môn chưa có giáo viên.

Không bỏ môn có phân công/dữ liệu học tập hoặc danh sách thi đã lập. Môn chưa có dữ liệu có thể thêm/bỏ bình thường. Kiểm thử liên thông: `RUN_DATABASE_TESTS=1 node --env-file=.env --import tsx --test tests/curriculum.integration.test.ts`.
