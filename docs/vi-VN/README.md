# Trình thông báo chủ đề Heybox

[![License: AGPL-3.0](https://img.shields.io/badge/License-AGPL--3.0-blue.svg)](https://opensource.org/licenses/AGPL-3.0)
[![Deno](https://img.shields.io/badge/Deno-2.x-000?logo=deno&logoColor=white)](https://deno.com/)
[![Production](https://img.shields.io/badge/Production-online-brightgreen)](https://heybox-topic-notifier.yuanxiqwq.deno.net/)
[![Dev](https://img.shields.io/badge/Dev-preview-blue)](https://heybox-topic-notifier--dev.yuanxiqwq.deno.net/)

| [简体中文](../../README.md) | **Tiếng Việt** |
|:-----------------------:|:--------------:|

---

<a href="https://heybox-topic-notifier.yuanxiqwq.deno.net/"><img src="https://deno.com/logo.svg" alt="Deno" width="16" height="16" align="absmiddle"> Heybox Topic Notifier</a>
là một ứng dụng Deno nhẹ dùng để giám sát bài đăng chủ đề trên Heybox. Ứng dụng định kỳ đọc các bài đăng
chủ đề thực tế theo thiết lập của từng tài khoản, kiểm tra tiêu đề, nội dung, bình luận và phản hồi theo
các quy tắc từ khóa, ghi lại các kết quả khớp trong chế độ xem đang chờ xử lý và lịch sử, rồi gửi thông báo
qua kênh đã được cấu hình.

## Tính năng

- Bảng điều khiển: xem trạng thái thăm dò, tổng số kết quả khớp, kết quả khớp mới nhất và các kết quả
  đang chờ xử lý, kèm thao tác kiểm tra thủ công
- Trang thiết lập: cấu hình ID chủ đề, trạng thái bật, ghi chú, đơn vị khoảng thời gian thăm dò, giới hạn
  số bài đăng, chế độ sắp xếp, ngôn ngữ giao diện, chế độ tối và màu chủ đề
- Thiết lập tài khoản: đăng ký, đăng nhập, đăng xuất, cập nhật tên người dùng và cập nhật mật khẩu;
  dữ liệu tài khoản được tách biệt theo ID người dùng
- Quy tắc từ khóa: hỗ trợ quy tắc dùng chung, quy tắc riêng cho từng chủ đề, vị trí khớp, phân biệt chữ hoa
  chữ thường và biểu thức chính quy
- Bảng kết quả khớp: bản ghi đang chờ xử lý và bản ghi lịch sử đều hỗ trợ bộ lọc theo khoảng thời gian,
  phân trang, hoàn tất hàng loạt và thao tác xóa
- Mục gỡ lỗi: kết quả khớp mô phỏng và kiểm thử thông báo, với giới hạn tần suất phía máy chủ cho thao tác
  thăm dò thủ công và thao tác gỡ lỗi
- Kênh thông báo: Webhook tùy chỉnh, ServerChan, PushPlus, WxPusher, email API và SMTP
- Chuyển tiếp thông báo: relay Cloudflare Worker tùy chọn cho PushPlus, WxPusher và ServerChan
- Bảo mật: hash mật khẩu PBKDF2, phiên dựa trên KV, token CSRF, header bảo mật, nhật ký kiểm toán,
  cùng allowlist gửi đi kèm xác thực DNS

## Công nghệ sử dụng

- Deno 2 + TypeScript
- Hono
- Deno KV
- Deno.cron + bộ lập lịch hẹn giờ cục bộ
- HTML render phía máy chủ + JavaScript/CSS thuần
- Script Cloudflare Workers để chuyển tiếp thông báo

## Phát triển cục bộ

Khởi động máy chủ phát triển:

```powershell
deno task dev
```

Sau đó mở:

```text
http://localhost:8000
```

Để ghi đè các giá trị mặc định, hãy dùng `.env.example` làm tài liệu tham khảo và đặt các biến môi trường
tương ứng trong môi trường chạy của bạn. Đăng ký tài khoản trong lần truy cập đầu tiên; biến môi trường
chỉ dùng để khởi tạo giá trị mặc định cho tài khoản mới hoặc dữ liệu mặc định, sau đó trang thiết lập của
mỗi tài khoản sẽ trở thành nguồn dữ liệu chuẩn.

Ứng dụng cung cấp trang đăng ký và đăng nhập. Mỗi tài khoản có thiết lập, lịch sử kết quả khớp, trạng thái
thăm dò và cấu hình thông báo riêng biệt, vì vậy người dùng dùng chung cùng một URL triển khai sẽ không
chia sẻ dữ liệu. Mật khẩu người dùng được lưu trong Deno KV dưới dạng hash PBKDF2 có salt, không phải văn bản
thuần. Phiên đăng nhập được lưu trong Deno KV, còn cookie của trình duyệt chỉ chứa một token phiên ngẫu nhiên.
Các thay đổi đối với thiết lập, tài khoản và gỡ lỗi đều xác thực token CSRF, và các thao tác nhạy cảm bị giới
hạn tần suất trên các bản triển khai công khai.

## Lệnh

```powershell
deno task dev
deno task start
deno task check
deno task clear-seen
```

`clear-seen` xóa các dấu mốc bài đăng đã xử lý để có thể xác minh lại cùng những bài đăng đó; hãy dùng cẩn thận
trong môi trường production.

## Triển khai

Xem [deployment](./deployment.md) để thiết lập Deno Deploy. Điểm vào của ứng dụng được định nghĩa bởi phần
`deploy` trong `deno.json`; GitHub Actions chỉ chạy kiểm tra và không triển khai ứng dụng. Điểm vào triển khai
trong `src/deploy.ts` khai báo Deno Deploy Cron, và quá trình thăm dò thực tế chỉ chạy trên Production và
timeline của Git Branch `dev`. Xem [worker](./worker.md) để thiết lập Worker chuyển tiếp thông báo.

## Giấy phép

Dự án này được cấp phép theo [GNU Affero General Public License v3.0](../../LICENSE).