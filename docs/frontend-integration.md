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
| `uploads-closed` | Ban tổ chức đang tạm dừng nhận ảnh | "Hiện chưa nhận ảnh, bạn quay lại sau nhé" |
| `rate-limited` | Chưa đủ 60 giây kể từ lần gửi trước. `e.retryAfterSeconds` là số giây còn phải chờ | "Chờ {n} giây nữa để gửi tiếp" |
| `quota-exceeded` | Đã gửi 20 ảnh | "Bạn đã gửi đủ số ảnh" |
| `upload-failed` | Mạng rớt giữa chừng. Ảnh đã được giữ chỗ, **đừng gọi lại `submitPhoto`**, vì lần gửi mới sẽ bị giới hạn 60 giây | Nút "Thử lại" gọi `resumeSubmission(backend, e.photoId!, image)` |
| `unknown` | Lỗi khác | "Có lỗi, thử lại sau" |

Tên người dùng (`displayName`) được `trim()`, phải dài **1–40 ký tự**.

### Trạng thái ảnh của mình và tải ảnh về

```ts
const stop = watchMyPhotos(backend, (photos) => { /* photos[i].status */ });
```

`status`: `uploading` → `pending` (chờ duyệt) → `approved` hoặc `rejected`. Nếu ban tổ chức gỡ ảnh sau khi duyệt thì thành `removed`.

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

## 5. Màn người duyệt

```ts
import { GoogleAuthProvider, signInWithPopup } from 'firebase/auth';
import { isModerator, watchPending, approve, reject, remove, setUploadsOpen, watchConfig, AlreadyReviewedError } from '../backend/src/client';

await signInWithPopup(backend.auth, new GoogleAuthProvider());
if (!(await isModerator(backend))) { /* "Tài khoản này chưa được cấp quyền duyệt" */ }

watchPending(backend, (photos) => { /* hàng chờ, cũ nhất trước */ });
await approve(backend, id);   // hoặc reject(backend, id)
```

- **Nhiều người duyệt cùng lúc:** nếu người khác đã xử lý ảnh đó trước, hàm ném `AlreadyReviewedError`. Chỉ cần bỏ qua, vì ảnh sẽ tự biến khỏi hàng chờ.
- **Gỡ ảnh đã duyệt:** `remove(backend, id)`. Ảnh biến khỏi big screen và bộ đếm giảm 1.
- **Công tắc nhận ảnh:** `watchConfig` để hiển thị trạng thái, `setUploadsOpen(backend, true/false)` để bật/tắt. **Tắt khi không có ai trực duyệt.**
- Danh sách người duyệt do Khả quản lý trên Firebase console (`moderators/{email}`).

## 6. Deploy

`firebase.json` ở gốc repo phục vụ thư mục **`frontend/dist`**. Build frontend ra đúng thư mục đó rồi chạy ở gốc repo:

```
npx firebase deploy --only hosting --project prod
```

Muốn có bản xem thử không ảnh hưởng bản chính (link riêng, tự hết hạn):

```
npx firebase hosting:channel:deploy review --project prod
```
