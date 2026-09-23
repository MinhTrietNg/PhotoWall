# Kiểm tra "không màn nào phải cuộn"

Thiết kế nói luồng khách không được cuộn trên điện thoại. Lời hứa đó vỡ chỉ
bằng một dòng chữ mới, và không thể xác nhận bằng cách đọc CSS. Thư mục này đo
nó.

```bash
cd frontend
npm run check:fit
```

Lệnh tự dựng dev server (backend mock, cổng 5199), mở Chrome với camera giả,
đi trọn luồng khách ở 11 viewport, rồi đối chiếu số đo với `budget.json`.
Vượt ngân sách thì exit code khác 0.

## Bốn lớp bảo đảm

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

**4. Không tràn ngang, vùng chạm đủ lớn** — ba luật không có ngân sách, vì
thiết kế không bao giờ muốn chúng:

- Không phần tử nào lòi ra ngoài mép trái hoặc phải của viewport.
- Mọi thứ bấm được có vùng chạm 48px theo cả hai chiều (bảng "05 Motion ·
  Responsive"). Vùng chạm đo bằng điểm chạm thật — `elementFromPoint` cách tâm
  nửa ô 48px về mỗi phía — nên một pill vẽ 32px nhưng có lớp `tap-target` 48px
  vẫn đạt. Input ẩn bên trong toggle hay checkbox được đo bằng `<label>` nhận
  cú chạm của nó; thứ đang bị che (ví dụ dưới một hộp thoại) thì bỏ qua.
- Hai thứ bấm được cách nhau ít nhất 8px, đo theo nét vẽ — khoảng mắt nhìn
  thấy khi nhắm ngón tay.

## Vì sao là mười một viewport đó

Chiều cao ghi trong `flow.mjs` là phần trình duyệt **để lại cho trang**, không
phải chiều cao thiết bị mà artboard vẽ theo. iPhone 14 là máy 844pt nhưng
Safari chỉ đưa cho document khoảng 745 khi còn đủ hai thanh. Đo 844 sẽ cho
"đạt" một màn mà trong tay vẫn cuộn.

`360x500` thấp hơn mọi điện thoại thật. Giữ nó làm sàn: ở đó màn **được phép**
cuộn bên trong chính nó, và điều cần kiểm là nó xuống cấp theo kiểu đó chứ
không cắt mất nội dung hay đẩy nút bấm ra khỏi tầm.

Bảy viewport đầu đi dọc dải chiều cao. Bốn cái sau đo theo bề ngang: một hàng
cố định kích thước — khay 4 ô, hai nút CTA cạnh nhau — vỡ theo chiều rộng chứ
không theo chiều cao, mà dải đầu chỉ có 360/375/390/430. `320x454` (SE đời đầu)
nằm dưới dải 360–430 thiết kế cam kết; nó có mặt để bắt lỗi ngang, và phần dư
theo chiều cao ở đó có ngân sách như sàn.

Viewport cố định vẫn bỏ sót được khe giữa hai bậc media query. Khi đổi một bậc,
quét cả dải theo từng vài pixel: bậc nén thứ hai từng nằm ở 620 trong khi S02
cần khoảng 637, nên màn cuộn ở cả dải 621–639. Danh sách chỉ bắt được nhờ có
đúng 628 trong đó; lệch vài pixel là lọt.

## Khi check đỏ

Sửa bố cục, đừng nới ngân sách. Vài hướng đã dùng trong code này:

- Cho phần không mang thông tin nhường chỗ trước (dải màu ở S07, cụm trang trí
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
