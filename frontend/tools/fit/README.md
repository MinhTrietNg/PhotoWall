# Kiểm tra "không màn nào phải cuộn"

Thiết kế nói luồng khách không được cuộn trên điện thoại. Lời hứa đó vỡ chỉ
bằng một dòng chữ mới, và không thể xác nhận bằng cách đọc CSS. Thư mục này đo
nó.

```bash
cd frontend
npm run check:fit
```

Lệnh tự dựng dev server (backend mock, cổng 5199), mở Chrome với camera giả,
đi trọn luồng khách ở 7 viewport, rồi đối chiếu số đo với `budget.json`.
Vượt ngân sách thì exit code khác 0.

## Ba lớp bảo đảm

**1. Quy tắc tĩnh** — chạy trước, không cần trình duyệt, chưa tới một giây:

- `.screen` phải có `height` xác định và **không** được dùng `min-height`. Đây
  là nguyên nhân gốc của toàn bộ chuyện cuộn: khối `min-height` luôn nở vừa nội
  dung nên không bao giờ có khoảng trống âm, `flex-shrink` không bao giờ kích
  hoạt, và mỗi pixel dư đều kéo dài trang thay vì bị chia lại.
- Mọi trang khách phải dựng màn bằng `<Screen>`. Component đó giữ khung nền,
  safe area và màu chrome iOS ở một chỗ; trang tự dựng root là mất cả ba.
- Mọi route trong `src/apps/mobile/App.tsx` phải có bước tương ứng trong
  `flow.mjs`. Thêm màn mà quên thêm bước thì check đỏ chứ không lặng lẽ bỏ qua.

**2. Phép đo** — với mỗi màn × mỗi viewport, lấy số lớn hơn giữa "document dài
hơn viewport" và "màn tự cuộn bên trong". Cả hai đều làm ngón tay khách phải
vuốt nên cả hai đều tính.

**3. Không nội dung nào bị cắt** — chiều cao xác định cho phép flex co lại, mà
co quá tay thì chữ bị giấu. Bất kỳ khối `overflow: hidden|clip` nào không chứa
nổi nội dung của chính nó đều làm check đỏ, dù màn có vừa khít hay không.

## Vì sao là bảy viewport đó

Chiều cao ghi trong `flow.mjs` là phần trình duyệt **để lại cho trang**, không
phải chiều cao thiết bị mà artboard vẽ theo. iPhone 14 là máy 844pt nhưng
Safari chỉ đưa cho document khoảng 745 khi còn đủ hai thanh. Đo 844 sẽ cho
"đạt" một màn mà trong tay vẫn cuộn.

`360x500` thấp hơn mọi điện thoại thật. Giữ nó làm sàn: ở đó màn **được phép**
cuộn bên trong chính nó, và điều cần kiểm là nó xuống cấp theo kiểu đó chứ
không cắt mất nội dung hay đẩy nút bấm ra khỏi tầm.

## Khi check đỏ

Sửa bố cục, đừng nới ngân sách. Vài hướng đã dùng trong code này:

- Cho phần không mang thông tin nhường chỗ trước (dải màu ở S08, cụm trang trí
  ở S01), thay vì cắt chữ.
- Để phần tử theo tỉ lệ nhận chiều cao còn lại rồi suy ra bề rộng
  (`container-type: size` + đơn vị `cqh`), thay vì tự trừ chiều cao chrome bằng
  hằng số — hằng số đó sẽ sai ngay lần thêm nội dung sau.
- Dùng `clamp()` theo viewport thay cho media query bậc thang, vì bậc thang hay
  tạo nghịch lý "vừa ở 693 nhưng tràn ở 745".
- Ở bậc rất thấp, để chrome dùng chung nhường trước khi từng màn phải giấu nội
  dung riêng.

Nếu thật sự phải chấp nhận một chỗ tràn:

```bash
npm run check:fit -- --update
```

Lệnh ghi lại `budget.json` với số đo hiện tại và để trống ô `why`. Check vẫn đỏ
cho tới khi có người viết lý do vào đó — cố ý như vậy. Lý do cũng bị xoá mỗi
khi con số thay đổi, nên không ai thừa kế được lời giải thích cũ cho một mức
tràn mới.

## Yêu cầu

`playwright-core` (đã nằm trong devDependencies) và một bản Chrome hoặc Edge
cài sẵn trên máy. Script tự dò các đường dẫn thông dụng; nếu không thấy thì đặt
biến môi trường `PW_CHROME` trỏ tới file thực thi. Không tải thêm trình duyệt
nào về.

Đo một server đang chạy sẵn (ví dụ bản build preview):

```bash
npm run check:fit -- --base=http://localhost:4173
```
