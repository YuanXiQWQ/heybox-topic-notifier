# Trình thông báo chủ đề Heybox

[![License: AGPL-3.0](https://img.shields.io/badge/License-AGPL--3.0-blue.svg)](https://opensource.org/licenses/AGPL-3.0)

| [简体中文](../../README.md) | **Tiếng Việt** |
| :-------------------------: | :------------: |

[Web](https://heybox.yuanxiqwq.top/) · [Windows x64](https://github.com/YuanXiQWQ/heybox-topic-notifier/releases/latest/download/heybox-topic-notifier-windows-x64-setup.exe) · [Android APK](https://github.com/YuanXiQWQ/heybox-topic-notifier/releases/latest/download/heybox-topic-notifier-android-universal.apk)

Thêm chủ đề Heybox trong phần cài đặt, chọn từ khóa, biểu thức chính quy hoặc bộ lọc AI rồi bật kiểm tra định kỳ. Bạn có thể chuyển bài viết phù hợp vào lịch sử và đưa trở lại không gian làm việc.

Tài khoản mới cần mã mời. Thông báo ứng dụng được bật riêng trên từng thiết bị và có thể dùng cùng email hoặc webhook. Các thay đổi ngoại tuyến sẽ đồng bộ khi có mạng trở lại. Ngôn ngữ và chế độ tối mặc định theo thiết bị.

## Tính năng

- Bảng điều khiển: xem trạng thái thăm dò, tổng số kết quả khớp, kết quả khớp mới nhất và các kết quả
  đang chờ xử lý, kèm thao tác kiểm tra thủ công
- Trang thiết lập: cấu hình ID chủ đề, trạng thái bật, ghi chú, đơn vị khoảng thời gian thăm dò, giới hạn
  số bài đăng, chế độ sắp xếp, ngôn ngữ giao diện, chế độ tối và màu chủ đề
- Thiết lập tài khoản: đăng ký, đăng nhập, đăng xuất, cập nhật tên người dùng và cập nhật mật khẩu;
  dữ liệu tài khoản được tách biệt theo ID người dùng
- Quy tắc từ khóa: hỗ trợ quy tắc dùng chung, quy tắc riêng cho từng chủ đề, vị trí khớp, phân biệt chữ hoa
  chữ thường và biểu thức chính quy
- Cài đặt → Cài đặt thông báo → Thử thông báo
- Kênh thông báo: Webhook tùy chỉnh, ServerChan, PushPlus, WxPusher, email API và SMTP
- Chuyển tiếp thông báo: relay Cloudflare Worker tùy chọn cho PushPlus, WxPusher và ServerChan

## Phát triển cục bộ

```sh
deno task dev
```

[localhost:8000](http://localhost:8000) · [`.env.example`](../../.env.example) · `deno task check`

## Triển khai

Dịch vụ Deno chạy trên Oracle Cloud và dùng Caddy cho HTTPS. Tài khoản, phiên đăng nhập và kết quả được lưu trong Turso. GitHub Actions tạo bộ cài Windows và Android từ thẻ phát hành.

[Tự triển khai](./deployment.md) · [Cloudflare Worker](./worker.md)

## Giấy phép

Dự án này được cấp phép theo [GNU Affero General Public License v3.0](../../LICENSE).
