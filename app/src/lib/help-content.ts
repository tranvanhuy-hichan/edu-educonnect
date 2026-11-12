import type { Role } from "@prisma/client";

/** Nội dung hướng dẫn trong ứng dụng. Thêm trang mới: thêm một mục vào PAGE_HELP (test sẽ nhắc nếu quên: mọi mục trong menu đều phải có hướng dẫn). */
export type HelpEntry = { match: string; title: string; summary: string; steps: string[]; tips?: string[] };
export type GuideStep = { title: string; text: string; href?: string };
export type RoleGuide = { role: string; title: string; intro: string; steps: GuideStep[] };

export const PAGE_HELP: HelpEntry[] = [
  { match: "/", title: "Trang chủ", summary: "Tổng quan nhanh những việc của hôm nay.", steps: ["Dải trên cùng chào bạn và có nút tắt tới việc hay dùng nhất.", "Các thẻ số liệu bấm vào được để mở danh sách tương ứng.", "Mục “Cần xử lý” (quản lý) liệt kê việc cần kiểm tra như lớp chưa có GVCN, sách quá hạn, tiết chưa ghi sổ.", "“Lịch hôm nay” là các tiết trong ngày; giáo viên bấm “Ghi sổ đầu bài” ngay tại đây."], tips: ["Dùng ô tìm kiếm trên thanh trên cùng (hoặc phím /) để nhảy nhanh tới trang hay tìm học sinh, giáo viên."] },
  { match: "/lop-hoc", title: "Lớp học", summary: "Quản lý lớp, sĩ số, giáo viên chủ nhiệm và danh sách học sinh.", steps: ["Bấm vào một lớp để xem học sinh, GVCN, các môn của lớp.", "“Thêm lớp” tạo lớp mới cho năm học hiện hành và chọn các môn học của lớp.", "Trong trang lớp có thể xếp học sinh vào lớp hoặc nhập danh sách từ tệp.", "Chọn GVCN ở thông tin lớp; người đó tự có thêm vai trò Giáo viên chủ nhiệm."], tips: ["Lớp đã có phân công, thời khoá biểu hoặc sổ đầu bài thì không xoá được: hãy chuyển học sinh sang lớp khác.", "Lớp bị xoá nhầm vẫn khôi phục được trong 30 ngày ở mục Thùng rác."] },
  { match: "/hoc-sinh", title: "Học sinh", summary: "Hồ sơ, tài khoản và lớp của từng học sinh.", steps: ["Tìm theo tên, mã học sinh hoặc email; lọc theo trạng thái, khối, lớp.", "“Thêm học sinh” tạo hồ sơ kèm tài khoản; mật khẩu ban đầu hiện một lần và có thể tải CSV.", "Mở một học sinh để sửa hồ sơ, xếp hoặc chuyển lớp, xem điểm và tài khoản.", "Điền đúng số điện thoại người giám hộ để phụ huynh nhận thông báo và mã xác minh."], tips: ["Học sinh đã có điểm, bài nộp hoặc mượn sách thì dùng “Khoá tài khoản” thay vì xoá.", "Hồ sơ xoá nhầm khôi phục được trong 30 ngày ở mục Thùng rác."] },
  { match: "/giao-vien", title: "Giáo viên", summary: "Hồ sơ giáo viên, môn phụ trách và các lớp đang dạy.", steps: ["Các thẻ lọc cho xem GVCN, GVBM, giáo viên chưa phân công và tài khoản đã khoá.", "“Thêm giáo viên” tạo hồ sơ cùng tài khoản; “Nhập hàng loạt” tạo nhiều người từ danh sách tên.", "Mở giáo viên để sửa môn phụ trách và xem lớp đang dạy.", "Phân công dạy lớp nào thực hiện ở mục Phân công giảng dạy."] },
  { match: "/phan-cong", title: "Phân công giảng dạy", summary: "Chọn giáo viên dạy từng môn của từng lớp theo học kỳ.", steps: ["Chọn học kỳ ở trên; các môn lấy từ thông tin của lớp.", "Ở môn còn trống, chọn giáo viên rồi lưu.", "Đổi giáo viên của một môn sẽ được ghi vào tab “Lịch sử đổi giáo viên” và báo cho giáo viên mới.", "Giáo viên được phân công sẽ nhận thông báo và thấy lớp trong mục Lớp của tôi."] },
  { match: "/lich-hoc", title: "Thời khoá biểu", summary: "Xem lịch học theo tuần; quản lý xếp và chỉnh lịch.", steps: ["Dùng nút tuần trước/sau để xem các tuần khác.", "Giáo viên và học sinh chỉ thấy lịch của mình.", "Quản lý có thể xếp tự động, sửa từng tiết và xuất Excel.", "Mỗi lần thay đổi lịch tạo một phiên bản có hiệu lực từ một tuần nhất định, lịch cũ vẫn được giữ."], tips: ["Phòng học và giáo viên không bị trùng giờ: hệ thống sẽ báo nếu xếp xung đột."] },
  { match: "/giang-day", title: "Giảng dạy", summary: "Xem học liệu theo môn, khối, lớp.", steps: ["Chọn môn, khối rồi lớp để xem các bài học đã đăng cho lớp đó.", "Mở bài học để xem nội dung, bài tập và bài nộp của học sinh."] },
  { match: "/bai-hoc", title: "Bài học và bài tập", summary: "Nội dung học, bài tập và bài kiểm tra của lớp.", steps: ["Giáo viên đăng bài học, đính kèm tệp và giao bài tập cho lớp.", "Bài trắc nghiệm có thể đặt hạn nộp, số lần làm, giờ làm bài và chế độ thi nghiêm túc.", "Học sinh mở bài, làm và nộp; xem lại bài hoặc điểm theo cài đặt của giáo viên.", "Giáo viên chấm bài tự luận và theo dõi vi phạm khi thi nghiêm túc."], tips: ["Học sinh sẽ nhận nhắc việc trước hạn nộp một ngày nếu chưa nộp.", "Bài học có lượt làm thì không xoá được; xoá nhầm bài khác khôi phục được trong 30 ngày."] },
  { match: "/ngan-hang-bai-hoc", title: "Kho bài học", summary: "Soạn bài học và bài tập mẫu dùng lại cho nhiều lớp.", steps: ["Tạo bài học theo môn và khối, thêm bài tập mẫu từ ngân hàng câu hỏi.", "Từ trang lớp, “Đăng từ kho” để đưa bài học và bài tập vào lớp.", "Sắp xếp thứ tự bài học; “Xoá” chỉ lưu trữ và đưa vào Thùng rác của quản trị."] },
  { match: "/ngan-hang-cau-hoi", title: "Ngân hàng câu hỏi", summary: "Soạn và quản lý câu hỏi theo môn, khối, bài học.", steps: ["Thêm câu hỏi trắc nghiệm hoặc trả lời ngắn, gắn bài học, mức độ.", "“Nhập từ tệp” đọc câu hỏi từ Word, PDF hoặc ảnh bằng AI; xem lại và duyệt trước khi dùng.", "Câu hỏi đã được bài tập dùng thì khi sửa sẽ tạo phiên bản mới để không đổi bài đã làm.", "Nhập bằng AI có giới hạn số lần mỗi ngày."], tips: ["Kiểm tra kỹ câu hỏi AI đọc, nhất là công thức và hình."] },
  { match: "/so-dau-bai", title: "Sổ đầu bài", summary: "Ghi nhận từng tiết dạy: nội dung, xếp loại, học sinh vắng.", steps: ["Chọn tiết của bạn trong tuần và bấm ghi sổ.", "Nhập tên bài, nhận xét, xếp loại tiết và chọn học sinh vắng (có phép hoặc không phép).", "Học sinh vừa được ghi vắng sẽ báo cho phụ huynh trong ứng dụng (và SMS nếu trường bật).", "Giáo viên chỉ ghi được ngày không ở tương lai và sửa trong vài ngày gần nhất; quản lý sửa không giới hạn."] },
  { match: "/lich-thi", title: "Lịch thi", summary: "Lập, công bố và theo dõi lịch thi, phòng thi, giám thị.", steps: ["Tạo đợt thi: chọn học kỳ, khối, môn, ngày giờ, cách chia phòng.", "Xem trước danh sách thí sinh, xếp phòng và giám thị; hệ thống báo trùng giờ hoặc quá sức chứa.", "“Công bố” sẽ báo cho học sinh có số báo danh và giáo viên coi thi; có thể thu hồi hoặc huỷ.", "Hệ thống nhắc học sinh, giám thị và phụ huynh một ngày trước kỳ thi."], tips: ["Xuất Excel danh sách phòng thi và số báo danh ngay trong trang chi tiết."] },
  { match: "/nhap-diem", title: "Nhập điểm", summary: "Nhập và cập nhật điểm theo lớp và môn.", steps: ["Chọn lớp-môn mình phụ trách để mở bảng điểm.", "Nhập điểm thường xuyên, giữa kỳ, cuối kỳ (thang 10); điểm trung bình tự tính theo hệ số 1-2-3.", "Mỗi lần lưu cần ghi lý do cập nhật; hệ thống lưu lịch sử trước và sau.", "Điểm đang hiển thị mà thay đổi sẽ báo học sinh và phụ huynh; học kỳ đang khoá xem thì chưa báo.", "Sổ điểm đã khoá cần yêu cầu mở quyền sửa có thời hạn."], tips: ["Hiệu trưởng hoặc Admin công bố điểm học kỳ để học sinh và phụ huynh bắt đầu xem."] },
  { match: "/thi-dua", title: "Thi đua", summary: "Chấm điểm thi đua của lớp theo tuần hoặc tháng.", steps: ["Chọn học kỳ và kỳ chấm, nhập điểm cho từng lớp.", "Quản lý tiêu chí thi đua và xem bảng xếp hạng lớp."] },
  { match: "/len-lop", title: "Xét lên lớp", summary: "Tổng kết cuối năm và quyết định lên lớp.", steps: ["Xem kết quả cả năm của từng học sinh, duyệt từng em hoặc cả lớp.", "Sau khi duyệt, thực hiện chuyển học sinh lên lớp của năm học mới.", "Kết quả đã duyệt thì không sửa điểm được trừ khi mở lại hồ sơ."], tips: ["Làm sau khi điểm cuối năm đã đầy đủ và được kiểm tra."] },
  { match: "/mon-hoc", title: "Môn học", summary: "Danh mục môn học và cách đánh giá (điểm số hoặc nhận xét).", steps: ["Thêm hoặc sửa môn, chọn hình thức đánh giá.", "Môn đang được lớp hoặc giáo viên dùng thì không xoá được."] },
  { match: "/phong-hoc", title: "Phòng học", summary: "Danh mục phòng, sức chứa, dùng cho thời khoá biểu và lịch thi.", steps: ["Thêm hoặc sửa phòng và sức chứa.", "Phòng cố định của lớp đặt trong thông tin lớp."] },
  { match: "/thu-vien", title: "Thư viện", summary: "Đầu sách, bản sao, phiếu mượn và sách quá hạn.", steps: ["Thêm đầu sách rồi các bản sao có mã riêng.", "Lập phiếu mượn cho học sinh với hạn trả; học sinh nhận thông báo và được nhắc một ngày trước hạn.", "Ghi trả sách; mục “Sách quá hạn” liệt kê phiếu cần thu hồi.", "Tab thống kê cho số liệu mượn trả."] },
  { match: "/tai-khoan/ra-soat", title: "Rà soát tài khoản", summary: "Tìm tài khoản không còn sử dụng để khoá, giảm rủi ro bảo mật.", steps: ["Xem các nhóm: lâu không đăng nhập, chưa từng đăng nhập, giáo viên chưa phân công, học sinh chưa xếp lớp.", "Tick các tài khoản không còn dùng rồi “Khoá các tài khoản đã chọn”.", "Hệ thống không tự khoá ai; khoá xong vẫn mở lại được."], tips: ["Ngày 1 hằng tháng hệ thống nhắc bạn rà soát."] },
  { match: "/tai-khoan", title: "Tài khoản", summary: "Quản lý tài khoản, vai trò và mật khẩu của người dùng.", steps: ["“Thêm tài khoản” cho cán bộ, “Nhập hàng loạt” từ danh sách tên.", "Mở một tài khoản để đổi vai trò, khoá hoặc mở khoá, xem phiên đăng nhập.", "“Cấp lại MK hàng loạt”: chọn vai trò hoặc lớp, xem trước số tài khoản rồi tải CSV mật khẩu mới.", "Người dùng bắt buộc đổi mật khẩu được cấp ngay khi đăng nhập."], tips: ["Tài khoản bị khoá tạm do nhập sai mật khẩu 5 lần có nút “Mở khoá đăng nhập” trong trang chi tiết.", "Mất điện thoại hoặc nghi lộ mật khẩu: “Đăng xuất mọi thiết bị” rồi cấp lại mật khẩu."] },
  { match: "/cau-hinh", title: "Cấu hình", summary: "Thông tin trường, năm học, học kỳ, khối và quy chế.", steps: ["Khai báo năm học và các học kỳ trước khi tạo lớp.", "Thiết lập khối, hệ số điểm, quy chế đánh giá và thông tin trường.", "Cẩn thận khi xoá năm học hoặc học kỳ đã có dữ liệu."] },
  { match: "/nhat-ky", title: "Nhật ký hoạt động", summary: "Ai đã làm gì và khi nào.", steps: ["Lọc theo người thực hiện, loại đối tượng, hành động và khoảng ngày.", "Dùng khi cần truy vết thay đổi điểm, tài khoản, lịch thi."] },
  { match: "/van-hanh", title: "Vận hành hệ thống", summary: "Sức khoẻ hệ thống: lỗi, tác vụ nền, SMS, cơ sở dữ liệu.", steps: ["Mục lỗi hệ thống gom các lỗi lặp lại; tìm theo mã người dùng báo; bấm “Đã xử lý” sau khi sửa.", "Hàng đợi tác vụ nền cho xem việc đang chờ hoặc lỗi và thử lại.", "Mục SMS cho biết số tin gửi được và lỗi gần nhất."] },
  { match: "/thung-rac", title: "Thùng rác", summary: "Khôi phục học sinh, lớp, bài học, câu hỏi bị xoá nhầm trong 30 ngày.", steps: ["Lọc theo loại; mỗi dòng cho biết ai xoá và còn bao nhiêu ngày.", "“Khôi phục” trả lại nguyên trạng kèm dữ liệu liên quan.", "Nếu mã hoặc email đã bị người khác dùng, hệ thống báo và không thay đổi gì.", "Quá 30 ngày bị xoá hẳn; có thể “Xoá hẳn” sớm."] },
  { match: "/ket-noi-api", title: "Kết nối ngoài (API)", summary: "Cấp khoá API cho hệ thống bên ngoài (ví dụ hệ thống Đoàn thanh niên) đọc, và nếu được cấp quyền GHI thì tạo/sửa học sinh, giáo viên, lớp, thông tin Đoàn.", steps: ["“Tạo khoá API”: đặt tên, chọn đúng những quyền cần thiết, thời hạn, giới hạn tốc độ và (nên) danh sách IP được phép.", "Khoá chỉ hiện MỘT LẦN ngay khi tạo: sao chép và gửi cho đơn vị nhận qua kênh an toàn.", "“Xoay khoá” cấp khoá mới và thu hồi khoá cũ; “Thu hồi” chặn ngay lập tức.", "Cột “24 giờ qua” cho biết số lần gọi và số lỗi của từng khoá.", "Mục “Thay đổi do hệ thống ngoài thực hiện” liệt kê mọi lần ghi (trước → sau); bấm “Hoàn tác” để trả dữ liệu về như cũ khi chưa ai sửa tiếp."], tips: ["Quyền “nhạy cảm” (liên hệ, CCCD) và quyền GHI chỉ cấp khi có thoả thuận bằng văn bản với đơn vị nhận.", "Hết hạn hoặc thu hồi thì hệ thống bên ngoài báo lỗi 401, hãy báo trước cho họ."] },
  { match: "/phien-dang-nhap", title: "Phiên đăng nhập", summary: "Các thiết bị đang đăng nhập tài khoản của bạn.", steps: ["Thiết bị lạ: bấm “Đăng xuất” ở dòng đó.", "“Đăng xuất các thiết bị khác” giữ lại thiết bị này.", "“Đăng xuất mọi nơi” dùng khi mất điện thoại hoặc nghi lộ mật khẩu; sau đó nên đổi mật khẩu."] },
  { match: "/doi-mat-khau", title: "Đổi mật khẩu", summary: "Đặt mật khẩu mới cho tài khoản của bạn.", steps: ["Nhập mật khẩu hiện tại và mật khẩu mới (ít nhất 6 ký tự).", "Mật khẩu mới phải khác mật khẩu cũ.", "Đổi mật khẩu sẽ đăng xuất các thiết bị khác."], tips: ["Nhập sai mật khẩu hiện tại quá nhiều lần sẽ bị khoá tạm."] },
  { match: "/diem-cua-toi", title: "Bảng điểm", summary: "Điểm các môn của bạn.", steps: ["Xem điểm từng môn theo học kỳ và điểm trung bình.", "Điểm chỉ hiện sau khi nhà trường công bố học kỳ đó."] },
  { match: "/lop-cua-toi", title: "Lớp của tôi", summary: "Các lớp và môn bạn đang dạy.", steps: ["Bấm vào một lớp-môn để quản lý bài học, bài tập và điểm.", "Từ đây đăng bài học, giao bài tập và nhập điểm."] },
  { match: "/lop-chu-nhiem", title: "Lớp chủ nhiệm", summary: "Theo dõi lớp bạn chủ nhiệm.", steps: ["Xem danh sách học sinh, điểm và sổ đầu bài của lớp.", "Cập nhật thông tin phụ huynh để thông báo gửi đúng người."] },
];

