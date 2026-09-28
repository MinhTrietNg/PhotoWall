<p align="center">
  <img src=".github/readme/hero.png" alt="Photo Wall · Đoàn hội Khoa CNTT × GDGoC SGU × AWS Student Builder Groups · SGU's Day 27.09.2026" width="100%">
</p>

<p align="center">
  <b>Photobooth chạy trên trình duyệt cho gian hàng SGU's Day 2026.</b><br>
  Khách quét QR, chụp 4 tấm bằng chính điện thoại của mình, ghép vào khung của ban tổ chức,<br>
  và vài giây sau dải ảnh đã trôi trên màn hình lớn tại gian hàng.
</p>

<p align="center">
  <img alt="React 19" src="https://img.shields.io/badge/React-19-1C1B33?style=for-the-badge&logo=react&logoColor=61DAFB">
  <img alt="Vite 7" src="https://img.shields.io/badge/Vite-7-1C1B33?style=for-the-badge&logo=vite&logoColor=FBBC04">
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-strict-1C1B33?style=for-the-badge&logo=typescript&logoColor=4285F4">
  <img alt="Firebase" src="https://img.shields.io/badge/Firebase-serverless-1C1B33?style=for-the-badge&logo=firebase&logoColor=FFCA28">
  <img alt="Cloud Vision" src="https://img.shields.io/badge/Cloud_Vision-SafeSearch-1C1B33?style=for-the-badge&logo=googlecloud&logoColor=34A853">
</p>

---

## 📊 Ngày 27/09 — những con số

Photo Wall chạy trọn ngày hội **SGU's Day 2026** tại không gian Khoa CNTT, Đại học Sài Gòn. Toàn bộ hệ thống không có máy chủ nào do nhóm tự vận hành. Tải của cả ngày nằm gọn trong Firebase:

<table>
  <tr>
    <td align="center" width="20%"><h2>948 MB</h2><sub>Hosting tải xuống<br>(7 ngày, dồn vào ngày hội)</sub></td>
    <td align="center" width="20%"><h2>27K</h2><sub>Lượt đọc Firestore<br>(màn lớn + console)</sub></td>
    <td align="center" width="20%"><h2>3.8K</h2><sub>Lượt ghi Firestore<br>(gửi ảnh, duyệt, gỡ)</sub></td>
    <td align="center" width="20%"><h2>1.6K</h2><sub>Lượt gọi Cloud Functions<br>(trigger autoApprove)</sub></td>
    <td align="center" width="20%"><h2>13.2 MB</h2><sub>Cloud Storage<br>(dải ảnh + thumbnail)</sub></td>
  </tr>
</table>

<p align="center">
  <img src=".github/readme/traffic-sgu-days.png" alt="Firebase console: Hosting 948MB, Functions 1.6K invocations, Firestore 27K reads và 3.8K writes, Storage 13.2MB" width="100%">
  <br><sub>Bảng Build trong Firebase console, chụp sau ngày hội. Các đường đều nằm sát 0 suốt tuần, rồi vọt lên đúng ngày sự kiện.</sub>
</p>

> [!NOTE]
> Toàn bộ sản phẩm, từ thiết kế đến bản chạy thật, được làm trong **5 ngày (22 → 26/09)** với **113 commit**, và lên sóng ngày 27/09.

---

## 📸 Hành trình của khách

Mục tiêu thiết kế: **từ lúc quét QR đến lúc lên Wall, trung vị ≤ 45 giây.** Mỗi màn chỉ trả lời một câu hỏi: *tiếp theo mình làm gì?*

<p align="center">
  <img src=".github/readme/mobile-flow.png" alt="Luồng khách: S01 Welcome, S02 Nhập tên, S03 Chụp tấm n/4, S04 Kiểm tra tấm, lặp 4 lần, S05 Chọn khung và xem lại, S06 Đang gửi, S07 Đã lên Wall" width="100%">
  <br><sub>Chụp từ chính app đang chạy (backend mock, camera giả), đi đúng thứ tự route trong <a href="frontend/src/apps/mobile/App.tsx">App.tsx</a>.</sub>
</p>

