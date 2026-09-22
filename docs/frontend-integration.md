# Hướng dẫn nối frontend với backend PhotoWall

Backend **không có server**. Mọi quy tắc (ai được gửi, ai được duyệt, gửi bao lâu một lần) nằm trong security rules của Firebase. Frontend gọi Firebase **qua các hàm trong `backend/src/client.ts`**. Rules chỉ chấp nhận đúng thứ tự ghi mà các hàm này thực hiện, nên đừng tự gọi `setDoc` hay `uploadBytes` vào `photos/`.

## 1. Import

Frontend import thẳng từ thư mục `backend/src`. Các ví dụ dưới đây viết `../backend/src/...`. Nếu file của bạn nằm sâu hơn (ví dụ trong `frontend/src/`), hãy chỉnh lại số `../` cho đúng, hoặc đặt alias trong Vite. Với Vite:

```ts
// vite.config.ts
import { defineConfig } from 'vite';

export default defineConfig({
  server: { port: 5173 }, // CORS của bucket chỉ mở cho cổng này khi dev
  resolve: {
    // Bắt buộc: không có dòng này sẽ có hai bản Firebase SDK (của frontend và của backend/),
    // và Firestore báo "Type does not match the expected instance".
    dedupe: ['firebase', '@firebase/app', '@firebase/auth', '@firebase/firestore', '@firebase/storage', '@firebase/app-check'],
  },
});
```

Frontend cần cài cùng major version Firebase với backend (hiện là `firebase@^12`):

```
npm install firebase@^12
```

## 2. Khởi tạo, **một lần** cho cả app

```ts
import { initBackend } from '../backend/src/init';

export const backend = initBackend({ emulators: import.meta.env.DEV && import.meta.env.VITE_EMULATORS === '1' });
```

- `initBackend()` khởi tạo App Check **trước** mọi thứ khác. Từ ngày 26.09, App Check bị bắt buộc; request không có token sẽ bị chặn.
- Mọi hàm trong `client.ts` nhận `backend` làm tham số đầu tiên.

### Chạy ở máy dev

| Cách | Khi nào | Làm gì |
|---|---|---|
| **Emulator** (khuyến nghị) | Làm giao diện, thử thoải mái, không đụng dữ liệu thật | Trong `backend/`: `npm run emulators`, rồi ở terminal khác chạy `npm run seed -- <gmail-của-bạn>`. Frontend chạy với `VITE_EMULATORS=1`. Đăng nhập Google trong emulator hiện popup giả, nhập email nào cũng được, nhưng email đó phải có trong lệnh seed thì mới là người duyệt. |
| **Project thật** từ `localhost` | Thử trước ngày hội | App Check chặn localhost. Trước khi gọi `initBackend()`, thêm `self.FIREBASE_APPCHECK_DEBUG_TOKEN = true;`, mở console trình duyệt, copy debug token in ra và gửi cho Khả để thêm vào *App Check → Manage debug tokens*. |

## 3. Màn điện thoại: chụp và gửi ảnh

### Chỉ đăng nhập khi bấm Gửi

**Không** gọi `ensureGuest()` lúc mở trang, chỉ gọi khi người dùng bấm Gửi. Người mở trang rồi bỏ đi sẽ không tốn một tài khoản. Firebase giới hạn số tài khoản mới theo IP, và wifi trường cho rất nhiều máy dùng chung một IP.

### Ảnh cần chuẩn bị

Từ canvas đã ghép 4 tấm và khung, xuất **một** file JPEG, chiều ngang khoảng 1080px, chất lượng `0.82`. Rules chỉ nhận file **dưới 2 MB**.

```ts
const image = await new Promise<Blob>((ok) => stripCanvas.toBlob((b) => ok(b!), 'image/jpeg', 0.82));
```

### Gửi ảnh

```ts
import { ensureGuest, submitPhoto, resumeSubmission, SubmitError } from '../backend/src/client';

await ensureGuest(backend);
try {
  const photoId = await submitPhoto(backend, { image, displayName, frameVariant: 'light' });
  // xong: ảnh đang chờ duyệt
} catch (e) {
  if (e instanceof SubmitError) { /* xem bảng dưới */ }
}
```