const COMMON_TIP = "Nút “?” ở thanh trên cùng luôn hướng dẫn riêng cho trang bạn đang mở.";

export const ROLE_GUIDES: Record<Role, RoleGuide> = {
  ADMIN: { role: "ADMIN", title: "Quản trị hệ thống", intro: "Bạn thiết lập hệ thống và giữ cho nó an toàn.", steps: [
    { title: "Khai báo năm học", text: "Tạo năm học, học kỳ, khối và quy chế trước tiên.", href: "/cau-hinh" },
    { title: "Tạo lớp và học sinh", text: "Thêm lớp, nhập học sinh vào lớp. Nhớ điền số điện thoại người giám hộ.", href: "/lop-hoc" },
    { title: "Cấp tài khoản giáo viên và phân công", text: "Tạo tài khoản, rồi phân công giáo viên cho từng môn của lớp.", href: "/phan-cong" },
    { title: "Xếp thời khoá biểu", text: "Xếp tự động hoặc nhập tay; lịch có phiên bản theo tuần.", href: "/lich-hoc" },
    { title: "Giữ an toàn", text: "Rà soát tài khoản mỗi tháng, xem phiên đăng nhập, dùng Thùng rác khi xoá nhầm.", href: "/tai-khoan/ra-soat" },
    { title: "Theo dõi vận hành", text: "Xem lỗi, tác vụ nền và SMS; kiểm tra backup định kỳ.", href: "/van-hanh" },
  ] },
  PRINCIPAL: { role: "PRINCIPAL", title: "Hiệu trưởng", intro: "Bạn điều hành và quyết định các mốc quan trọng.", steps: [
    { title: "Xem tổng quan", text: "Trang chủ cho biết việc cần xử lý trong ngày.", href: "/" },
    { title: "Lịch thi", text: "Lập và công bố lịch thi; hệ thống tự báo học sinh, giám thị và phụ huynh.", href: "/lich-thi" },
    { title: "Công bố điểm", text: "Khi đủ điều kiện, công bố điểm học kỳ để học sinh và phụ huynh xem.", href: "/nhap-diem" },
    { title: "Xét lên lớp", text: "Duyệt kết quả cuối năm và chuyển lớp.", href: "/len-lop" },
  ] },
  VICE_PRINCIPAL: { role: "VICE_PRINCIPAL", title: "Hiệu phó", intro: "Bạn hỗ trợ điều hành học vụ.", steps: [
    { title: "Xem tổng quan", text: "Theo dõi việc cần xử lý và sổ đầu bài.", href: "/" },
    { title: "Thời khoá biểu và phân công", text: "Xếp lịch và phân công giảng dạy.", href: "/phan-cong" },
    { title: "Lịch thi", text: "Chuẩn bị đợt thi, chia phòng, xếp giám thị.", href: "/lich-thi" },
  ] },
  HOMEROOM_TEACHER: { role: "HOMEROOM_TEACHER", title: "Giáo viên chủ nhiệm", intro: "Ngoài việc dạy, bạn theo dõi lớp mình chủ nhiệm.", steps: [
    { title: "Lớp chủ nhiệm", text: "Xem học sinh, điểm, chuyên cần của lớp.", href: "/lop-chu-nhiem" },
    { title: "Thông tin phụ huynh", text: "Giữ số điện thoại người giám hộ chính xác để phụ huynh nhận thông báo và mã xác minh.", href: "/hoc-sinh" },
    { title: "Chuyên cần và điểm của lớp", text: "Xem sổ đầu bài và bảng điểm để kịp thời nhắc nhở học sinh.", href: "/so-dau-bai" },
  ] },
  SUBJECT_TEACHER: { role: "SUBJECT_TEACHER", title: "Giáo viên bộ môn", intro: "Bạn dạy, giao bài và nhập điểm cho lớp được phân công.", steps: [
    { title: "Xem lớp của tôi", text: "Các lớp-môn bạn phụ trách và thời khoá biểu.", href: "/lop-cua-toi" },
    { title: "Ghi sổ đầu bài", text: "Ghi từng tiết và học sinh vắng ngay sau buổi dạy.", href: "/so-dau-bai" },
    { title: "Soạn câu hỏi và bài học", text: "Dùng ngân hàng câu hỏi (có nhập từ tệp bằng AI) và kho bài học để tái sử dụng.", href: "/ngan-hang-cau-hoi" },
    { title: "Giao bài, kiểm tra", text: "Đăng bài học, giao bài tập hoặc bài kiểm tra trắc nghiệm có hạn nộp.", href: "/lop-cua-toi" },
    { title: "Nhập điểm", text: "Mỗi lần lưu ghi lý do; học sinh và phụ huynh được báo khi điểm đang hiển thị.", href: "/nhap-diem" },
  ] },
  LIBRARIAN: { role: "LIBRARIAN", title: "Thủ thư", intro: "Bạn quản lý sách và việc mượn trả.", steps: [
    { title: "Thêm sách", text: "Tạo đầu sách rồi các bản sao có mã riêng.", href: "/thu-vien" },
    { title: "Lập phiếu mượn", text: "Chọn học sinh, sách và hạn trả; học sinh được nhắc trước hạn một ngày.", href: "/thu-vien" },
    { title: "Theo dõi sách quá hạn", text: "Mục “Sách quá hạn” liệt kê phiếu cần thu hồi.", href: "/thu-vien" },
  ] },
  STUDENT: { role: "STUDENT", title: "Học sinh", intro: "Mọi thứ về việc học của bạn ở một nơi.", steps: [
    { title: "Xem lịch học", text: "Thời khoá biểu theo tuần và lịch thi.", href: "/lich-hoc" },
    { title: "Làm bài học và bài tập", text: "Nộp đúng hạn; hệ thống nhắc bạn một ngày trước hạn nếu chưa nộp.", href: "/bai-hoc" },
    { title: "Xem điểm", text: "Điểm xuất hiện sau khi nhà trường công bố học kỳ.", href: "/diem-cua-toi" },
    { title: "Mượn sách", text: "Xem sách đang mượn và hạn trả ở Thư viện.", href: "/thu-vien" },
    { title: "Giữ an toàn tài khoản", text: "Đổi mật khẩu khi được cấp; kiểm tra thiết bị đăng nhập ở menu tài khoản.", href: "/phien-dang-nhap" },
  ] },
};

const ORDER: Role[] = ["ADMIN", "PRINCIPAL", "VICE_PRINCIPAL", "HOMEROOM_TEACHER", "SUBJECT_TEACHER", "LIBRARIAN", "STUDENT"];

/** Hướng dẫn cho trang đang mở: mục có `match` dài nhất khớp đầu đường dẫn. Trang chủ chỉ khớp đúng "/". */
export function helpFor(path: string): HelpEntry | null {
  const clean = path.split("?")[0].replace(/\/+$/, "") || "/";
  let best: HelpEntry | null = null;
  for (const e of PAGE_HELP) {
    const ok = e.match === "/" ? clean === "/" : clean === e.match || clean.startsWith(e.match + "/");
    if (ok && (!best || e.match.length > best.match.length)) best = e;
  }
  return best;
}

/** Hướng dẫn theo vai trò; người kiêm nhiều vai trò thấy gộp (bỏ trùng bước). */
export function guidesFor(roles: readonly Role[]): RoleGuide[] {
  return ORDER.filter((r) => roles.includes(r)).map((r) => ROLE_GUIDES[r]);
}
export const HELP_TIP = COMMON_TIP;