| Bước | Route | Khách làm gì | Chi tiết đáng chú ý |
|:---:|---|---|---|
| **S01** | `/` | Quét QR, bấm *Bắt đầu chụp ảnh* | Không cài app, không đăng nhập. |
| **S02** | `/name` | Nhập tên (1–24 ký tự), đồng ý hiển thị | Tắt *"Hiện tên trên màn hình lớn"* thì Wall ghi "Tân sinh viên". |
| **S03** | `/camera/:n` | Chụp tấm *n* / 4 | Hẹn giờ 3s bật sẵn. Đổi camera mờ dần, tự lật hình theo camera trước/sau. Chọn từ thư viện nếu BTC cho phép. |
| **S04** | `/camera/:n/review` | Giữ tấm vừa chụp hoặc chụp lại | S03 ↔ S04 lặp đủ 4 tấm. |
| **S05** | `/finish` | Chọn khung và xem lại cả dải, trên cùng một màn | Bấm thẻ để đổi khung ngay trên bản xem trước; chạm một ô để chụp lại riêng ô đó. |
| **S06** | `/upload` | Chờ gửi | Ẩn *Huỷ* và *Quay lại* khi đang tải lên; quá 45 giây thì báo lỗi thay vì treo. |
| **S07b → S07** | `/done` | Chờ duyệt, rồi *"Bạn đã lên Wall!"* | Cùng một màn tự chuyển khi BTC bấm *Duyệt*. Nhận số *Khoảnh khắc #N*, tải dải ảnh về, chia sẻ, hoặc tự gỡ. |

Điện thoại cố ý **không có** màn xem Wall và màn "dải ảnh của tôi": Wall chỉ chiếu trên màn hình lớn, còn mọi thao tác với dải ảnh đã gửi nằm ngay ở `/done`.

<p align="center">
  <img src=".github/readme/mobile-states.png" alt="Trạng thái phụ: S03 đếm ngược 3 giây, S07b chờ duyệt, E01 chưa cho phép camera, E02 mất mạng gửi lại, E03 đã đóng nhận ảnh" width="100%">
</p>

- **E01 · Chưa cho phép camera:** hướng dẫn mở lại quyền camera, hoặc dùng *Thư viện* nếu BTC cho phép.
- **E02 · Gửi chưa thành công:** 4 tấm vẫn còn; *Gửi lại* dùng đúng dải ảnh đang gửi dở.
- **E03 · Đã đóng nhận ảnh:** khi BTC tạm dừng hoặc tới giờ tự đóng, khách đang chụp dở được chuyển sang `/closed` ngay lúc đó.

Những thứ khách không thấy nhưng giữ cho luồng không vỡ:

- **Không màn nào phải cuộn.** `npm run check:fit` mở Chrome với camera giả, đi trọn luồng ở **11 viewport** và đo từng màn, vượt ngân sách là đỏ.
- **Ảnh không mất khi rời trang.** Các tấm đã chụp nằm trong IndexedDB; quay lại trong 30 phút sẽ được hỏi *"Tiếp tục bộ đang chụp?"*.
- **Mạng rớt giữa chừng không tốn lượt.** Chỗ của ảnh đã được giữ; nút *Gửi lại* chỉ tải tiếp file.
- **Xem trước đúng là ảnh sẽ tải về.** Bản xem trước trên DOM và canvas xuất JPEG đọc cùng toạ độ ô từ `frames.json`.
- **Đăng nhập ẩn danh chỉ khi bấm Gửi.** Wifi trường cho hàng trăm máy dùng chung một IP, nên người mở trang rồi bỏ đi không được tốn một tài khoản.

---

## 🖥️ Màn hình lớn

Màn 1920 × 1080 đặt tại gian hàng. Không polling: ảnh được duyệt xuất hiện trong khoảng một giây.

<p align="center">
  <img src=".github/readme/d02-big-screen-arrival.png" alt="D02 Màn hình lớn: thẻ Vừa lên Wall trượt từ dưới lên, bộ đếm 329 khoảnh khắc, mã QR" width="100%">
  <br><sub><b>D02</b> · Một dải vừa được duyệt: thẻ <i>"Vừa lên Wall!"</i> trượt lên, bộ đếm nhảy +1.</sub>
</p>

<details>
<summary><b>D01 · Trạng thái thường</b> (bấm để xem)</summary>
<br>
<p align="center"><img src=".github/readme/d01-big-screen.png" alt="D01 Màn hình lớn: dải ảnh trượt liên tục" width="100%"></p>
</details>

