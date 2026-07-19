# 📱 CDC Nhiệm vụ — Bản di động (PWA)

App điện thoại (Progressive Web App) kết nối với hệ thống **Quản lý Nhiệm vụ & Báo cáo BCtuan** (Google Apps Script + Google Sheet). Cài lên màn hình chính điện thoại như app thật, không cần qua App Store / CH Play.

Cách hoạt động:

```
[PWA trên điện thoại]  --fetch JSON-->  [BCtuan Web App (/exec)]  -->  Google Sheet
   (thư mục này,                          (Code.gs -> doGet ?action=...
    host tĩnh bất kỳ)                              -> doPost {action, payload})
```

- Backend **dùng chung 100%** với bản desktop — cùng Sheet, cùng nghiệp vụ (TaskService/ReportService), chỉ thêm 1 lớp API JSON mỏng trong `Code.gs`.
- Bản desktop (mở URL `/exec` trực tiếp) **không thay đổi gì**.

## Tính năng bản v1

- **Tổng quan**: 6 thẻ thống kê (tổng số / hoàn thành / đang thực hiện / chậm tiến độ / sắp đến hạn / quá hạn) + danh sách sắp đến hạn.
- **Nhiệm vụ**: danh sách theo đơn vị của mình (Phòng KHNV / Ban Giám đốc / Quản trị viên thấy tất cả — cùng quy tắc bản desktop), tìm kiếm, lọc theo trạng thái, xem chi tiết (lịch sử cập nhật + văn bản kết quả), **cập nhật tiến độ** ngay trên điện thoại (kèm chụp ảnh đính kèm, đánh dấu hoàn thành + khai văn bản kết quả).
- **Báo cáo**: xem báo cáo tổng hợp theo Tuần / Tháng / Quý / Năm.
- Nhận diện offline: mất mạng hiện banner "📡 Không có mạng — Thử lại", giao diện vẫn mở được nhờ service worker cache.

Chưa có ở v1 (vẫn dùng bản desktop): tạo nhiệm vụ mới / giao ban hàng loạt, module Chỉ tiêu kế hoạch, trang Quản trị danh mục.

## Triển khai (làm 1 lần)

### Bước 1 — Đẩy code backend mới lên Apps Script

`Code.gs` đã được bổ sung API JSON (không đổi nghiệp vụ). Trong thư mục gốc `BCtuan`:

```bash
clasp push -f
```

### Bước 2 — Tạo deployment Web App mới

1. Mở <https://script.google.com> → project BCtuan → **Triển khai** (Deploy) → **Quản lý các lượt triển khai** (Manage deployments).
2. Sửa deployment hiện có → **Phiên bản mới** (New version) → Triển khai. (Giữ nguyên *Thực thi bằng: Tôi*, *Ai có quyền truy cập: Bất kỳ ai*.)
3. Sao chép **URL Ứng dụng web** — dạng `https://script.google.com/macros/s/XXXX/exec`.

> ⚠️ Nếu tạo deployment **mới hoàn toàn** thay vì phiên bản mới của deployment cũ, URL `/exec` sẽ đổi — link desktop đang gửi cho mọi người sẽ khác link cũ. Nên dùng "New version" trên deployment sẵn có.

### Bước 3 — Điền URL vào `config.js`

Mở `mobile/config.js`, dán URL vừa sao chép:

```js
window.CDC_MOBILE_CONFIG = {
  API_BASE_URL: 'https://script.google.com/macros/s/XXXX/exec'
};
```

### Bước 4 — Host thư mục `mobile/` lên 1 địa chỉ https tĩnh

Cách dễ nhất — **GitHub Pages** (giống mô hình `monsterph6.github.io`):

1. Tạo repo GitHub mới (vd `cdc-nhiemvu-mobile`), đẩy toàn bộ **nội dung thư mục `mobile/`** lên nhánh `main` (các file `index.html`, `app.js`... nằm ở gốc repo).
2. Repo → **Settings → Pages** → Source: `Deploy from a branch`, Branch: `main` / `(root)` → Save.
3. Chờ ~1 phút, app có tại `https://<tên-tài-khoản>.github.io/cdc-nhiemvu-mobile/`.

(Thay thế: Cloudflare Pages, Netlify... đều được — chỉ cần https tĩnh.)

### Bước 5 — Cài lên điện thoại

Mở link ở Bước 4 bằng Chrome (Android) hoặc Safari (iPhone):

- **Android/Chrome**: menu ⋮ → **Thêm vào Màn hình chính** (hoặc banner "Cài đặt ứng dụng" tự hiện).
- **iPhone/Safari**: nút Chia sẻ □↑ → **Thêm vào MH chính**.

Lần đầu mở, app hỏi Khoa/phòng + Họ tên + SĐT (giống bản desktop — chỉ để tự điền "Người cập nhật", lưu trên máy, không phải đăng nhập).

## Thử nhanh trên máy tính (trước khi host)

Service worker cần chạy qua http(s), không mở `file://` trực tiếp:

```bash
cd BCtuan/mobile
python -m http.server 8080
# mở http://localhost:8080
```

## Khi sửa giao diện mobile

Mỗi lần sửa `index.html` / `app.js` / `styles.css`, tăng `CACHE_VERSION` trong `sw.js` (vd `cdc-nhiemvu-v2`) rồi đẩy lại lên hosting — để điện thoại người dùng nhận bản mới thay vì dùng cache cũ.

## Ghi chú kỹ thuật

- Client gửi POST với `Content-Type: text/plain;charset=utf-8` (không phải `application/json`) — chủ đích, để tránh CORS preflight `OPTIONS` mà Apps Script Web App không trả lời được. Đừng "sửa" lại thành `application/json`.
- API luôn trả HTTP 200; thành công/thất bại phân biệt bằng field `ok` trong JSON (`{ok:true, data}` / `{ok:false, error}`) — Apps Script không set được HTTP status tuỳ ý.
- Quyền xem/sửa theo khoa/phòng là **quy ước tự khai báo** (như bản desktop), không phải bảo mật thật — ai có link API đều gọi được. Chấp nhận ở mức nội bộ như hiện tại; muốn bảo mật thật thì phải chuyển sang hệ có đăng nhập (NhiemVuCDC).
