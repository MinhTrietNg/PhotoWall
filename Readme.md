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