- **Băng chuyền, không phải marquee.** Kiểu `translateX(-50%)` quen thuộc sẽ giật cả hàng mỗi khi thêm hoặc gỡ một dải. [conveyor.ts](frontend/src/features/display/conveyor.ts) đặt các dải vào từng ô trên một băng chạy đều; dải mới chen vào bằng một cú dịch mềm.
- **Hàng đợi thẻ có giới hạn.** Mỗi thẻ giữ màn 6,3 giây. Tối đa 3 thẻ chờ; nhiều hơn thì gộp thành một thẻ *"+N dải ảnh mới"*, nên duyệt dồn 10 ảnh không kéo dài thành một phút.
- **Chỉ BTC mở được.** `/display` đứng sau cùng lớp đăng nhập Google với console. Chỉ tài khoản có trong danh sách kiểm duyệt mới thấy Wall; khách lỡ quét nhầm URL chỉ thấy màn đăng nhập. Phiên đăng nhập vẫn giữ qua các lần kiosk tự tải lại.
- **Tự chăm sóc.** Listener Firestore tự nối lại khi luồng bị lỗi. Kiosk tự tải lại mỗi 6 giờ, và chỉ khi có mạng. Admin bấm *"Làm mới màn lớn"* là mọi màn đang mở cùng tải lại.

---

## 🛡️ Console kiểm duyệt

Chạy ở `/admin`, đăng nhập Google, chỉ email có trong danh sách mới vào được.

<p align="center">
  <img src=".github/readme/m01-moderation.png" alt="M01 Console kiểm duyệt: danh sách chờ duyệt, nút Duyệt và Gỡ, chọn nhiều" width="100%">
</p>

| Vai trò | Ai | Được làm |
|---|---|---|
| `moderator` | Đoàn hội Khoa CNTT · AWS Student Builder Groups | Duyệt, gỡ, khôi phục ảnh; xem mọi tab |
| `admin` | GDGoC | Tất cả quyền trên, cộng: mở/đóng nhận ảnh, giờ tự đóng, bật/tắt khung, thêm/gỡ người duyệt, xuất dữ liệu, lên lịch xoá |

- **Phím tắt `A` / `R` / `↑↓`** để duyệt nhanh, cùng chọn nhiều để duyệt hoặc gỡ hàng loạt. Mục tiêu dưới 3 phút cho mỗi ảnh; quá 3 phút thì thời gian chờ chuyển đỏ.
- **Tự động duyệt bằng Cloud Vision SafeSearch.** Hàm `autoApprove` chấm `adult · violence · racy`; dải nào chạm ngưỡng thì ở lại *Chờ duyệt* kèm điểm cho người duyệt xem.
- **Gỡ là mất khỏi màn lớn ngay**, nhưng file giữ 24 giờ để còn khôi phục.
- **Sau sự kiện:** tải toàn bộ dải ảnh thành `.zip`, xuất CSV, và dựng **video timelapse ngay trong trình duyệt** bằng `MediaRecorder` (hoặc `npm run timelapse` với FFmpeg).

---

## 🖼️ Bộ khung photobooth

Một component, một template. Mọi khung đều là canvas **1080 × 3400** với 4 ô ảnh.

<p align="center">
  <img src=".github/readme/frames-overview.png" alt="Bốn khung: F01 GDGoC Build Together, F02 AWS Build on AWS, F03 ISF Khoa CNTT, F04 Collab ISF x GDGoC x AWS" width="100%">
</p>

Thêm khung mới chỉ cần **1 file overlay** trong [frontend/public/frames/](frontend/public/frames/) và **1 dòng** trong [frames.json](frontend/public/frames/frames.json):

```jsonc
{
  "id": "f01-gdgoc",                  // khớp /^f[0-9]{2}-[a-z0-9-]{1,30}$/ trong rules
  "label": "Khung 01",
  "title": "GDGoC · Build Together",
  "overlay": "frame-f01-gdgoc.webp",  // PNG/WebP alpha 1080×3400, vẽ đè lên cùng
  "slots": [[171, 338, 735, 549], /* … 4 ô [x, y, w, h] */],
  "r": 36                             // bo góc ô ảnh
}
```

Ảnh xuất ra là JPEG chất lượng 0.82 (dự phòng 0.75), mục tiêu ≤ 600 KB, trần cứng 2 MB. Kèm một thumbnail 480px cho màn lớn và console, khoảng 60–90 KB thay vì ~600 KB.