| `e.code` | Nghĩa | Nên hiển thị |
|---|---|---|
| `invalid-input` | Tên rỗng hoặc dài hơn 40 ký tự, ảnh không phải JPEG, hoặc ảnh quá lớn | Lỗi ở phía frontend, kiểm tra lại bước xuất ảnh |
| `uploads-closed` | Ban tổ chức đang tạm dừng nhận ảnh, hoặc đã qua giờ `closesAt` | "Hiện chưa nhận ảnh, bạn quay lại sau nhé" |
| `rate-limited` | Chưa đủ 60 giây kể từ lần gửi trước. `e.retryAfterSeconds` là số giây còn phải chờ | "Chờ {n} giây nữa để gửi tiếp" |
| `quota-exceeded` | Đã gửi đủ `maxSubmitsPerUser` dải ảnh (mặc định 3) | "Bạn đã gửi đủ số ảnh" |
| `upload-failed` | Mạng rớt giữa chừng. Ảnh đã được giữ chỗ, **đừng gọi lại `submitPhoto`**, vì lần gửi mới sẽ bị giới hạn 60 giây | Nút "Thử lại" gọi `resumeSubmission(backend, e.photoId!, image)` |
| `unknown` | Lỗi khác | "Có lỗi, thử lại sau" |

Tên người dùng (`displayName`) được `trim()`, phải dài **1–40 ký tự**.

### Trạng thái ảnh của mình, tải về, tự gỡ

```ts
const stop = watchMyPhotos(backend, (photos) => { /* photos[i].status */ });
```

`status`: `uploading` → `pending` (chờ duyệt) → `approved` hoặc `rejected`. Nếu ban tổ chức gỡ ảnh sau khi duyệt thì thành `removed`. Khi đã duyệt, `photo.momentNo` là số "Khoảnh khắc #N" của ảnh.

**Tự gỡ ảnh (S09):** `removeMyPhoto(backend, id)` khi ảnh đang `pending` hoặc `approved`. Ảnh biến khỏi big screen và bị **xoá hẳn**, không khôi phục được; sau đó `photo.reviewedBy === 'owner'`.

**Tải ảnh về máy:** ngay sau khi gửi, dùng luôn blob `image` đang có trong bộ nhớ (`URL.createObjectURL(image)` kèm `<a download>`), không cần tải lại từ server. Muốn tải lại sau khi đã tải lại trang thì dùng `photoUrl(backend, id)`.

## 4. Big screen (16:9)

```ts
import { watchApproved, watchStats, photoUrl } from '../backend/src/client';

watchApproved(backend, ({ photos, added, removedIds }) => {
  // lần đầu: `photos` là 200 ảnh mới nhất, `added` rỗng
  // sau đó: `added` là ảnh vừa được duyệt, hiện nổi vài giây rồi đưa vào slideshow
  //         `removedIds` là ảnh bị gỡ, bỏ khỏi slideshow ngay
});
watchStats(backend, ({ approvedCount }) => { /* bộ đếm */ });
```

- Big screen **không cần đăng nhập** và **không cần polling**. Listener tự nhận ảnh mới trong khoảng một giây.
- Big screen dùng ảnh đầy đủ: `photoUrl(backend, id)`.

## 5. Màn người duyệt (`/admin`)

### Đăng nhập và vai trò

```ts
import { GoogleAuthProvider, signInWithPopup } from 'firebase/auth';
import { getMyRole } from '../backend/src/client';

await signInWithPopup(backend.auth, new GoogleAuthProvider());
const role = await getMyRole(backend);   // 'admin' | 'moderator' | null
if (!role) { /* M00: "… chưa có quyền kiểm duyệt" */ }
```

| Vai trò | Được làm |
|---|---|
| `moderator` | Duyệt, gỡ, khôi phục ảnh |
| `admin` | Như `moderator`, **cộng thêm**: đổi mọi cài đặt (M02, kể cả công tắc "Đang nhận ảnh") và thêm/xoá người duyệt |

### Ba tab kiểm duyệt (M01)

```ts
import { watchPending, watchByStatus, approve, reject, remove, restore, purgeExpired, AlreadyReviewedError } from '../backend/src/client';

watchPending(backend, cb);                               // "Chờ duyệt", cũ nhất trước
watchByStatus(backend, ['approved'], cb);                // "Đã duyệt"
watchByStatus(backend, ['rejected', 'removed'], cb);     // "Đã gỡ"

await approve(backend, id);                  // Duyệt — gán "Khoảnh khắc #N" (photo.momentNo)
await reject(backend, id, 'inappropriate');  // Gỡ ở tab Chờ duyệt
await remove(backend, id, 'duplicate');      // Gỡ ở tab Đã duyệt — biến khỏi big screen ngay
await restore(backend, id);                  // Khôi phục ở tab Đã gỡ

purgeExpired(backend);  // gọi một lần khi mở trang admin: xoá hẳn ảnh đã gỡ quá hạn giữ
```

- **Lý do gỡ** (hộp thoại gỡ ảnh): `'inappropriate'` = Không phù hợp, `'duplicate'` = Trùng / lỗi ảnh, `'guest-request'` = Người gửi yêu cầu. Lý do được lưu ở `photo.reviewReason`, khách không thấy.
- **Khôi phục** chỉ được trong `removedRetentionHours` giờ kể từ lúc gỡ (mặc định 24). Quá hạn, hoặc ảnh do **khách tự gỡ** (`photo.reviewedBy === 'owner'`), thì `restore` bị từ chối. Nên ẩn nút Khôi phục trong hai trường hợp đó.
- **Nhiều người cùng thao tác:** nếu người khác đã xử lý ảnh trước, hàm ném `AlreadyReviewedError`. Bỏ qua là được, danh sách tự cập nhật.
- Cột meta của mỗi dòng: `photo.momentNo`, `photo.frameVariant`, `photo.ownerUid`, `photo.reviewedBy`, `photo.reviewedAt`.

### Cài đặt sự kiện (M02, chỉ admin)

```ts
import { watchConfig, updateConfig, requestDisplayReload } from '../backend/src/client';

watchConfig(backend, (c) => { /* c đã được điền sẵn giá trị mặc định */ });
await updateConfig(backend, { uploadsOpen: false, maxSubmitsPerUser: 3 });
await requestDisplayReload(backend);   // "Làm mới màn lớn"
```

| Field | Ô trên M02 | Mặc định | Ai áp dụng |
|---|---|---|---|
| `uploadsOpen` | Đang nhận ảnh | | rules |
| `uploadsChangedAt` | "Đã đóng lúc 17:30" (E03) — server tự ghi, không sửa tay | | tự động |
| `closesAt` | Tự động đóng lúc | không có | rules |
| `maxSubmitsPerUser` | Giới hạn mỗi phiên (1–20) | 3 | rules |
| `allowGallery` | Cho phép chọn ảnh từ thư viện | true | FE |
| `removedRetentionHours` | Giữ ảnh đã gỡ (1–168 giờ) | 24 | rules |
| `marqueePxPerSec` | Tốc độ trượt (5–400), `null` = 70 giây/vòng | null | FE |
| `showNames` | Hiện tên người gửi | true | FE |
| `arrivalCard` | Card "Vừa lên Wall" | true | FE |
| `qrUrl` | Link trong mã QR (phải là `https://`) | trang chủ | FE |
| `frames` | Trạng thái khung: `[{ id, enabled }]`, thứ tự = thứ tự trên màn Chọn khung | `[]` = tất cả khung, theo `frames.json` | FE |
| `displayReloadAt` | Làm mới màn lớn — big screen reload khi giá trị đổi | | FE |

"Ai áp dụng" = **rules** nghĩa là backend chặn thật; **FE** nghĩa là giao diện phải tự đọc và làm theo.
Không có: SafeSearch, tự động duyệt, tải ZIP, timelapse, xuất CSV, lịch xoá dữ liệu (cần server).

### Người kiểm duyệt (M02, chỉ admin)

```ts
import { watchModerators, saveModerator, deleteModerator } from '../backend/src/client';

watchModerators(backend, (list) => { /* [{ email, role, name?, org? }] */ });
await saveModerator(backend, 'mai@gmail.com', { role: 'moderator', name: 'Mai Lê', org: 'AWS SC' });
await deleteModerator(backend, 'mai@gmail.com');
```

Email phải là **tài khoản Google** mà người đó dùng để đăng nhập. Admin không tự hạ quyền hay tự xoá mình được.

## 6. Deploy

Web chạy tại **<https://photowall-gdgocsgu.web.app>**. Mã QR trên big screen trỏ về địa chỉ này.

`firebase.json` ở gốc repo phục vụ thư mục **`frontend/dist`**. Build frontend ra đúng thư mục đó rồi chạy ở gốc repo:

```
npx firebase deploy --only hosting --project prod
```

Chỉ domain `photowall-gdgocsgu.web.app` (và `localhost` khi dev) được Auth, App Check và CORS cho phép. Link preview channel (`photowall-gdgocsgu--xxx.web.app`) sẽ **không** đăng nhập Google được và bị App Check chặn, nên hãy test trên domain chính.
