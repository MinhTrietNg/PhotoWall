# Photo Wall — Frontend Implementation Plan

> **Single source of truth for the PhotoWall frontend.**
> Extracted from the Claude Design canvas **`Photo Wall — GDGoC × AWS × Đoàn hội · UI/UX`**
> and reconciled against the Firebase backend that already exists on the `backend` branch.

| | |
|---|---|
| Document version | 1.0 |
| Written | 2026-09-22 |
| Design source | `Photo Wall — GDGoC × AWS × Đoàn hội · UI/UX` |
| Design artifact | `https://claude.ai/code/artifact/68fc6c75-6b13-4d0d-8093-6acfe1275fd1` |
| Design version read | `1790059353-e701` (canvas schema `v: 3`, created on files `2026-09-21T08:32:03Z`) |
| Artboards inspected | 32 of 32 (100%) |
| Design assets extracted into repo | 9 PNG (3 frame overlays + 6 partner logos) |
| Backend contract source | `origin/backend` branch, commit `3faa188` |

> ### Implementation status — updated 2026-09-22
>
> **Stack changed by the project lead: React, not Lit.** The design board DESIGN-D30 specified
> `Lit + Material Web`; the team chose **React + Vite + TypeScript**, split into **three separate
> web apps** served from one Firebase Hosting target. Every visual specification in this document
> still applies unchanged — only the component technology differs. See §10.1.
>
> | App | Route | Entry | State |
> |---|---|---|---|
> | Guest mobile flow | `/` | `frontend/index.html` | **Built** — all 10 screens + 3 error states |
> | Big screen kiosk | `/display/` | `frontend/display/index.html` | Placeholder — Phase 9 |
> | Moderation console | `/admin/` | `frontend/admin/index.html` | Placeholder — Phase 10 |
>
> Done: **P0** (repo merge, Vite/React scaffold, dedupe), **P1** (tokens, fonts, icons),
> **P2–P3** (the controls and patterns the mobile flow uses), **P4** (frame registry +
> `PhotoWallFrame` + validation), **P5** (router, session, IndexedDB, resume prompt,
> uploads-closed guard), **P6** (welcome, name, camera, shot review, E01),
> **P7** (frame select, review, `compose.ts`), **P8** (upload, done, my strip, E02, E03).
>
> Not done: **P0.4 is still open** — `FRAME_VARIANTS` / `firestore.rules` still say
> `['light','dark']`. The mobile app already sends the real frame id, so **uploads against the
> real backend will be rejected until P0.4 lands**. Development runs on the mock backend
> (`VITE_BACKEND=mock`, the default) which accepts the real ids.

---

## 1. Document Purpose

### What this file is

This file is the **design-to-engineering handoff** for the PhotoWall frontend. Every visual
decision, measurement, colour, interaction, motion curve, brand rule and state that previously
existed only inside the Claude Design canvas has been transcribed here.

### Why it exists

The Claude Design canvas is a *design tool artifact*, not a repository artifact. It can be
deleted, moved, or lose its share link. The team needs the UI/UX knowledge to live inside
git alongside the code. **Assume the canvas is gone.** Everything needed to faithfully build
the intended product must be in this file, in `frontend/public/frames/`, and in
`frontend/public/logos/`.

### How to use it

| You are… | Read |
|---|---|
| A new frontend dev | §2 → §4 → §35 (Quick Start) → your phase in §22 |
| Implementing one screen | §6 (that screen) + §7 (tokens) + §10 (components) |
| Implementing the frame/export engine | §18 + §19 + `frontend/public/frames/frames.json` |
| A fresh Claude Code session | §34 first, then §32 + §33, then the phase you are asked for |
| A reviewer / QA | §28 + §16 + §33 |
| Wiring to Firebase | §12 + §13 + §20.5 (**the design/backend conflicts — read before coding**) |

### Evidence labelling used throughout

| Tag | Meaning |
|---|---|
| **[C]** CONFIRMED | Directly read out of the design artboard source, the frame PNGs, or the backend source. Exact. |
| **[I]** INFERRED | Strongly implied by the design architecture but not literally written in it. Safe default; may be changed with a note. |
| **[U]** UNRESOLVED | Cannot be determined from the design or the repo. Listed in §31. **Do not invent a value — ask the BTC/Admin.** |

---

## 2. Product Overview

### What it is

**Photo Wall** is a browser-based photobooth run at a GDGoC booth at an on-campus event at
Saigon University. Guests photograph themselves with their own phone; the app composes four
shots into one vertical photobooth strip inside an organiser-supplied frame; the strip is sent
for moderation and then scrolls continuously on a large screen at the booth. **[C]**

### Target users

| Role | Device | Auth |
|---|---|---|
| **Khách** (guest / student) | own phone, 360–430 px wide | none visible — anonymous Firebase auth, triggered only on Send **[C]** |
| **Kiểm duyệt** (moderator — AWS Student Club, Đoàn hội) | laptop, fixed 1280 px | Google sign-in, email allowlist **[C]** |
| **Admin** (GDGoC) | laptop, fixed 1280 px | Google sign-in, allowlist (same mechanism) **[C]** |
| **Màn hình lớn** (kiosk) | 1920×1080 screen at the booth | none — reads approved photos publicly **[C]** |

### Primary user journey (guest)

```
Scan QR at the booth
  -> S01 Welcome
  -> S02 Enter name + consent
  -> S03 Shoot photo 1 -> S04 check it -> (repeat x4)
  -> S05 Choose one of the organiser frames
  -> S06 Review the composed strip
  -> S07 Upload
  -> S08 / S08b Done (live on the Wall, or waiting for moderation)
  -> strip scrolls on the big screen at the booth
```

**Target: the whole journey in <= 45 s median.** **[C]** — stated as the KPI on DESIGN-D30.

### UX goals, in the designer's own words

- *"Mỗi màn hình chỉ trả lời một câu: **Tiếp theo mình làm gì?**"* — every screen answers exactly
  one question: what do I do next. **[C]** (DESIGN-D01)
- *"Gian hàng GDGoC được gói vào một trang web"* — the GDGoC booth, wrapped into a web page. **[C]**
- Flat colour, 2 px ink outlines, hard offset shadows, warm cream ground — "like the whiteboards,
  stickers and photobooth strips at the booth". **[C]**
- Copy is short, warm, second person (`bạn`). One sentence per screen. Buttons are verbs. **[C]**

### Core features

1. 4-shot photobooth capture with a 3-second timer, mirror toggle, camera switch, gallery fallback. **[C]**
2. Per-shot review — retake any single shot without losing the others. **[C]**
3. Frame selection from a **fixed organiser-supplied set** (currently 3). **[C]**
4. Client-side composition to a single 1080x3400 JPEG. **[C]**
5. Upload + moderation queue. **[C]**
6. Continuous horizontal marquee on a 1920x1080 big screen, with a celebratory "just arrived" card. **[C]**
7. Moderator console: approve / reject / remove, with tabs and bulk selection. **[C]**
8. Admin settings for the event. **[C]** (but see §20.5 — mostly unsupported by the current backend)

### Explicitly OUT of scope — do not add these

These are **decisions the organisers made**, recorded on DESIGN-D32 (Audit). Re-adding them
would be a regression, not an improvement.

- **No photo wall / feed on the phone.** The Wall exists only on the big screen, so people
  gather at the booth. The phone only ever shows *your own* strip. **[C]**
  (The backend branch confirms this: commit `3faa188` = *"bỏ feed trên điện thoại"*.)
- **No user decoration mode** (no drag-drop stickers, no custom text). Guests only *pick* a
  frame. Reason: 1–2 min per person would jam the queue, and stickers could cover faces. **[C]**
- **No minigame.** **[C]**
- **No guest login.** **[C]**
- **No "report photo" button for guests** — moderation is staffed at the booth. **[C]**

### Relationship between Photo Wall and the organisations

Six organisations co-brand the event. Their logos appear as a fixed row on the big screen
footer and inside frame F03's artwork. Their order is **fixed** (see §8 and §33).

`Đoàn TNCS HCM` · `Đại học Sài Gòn (SGU)` · `Hội Sinh viên Việt Nam` · `Khoa CNTT (ISF)` **×**
`GDGoC on Campus SGU` **×** `AWS Student Builder Groups`

### Expected output for the user

One **1080 x 3400 px JPEG** photobooth strip: four of their photos inside the chosen frame
artwork. They can download it immediately, and it appears on the big screen once approved. **[C]**

---

## 3. Design Source Inventory

All 32 artboards on the canvas were read in full. `Status` below means: could the artboard's
intent be fully recovered from its source?

### 3.1 Foundations & component library

| ID | Artboard file | Canvas title | Size (px) | Purpose | Status |
|---|---|---|---|---|---|
| DESIGN-D01 | `Foundations.dc.html` | 01 Foundations | 1440x3540 | 24 colour tokens, 10 type styles, spacing, radius, outline, shadow, breakpoints, motion tokens, 3 control sizes | Confirmed |
| DESIGN-D02 | `Components.dc.html` | 02a Component library · controls | 1440x3940 | Button, icon-button, toggle, checkbox, input, select, pill, tag, steps, tabs, top bar, frame option, PhotoWallFrame — all with measurements | Confirmed |
| DESIGN-D03 | `Components_Patterns.dc.html` | 02b Component library · patterns | 1440x3080 | Camera block, toast, dialog, QR, counter, progress, skeleton, photo card, strip tile, empty/loading/error, moderation table row | Confirmed |

### 3.2 Guest mobile flow — 390 x 844 each

| ID | Artboard file | Canvas title | Purpose | Status |
|---|---|---|---|---|
| DESIGN-D04 | `Welcome.dc.html` | S01 Welcome | Hero landing, floating decor, single CTA | Confirmed |
| DESIGN-D05 | `EnterName.dc.html` | S02 Nhập tên | Name input, show-name toggle, consent checkbox | Confirmed |
| DESIGN-D06 | `Camera.dc.html` | S03 Chụp ảnh 1/4 | Live viewfinder, 4-slot tray, shutter, dark theme | Confirmed |
| DESIGN-D07 | `ShotReview.dc.html` | S04 Kiểm tra ảnh 1/4 | "Tấm này được chứ?" — retake / accept | Confirmed |
| DESIGN-D08 | `Camera_Last.dc.html` | S03d Chụp ảnh 4/4 · đếm ngược 3s | Last shot, countdown ring state, 3 tray slots filled | Confirmed |
| DESIGN-D09 | `FrameSelect.dc.html` | S05 Chọn khung | 150 px live preview + 3 frame option cards; **interactive prototype** | Confirmed |
| DESIGN-D10 | `Review.dc.html` | S06 Xem lại dải ảnh | 168 px strip + per-slot retake grid + frame chip | Confirmed |
| DESIGN-D11 | `Uploading.dc.html` | S07 Đang gửi | Determinate progress 62% variant | Confirmed |
| DESIGN-D12 | `Success.dc.html` | S08 Thành công | "Bạn đã lên Wall!" + download / share / my strip | Confirmed |
| DESIGN-D13 | `Success_Pending.dc.html` | S08b Đã nhận · đang duyệt | Queue-position variant | Confirmed |
| DESIGN-D14 | `PhotoDetail.dc.html` | S09 Dải ảnh của tôi · gỡ | Dark screen, 186 px strip, download + self-remove | Confirmed |

### 3.3 Guest error / edge states — 390 x 844 each

| ID | Artboard file | Canvas title | Purpose | Status |
|---|---|---|---|---|
| DESIGN-D15 | `State_CameraDenied.dc.html` | E01 Camera bị từ chối | Permission denied overlay + Safari instructions | Confirmed |
| DESIGN-D16 | `State_UploadFailed.dc.html` | E02 Gửi lỗi · mất kết nối | Retry-with-kept-blob | Confirmed |
| DESIGN-D17 | `State_Closed.dc.html` | E03 Đã đóng nhận ảnh | Uploads closed, still downloadable | Confirmed |

### 3.4 Big screen (kiosk)

| ID | Artboard file | Canvas title | Size | Purpose | Status |
|---|---|---|---|---|---|
| DESIGN-D18 | `LargeScreen.dc.html` | D01 Màn hình lớn · trạng thái thường | 1920x1080 | Continuous marquee, counter, QR, logo footer | Confirmed |
| DESIGN-D19 | `LargeScreen_New.dc.html` | D02 Màn hình lớn · có ảnh vừa lên | 1920x1080 | Arrival card state: dim + yellow card + `+1` | Confirmed |

### 3.5 Organiser console

| ID | Artboard file | Canvas title | Size | Purpose | Status |
|---|---|---|---|---|---|
| DESIGN-D20 | `ModLogin.dc.html` | M00 Đăng nhập BTC · lỗi chưa có quyền | 1280x800 | Google sign-in + "not on allowlist" error | Confirmed |
| DESIGN-D21 | `Moderator.dc.html` | M01 Kiểm duyệt | 1280x1080 | 3 tabs, table rows, bulk bar, remove dialog; **interactive prototype** | Confirmed |
| DESIGN-D22 | `ModSettings.dc.html` | M02 Cài đặt sự kiện · Admin | 1280x1440 | Event settings, frame on/off, data export, moderator list | Confirmed (but see §20.5 — largely unsupported) |

### 3.6 Frame system

| ID | Artboard file | Canvas title | Size | Purpose | Status |
|---|---|---|---|---|---|
| DESIGN-D23 | `Frame_Spec.dc.html` | F-SPEC Đặc tả dải photobooth | 1320x1400 | The canonical 1080x3400 grid, layer order, export rule | Confirmed |
| DESIGN-D24 | `Frame_System.dc.html` | F-SYS Frame template · bảng đo + frames.json | 1440x1700 | Per-frame measured slot table + the literal `frames.json` | Confirmed |
| DESIGN-D25 | `Frame_Overview.dc.html` | F00 Bộ khung · tổng thể | 1320x1280 | All three frames at 30% side by side | Confirmed |
| DESIGN-D26 | `Frame_01.dc.html` | F01 Khung 01 · GDGoC · Build Together | 1080x3400 | 1:1 export board | Confirmed |
| DESIGN-D27 | `Frame_02.dc.html` | F02 Khung 02 · AWS · Build on AWS | 1080x3400 | 1:1 export board | Confirmed |
| DESIGN-D28 | `Frame_03.dc.html` | F03 Khung 03 · Đoàn hội · GDGoC · AWS | 1080x3400 | 1:1 export board | Confirmed |

### 3.7 Cross-cutting documentation boards

| ID | Artboard file | Canvas title | Size | Purpose | Status |
|---|---|---|---|---|---|
| DESIGN-D29 | `Motion_Responsive.dc.html` | 05 Motion · Responsive · Accessibility | 1440x1660 | Motion table, responsive rules, a11y rules | Confirmed |
| DESIGN-D30 | `Handoff.dc.html` | 06 Developer handoff | 1440x3400 | Screen inventory, component inventory, **the full CSS token block**, asset list, interaction notes, data model, analytics | Confirmed |
| DESIGN-D31 | `Roles.dc.html` | 07 Phân quyền | 1440x1600 | 4-role x 20-action permission matrix | Confirmed |
| DESIGN-D32 | `Audit.dc.html` | 08 Phản biện & kiểm tra logic | 1440x1240 | 16 adversarial UX questions + the designed answer | Confirmed |

### 3.8 Canvas notes (sticky annotations)

| Note | Text (translated intent) |
|---|---|
| `t1` | 01 · Design system — token · control · pattern |
| `t2` | 02 · Mobile flow 390x844 — QR -> name -> 4 shots (review each) -> pick frame -> send -> onto the big screen (**no Wall on the phone**) |
| `t3` | 03 · Big screen (normal / just-arrived) · BTC login · Moderation · Admin settings |
| `t4` | 04a · Photobooth frame — spec & docs (identical for every frame) |
| `t4b` | 04b · Frame set — F01 GDGoC · F02 AWS · F03 Partners · **F04… added later, same 1080x3400 template** |
| `t5` | 05 · Motion · responsive · handoff · permissions · UX critique |
| `s2` | Prototype: green button = next, arrow = back. Shoot -> Check -> (x4, prototype shortened to shots 1 and 4) -> Pick frame: tap a frame card to change the frame right in the preview -> Review -> Send. |

### 3.9 Count discrepancy — noted, not an error

DESIGN-D30 says *"34 artboard"* and *"21 component"*. The canvas actually holds **32**
artboards. The designer counted `S03 · S03d` and `M00 · M01 · M02` as separate screen *entries*
in the screen-inventory table rather than as artboards. **No artboard is missing.** **[C]**

---

## 4. Complete User Flow

### 4.1 Guest flow with triggers and failure branches

```
                    [QR code on the big screen]
                               |
                               v
                   +-----------------------+
                   | S01 Welcome  (D04)    |  route /
                   +-----------+-----------+
              tap "Bắt đầu chụp ảnh"
                               v
                   +-----------------------+
                   | S02 Nhập tên  (D05)   |  route /name
                   +-----------+-----------+
      name 1..24 chars AND consent checked  --> otherwise CTA disabled
                               v
        +------------------------------------------+
        | S03 Camera (D06 / D08)  route /camera/:n  |<--+
        +------------------+-----------------------+   |
         camera permission denied --> E01 (D15)         |
                           | shutter / 3s timer fires   |
                           v                            |
        +------------------------------------------+    | "Chụp lại"
        | S04 Shot review (D07) /camera/:n/review  |-----+
        +------------------+-----------------------+
              "Dùng ảnh này" ; n < 4 -> n+1 ; n = 4 -> next
                               v
                   +-----------------------+
                   | S05 Chọn khung (D09)  |  route /frame
                   +-----------+-----------+
                     "Dùng khung này"
                               v
                   +-----------------------+
                   | S06 Xem lại  (D10)    |  route /review
                   +-----------+-----------+
   "Chụp lại một ô N" --> back to /camera/N  ;  "Chụp lại hết" --> /camera/1
                     "Gửi lên Wall"
                               v
                   +-----------------------+
                   | S07 Đang gửi (D11)    |  route /upload
                   +-----------+-----------+
          upload error   --> E02 (D16) --"Gửi lại"--> retry same blob
          uploads closed --> E03 (D17)
                               v
              +----------------+----------------+
              v                                 v
   +--------------------+            +----------------------+
   | S08 Thành công     |            | S08b Đang duyệt      |  route /done
   | (D12) — approved   |            | (D13) — pending      |
   +---------+----------+            +----------+-----------+
             +---------------+------------------+
                             v
                   +-----------------------+
                   | S09 Dải ảnh của tôi   |  route /me/:id
                   | (D14)                 |
                   +-----------------------+
```

### 4.2 Transition table

| # | From | Trigger | To | Validation | Loading | Failure |
|---|---|---|---|---|---|---|
| T1 | S01 | tap `Bắt đầu chụp ảnh` | S02 | none | none | — |
| T2 | S02 | tap `Tiếp tục` | S03 (n=1) | `name.trim().length` 1–24 **and** consent checked, else CTA is `btn-dis` | none | — |
| T3 | S03 | tap shutter, or 3 s timer reaches 0 | S04 | camera stream live | white flash 120 ms | permission denied -> E01 |
| T4 | S03 | tap `Thư viện` | S04 | file is an image | decode | unsupported format -> toast error |
| T5 | S04 | tap `Chụp lại` | S03 (same n) | — | none | — |
| T6 | S04 | tap `Dùng ảnh này` | S03 (n+1) if n<4, else S05 | — | shot animates into tray slot n, 400 ms | — |
| T7 | S05 | tap a `pw-frame-option` card | S05 (preview swaps) | frame must be enabled | crossfade 160 ms | — |
| T8 | S05 | tap `Dùng khung này` | S06 | a frame is selected | none | — |
| T9 | S06 | tap slot N `Chụp lại ô N` | S03 (n=N) | — | none | — |
| T10 | S06 | tap `Chụp lại hết` | S03 (n=1), all shots cleared | confirm dialog **[I]** | none | — |
| T11 | S06 | tap `Gửi lên Wall` | S07 | 4 shots present, frame chosen, name valid | compose then upload | see below |
| T12 | S07 | upload completes | S08 or S08b | — | progress % or indeterminate | — |
| T13 | S07 | network drops | E02 | — | — | keep the JPEG blob in memory; `Gửi lại` calls `resumeSubmission`, **never** `submitPhoto` again |
| T14 | S07 | `uploads-closed` from backend | E03 | — | — | — |
| T15 | S08/S08b | tap `Tải dải ảnh về` | (stays) | — | — | uses the in-memory blob, no re-download |
| T16 | S08/S08b | tap `Chụp bộ khác` | S01, session shots cleared | rate limit 60 s applies | — | `rate-limited` -> toast "Chờ {n} giây nữa" |
| T17 | S08/S08b | tap `Dải ảnh của tôi` | S09 | — | — | — |
| T18 | any | uploads closed at load | E03 | `watchConfig` reports `uploadsOpen: false` | — | — |

### 4.3 Moderator flow

```
M00 /mod  --Google sign-in-->  isModerator()? --no--> M00 with error banner
                                    | yes
                                    v
                        M01 /mod  (3 tabs)
                        |- Chờ duyệt   -> Duyệt (approve) / Gỡ (reject)
                        |- Đã duyệt    -> Gỡ (remove)  [confirm dialog]
                        '- Đã gỡ       -> Khôi phục (restore)   [!] see §20.5 #9
                                    |
                                    v  (gear icon, Admin only)
                        M02 /mod/settings
```

### 4.4 Big screen flow

```
/display  (no auth)
  |- watchApproved()  --> marquee track, ~70 s per loop, never stops
  |    |- added[]      --> dim track to 55%, raise yellow arrival card (700 ms),
  |    |                   hold 5 s, fly to head of track, counter rolls +1
  |    '- removedIds[] --> drop that tile from the track immediately
  |- watchStats()     --> approvedCount in the green counter card
  '- self-reload every 6 h
```

---

## 5. Page / Route Architecture

The design specifies routes explicitly on DESIGN-D30. Keep them. `firebase.json` already
rewrites `**` -> `/index.html`, so any client-side router works. **[C]**

```
/
├── /                       S01 Welcome            (D04)     guest
├── /name                   S02 Enter name         (D05)     guest
├── /camera/:n              S03 Capture shot n     (D06/D08) guest   n in 1..4
├── /camera/:n/review       S04 Check shot n       (D07)     guest
├── /frame                  S05 Choose frame       (D09)     guest
├── /review                 S06 Review strip       (D10)     guest
├── /upload                 S07 Uploading          (D11)     guest
├── /done                   S08 / S08b             (D12/D13) guest
├── /me/:id                 S09 My strip           (D14)     guest
├── /closed                 E03 Uploads closed     (D17)     guest
├── /display                D01 / D02 Big screen   (D18/D19) kiosk
├── /mod                    M00 login / M01 queue  (D20/D21) moderator
└── /mod/settings           M02 Event settings     (D22)     admin
```

`404` -> redirect to `/` (Welcome). **[C]**

### Route detail

| Route | Responsibility | Main components | State it owns | Entered from | Exits to |
|---|---|---|---|---|---|
| `/` | Sell the idea in one screen, one CTA | `pw-hero-decor`, `pw-button` | none | QR, 404, `Chụp bộ khác` | `/name` |
| `/name` | Collect `displayName`, consent, show-name preference | `pw-topbar`, `pw-steps`, `pw-input`, `pw-toggle`, `pw-checkbox` | draft name + 2 booleans | `/` | `/camera/1` |
| `/camera/:n` | Live camera, timer, mirror, facing mode, tray | `pw-camera`, `pw-topbar` (dark) | `MediaStream`, timer, facingMode, mirrored | `/name`, `/camera/:n-1/review`, `/review` | `/camera/:n/review`, `E01` |
| `/camera/:n/review` | Accept or retake shot `n` | `pw-topbar` (dark), `pw-button` x2 | the candidate blob | `/camera/:n` | `/camera/:n` or `/camera/:n+1` or `/frame` |
| `/frame` | Pick one enabled frame, live 150 px preview | `pw-photowall-frame` (preview 150), `pw-frame-option` xN | `selectedFrameId` | `/camera/4/review` | `/review` |
| `/review` | Final check, per-slot retake, frame chip | `pw-photowall-frame` (168), retake grid, `pw-pill` | none (reads session) | `/frame` | `/camera/:n`, `/upload` |
| `/upload` | Compose canvas, `ensureGuest`, `submitPhoto` | `pw-progress`, `pw-photowall-frame` (40) | `uploadProgress`, `photoId` | `/review` | `/done`, `E02`, `E03` |
| `/done` | Confirm; branch approved vs pending | `pw-photo-card`, `pw-button` x2, text button | `photoStatus` (live) | `/upload` | `/me/:id`, `/` |
| `/me/:id` | Show one own strip, download, (self-remove) | `pw-photowall-frame` (186), `pw-button` | live `Photo` doc | `/done` | `/` |
| `/closed` | Event over | `pw-state`, `pw-button` | `approvedCount` | anywhere when `uploadsOpen=false` | `/me/:id`, `/` |
| `/display` | Kiosk marquee. **Separate layout, no shared app chrome.** | `pw-marquee`, `pw-strip-tile`, `pw-counter`, `pw-qr`, logo footer | approved list, arrival queue | direct URL | never |
| `/mod` | Sign-in or moderation queue | `pw-tabs`, `pw-mod-row`, `pw-dialog` | tab, selection, queues | direct URL | `/mod/settings` |
| `/mod/settings` | Event config | setting rows, `pw-toggle`, `pw-select` | config draft | `/mod` | `/mod` |

**Do not add routes.** In particular there is deliberately **no `/wall`** on the phone. **[C]**

---
## 6. Screen-by-Screen Specification

Every measurement below was read out of the artboard source. Unless a value is marked **[I]**
or **[U]**, it is literal.

### 6.0 Rules that apply to every mobile screen

- Root: `width: 390px; height: 844px; display:flex; flex-direction:column; overflow:clip; position:relative`. **[C]**
  In production this becomes `100dvw × 100dvh`; 390×844 is the design reference (iPhone 14/15). **[I]**
- Light screens: `background: #FAF7F2` (`--pw-bg`). Dark screens (camera family): `background: #1C1B33` (`--pw-ink`). **[C]**
- `box-sizing: border-box` on everything. Borders are drawn **inside** the box. **[C]**
- Screen side gutter = **20 px**. Bottom CTA block = `padding: 0 20px 32px` and is pushed down
  by `margin-top: auto`, so the CTA is always pinned to the bottom regardless of content height. **[C]**
- Top bar height is **76 px** = `padding-top 20` + `48` control + `8` breathing. **[C]**
- Fonts: `Unbounded` for headings (class `.u`), `Be Vietnam Pro` for everything else. **[C]**
- The flow screens **must not scroll** (DESIGN-D29). Only `/me/:id` may scroll on short devices. **[C]**

---

### DESIGN-D04 — S01 Welcome · route `/`

#### Purpose
One screen, one promise, one button. Confirms the guest is in the right place and who is
behind it.

#### Layout hierarchy
```
Root 390x844  bg #FAF7F2
├── Partner text strip          (flex-shrink 0, padding 20 20 0, centred)
├── Decor zone                  (height 290, margin-top 12, aria-hidden)
│   ├── fl1  blue rounded square "</>"
│   ├── fl2  yellow circle
│   ├── fl3  green "128 trên Wall" pill
│   ├── fl4  three fanned mini strips (f01, f02, f03)
│   ├── fl5  red rounded square
│   └── fl6  four Google dots
├── Title block                 (padding 8 20 0, gap 12)
│   ├── h1  PHOTO / WALL
│   └── p   two-line promise
└── Bottom CTA block            (margin-top auto, padding 0 20 32, gap 12)
    ├── Primary button
    └── Helper line
```

#### Visual properties

| Element | Spec |
|---|---|
| Partner strip | `inline-flex; gap 8; font-weight 700; font-size 11; letter-spacing .02em; color #1C1B33; white-space nowrap`. Separator `×` is `#5B5975` weight 500. Text: `GDGoC × Đoàn hội Khoa CNTT × AWS Student Club` |
| `fl1` | `left 20 top 4; 148x148; radius 32; bg #4285F4; border 2 #1C1B33; rotate(-4deg)`; glyph `</>` Unbounded 52/800 white |
| `fl2` | `right 22 top 0; 124x124; border-radius 50%; bg #FBBC04; border 2 #1C1B33` |
| `fl3` | `left 20 top 176; 150x48; radius 999; bg #34A853; border 2 #1C1B33; shadow 3px 3px 0 #1C1B33`; white 13/700; bolt icon 20; label `128 trên Wall` |
| `fl4` | `left 192 top 58; 180x216`. Three strips, each `58x183`, all at `left 58 top 6/2/0`, `transform-origin 50% 135%`, rotations **-15deg (f01)**, **-2deg (f02)**, **+12deg (f03)** — so they fan out like held cards. Each wrapper: `border 2 #1C1B33; radius 12; shadow 4px 4px 0 #1C1B33; bg #fff; overflow hidden` |
| `fl5` | `left 40 top 238; 42x42; radius 12; bg #EA4335; border 2 #1C1B33; rotate(12deg)` |
| `fl6` | `left 104 top 252`; four 10 px dots, gap 6, order **blue #4285F4 · red #EA4335 · yellow #FBBC04 · green #34A853** |
| `h1` | Unbounded `64px / .95`, weight 800, `letter-spacing -.01em`, margin 0. Line 1 `PHOTO`, `<br>`, line 2 `WALL` wrapped in a chip |
| `WALL` chip | `background #FBBC04; padding 0 12px 4px; border-radius 8px; display inline-block; line-height 1.05` — **no border on this chip** |
| Promise `p` | `font-size 20; weight 600; line-height 1.35`. `Chụp 4 tấm kiểu photobooth.<br>Để lại một khoảnh khắc.` |
| CTA | `.btn .btn-p` full width, camera icon 24 + `Bắt đầu chụp ảnh` |
| Helper | `13/600 #5B5975`, monitor icon 18, gap 8, centred: `Dải ảnh của bạn sẽ hiện trên màn hình lớn tại gian hàng` |

#### Motion
`@keyframes pw-float {0%,100%{translate:0 0} 50%{translate:0 -10px}}` and `pw-float-s` (−6 px).
Durations / negative delays per element: `fl1 5.6s`, `fl2 6.8s -2.2s`, `fl3 5.1s -1.1s (small)`,
`fl4 7.4s -3.4s`, `fl5 4.6s -0.6s (small)`, `fl6 6.2s -2.8s (small)`. All `ease-in-out infinite`,
`will-change: translate`. Under `prefers-reduced-motion: reduce` → `animation: none`. **[C]**

#### Responsive
| Width | Behaviour |
|---|---|
| 360 | Decor zone keeps 290 px; the `fl2` circle may clip at the right edge — acceptable, it is `aria-hidden` decor. Hero drops to `56px` **[I]** |
| 390 | Reference |
| 430 | Decor stays anchored left/right; extra width goes between `fl1` and `fl2` |
| ≥ 768 | Whole flow is centred in a **430 px column**; the cream ground plus pattern fills the sides **[C]** |

---

### DESIGN-D05 — S02 Nhập tên · route `/name`

#### Purpose
Collect the one piece of data the product needs (`displayName`) and get explicit consent
before a real person's face goes on a public screen.

#### Layout hierarchy
```
Root 390x844  bg #FAF7F2
├── Top bar        h76   [back 48] [Bước 1 / 3] [spacer 48]
├── Steps row      pad 16 20 0, gap 8, centred
├── Question block pad 40 20 0, gap 24
│   ├── yellow icon disc 56
│   ├── h1 "Bạn tên gì?"
│   ├── p  helper
│   └── field group (label + input + helper/counter row)
├── Consent block  pad 24 20 0, gap 12
│   ├── Setting row — "Hiện tên trên màn hình lớn" (toggle)
│   └── Consent row — checkbox on yellow tint
└── Bottom CTA     "Tiếp tục"
```

#### Visual properties

| Element | Spec |
|---|---|
| Back button | `.ibtn` 48x48, `bg #fff`, `border 2 #1C1B33`, arrow-back icon 24, `aria-label="Quay lại"` |
| Title | Unbounded `16/600` `#1C1B33` — `Bước 1 / 3` |
| Right spacer | an empty `48x48` div, **required** so the title stays optically centred **[C]** |
| Step chip (current) | `h28; pad 0 12; radius 999; bg #1C1B33; color #fff; border 2 #1C1B33; 12/700` |
| Step chip (todo) | `bg #fff; color #5B5975; border 2 #DAD6CE` |
| Icon disc | `56x56; radius 16; bg #FBBC04; border 2 #1C1B33; rotate(-6deg)`; icon 32 |
| `h1` | Unbounded `32 / 1.1`, weight 700, `margin: 12px 0 0` — `Bạn tên gì?` |
| Sub `p` | `15 / 1.5` `#5B5975` — `Tên sẽ xuất hiện cùng dải ảnh của bạn trên màn hình lớn.` |
| Label | `15/700` — `Tên của bạn` |
| Input | `.input`: `h56; border 2 #1C1B33; radius 16; bg #fff; pad 0 16; 17/500`. Placeholder `VD: Minh Triết`, `#8D8BA3`. `maxlength=24`, `autocomplete="given-name"`. **The artboard shows the focus state**: `border-color #1967D2; box-shadow 0 0 0 3px #D2E3FC` |
| Helper row | `13 #5B5975` left `Tên thật hoặc nickname đều được.` / right counter `0/24` weight 600 |
| Setting row | `pad 12 16; border 2 #1C1B33; radius 16; bg #fff; gap 12; space-between`. Title `15/700`; sub `12 #5B5975` = `Tắt: hiển thị "Tân sinh viên" thay tên` |
| Toggle | visually-hidden `<input type=checkbox>` + `aria-hidden` span `48x28; radius 999; bg #188038 (on) / #DAD6CE (off); border 2 #1C1B33`; knob `20x20` white circle at `right 2 top 2` |
| Consent row | `pad 12 16; border 2 #1C1B33; radius 16; **bg #FEEFC3**; align-items flex-start; gap 12` |
| Checkbox | `24x24; radius 8; bg #1967D2; border 2 #1C1B33`; check icon 16 white; `margin-top 1px` |
| Consent copy | `13 / 1.45` — *"Tôi đồng ý cho ảnh hiển thị trên Photo Wall và màn hình lớn tại sự kiện; tôi có thể gỡ bất cứ lúc nào."* + link `Quy định ảnh` weight 700 |
| CTA | `.btn .btn-p` `Tiếp tục` + arrow-forward icon 24 |

#### Interactive states
`default · focus (blue border + 3 px halo) · filled (green check suffix 24) · error (red border +
3 px red halo + icon 16 + red helper) · disabled (bg #F1EEE7, border #DAD6CE, text #8D8BA3)` **[C]**

CTA is `.btn-dis` (bg `#DAD6CE`, text `#5B5975`, no shadow, `cursor: not-allowed`) until the
name is 1–24 chars **and** consent is ticked. **[I]** — the design does not show the disabled CTA
on this board, but DESIGN-D02 defines the disabled variant and consent is described as required.

#### Note on the name length
The design caps the field at **24** characters. The backend allows up to **40**
(`LIMITS.displayNameMaxLength`). 24 is the stricter value and is what the UI must enforce,
because the big screen name pill is sized for it. **[C]**

---

### DESIGN-D06 / D08 — S03 Chụp ảnh · route `/camera/:n`

#### Purpose
Take shot `n` of 4. This is the only dark screen in the guest flow, so the viewfinder reads
as the subject.

#### Layout hierarchy
```
Root 390x844  bg #1C1B33  (dark)
├── Top bar h76   [back 48 dark] [Ảnh n / 4] [timer pill 32][mirror pill 32]
├── Tray row      pad 16 20 0, gap 12 — four 72x54 cells
├── Viewfinder    pad 16 16 0 — 358x268 box
│   ├── live video (object-fit cover)
│   ├── rule-of-thirds grid
│   ├── four yellow corner brackets
│   ├── top pill "Ô ảnh n / 4"
│   └── bottom hint chip
├── Caption line  pad 12 20 0, centred
├── Strip hint card  margin 16 20 0
├── (spacer, margin-top auto)
├── Controls row  pad 16 32 0 — [Thư viện 56] [Shutter 84] [Đổi camera 56]
└── Footer note   pad 16 20 20
```

#### Visual properties

| Element | Spec |
|---|---|
| Back button (dark) | `.ibtn` 48, `bg #26253F`, `border 2 #3D3B5C`, `color #fff` |
| Title | Unbounded `16/600` `#fff` — `Ảnh 1 / 4` |
| Timer pill | `.pill` `h32`, `bg #FBBC04`, `border #1C1B33`, clock icon 16, label `3s`, `aria-pressed="true"` — **timer is ON by default** |
| Mirror pill | `h32 w32 pad 0`, `bg #1C1B33`, `color #fff`, `border 2 #fff`, `aria-pressed="false"`, `aria-label="Lật gương"` |
| Tray cell — current | `72x54; radius 12; border **3px** #FBBC04`; inner `bg #26253F`; camera icon 24 `#FBBC04` |
| Tray cell — todo | `72x54; radius 12; border 2 **dashed** #5B5975`; number Unbounded `16/800` `#8D8BA3` |
| Tray cell — done | `border 2 #34A853` + check icon 18 `#188038` over the thumbnail **[C]** (DESIGN-D03) |
| Viewfinder | `358x268` (**4:3**), `radius 20`, `border 2 #fff`, `bg #26253F`, `margin 0 auto` |
| Thirds grid | 1 px lines `rgba(255,255,255,.18)` at `33.3%` and `66.6%` on both axes |
| Corner brackets | `30x30`, `4px solid #FBBC04`, inset `12px`, only the two outer edges drawn, `radius 8` on the outer corner |
| Frame pill | `.pill` centred at `top 12` — `Ô ảnh 1 / 4` |
| Hint chip | `bottom 12`, `bg rgba(28,27,51,.75)`, white, `radius 999`, `pad 6 12`, `12/600` — `Đưa mặt vào giữa khung nhé` |
| Caption | `13 / 1.5` `#C9C6DA`, centred — `Tấm đầu tiên — cười tươi lên nào. Hẹn giờ 3 s đang bật.` |
| Strip hint card | `pad 12 16; radius 16; border 2 #3D3B5C; bg #26253F; flex; gap 16; align centre` |
| — mini frame | `PhotoWallFrame` **40x126**, wrapped `border 2 #fff; radius 8`. Empty slots show their number at Unbounded `10/800`, `opacity .35`, on `#F1EEE7` |
| — label | `.lbl` `#B8B5D1` — `Dải ảnh của bạn · 0/4` |
| — body | `13/1.5 #C9C6DA` — `Gợi ý 4 dáng: **cười** → **nghiêm** → **bất ngờ** → **chỉ tay**.` |
| Side buttons | `.ibtn` **56x56**, `bg #1C1B33`, `border 2 #fff`, `color #fff`; caption below: `12/600 #fff`, gap 8 |
| Shutter | `84x84` circle, `border 4px #fff`, `bg #fff`, `box-shadow 0 0 0 3px #1C1B33`; **inner core** `66x66` circle `bg #1967D2`, `border 3 #1C1B33` |
| Controls row | `padding: 16px 32px 0; justify-content: space-between` — the three columns are ≥ 24 px apart **[C]** |
| Footer note | `12` `#B8B5D1`, centred — `Mỗi tấm được xem lại trước khi ghép · ← thoát vẫn giữ ảnh đã chụp.` |

#### D08 differences (shot 4 of 4)
Title `Ảnh 4 / 4`; tray slots 1–3 are **done**, slot 4 is **current**; viewfinder pill
`Ô ảnh 4 / 4`; hint chip `Tấm cuối · đổi dáng nào`; caption
`Tấm cuối — đổi một dáng khác cho dải ảnh sinh động.`; strip label `Dải ảnh của bạn · 3/4`. **[C]**

#### Countdown state
When the 3 s timer runs: a **64 px counting ring** appears in the centre of the viewfinder, and
the device vibrates **10 ms per tick**. **[C]** (DESIGN-D30 interaction notes)

#### Responsive
`viewport 4:3 = min(100vw − 32, (100dvh − 420) × 4/3)`. **[C]** — this is a literal formula from
DESIGN-D29 and must be implemented as written, so the 4-cell tray plus 3 controls always fit.

---

### DESIGN-D07 — S04 Kiểm tra ảnh · route `/camera/:n/review`

#### Purpose
Let the guest reject a bad shot **before** it costs them the whole strip.

#### Layout & content
Same dark chrome as D06. Top bar right slot now shows a **name pill** (`.pill` h32) instead of
the timer/mirror controls. Tray unchanged. The viewfinder box (`358x268`) now shows the frozen
candidate shot with a `Vừa chụp` badge.

| Element | Spec |
|---|---|
| `h2` | Unbounded `24 / 1.2` weight 700, white — `Tấm này được chứ?` |
| Body | `Ảnh sẽ vào ô 1 của dải. Chụp lại bao nhiêu lần cũng được.` |
| Buttons | Two **L (56 px)** buttons side by side, `gap 12`: left `Chụp lại` = `.btn-s` (secondary, white); right `Dùng ảnh này` = **`.btn-g` success** (`bg #188038`, white, `shadow 3px 3px 0 #1C1B33`) |

> **Design rule:** `Dùng ảnh này` is one of only **two** places the Success button variant is
> allowed (the other is `Duyệt` in moderation). **[C]** (DESIGN-D02)

---

### DESIGN-D09 — S05 Chọn khung · route `/frame`

#### Purpose
Pick one of the organiser frames, with the change visible in a live preview of the real strip.

#### Layout hierarchy
```
Root 390x844  bg #FAF7F2
├── Top bar h76  [back 48] [Chọn khung] [pill "4 / 4 ảnh" h32]
├── Steps row    1 done (green) · 2 current (ink) · 3 todo
└── Main  pad 16 20 0, flex, gap 16, align-items flex-start
    ├── LEFT  width 154, gap 10
    │   ├── Preview wrapper (border 2 ink, radius 12, shadow 4 4 0, bg #fff)
    │   │   └── PhotoWallFrame 150 x 472
    │   └── caption 11/1.45 #5B5975
    └── RIGHT flex:1, gap 6
        ├── .lbl "Khung có sẵn · 3"
        └── pw-frame-option x N   (184 x 73 each)
```
Bottom CTA: `.btn .btn-p` — `Dùng khung này`.

#### Frame option card — exact spec **[C]**

| Property | Value |
|---|---|
| Size | `width 184` (fills the right column) `× height 73` |
| Padding | `4px 8px 4px 4px` (asymmetric — thumbnail sits flush left) |
| Gap / radius | `gap 8`, `border-radius 12` |
| Background | `#fff` |
| Thumbnail | `PhotoWallFrame` **18 × 57**, wrapped `border 2 #1C1B33; radius 4; overflow clip` |
| Label | `.lbl` at `font-size 10` — `Khung 01` |
| Name | `12 / 1.3`, weight 700 — `GDGoC · Build Together` |
| **Default** | `border: 2px solid #1C1B33` |
| **Selected** | `border: 2px solid #1967D2; box-shadow: 0 0 0 3px #D2E3FC` + check disc on the right: `20x20; radius 50%; bg #1967D2; border 2 #1C1B33`, white check |
| **Hover** | `background: #F1EEE7` |
| **Focus** | `outline 3px #1967D2; offset 3px` |
| **Pressed** | `transform: scale(.98)` |
| Semantics | `<button aria-pressed>`, the set behaves as a radiogroup over the *enabled* frames **[C]** |

#### The canonical frame id list
The artboard's own logic block contains, literally:

```js
const IDS = ['f01-gdgoc', 'f02-aws', 'f03-partners'];
```

**These three strings are the frame ids for the whole product.** **[C]**

#### Behaviour
- Tapping a card swaps **both** the overlay PNG and the slot geometry in the 150 px preview,
  **crossfade 160 ms**; the four photos stay put; the preview box does not resize. **[C]**
- Card order on screen = the order configured in M02. **[C]**
- A frame disabled by Admin is **hidden** (not greyed). If only one frame remains it is
  pre-selected and the list is effectively a label. **[C]**
- Caption below the preview, `11/1.45 #5B5975`: `Xem trước đúng là ảnh sẽ tải về. Bấm thẻ để đổi khung.`
  — this is a promise the implementation must keep (see §18). **[C]**

---

### DESIGN-D10 — S06 Xem lại dải ảnh · route `/review`

#### Purpose
Last check before sending, with cheap per-slot repair.

#### Layout hierarchy
```
Root 390x844  bg #FAF7F2
├── Top bar h76  [back 48 → /frame] [Xem lại] [name pill h32 → /name]
├── Steps row    1 done · 2 current · 3 todo
├── Main  pad 12 20 0, flex, gap 16, align-items centre
│   ├── LEFT  PhotoWallFrame 168 x 529 in (border 2 ink, radius 12, shadow 4 4 0)
│   └── RIGHT flex:1, gap 12
│       ├── .lbl "Chụp lại một ô"
│       ├── 2x2 grid gap 8 — four retake tiles, h 56 each
│       ├── .lbl "Khung"
│       └── a.pill h36 → /frame  "Khung 01 · GDGoC"  + chevron
├── Note 13 #5B5975
└── Bottom  [Chụp lại hết (secondary)] [Gửi lên Wall (primary)]
```

| Element | Spec |
|---|---|
| Name pill | `a.pill h32` linking back to `/name` with an edit icon — **tapping the name edits it** **[C]** |
| Retake tile | `display block; height 56; radius 12; border 2 #1C1B33; overflow hidden; position relative` showing shot N |
| — number badge | Unbounded `11/800` white at `left 6 top 4` |
| — retake affordance | disc `22x22` at `right 4 bottom 4`: `bg #fff; border 2 #1C1B33; radius 50%`, refresh icon |
| Frame chip | `a.pill h36`, `13px`, `justify-content: space-between`, full width, chevron right |
| Note | `Ảnh lên màn hình lớn đúng như bản xem trước. Gửi xong vẫn gỡ được.` |
| Buttons | both **L**; `Chụp lại hết` is deliberately the *secondary*, `Gửi lên Wall` the only primary **[C]** |

---

### DESIGN-D11 — S07 Đang gửi · route `/upload`

| Element | Spec |
|---|---|
| Top bar | title `Bước 3 / 3` |
| Steps | 1 done, 2 done, 3 current |
| Loader card | `.card` `110x96`, `pad 8`, `radius 16`, `shadow 4px 4px 0 #1C1B33`, `display grid; grid-template-columns: repeat(3, minmax(0,1fr)); gap 4` — the four Google-coloured blocks run into the grid in sequence, **stagger 120 ms, loop 1.2 s ease-in-out** **[C]** |
| Mini strip | `PhotoWallFrame` **40 × 126** |
| `h1` | Unbounded `32/1.1` — `Đang gửi lên<br>Photo Wall…` |
| Body | `Vài giây thôi. Đừng đóng trang nhé.` |
| Progress label row | Body S 700 both ends — left `Ghép 4 ảnh xong · đang gửi`, right `62%` |
| Progress bar | `height 16; radius 999; border 2 #1C1B33; fill #1967D2`. `role="progressbar"` + `aria-valuenow` **[C]** |
| Indeterminate variant | four `16 px` blocks, `radius 4`, running in sequence — used when `bytesTransferred` is unavailable **[C]** |
| Cancel | text button `Huỷ` |

---

### DESIGN-D12 / D13 — S08 · S08b Done · route `/done`

Two variants of the same route. **Which one shows depends on the photo's moderation status.**

| | **D12 — S08 Thành công** | **D13 — S08b Đã nhận, đang duyệt** |
|---|---|---|
| Strip size | `PhotoWallFrame` **90 × 283** | `PhotoWallFrame` **84 × 264** |
| Corner disc | `56x56` circle, `bg #fff`, `border 2 #1C1B33`, **`color #188038`** (green check), at `right -22 bottom -14` | same disc but **`color #1C1B33`** (neutral clock/hourglass) |
| `h1` | `Bạn đã lên Wall!` | `Đã nhận, đang duyệt` |
| Body | `Dải ảnh của **Minh Triết** đang trượt trên màn hình lớn tại gian hàng.` | `Ban tổ chức xem nhanh trước khi lên màn hình lớn, thường dưới 1 phút. Dải ảnh của **Minh Triết** sẽ tự xuất hiện trên đó, không cần làm gì thêm.` |
| Status pill | `Khoảnh khắc thứ 129` (neutral) | `Hàng chờ duyệt: 2 / 3` (**yellow-100 bg + yellow-700 text**) |
| Buttons | `Tải dải ảnh về` (primary L) · `Chụp bộ khác` (secondary) · `Chia sẻ` (text) · `Dải ảnh của tôi` (text) | `Tải dải ảnh về` (primary L) · `Chụp bộ khác` (secondary) · `Dải ảnh của tôi` (text) |
| Motion | **600 ms overshoot** as the mini strip drops in + check pops; **7 confetti pieces, once, never looping** **[C]** | no confetti **[C]** |

> **Important consequence of the real backend** (see §20.5 #3): with no auto-approval service,
> **S08b is the normal outcome and S08 is reached only after a moderator taps Duyệt.** The screen
> must therefore subscribe to the photo's live status and upgrade D13 → D12 in place.

---

### DESIGN-D14 — S09 Dải ảnh của tôi · route `/me/:id`

Dark screen (`bg #1C1B33`).

| Element | Spec |
|---|---|
| Strip | `PhotoWallFrame` **186 × 586** — the largest on-phone rendering |
| Heading | `Dải ảnh của bạn` |
| Name | `Minh Triết` |
| Meta | `14:32 · Khoảnh khắc #129` |
| Icon button | `.ibtn` 56, dark treatment |
| Primary | `Tải dải ảnh về` |
| Destructive | `Gỡ dải ảnh của tôi` — rendered as a **red text button**, not a filled destructive button **[C]** |

This is the **only** screen where a guest can destroy something, and the design deliberately
makes it the quietest control on the page. **[C]**
See §20.5 #9 — the current backend does **not** permit a guest to remove their own photo.

---

### DESIGN-D15 — E01 Camera bị từ chối

Camera chrome stays behind (so the guest sees where they are), with an overlay card.

| Element | Content |
|---|---|
| Heading | `Chưa bật được camera` |
| Body | `Trình duyệt chưa cho phép truy cập camera. Cho phép lại trong cài đặt trang, hoặc chọn 4 ảnh có sẵn.` |
| Primary | `Cho phép camera` |
| Tonal | `Chọn từ thư viện` |
| Footer hint | `Safari: AA → Cài đặt trang web → Camera → Cho phép` |

The gallery fallback is a first-class path, not a consolation prize — it appears in the normal
camera controls too. **[C]**

---

### DESIGN-D16 — E02 Gửi lỗi · mất kết nối

| Element | Content |
|---|---|
| Heading | `Gửi ảnh chưa thành công` |
| Body | `Mạng hơi chập chờn. 4 ảnh của bạn vẫn còn đây, chỉ cần gửi lại thôi.` |
| Primary | `Gửi lại` |
| Secondary | `Xem lại dải ảnh` |

**Implementation contract:** `Gửi lại` must call `resumeSubmission(backend, photoId, image)`
with the blob already in memory. It must **not** call `submitPhoto` again — that would trip the
60-second rate limiter and strand the guest. **[C]** (`docs/frontend-integration.md`)

---

### DESIGN-D17 — E03 Đã đóng nhận ảnh

| Element | Spec |
|---|---|
| Top | the same partner text strip as S01 |
| Icon disc | `96x96; radius 24; bg #34A853; border 2 #1C1B33; shadow 4px 4px 0 #1C1B33; rotate(-6deg)`, white icon |
| Heading | `Wall đã đóng nhận ảnh` |
| Body | `Cảm ơn **412 khoảnh khắc**. Bạn vẫn tải lại dải ảnh của mình được trong 7 ngày.` |
| Pill | `Đã đóng lúc 17:30` |
| Buttons | `Dải ảnh của tôi` · `Về trang chủ` |

The **7-day** retention promise is a commitment made to the user in copy. See §31 Q7. **[C]**

---

### DESIGN-D18 — D01 Màn hình lớn (normal) · route `/display`

#### Purpose
The centrepiece at the booth. It never stops moving and never needs a human.

#### Layout hierarchy
```
Root 1920x1080  bg #FAF7F2  overflow clip
├── decor square (absolute left 1232 bottom -60)
├── Header       pad 44 64 0, space-between
│   ├── h1 PHOTO [WALL chip]   + four 18px dots
│   └── (right side empty)
├── Body row     pad 32 64 0, gap 40
│   ├── Marquee viewport 1236 x 760
│   │   ├── .pw-track (duplicated content)
│   │   ├── left fade 80px
│   │   └── right fade 80px
│   └── Right column width 516, gap 24
│       ├── Counter card (green)
│       ├── QR card
│       └── "Đến lượt bạn" / "Quét QR để lên Wall"
└── Footer logo strip  h112
```

#### Visual properties

| Element | Spec |
|---|---|
| Decor square | `absolute; left 1232; bottom -60; 150x150; radius 32; bg #4285F4; border **3** #1C1B33; rotate(14deg)` |
| `h1` | Unbounded **84 / 1**, weight 800, `letter-spacing -.01em` |
| `WALL` chip | `bg #FBBC04; pad 0 16 6; radius 16; border **3** #1C1B33` (on the big screen the chip *does* have a border, unlike S01) |
| Google dots | four `18px` circles, `gap 10`, `translateY(6px)`, order blue · red · yellow · green |
| Marquee viewport | `1236 x 760; radius 24; border **3** #1C1B33; bg #fff; overflow hidden; position relative` |
| Track | `.pw-track { position:absolute; left:0; top:8px; display:flex; gap:24px; padding:0 12px; width:max-content }` |
| Track animation | `@keyframes pw-slide { from{transform:translateX(0)} to{transform:translateX(-50%)} }` · `animation: pw-slide 70s linear infinite` · `:hover { animation-play-state: paused }` |
| Tile | `inline-flex; radius 20; border **3** #1C1B33; bg #fff; overflow hidden`; `PhotoWallFrame` **230 x 724** |
| Name pill | `absolute; left 12; right 12; bottom 12`; inner span `bg #fff; border 3 #1C1B33; radius 999; pad 0 16; h38; 18/700; text-overflow ellipsis` |
| `MỚI` tag | `absolute; top 70; left 14; h36; pad 0 16; radius 999; bg #FBBC04; border 3 #1C1B33; 18/800; gap 8` + icon. Shown for **6 s** after arrival **[C]** (DESIGN-D03) |
| Edge fades | `absolute; top 0; bottom 0; width 80px`. Left: `linear-gradient(90deg, rgba(255,255,255,.95), rgba(255,255,255,0))`. Right: the `270deg` mirror |
| Counter card | `radius 32; bg **#34A853**; border 3 #1C1B33; shadow 4px 4px 0 #1C1B33; pad 28 36; color #fff` |
| — number | Unbounded **132 / .95**, weight 800, `letter-spacing -.02em` |
| — caption | Unbounded **32**, weight 700, `letter-spacing .06em` — `KHOẢNH KHẮC` |
| QR card | `.card` `radius 32; pad 32; shadow 4px 4px 0; align-items centre; gap 20`; inner white box `pad 16; radius 16` holds the QR |
| CTA text | `Đến lượt bạn` Unbounded **40/800**; below `Quét QR để lên Wall` **24/600** `#5B5975` with icon, gap 12 |
| Footer strip | `height 112; padding 0 64; justify-content centre; bg #fff; border-top 3px #1C1B33` |
| Logo row | `gap 20`; see §8 for the per-logo rules |

#### Marquee implementation contract **[C]**
- The track content is **duplicated** and the animation runs to `-50%`, which is what makes the
  loop seamless. Render the list twice.
- Speed is stated two ways on two boards: **~70 s per loop** (D29) and **~40 px/s** (D29/D30).
  With ~14 tiles of 230 px + 24 gap ≈ 3 556 px per copy, 70 s gives ≈ 51 px/s. Treat **duration
  70 s** as the canonical value and let px/s follow from the tile count, or make speed
  configurable (M02 exposes a `px/giây` setting). **[C]** / **[I]**
- A newly approved photo is **inserted at the head of the track** (right side). The track must
  not re-layout or jump when this happens. **[C]**
- Minimum font size anywhere on this screen: DESIGN-D30 says **18 px**, DESIGN-D29 says **22 px**.
  The smallest text actually drawn is **18 px** (name pill). Use **18 px** as the floor. **[C]**
- Hide the cursor; self-reload every 6 hours. **[C]**

> **As built** (`features/display/conveyor.ts`). A track rendered twice and animated to `-50%`
> cannot take an insertion or a removal without its width, and so its `-50%`, changing — the
> jump this contract forbids. The marquee is therefore a conveyor: tiles in numbered slots on
> an endless tape moving left, the next photo laid just past the right edge, a strip landing at
> the head or leaving making room by an eased one-slot shift. Same seamless loop, read one tile
> at a time. Pace: `marqueePxPerSec`, else **40 px/s** (D29/D30). **[I]**
>
> The decor square is **not drawn**: at `left 1232; bottom -60` it sits on top of the AWS disc in
> the footer, or wholly under the footer if the footer is stacked above it. Pending a decision
> from design. **[I]**
>
> The stage takes the window's shape instead of letterboxing (`features/display/stage.ts`): a
> 16:9 window shows the artboard exactly; a wider one (a browser with its toolbar) widens the
> marquee while the 516 column keeps its size; a taller one splits the extra height above the
> header and above the footer. The footer strip always runs edge to edge. **[I]**
>
> D02 card, as built: the strip is **208 wide** so it fills the card's height, the text column is
> centred beside it, names get up to four lines at 52 px, and three confetti chips moved off the
> text — (540, 150) → (540, 84), (520, 380) → (536, 596), (470, 560) → (462, 636). **[I]**

---

### DESIGN-D19 — D02 Màn hình lớn · ảnh vừa lên

Everything from D01, plus an arrival sequence.

| Element | Spec |
|---|---|
| Dim layer | `.pw-dim { position:absolute; inset:0; border-radius:24px; background: rgba(250,247,242,.55) }`, `animation: pw-dim .4s ease-out both` — dims **the marquee viewport only**, not the whole screen |
| Arrival card | `.pw-arrive`: `position absolute; left 50%; margin-left -300px; bottom 0; width 600; height 690; border-radius 32px 32px 0 0; background **#FBBC04**; border **4px** #1C1B33; box-shadow **8px 0 0 #1C1B33**; display flex; align-items flex-end; gap 32; padding 0 32; overflow hidden` |
| Arrival animation | `@keyframes pw-rise { from{transform:translateY(112%)} to{transform:translateY(0)} }` · `.7s cubic-bezier(.2,.8,.2,1) both` |
| Confetti inside card | 7 chips, all `border 3 #1C1B33`, at fixed positions: `(20,30) 26px red r6 rot20` · `(500,24) 22px blue circle` · `(540,150) 30px green r8 rot-15` · `(40,240) 18px yellow circle` · `(520,380) 24px red r6 rot35` · `(30,480) 30px blue circle` · `(470,560) 16px green r4 rot10` |
| Strip in card | `inline-flex; bottom -40; border 4 #1C1B33; radius 16; shadow 4px 4px 0 #1C1B33; transform rotate(-3deg)` |
| Card text | green pill `h44 / 20px` `Vừa lên Wall!` · name Unbounded **52 / 1.05** 800 · body **24 / 1.35** 600 `Dải ảnh của bạn đang bay vào Wall — tìm nó ở đầu hàng bên phải nhé.` · pill `h40 / 18px` `Khoảnh khắc #329` |
| `+1` badge | on the counter card: `absolute; right -14; top -18; h44; pad 0 16; radius 999; bg #FBBC04; border 3 #1C1B33; color #1C1B33;` Unbounded **24/800**. Auto-hides after **1.5 s** **[C]** |
| Counter roll | old number slides up, new slides in, **400 ms decel**; the whole block pulses `scale(1.02)` **[C]** |
| Sequence | rise 700 ms → hold **5 s** → shrink and fly to the head of the track (600 ms) where it becomes a `MỚI` tile. **The marquee never stops during any of this.** **[C]** |
| Queue rule | max **3** cards queued; beyond that they merge into `+N dải ảnh mới`. Marked *"Trong spec"* on DESIGN-D32 — i.e. **not drawn, must be built**. **[C]** |

---

### DESIGN-D20 — M00 Đăng nhập BTC · route `/mod` (signed out)

1280 × 800.

| Element | Content |
|---|---|
| Heading | `Kiểm duyệt Photo Wall` |
| Sub | `Chỉ dành cho ban tổ chức` |
| Body | `Đăng nhập bằng tài khoản Google đã được GDGoC thêm vào danh sách kiểm duyệt. Khách tham gia không cần đăng nhập.` |
| Button | Google "G" mark + `Đăng nhập bằng Google` |
| Error banner | `**minhtriet@gmail.com** chưa có quyền kiểm duyệt. Nhờ Admin GDGoC thêm bạn trong Cài đặt → Người kiểm duyệt.` |
| Footer | `Phiên hết hạn sau 12 giờ` · link `Về trang khách →` |

The board is drawn **in its error state** — build both the clean and the error state. **[C]**

> **As built** (`pages/ModLogin.tsx`). Measured off the 3x export: card **520** wide, pad **36**,
> radius 20, shadow-2; tile 48 / radius 12 with `admin_panel_settings`; title Unbounded **24/800**;
> sub Body S; the sign-in button is the screen's **one primary** (L, blue, white "G" disc 22);
> banner red-100 / radius 16 with a red `block` icon and ink text; footer split left/right.
> Decor: a yellow-500 disc 220 at `(-60, -60)` and a blue-500 tile 160 / radius 32 rotated
> **12°** at `right 80, bottom -40`, both with a **3 px** ink outline. **[I]**

---

### DESIGN-D21 — M01 Kiểm duyệt · route `/mod`

1280 × 1080, `bg #FAF7F2`. **Fixed 1280 — no mobile layout.** **[C]**

#### Layout hierarchy
```
Root 1280x1080
├── Header  pad 24 32 0, space-between
│   ├── [logo tile 44] + title block
│   └── [330 dải ảnh][Đang nhận ảnh][⚙ 36][Lan · Admin GDGoC][⎋ 36]
├── Tab row pad 20 32 0, space-between
│   ├── Chờ duyệt (3) | Đã duyệt · 325 | Đã gỡ · 2
│   └── sort select
├── Helper line
├── Table
│   ├── header row (bg #F1EEE7, .lbl)
│   └── rows
├── Bulk bar (when rows selected)
└── Remove dialog (overlay)
```

| Element | Spec |
|---|---|
| Logo tile | `44x44; radius 12; bg #1C1B33; color #fff`, icon |
| Title | Unbounded `24 / 1.1` 700 — `Photo Wall · Kiểm duyệt` |
| Sub | `13 #5B5975` — `Duyệt · gỡ · khôi phục — mọi thay đổi lên màn hình lớn ngay` |
| Header pills | all `h36 / 13px`. Count pill neutral. **Uploads-open pill** `bg #CEEAD6; color #188038` (it is a button — tapping it toggles uploads). User pill `bg #1C1B33; color #fff`. Two `.ibtn` at 36 (settings, sign out) |
| Tabs | `h40; pad 0 16; gap 8; Body S 600`. Selected `bg #1C1B33; color #fff`. Hover `bg #F1EEE7`. Focus ring 3. Count badge `20px; radius 999; pad 0 8;` Label 800, tinted per tab (`#FBBC04` for pending) |
| Tab semantics | `role="tablist" / role="tab" / aria-selected` **[C]** |
| Sort | select `Mới nhất trước` / `Chờ lâu nhất trước` |
| **Table grid** | `grid-template-columns: 44px 96px minmax(0,1fr) 170px 330px 220px; gap 16` **[C]** |
| Row padding | `10px 20px`; row divider `2px solid #DAD6CE`; header `bg #F1EEE7` with `.lbl` |
| Columns | `Ảnh` · `Người gửi` · `Thời gian` · `Trạng thái · lý do` · `Hành động` |
| Thumb | `44` wide, `radius 8`, correct 1:3.148 ratio |
| Name / meta | name Body 700; meta Body S `#5B5975` — `#131 · khung F03 · phiên a3f9…131` |
| Time | `14:34` plus a waiting line `chờ 1 phút` which turns **red when > 3 minutes** **[C]** |
| Status | pill 32 + reason chip 22 |
| Actions | **S (40 px)** buttons only — `Duyệt` (success) and `Gỡ` (destructive); approved rows show only `Gỡ`; removed rows show only `Khôi phục` **[C]** |
| Helper | `Mục tiêu < 3 phút / ảnh. … Phím tắt: **A** duyệt · **R** gỡ · **↑↓** chọn dòng.` — **keyboard shortcuts are a requirement** **[C]** |
| Empty (pending) | `Hết hàng chờ · ảnh mới tự hiện lên đầu danh sách, không cần tải lại` |
| Bulk bar | `2 dải ảnh đã chọn` · `Bỏ chọn` · `Duyệt 2 ảnh` · `Gỡ 2 ảnh`; row selection = checkbox 24 + `bg blue-0` tint; hover `bg` cream **[C]** |
| Removed-tab note | `Ảnh đã gỡ giữ **24 giờ** rồi xoá hẳn; người gửi thấy "Đã gỡ bởi BTC" (không hiện lý do). Khôi phục → quay lại Đã duyệt và lên màn hình lớn ở đầu băng.` |

#### Remove dialog
`Gỡ dải ảnh của Đức Huy?` / meta `#131 · 14:34 · SafeSearch: violence · LIKELY` /
`Lý do (ghi log nội bộ, người gửi không thấy)` with three choices
`Không phù hợp` · `Trùng / lỗi ảnh` · `Người gửi yêu cầu` /
explanation / `Huỷ` (left) + `Gỡ ảnh` (right, destructive).

Dialog spec: `width 342` on mobile / centred on desktop, `pad 24`, `radius 20`,
`shadow 4px 4px 0 #1C1B33`, scrim `rgba(28,27,51,.55)`, open `200 ms scale .96 → 1`,
`Esc`/scrim = Cancel, focus trap, return focus to the opener, `aria-modal` + `aria-labelledby`. **[C]**

> **As built** (`pages/ModQueue.tsx`, `features/moderation/*`). The M01 board supersedes a few
> rows above: the header subtitle reads `Duyệt · gỡ · khôi phục — …`; only `Chờ duyệt` carries a
> badge (yellow, 16 tall), the other tabs read `Đã duyệt · 325` inline; the toolbar has a search
> field (280 × 48, name or #id, Vietnamese marks folded) before the sort select (170 × 48); the
> table is one card filling the window with the helper line under its header; rows are 10 · 20 ·
> 10 · 10 padded (the checkbox centred in the first 44), `Gỡ` in a row is the secondary button in
> red, and every row has a 40 zoom button that opens the strip at reading size. The bulk bar is
> the card's ink footer (64 tall). SafeSearch chips are replaced by `Chế độ duyệt tay` (§20.5 #3);
> approved rows show `Lan duyệt · 14:32`, removed rows `Lan gỡ · 14:20 · còn 23 h`. The row cursor
> appears only once the keyboard is used, and a first `A`/`R` only reveals it. **[I]**

---

### DESIGN-D22 — M02 Cài đặt sự kiện · route `/mod/settings`

1280 × 1440. Header: `Cài đặt sự kiện` / `Chỉ Admin GDGoC thấy trang này · mọi thay đổi có hiệu
lực ngay và được ghi log`, with `Huỷ thay đổi` and `Lưu`.

| Section | Rows drawn on the board |
|---|---|
| **Nhận ảnh** | `Đang nhận ảnh` (toggle, **Admin** tag) — *"Tắt → khách thấy màn 'Đã đóng nhận ảnh', vẫn tải dải ảnh của mình được"* · `Tự động đóng lúc` (time, local) · `Giới hạn mỗi phiên` (**n** bộ ảnh / phiên · 1 bộ / phút) · `Cho phép chọn ảnh từ thư viện` — *"Tắt nếu cần ảnh chụp tại chỗ 100%"* |
| **Kiểm duyệt** | `Tự động duyệt` (**Admin**) — *"Ảnh không bị SafeSearch gắn cờ lên Wall ngay; tắt → mọi ảnh vào Chờ duyệt"* · `Ngưỡng SafeSearch` (adult · violence · racy) · `Giữ ảnh đã gỡ` (**n** giờ rồi xoá hẳn) |
| **Màn hình lớn** | `Tốc độ trượt` (px/giây) · `Hiện tên người gửi` — *"Tắt nếu có yêu cầu ẩn danh toàn sự kiện"* · `Card "Vừa lên Wall"` (**Admin**) · `Link trong mã QR` + `Mở /display` · `Làm mới màn lớn` |
| **Khung ảnh** | `Trạng thái khung · bộ khung BTC (3)` with badge **`Đã khoá · duyệt 24.09`**; one row per frame with its file name; note: *"Khách chọn 1 trong các khung đang bật. Tắt khung → màn Chọn khung ẩn thẻ đó; nếu chỉ còn 1 khung thì tự chọn sẵn. **Thứ tự trên màn Chọn khung = thứ tự ở đây.**"* |
| **Dữ liệu** | `Tải toàn bộ dải ảnh (.zip)` · `Tạo video timelapse` · `Xuất danh sách tham gia (.csv)` · `Xoá toàn bộ dữ liệu sau sự kiện` (`Lên lịch 04.10 · cần 2 Admin xác nhận`). Note: *"Xuất chỉ gồm ảnh đang hiển thị. Ảnh đã gỡ không bao giờ vào bản xuất."* |
| **Người kiểm duyệt** | Avatar-initial rows: `Lan Phạm · lan@gdgoc.dev · Admin · GDGoC` · `Huy Trần · huy@gdgoc.dev · Admin · GDGoC` · `Mai Lê · mai@aws-sc.vn · Kiểm duyệt · AWS SC` · `Đức Nguyễn · duc@doanhoi.sgu · Kiểm duyệt · Đoàn hội`; role select `Kiểm duyệt`/`Admin` + `Thêm` |

> **Reality check — read §20.5 before building this screen.** The deployed backend's
> `config/app` document accepts **only** `{uploadsOpen, eventName}`, enforced by
> `firestore.rules`. Of the ~18 settings above, exactly **one** (`Đang nhận ảnh`) is currently
> writable. Build the screen in the order given in §22 Phase 9 and gate the rest.

> **As built** (`pages/ModSettings.tsx`, after `8fe65e9` widened the schema). Six cards in two 598
> columns (gap 20), pad 20 · 24, a 36 blue-100 tile per card; settings are one draft written by
> `Lưu` as a single `updateConfig` of the changed fields, actions (ZIP, CSV, `Làm mới màn lớn`,
> moderators, the wipe) run at once. `Tự động duyệt` and `Ngưỡng SafeSearch` are drawn **disabled**
> — no server runs SafeSearch (§20.5 #8). `Tự động đóng lúc` stores the next time the clock reads
> HH:MM. The last enabled frame cannot be switched off. The ZIP is written in the browser, stored
> (JPEGs do not deflate), with the file names `listZipEntries()` gives. **[I]**

---
## 7. Design System Extraction

This is **not** invented. DESIGN-D30 contains a literal CSS custom-property block; DESIGN-D01
documents the role of every token. Reproduce the block verbatim at `:root` of the app shell.

> **Rule from the design:** *"Không hard-code hex / px trong component — mọi số trên board 01 &
> 02 đều có token ở đây."* No raw hex or px in a component. If you need a value that has no
> token, you are probably doing something the design didn't intend. **[C]**

### 7.1 Colour — 24 tokens

#### Brand (the four Google colours, each with exactly one job)

| Token | Value | Contrast | Usage **[C]** |
|---|---|---|---|
| `--pw-blue-700` | `#1967D2` | 5.4:1 | **Primary.** Buttons, links, focus ring, selected tab. White text. |
| `--pw-blue-500` | `#4285F4` | — | Graphic blocks, decor, badges. **Never small white text on it.** |
| `--pw-blue-100` | `#D2E3FC` | — | Tonal button, info background, 3 px focus halo. |
| `--pw-blue-900` | `#174EA6` | — | Primary hover, link hover. |
| `--pw-yellow-500` | `#FBBC04` | 9.8:1 | **Look here.** Highlight, `MỚI` tag, viewfinder brackets, arrival card. Ink text. |
| `--pw-yellow-700` | `#B06000` | 4.6:1 | Warning **text** on yellow-100. |
| `--pw-yellow-100` | `#FEEFC3` | — | Soft warning, pending, the consent box. |
| `--pw-green-700` | `#188038` | 5.0:1 | **Done.** Upload complete, completed step, toggle on, `Duyệt`. |
| `--pw-green-500` | `#34A853` | — | Graphic blocks, the big-screen counter card, `BẠN` tag. |
| `--pw-green-100` | `#CEEAD6` | — | Success state, "accepting photos". |
| `--pw-red-700` | `#C5221F` | 5.8:1 | **Careful.** Remove, upload error, offline. |
| `--pw-red-500` | `#EA4335` | — | Decorative dots, small accents. **Never text.** |
| `--pw-red-100` | `#FAD2CF` | — | Error, offline banner, danger cell. |

#### Neutral

| Token | Value | Contrast | Usage **[C]** |
|---|---|---|---|
| `--pw-bg` | `#FAF7F2` | — | App and big-screen ground. **Never pure white as a page background.** |
| `--pw-surface` | `#FFFFFF` | — | Cards, secondary buttons, chips, inputs, photo tiles. |
| `--pw-surface-2` | `#F1EEE7` | — | Skeleton, code chip, table header, disabled surface. |
| `--pw-line` | `#DAD6CE` | — | Table rules, future-step border, disabled button background. |
| `--pw-ink` | `#1C1B33` | 15.7:1 | Primary text, **every 2 px outline**, hard shadows, camera background. |
| `--pw-ink-2` | `#5B5975` | 6.3:1 | Descriptions, helper text, timestamps, secondary icons. |
| `--pw-ink-3` | `#8D8BA3` | 3.3:1 | Placeholder, un-shot slot numbers, disabled text. |
| `--pw-ink-800` | `#26253F` | — | Dark surface: viewfinder box, cards on the camera screen. |
| `--pw-ink-700` | `#3D3B5C` | — | Border on dark. |
| `--pw-on-dark-2` | `#C9C6DA` | 10:1 | Description text on dark. |
| `--pw-on-dark-3` | `#B8B5D1` | 8.4:1 | Labels / meta on dark. |
| `--pw-scrim` | `rgba(28,27,51,.55)` | — | **The only translucent overlay in the product** — dialog scrim, and the marquee dim. |
| `--pw-partner-aws` | `#3BB0FF` | — | **Only** the AWS circular badge background. Never elsewhere in UI. |

#### Colour discipline — memorise this

```
Blue   = do this        (exactly ONE primary button per screen)
Yellow = look here
Green  = it worked
Red    = be careful     (always with an icon AND words, never colour alone)
```
**[C]** (DESIGN-D01)

Placeholder pastels (`--pw-ph-*`) and the `rgba(28,27,51,.28)` silhouette gradients seen in the
artboards are **mock-up only** — production shows real photographs. **[C]**

### 7.2 Typography — exactly 10 styles

Two families. `Unbounded` (display) and `Be Vietnam Pro` (everything else), both from Google
Fonts `css2`, **Vietnamese subset**, `display=swap`, two woff2 preloaded. **[C]**

| Token | Font · weight | Size / line-height | Letter-spacing | Used for |
|---|---|---|---|---|
| `--pw-type-display` | Unbounded 800 | `64 / .95` | `-.01em` | Welcome hero, countdown digits. Big screen uses its own scale: **132 / 84 / 40**. |
| `--pw-type-h1` | Unbounded 800 | `32 / 1.1` | 0 | Screen title, max 2 lines. |
| `--pw-type-h2` | Unbounded 700 | `24 / 1.2` | 0 | Big block title, moderation page title, confirm question. |
| `--pw-type-h3` | Unbounded 700 | `20 / 1.25` | 0 | Dialog title, section title, state card title. |
| `--pw-type-title` | Unbounded 600 | `16 / 1.3` | 0 | Top-bar title, card and settings-section title. |
| `--pw-type-body-l` | Be Vietnam Pro 600 | `17 / 1.5` | 0 | L button, L input, hero lead. |
| `--pw-type-body` | Be Vietnam Pro 400 | `15 / 1.5` | 0 | Description, form label (at 700), M button, sender name, toast. |
| `--pw-type-body-s` | Be Vietnam Pro 400 | `13 / 1.45` | 0 | Helper, caption, S button, tab, table cell, banner. |
| `--pw-type-caption` | Be Vietnam Pro 600 | `12 / 1.4` | 0 | Pill, timestamp, icon-button label, tag. |
| `--pw-type-label` | Be Vietnam Pro 700 | `11 / 1.2` | `.08em` | **UPPERCASE** group labels, table columns, frame numbers. |

> **Hard rule:** *"Chỉ 10 style trên toàn sản phẩm. Không tạo cỡ 14 / 16 (body) hay 18 / 22 / 30
> (heading)."* Smallest text on mobile = **11 px** (Label, uppercase, ≥ 6:1). Smallest on the big
> screen = **18 px**. **[C]**

### 7.3 Spacing — base 4

| Token | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 |
|---|---|---|---|---|---|---|---|---|---|---|
| px | 4 | 8 | 12 | 16 | 20 | 24 | 32 | 40 | 48 | 64 |

| Context | Value **[C]** |
|---|---|
| Mobile screen gutter | **20** |
| Desktop gutter | **32** |
| Big screen gutter | **64** |
| Inside a group | 8 |
| Between groups | 16 |
| Between sections | 24 |
| Between two adjacent buttons | 12 |
| Photo grid gap | 12 |
| Bottom padding on a screen with a CTA | 32 (+ `env(safe-area-inset-bottom)`) |

> **Forbidden values: 6 / 10 / 14 / 18 / 22 / 28.** **[C]**

### 7.4 Border radius

| Token | px | Used on **[C]** |
|---|---|---|
| `--pw-radius-1` | 4 | small tag, code chip, **frame-option thumbnail wrapper** |
| `--pw-radius-2` | 8 | strip thumbnail, checkbox |
| `--pw-radius-3` | 12 | tray cell, M input, swatch, frame-option card |
| `--pw-radius-4` | 16 | small card, L input, tile, toast, banner |
| `--pw-radius-5` | 20 | card, viewfinder, dialog, big-screen tile |
| `--pw-radius-6` | 24 | hero block, icon disc, marquee viewport |
| `--pw-radius-7` | 32 | big-screen cards (counter, QR, arrival) |
| `--pw-radius-full` | 999 | buttons, pills, chips, toggle |

Rule: **child radius ≤ parent radius − parent padding.** The exported PNG frame has **square
corners** (it is meant to be printed/cut). **[C]**

### 7.5 Outline, shadow, focus

| Token | Value | Where **[C]** |
|---|---|---|
| `--pw-outline` | `2px solid var(--pw-ink)` | **every** container in the mobile app |
| `--pw-outline-strong` | `3px solid var(--pw-ink)` | big screen only, and the active capture slot |
| `--pw-shadow-1` | `3px 3px 0 var(--pw-ink)` | primary / success buttons, toast |
| `--pw-shadow-2` | `4px 4px 0 var(--pw-ink)` | hero card, dialog, floating strip, big-screen cards |
| `--pw-focus` | `0 0 0 3px var(--pw-blue-700)` | focus halo |
| Pressed | `translate(2px, 2px)` **and remove the shadow** | all buttons |

> **No blur. No gradients. No glassmorphism.** Shadows are hard, offset, ink-coloured. **[C]**
> (The only gradients in the whole design are the two 80 px white edge fades on the marquee.)

### 7.6 Z-index layers **[I]**

The design never states z-index numerically. Derived from stacking order actually drawn:

| Layer | Suggested | Contents |
|---|---|---|
| base | 0 | page content |
| sticky bottom CTA | 10 | mobile CTA block |
| overlay chrome | 20 | camera controls above the viewfinder |
| marquee dim | 30 | `.pw-dim` |
| arrival card | 40 | `.pw-arrive` |
| toast | 50 | `pw-toast` |
| scrim | 60 | dialog scrim |
| dialog | 70 | `pw-dialog` |

Within `PhotoWallFrame` the order **is** confirmed: `PhotoSlot01..04` below, `FrameOverlay`
above. **[C]**

### 7.7 Breakpoints and container widths

| Name | Range | Gutter | Behaviour **[C]** |
|---|---|---|---|
| Mobile | 360–430 | 20 | Capture flow is one column. **No Wall.** Test at 360 (Galaxy A) and 430 (iPhone Pro Max). |
| Tablet | 768–1023 | 32 | Flow keeps a **430 px centred column**, cream ground + pattern at the sides. |
| Desktop | ≥ 1024 | 32 | Content max **1200**. Moderation is a fixed **1280**. |
| Big screen | 1920 × 1080 | 64 | Own route, own layout: marquee `1236 × 760` + right column `516`. |

Buttons never stretch beyond **342 px** (= 390 − 2×20 − …) on wide screens. **[C]**

### 7.8 Motion tokens

| Token | Value | Used for **[C]** |
|---|---|---|
| `--pw-dur-1` | `80ms` | button press |
| `--pw-dur-2` | `160ms` | hover, release, frame crossfade |
| `--pw-dur-3` | `240ms` | screen transition |
| `--pw-dur-4` | `360ms` | item entering the big-screen track |
| `--pw-dur-5` | `700ms` | big-screen arrival card |
| `--pw-ease-std` | `cubic-bezier(.2,0,0,1)` | default |
| `--pw-ease-decel` | `cubic-bezier(0,0,0,1)` | entering |
| `--pw-ease-accel` | `cubic-bezier(.3,0,1,1)` | leaving |

### 7.9 Control sizes — three, no odd sizes

| Control | **L** (mobile CTA) | **M** (dialog, desktop) | **S** (tab, table, chip) |
|---|---|---|---|
| Button | `56` · pad-x 24 · Body L 600 · icon 24 | `48` · pad-x 20 · Body 600 · icon 20 | `40` · pad-x 16 · Body S 600 · icon 16 |
| Icon button | `56` (camera, dark) | `48` (default, ≥ touch target) | `32` (pill tool: timer, mirror) |
| Input / Select | `56` · radius 16 · Body L 500 | `48` · radius 12 · Body 500 | `40` · radius 12 · Body S 500 |
| Pill / Chip / Tag | `32` (name, status-with-icon) | `28` (default, steps) | `24` (tags `MỚI` / `BẠN` / `Admin`) |
| Toggle / Checkbox | — | Toggle `48×28`, knob 20 | Checkbox `24`, radius 8, check 16 |
| Icon | `32`, `48` hero/state disc | `24` bar & button | `20` M button, `16` pill / S button / meta |

Rules: same level = same size. Two buttons at the bottom of a screen are **always L**. Actions
inside the moderation table are **always S**. Minimum touch target **48 × 48** (pill 32 and tag
24 are display-only, not tappable). **[C]**

### 7.10 Material Web bridge

```css
--md-sys-color-primary: var(--pw-blue-700);
--md-sys-color-error:   var(--pw-red-700);
--md-sys-shape-corner-full: 999px;
--md-ref-typeface-plain: var(--pw-font-body);
```
**[C]** — set these so Material Web components inherit the PhotoWall palette.

### 7.11 Icons

Material Symbols Outlined, weight 500 (`FILL 1` when active), **inlined as SVG** from
`@material-symbols/svg-500`. Sizes 16 / 20 / 24 / 32 / 48. Never an icon font, never emoji. **[C]**

---

## 8. Organization / Brand Assets

### 8.1 The six organisations and their fixed order

This order appears **twice** in the design, identically, and is therefore a design invariant:
in the big-screen footer strip (DESIGN-D18/D19) and inside the F03 frame artwork (DESIGN-D28).

```
1. Đoàn TNCS Hồ Chí Minh          logo-doan.png
2. Đại học Sài Gòn (SGU)          logo-sgu.png
3. Hội Sinh viên Việt Nam         logo-hsv.png
4. Khoa CNTT — ISF, SGU           logo-isf-cntt.png
                       ×
5. GDGoC on Campus · SGU          logo-gdgoc-brackets.png
                       ×
6. AWS Student Builder Groups     badge-aws.png
```

The `×` separators sit **after item 4 and after item 5**, grouping the row as
`[Đoàn hội Khoa CNTT] × [GDGoC] × [AWS]`. **[C]**

> A **different** order is used in the plain-text partner line on S01 and E03:
> `GDGoC × Đoàn hội Khoa CNTT × AWS Student Club`. Both are confirmed; they are not
> interchangeable. Use the text order for the text strip, the logo order for the logo row. **[C]**

### 8.2 Per-asset rules

| # | Asset | Source size | Alpha | Disc treatment on the big screen **[C]** |
|---|---|---|---|---|
| 1 | `logo-doan.png` | 600×600 | yes | `76×76` disc, `border 4 #1C1B33`, `radius 50%`, `bg #fff`, **`padding 3.8px`**, `object-fit contain` |
| 2 | `logo-sgu.png` | 597×600 | yes | same as #1 |
| 3 | `logo-hsv.png` | 599×600 | yes | same as #1 |
| 4 | `logo-isf-cntt.png` | 600×600 | yes | same as #1 |
| 5 | `logo-gdgoc-brackets.png` | **370×179** | yes | same disc, but **`padding 15.2px`** — the mark is 2.07:1, so it needs more inset to look optically equal |
| 6 | `badge-aws.png` | **640×640** | **no** | disc with **`background: #3BB0FF`**, **no padding**, **`object-fit: cover`** — it is a square poster cropped into the circle, not a transparent mark |

Both exceptions are deliberate and measured. Reproduce them exactly.

### 8.3 Brand rules — non-negotiable

| Rule | Why |
|---|---|
| **Never recreate a logo** in CSS, hand-drawn SVG, AI-generated shapes, or text. Use the PNG in `frontend/public/logos/`. | These are official marks of real organisations. **[C]** (DESIGN-D25: *"logo, chữ, sticker, màu đúng như BTC gửi"*) |
| **Never change a logo's aspect ratio.** `object-fit: contain` (or `cover` for AWS) only. No `width:100%;height:100%` stretching. | §33 invariant |
| **Never recolour a logo**, including the AWS badge. | **[C]** |
| **Never reorder** the six logos. | **[C]** |
| **Never redraw the frame artwork.** The three frame PNGs are organiser-supplied art. | **[C]** (DESIGN-D24) |
| `--pw-partner-aws` (`#3BB0FF`) is used **only** as the AWS disc background. | **[C]** |

### 8.4 Google ecosystem marks inside the frame artwork

The F01 artwork contains Google Cloud, Firebase, Gemini and Google "G" sticker marks, and the
F02 artwork contains the AWS wordmark. **These live inside the PNG.** The frontend never draws
them separately and must never composite anything over the overlay layer. **[C]**

---

## 9. Asset Manifest

### 9.1 Extracted and committed by this handoff

All nine were pulled out of the design canvas's asset store and written into the repository
so they no longer depend on the design being reachable.

| Asset | Repo path | Size | Format | Used by | Requirement |
|---|---|---|---|---|---|
| Frame F01 GDGoC | `frontend/public/frames/frame-f01-gdgoc.png` | 1080×3400, 1.99 MB | PNG **RGBA** | canvas export, all previews | true alpha in the 4 photo windows; **never rescale non-uniformly** |
| Frame F02 AWS | `frontend/public/frames/frame-f02-aws.png` | 1080×3400, 2.03 MB | PNG **RGBA** | same | same |
| Frame F03 Partners | `frontend/public/frames/frame-f03-partners.png` | 1080×3400, 236 KB | PNG **RGBA** | same | same |
| Frame registry | `frontend/public/frames/frames.json` | — | JSON | frame engine | slot geometry, see §19 |
| Đoàn | `frontend/public/logos/logo-doan.png` | 600×600, 124 KB | PNG RGBA | big-screen footer | original asset, contain, ratio locked |
| SGU | `frontend/public/logos/logo-sgu.png` | 597×600, 174 KB | PNG RGBA | big-screen footer | same |
| HSV | `frontend/public/logos/logo-hsv.png` | 599×600, 75 KB | PNG RGBA | big-screen footer | same |
| ISF / Khoa CNTT | `frontend/public/logos/logo-isf-cntt.png` | 600×600, 160 KB | PNG RGBA | big-screen footer | same |
| GDGoC brackets | `frontend/public/logos/logo-gdgoc-brackets.png` | 370×179, 11 KB | PNG RGBA | big-screen footer | padding 15.2 in the 76 disc |
| AWS badge | `frontend/public/logos/badge-aws.png` | 640×640, 32 KB | PNG **RGB, no alpha** | big-screen footer | `cover` + `#3BB0FF` background |

### 9.2 Assets named by the design but NOT present

DESIGN-D30's asset list names two GDGoC variants; only one was ever uploaded to the canvas.

| Expected name | Status | Action |
|---|---|---|
| `logo-gdgoc-brackets.png` | **present** (370×179) | — |
| `logo-gdgoc-lockup.png` | **missing** | Not used by any artboard. Ask BTC only if a horizontal lockup is wanted somewhere. §31 Q3 |

### 9.3 Assets still to be produced

| Asset | Owner | Notes |
|---|---|---|
| QR code image / component | frontend | Generated at build time from the deploy URL. Black modules on white, quiet zone ≥ 4 modules, **nothing overlaid on it**. **[C]** |
| Favicon / app icon | **[U]** | Not in the design. §31 Q8 |
| Open Graph image | **[U]** | Not in the design. §31 Q8 |
| `Unbounded` + `Be Vietnam Pro` woff2 | frontend | Two files preloaded; the rest via Google Fonts `css2` link with `display=swap`, Vietnamese subset. **[C]** |

### 9.4 Quality notes on the supplied frames **[C]**

Recorded verbatim on DESIGN-D24, because it affects download quality:

- F01 and F02 originate from a **725 × 2170** source (ratio 0.334) upscaled **1.567×** to 1080×3400.
  Fine for the Wall and the big screen; a native ≥ 1080 × 3400 original would make the
  **downloaded file** sharper.
- F01: after upscaling, **18 px of cloud background was trimmed from each side** (the measured
  table records 28 px/side) — no logo, text or sticker was touched.
- F02: text runs close to both edges, so instead of trimming it was **horizontally compressed by
  4.9 %**. Below the visible-difference threshold, but recorded.
- F03: drawn natively at 1080 × 3400 on the F-SPEC grid — its four slots land exactly on the
  canonical grid, and its six partner logos are the organisers' original files, only scaled down.

**Ask the organisers for ≥ 1080 × 3400 originals of F01 and F02 before the event.** §31 Q1.

### 9.5 Obsolete assets in the design canvas — do not import

The canvas asset store holds **21** PNGs; only **9** are referenced by the current artboards.
The other 12 are superseded iterations of the frame artwork (earlier crops and chroma-key
passes, uploaded 2026-09-21). They are intentionally **not** copied into the repo. If someone
later reopens the canvas, the only valid frame blobs are:

```
frame-f01-gdgoc   = /_blob/565d7cd587aa13a59fdc19facca18c84
frame-f02-aws     = /_blob/374664b4b11470f6e5f2611fff6dde54
frame-f03-partners= /_blob/a01555a2b3252006f330fc65c99fd246
```

### 9.6 Recommended final asset organisation

```
frontend/public/
├── frames/
│   ├── frames.json              ← the registry; single source of slot geometry
│   ├── frame-f01-gdgoc.png
│   ├── frame-f02-aws.png
│   └── frame-f03-partners.png
├── logos/
│   ├── logo-doan.png
│   ├── logo-sgu.png
│   ├── logo-hsv.png
│   ├── logo-isf-cntt.png
│   ├── logo-gdgoc-brackets.png
│   └── badge-aws.png
└── fonts/
    ├── unbounded-latin-vietnamese.woff2
    └── be-vietnam-pro-latin-vietnamese.woff2
```

Frames and logos live in `public/` (not `src/assets/`) deliberately: the frame PNG is fetched at
runtime by the canvas compositor using the path from `frames.json`, and adding frame F04 must
be *"1 PNG + 1 line of JSON, no code change"*. **[C]**

---

## 10. Component Architecture

### 10.1 Framework decision

DESIGN-D30 states the stack outright: **`Lit + Material Web`**, `Firebase Auth · Firestore ·
Storage`, `Canvas API` for composition, `GA4`. **[C]**
`docs/frontend-integration.md` on the `backend` branch assumes **Vite** and a `frontend/dist`
build output (already wired in `firebase.json`). **[C]**

> **Superseded 2026-09-22 — the project lead chose React.**
> **Stack: Vite + React 19 + TypeScript**, CSS Modules for layout and one global stylesheet for
> the design-system primitives, split into **three separate apps** (mobile `/`, display
> `/display/`, admin `/admin/`) built as a Vite multi-page app and served from the single
> Firebase Hosting target.
>
> This changes the component *technology* only. Every measurement, colour, state, interaction,
> motion curve and invariant in this document is unchanged and still binding.
>
> The `pw-*` tag names below are kept as the **naming map** between design and code: the Lit tag
> `pw-button` is the React component `Button` in `components/Button.tsx`, `pw-photowall-frame` is
> `PhotoWallFrame`, and so on. §36 carries the actual file paths.

The global class names the design itself used on its artboards (`.btn`, `.btn-p`, `.ibtn`,
`.card`, `.pill`, `.lbl`, `.input`, `.u`) are reproduced in `src/styles/base.css`, so a value can
be traced from artboard to stylesheet without a lookup table.

### 10.2 Directory layout

```
frontend/src/
├── app/
│   ├── pw-app.ts               root element; :root tokens; router outlet
│   ├── router.ts               route table (§5)
│   └── backend.ts              initBackend() singleton
├── components/
│   ├── controls/               DESIGN-D02
│   │   ├── pw-button.ts
│   │   ├── pw-icon-button.ts
│   │   ├── pw-input.ts
│   │   ├── pw-select.ts
│   │   ├── pw-toggle.ts
│   │   ├── pw-checkbox.ts
│   │   ├── pw-setting-row.ts
│   │   ├── pw-pill.ts
│   │   ├── pw-tag.ts
│   │   ├── pw-steps.ts
│   │   ├── pw-tabs.ts
│   │   └── pw-topbar.ts
│   ├── patterns/               DESIGN-D03
│   │   ├── pw-toast.ts
│   │   ├── pw-progress.ts
│   │   ├── pw-skeleton.ts
│   │   ├── pw-dialog.ts
│   │   ├── pw-state.ts         empty / loading / error
│   │   └── pw-photo-card.ts
│   └── icons/
│       └── icon.ts             inline Material Symbols sprite
├── features/
│   ├── capture/
│   │   ├── pw-camera.ts        viewfinder + tray + controls
│   │   ├── use-camera.ts       getUserMedia, facingMode, mirror, timer
│   │   └── shot-store.ts       the 4 shots + IndexedDB persistence
│   ├── frames/
│   │   ├── pw-photowall-frame.ts   THE core component (§19)
│   │   ├── pw-frame-option.ts
│   │   ├── frame-registry.ts       loads & validates frames.json
│   │   └── compose.ts              canvas composition + JPEG export (§18)
│   ├── submit/
│   │   ├── upload-controller.ts    ensureGuest → submitPhoto → resume
│   │   └── download.ts             objectURL + <a download>
│   ├── display/
│   │   ├── pw-marquee.ts
│   │   ├── pw-strip-tile.ts
│   │   ├── pw-counter.ts
│   │   ├── pw-qr.ts
│   │   ├── pw-arrival-card.ts
│   │   ├── pw-partner-logos.ts
│   │   └── arrival-queue.ts        max 3 queued, merge to "+N"
│   └── moderation/
│       ├── pw-mod-row.ts
│       ├── pw-mod-table.ts
│       └── pw-mod-shortcuts.ts     A / R / arrow keys
├── pages/
│   ├── page-welcome.ts   page-name.ts     page-camera.ts
│   ├── page-shot-review.ts   page-frame.ts   page-review.ts
│   ├── page-upload.ts    page-done.ts     page-me.ts
│   ├── page-closed.ts    page-display.ts
│   └── page-mod.ts       page-mod-settings.ts
├── state/
│   └── session.ts        the guest session store (§12)
├── styles/
│   ├── tokens.css        §7 verbatim
│   └── reset.css
└── types/
    ├── frame.ts          FrameTemplate, PhotoSlotRect
    └── session.ts        CaptureSession, Shot
```

### 10.3 Component contracts

#### `pw-button` — DESIGN-D02

| | |
|---|---|
| Responsibility | Every textual action in the product. |
| Props | `variant: 'primary'\|'secondary'\|'tonal'\|'success'\|'destructive'\|'text'` · `size: 'l'\|'m'\|'s'` (default `l`) · `fullWidth?: boolean` · `loading?: boolean` · `disabled?: boolean` · `iconStart?`/`iconEnd?` |
| State | none |
| Slots | default (label) |
| Events | `click` (native) |
| Reusable | yes |
| Rules | exactly one `primary` per screen; `success` only for `Dùng ảnh này` and `Duyệt`; `text` never stands alone as the CTA |

#### `pw-icon-button` — DESIGN-D02

Props `size: 48\|56\|32` · `tone: 'light'\|'dark'\|'accent'` · `label` (**required**, becomes
`aria-label`). A separate `shutter` variant renders the 84 px composite. **[C]**

#### `pw-input` — DESIGN-D02

Props `size` · `label` · `helper` · `error?` · `maxlength` · `counter?: boolean` ·
`prefixIcon?`/`suffixIcon?`. States: default / focus / filled / error / disabled.
Emits `input`, `change`. Error must render **border + halo + icon + text**, never colour alone. **[C]**

#### `pw-steps` — DESIGN-D02

Props `steps: {label:string}[]` · `current: number`. Renders 28 px chips:
done = `bg green-700 white + check`, current = `bg ink white`, todo = `bg #fff, text ink-2,
border line`. **Display only — not interactive.** **[C]**

#### `pw-topbar` — DESIGN-D02

Props `tone: 'light'\|'dark'` · `title` · `backHref?` · right slot.
Fixed `height 76`. The right slot is **always rendered at 48 px even when empty**, so the title
stays optically centred. **[C]**

#### `pw-photowall-frame` — DESIGN-D02 + D23 + D24 — **the core component**

| | |
|---|---|
| Responsibility | Render one photobooth strip at any size: 4 photo slots below, one PNG overlay above. |
| Props | `variant: FrameId` · `photos: (Blob\|string\|null)[4]` · `width: number` (height derives from `aspect-ratio: 1080 / 3400`) · `showSlotNumbers?: boolean` (empty-state) |
| State | none — pure |
| Structure | root `position:relative; aspect-ratio:1080/3400; overflow:clip` → `PhotoSlot01..04` absolutely positioned **in percent** → `FrameOverlay` `<img>` at `left:-1px; top:-1px; width:calc(100% + 2px); height:calc(100% + 2px); pointer-events:none` |
| Slot rendering | `object-fit: cover`, centre crop, `background #F1EEE7` while empty, `border-radius ≈ 5% of slot width` (36 px at 1080) |
| Sizes used in the product | **18** (option thumb) · **40–44** (camera hint, upload, mod row) · **84 / 90** (done) · **96–167** (samples, mobile grid) · **150** (frame select preview) · **168** (review) · **186** (my strip) · **230–300** (big-screen tile) · **1080** (export) **[C]** |
| Reusable | yes — it appears on 21 of the 32 artboards |

The `-1px / +2px` overlay inset is **deliberate**: it hides a 1 px seam between the overlay's
edge and the container border at fractional scales. Keep it. **[C]**

#### `pw-frame-option` — DESIGN-D02 / D09

Props `frame: FrameTemplate` · `index: number` · `selected: boolean`.
Emits `select`. `aria-pressed`. Exact geometry in §6 (DESIGN-D09). **[C]**

#### `pw-camera` — DESIGN-D03

| | |
|---|---|
| Responsibility | Viewfinder + 4-slot tray + 3 controls. |
| Props | `shotIndex: 1..4` · `shots: Shot[]` · `timerOn: boolean` · `mirrored: boolean` · `facing: 'user'\|'environment'` |
| State | `MediaStream`, countdown ticks |
| Events | `capture(Blob)` · `toggle-timer` · `toggle-mirror` · `switch-camera` · `pick-from-gallery(File)` · `denied` |
| Geometry | viewport `358×268` 4:3, radius 20, border 2 `#fff`; corner brackets 28–30 px / 4 px yellow; tray cells `72×54` radius 12 gap 12; controls: ibtn 56 / shutter 84 / ibtn 56, gutter 32, ≥ 24 px apart **[C]** |

#### `pw-dialog` — DESIGN-D03

Props `open` · `title` · `tone: 'destructive'\|'default'`. Emits `confirm`, `cancel`.
`width 342` (mobile fill, gutter 24), `pad 24`, `radius 20`, `shadow-2`, scrim `--pw-scrim`.
Open `200 ms scale .96 → 1`. `Esc` and scrim click = cancel. Focus trap. Returns focus to the
opener. `aria-modal` + `aria-labelledby`. Cancel on the **left**, destructive on the **right**. **[C]**

#### `pw-toast` — DESIGN-D03

Props `tone: 'info'\|'success'\|'error'\|'on-dark'` · `action?`. `role="status"`.
Full width minus the 20 px gutter, `pad 16`, `radius 16`, `gap 12`, Body 600, filled icon 24,
`shadow-1`. Sits 16 px from the bottom, **above the CTA if one is present**.
Auto-hide **4 s**; **errors persist until dismissed**. **[C]**

#### `pw-strip-tile` — DESIGN-D03

Props `photo: Photo` · `size` · `badge?: 'new'\|'own'`.
`aspect-ratio 1 : 3.148`, radius 16, border 2 ink. Name pill 28 at the bottom, 8 px inset,
Caption 700, ellipsis. Tag 24 at top-left, 8 px inset. **The whole tile is an `<a>`** with
`aria-label="Mở dải ảnh của …"`. Hover/focus: `halo 3 blue-100 + border blue-700`.
Grid: mobile 2 col @167 · tablet 4 · desktop 6 · big screen height 740. **[C]**

#### `pw-state` — DESIGN-D03

Props `tone: 'empty'\|'loading'\|'error'` · `title` · `body` · `action`.
Disc 64 in the matching tint with a 32 px icon, H3 title, Body `ink-2`, gap 12, tonal M button
(L full-width on mobile). Yellow = invitation, blue = waiting, red = error.
**Always offers exactly one next action.** **[C]**

#### `pw-mod-row` — DESIGN-D03 / D21

Props `photo` · `mode: 'pending'\|'ok'\|'removed'` · `selected`.
Grid `44px 96px minmax(0,1fr) 170px 330px 220px`, gap 16, pad `10px 20px`, divider
`2px #DAD6CE`. Emits `approve`, `reject`, `remove`, `restore`, `toggle-select`. **[C]**

#### `pw-marquee` — DESIGN-D18

Props `items: Photo[]` · `durationSeconds = 70` · `paused`.
Renders the item list **twice**, animates `translateX(0 → -50%)`, `linear infinite`.
Pauses on hover. Inserts new items at the head **without re-layout**. **[C]**

#### `pw-counter` — DESIGN-D03 / D18

Props `value: number`. Roll-up 400 ms decel on change, `+1` yellow pill for 1.5 s, block pulses
`scale(1.02)`. Big-screen scale: number 132, caption 32. **[C]**

#### `pw-arrival-card` — DESIGN-D19

Props `photo` · `momentNumber`. Emits `done` after the full 700 + 5000 + 600 ms sequence.
Geometry in §6. **[C]**

#### `pw-qr` — DESIGN-D03

Props `url`. Black modules on white, quiet zone ≥ 4 modules, generated at build time from the
deploy URL, **nothing drawn on top of it**. **[C]**

#### `pw-partner-logos` — DESIGN-D18

No props. Renders the six logos in the fixed order with the two `×` separators and the two
per-logo exceptions from §8.2. **This component is the single place that knowledge lives.** **[I]**

---

## 11. Component Dependency Tree

```
pw-app  (tokens at :root, router outlet, backend singleton)
│
├── page-welcome                         DESIGN-D04
│   ├── partner-text-strip
│   ├── hero-decor  (6 floating shapes)
│   │   └── pw-photowall-frame ×3        (58×183, fanned)
│   └── pw-button [primary]
│
├── page-name                            DESIGN-D05
│   ├── pw-topbar [light]
│   ├── pw-steps  (current 1)
│   ├── pw-input  (name, maxlength 24, counter)
│   ├── pw-setting-row → pw-toggle       ("Hiện tên")
│   ├── consent-row → pw-checkbox        (on --pw-yellow-100)
│   └── pw-button [primary]
│
├── page-camera                          DESIGN-D06 / D08 / D15
│   ├── pw-topbar [dark]
│   │   ├── pw-pill  (timer 3s, aria-pressed)
│   │   └── pw-icon-button (mirror, 32)
│   ├── pw-camera
│   │   ├── viewfinder (video + thirds + brackets + pills)
│   │   ├── tray  ×4 cells
│   │   └── controls: pw-icon-button 56 · shutter 84 · pw-icon-button 56
│   ├── strip-hint-card → pw-photowall-frame (40×126)
│   └── pw-state [error]  ← camera denied (E01)
│
├── page-shot-review                     DESIGN-D07
│   ├── pw-topbar [dark] → pw-pill (name)
│   ├── tray ×4
│   ├── shot preview (358×268)
│   └── pw-button [secondary] + pw-button [success]
│
├── page-frame                           DESIGN-D09
│   ├── pw-topbar [light] → pw-pill ("4 / 4 ảnh")
│   ├── pw-steps (current 2)
│   ├── pw-photowall-frame (150×472)          ← live preview
│   ├── pw-frame-option[]                     ← reads frame-registry
│   │   └── pw-photowall-frame (18×57)        ← thumbnail
│   └── pw-button [primary]
│
├── page-review                          DESIGN-D10
│   ├── pw-topbar [light] → pw-pill (name, links to /name)
│   ├── pw-steps (current 2)
│   ├── pw-photowall-frame (168×529)
│   ├── retake-grid ×4
│   ├── pw-pill (frame chip → /frame)
│   └── pw-button [secondary] + pw-button [primary]
│
├── page-upload                          DESIGN-D11 / D16
│   ├── pw-steps (current 3)
│   ├── upload-loader-card (4 Google blocks)
│   ├── pw-photowall-frame (40×126)
│   ├── pw-progress
│   ├── pw-button [text] ("Huỷ")
│   └── pw-state [error] ← E02 + pw-button ("Gửi lại")
│
├── page-done                            DESIGN-D12 / D13
│   ├── pw-photo-card → pw-photowall-frame (90×283 | 84×264)
│   ├── pw-pill (moment # | queue position)
│   ├── confetti (7 pieces, once)             ← D12 only
│   └── pw-button [primary] [secondary] [text]…
│
├── page-me                              DESIGN-D14
│   ├── pw-topbar [dark]
│   ├── pw-photowall-frame (186×586)
│   ├── pw-button [primary] ("Tải dải ảnh về")
│   └── pw-button [text, destructive] ("Gỡ dải ảnh của tôi")
│       └── pw-dialog [destructive]
│
├── page-closed                          DESIGN-D17
│   ├── partner-text-strip
│   ├── pw-state
│   └── pw-button ×2
│
├── page-display                         DESIGN-D18 / D19   ← separate layout, no app chrome
│   ├── display-header (PHOTO WALL 84 + 4 dots)
│   ├── pw-marquee
│   │   └── pw-strip-tile[]  ×2 copies
│   │       ├── pw-photowall-frame (230×724)
│   │       ├── name pill (h38)
│   │       └── pw-tag ("MỚI", 6 s)
│   ├── right column (516)
│   │   ├── pw-counter (green card, +1 pill)
│   │   └── pw-qr (card) + CTA text
│   ├── pw-arrival-card                        ← D02 state only
│   │   └── pw-photowall-frame + confetti ×7
│   └── pw-partner-logos  (footer, h112)
│
├── page-mod                             DESIGN-D20 / D21
│   ├── [signed out] mod-login → Google button + error banner
│   └── [signed in]
│       ├── mod-header (pills, settings, sign out)
│       ├── pw-tabs (3)
│       ├── pw-mod-table
│       │   └── pw-mod-row[]
│       │       ├── pw-photowall-frame (44)
│       │       ├── pw-pill (status) + reason chip
│       │       └── pw-button [s, success] / [s, destructive]
│       ├── bulk-bar
│       ├── pw-state (empty / loading / error)
│       └── pw-dialog [destructive]
│
└── page-mod-settings                    DESIGN-D22
    ├── settings-section ×6
    │   ├── pw-setting-row → pw-toggle | pw-select | pw-input
    │   └── pw-tag ("Admin")
    ├── frame-status-list → pw-photowall-frame (44)
    └── moderator-list rows
```

### Shared leaf components — the high-reuse set

`pw-photowall-frame` (12 artboards) · `pw-button` (all) · `pw-pill` (14) · `pw-icon-button` (9)
· `pw-topbar` (9) · `pw-steps` (5) · `pw-dialog` (2) · `pw-state` (4).
**Change one of these and you change most of the product** — see §25 and §26.

---
## 12. State Model

### 12.1 Ownership summary

| State | Type | Owner | Lifetime | Updated by | Consumed by |
|---|---|---|---|---|---|
| `displayName` | `string` (1–24) | `session` store | session (survives reload via IndexedDB) | S02 input, S06 name chip | S02, S04, S06, S08, S09, submit |
| `showName` | `boolean` (default `true`) | `session` | session | S02 toggle | submit, big screen |
| `consentGiven` | `boolean` (must be `true`) | `session` | session | S02 checkbox | S02 CTA gate |
| `shots` | `(Shot \| null)[4]` | `shot-store` | session; persisted in **IndexedDB** | S03 capture, S04 accept, gallery pick | S03 tray, S06 grid, all `pw-photowall-frame`, compose |
| `activeShotIndex` | `1..4` | URL (`/camera/:n`) | per navigation | router | S03, S04 |
| `candidateShot` | `Blob \| null` | `page-camera` local | until accepted/discarded | shutter, timer, gallery | S04 |
| `timerOn` | `boolean` (default `true`) | `page-camera` local, persisted in **sessionStorage** | tab (carries to the next shot) | timer pill | S03 |
| `mirrored` | `boolean`, **derived** **[I]**: `true` for the front camera, `false` for the rear, read from the opened track's `facingMode` (no mirror pill) | `use-camera` | per stream | camera switch | S03 video transform + saved frame |
| `backCamera` | `boolean` (default `false`) **[I]** | `page-camera` local, persisted in **sessionStorage** | tab (carries to the next shot) | switch-camera | `getUserMedia` facingMode |
| `facing` | `'user' \| 'environment'` | `page-camera` local | session | switch-camera | `getUserMedia` |
| `cameraError` | `'denied' \| 'unavailable' \| null` | `page-camera` local | until resolved | `getUserMedia` rejection | E01 |
| `selectedFrameId` | `FrameId` | `session` | session | S05 cards | S05, S06, compose, submit |
| `frames` | `FrameTemplate[]` | `frame-registry` | app lifetime (fetched once) | `frames.json` load | S05, everything rendering a strip |
| `composedBlob` | `Blob \| null` | `upload-controller` | until the user leaves `/done` | compose step | upload, download, E02 retry |
| `uploadProgress` | `number \| 'indeterminate'` | `upload-controller` | during upload | Storage task | S07 |
| `photoId` | `string \| null` | `upload-controller` | session | `submitPhoto` | `/done`, `/me/:id`, retry |
| `submitError` | `SubmitError \| null` | `upload-controller` | until retried | client throws | E02, E03, toasts |
| `myPhotos` | `Photo[]` | `watchMyPhotos` subscription | while `/done` or `/me/:id` mounted | Firestore snapshot | `/done` (D12 vs D13), `/me/:id` |
| `appConfig` | `AppConfig \| null` | `watchConfig` subscription | app lifetime | Firestore snapshot | route guard → E03, mod header |
| `approvedPhotos` | `Photo[]` | `watchApproved` | while `/display` mounted | Firestore snapshot | marquee |
| `arrivalQueue` | `Photo[]` (max 3) | `arrival-queue` | transient | `added[]` from `watchApproved` | `pw-arrival-card` |
| `approvedCount` | `number` | `watchStats` | while `/display` mounted | Firestore snapshot | `pw-counter` |
| `modTab` | `'pending' \| 'ok' \| 'removed'` | `page-mod` local (mirror in URL **[I]**) | per visit | tab click | queue query |
| `modSelection` | `Set<string>` | `page-mod` local | per tab | row checkbox | bulk bar |
| `pendingQueue` | `Photo[]` | `watchPending` | while `/mod` mounted | Firestore snapshot | table |
| `moderator` | `User \| null` + `isModerator` | `page-mod` | until sign-out (12 h) | `signInWithPopup` | routing, header pill |

### 12.2 Where each kind of state lives

The design does not name a state library, and the app is small. **Do not add Redux/Zustand.** **[I]**

| Kind | Mechanism | Rationale |
|---|---|---|
| Server state (photos, config, stats) | **Firestore `onSnapshot` subscriptions** via `backend/src/client.ts` | Already implemented, already realtime, already rules-enforced. Never poll — the integration doc says so explicitly. **[C]** |
| Guest session (name, consent, shots, frame) | A single **Lit reactive controller / `@lit/context`** singleton `session`, backed by **IndexedDB** | The design requires shots to survive leaving the flow: *"Ảnh đã duyệt giữ trong IndexedDB theo phiên; quay lại trong 30 phút hỏi 'Tiếp tục bộ đang chụp?'"* **[C]** |
| Step position | **URL** (`/camera/:n`) | The design gives every step a route; back/forward must work. **[C]** |
| Ephemeral UI (hover, dialog open, candidate shot) | **local component state** | never lifted |
| Cross-cutting singletons (`backend`, `frames`) | module-level, injected via context | `initBackend()` **must run exactly once** — App Check breaks otherwise. **[C]** |

### 12.3 Session resume rule **[C]**

On entering the flow, if IndexedDB holds shots from **the last 30 minutes**, prompt
*"Tiếp tục bộ đang chụp?"* and offer resume or start over. Clear the store after a successful
submit or on "Chụp lại hết".

### 12.4 Auth timing rule — important **[C]**

> *"**Không** gọi `ensureGuest()` lúc mở trang, chỉ gọi khi người dùng bấm Gửi."*

Do **not** create an anonymous account on page load. Call `ensureGuest(backend)` only inside the
`Gửi lên Wall` handler. Firebase caps new anonymous accounts per IP, and the whole venue shares
one campus wifi IP — creating an account for every passer-by would exhaust the quota and take
the booth offline.

---

## 13. Data Models

### 13.1 Frontend-only types

```ts
// types/frame.ts
/** Pixel rectangle on the canonical 1080 x 3400 canvas: [x, y, w, h]. */
export type SlotRect = readonly [x: number, y: number, w: number, h: number];

export type FrameId = 'f01-gdgoc' | 'f02-aws' | 'f03-partners' | (string & {});

export interface FrameTemplate {
  /** Stable id, also written to Firestore. */
  id: FrameId;
  /** Internal design name, e.g. "Frame / F01 GDGoC". */
  name: string;
  /** Short label shown above the title on a frame card, e.g. "Khung 01". */
  label: string;
  /** Human title shown to the guest, e.g. "GDGoC · Build Together". */
  title: string;
  /** File name under /frames/ — a true-alpha PNG, exactly 1080 x 3400. */
  overlay: string;
  /** Exactly four slots, top to bottom. */
  slots: readonly [SlotRect, SlotRect, SlotRect, SlotRect];
  /** Corner radius in canvas px at 1080 wide (36 for every current frame). */
  r: number;
  /** Admin can hide a frame; hidden frames are not rendered at all. */
  enabled?: boolean;
}

export interface FrameRegistry {
  /** Always [1080, 3400]. */
  canvas: readonly [number, number];
  frames: FrameTemplate[];
}
```

```ts
// types/session.ts
export interface Shot {
  /** Raw camera/gallery capture, before composition. */
  blob: Blob;
  /** Object URL for preview; revoke on replace. */
  url: string;
  width: number;
  height: number;
  capturedAt: number;
  source: 'camera' | 'gallery';
  /** How many times this slot was retaken — reported to analytics. */
  retakes: number;
}

export interface CaptureSession {
  displayName: string;      // 1..24 after trim
  showName: boolean;        // default true
  consentGiven: boolean;    // must be true to continue
  shots: (Shot | null)[];   // length 4
  selectedFrameId: FrameId;
  startedAt: number;        // for the 30-minute resume window
}
```

```ts
// types/photo.ts — view model over the backend's PhotoDoc
export type PhotoView = Photo & {
  /** Resolved download URL, lazily fetched via photoUrl(). */
  url?: string;
  /** Display index shown as "Khoảnh khắc #129". See §31 Q5. */
  momentNumber?: number;
};
```

### 13.2 Backend types — already written, **do not redefine**

These live in `backend/src/schema.ts` on the `backend` branch. Import them; never duplicate
them in the frontend.

```ts
export const PHOTO_STATUSES = ['uploading','pending','approved','rejected','removed'] as const;
export const FRAME_VARIANTS  = ['light','dark'] as const;          // <-- see §20.5 #1
export const LIMITS = {
  submitIntervalSeconds: 60,
  maxSubmitsPerUser: 20,
  maxUploadBytes: 2 * 1024 * 1024,
  displayNameMaxLength: 40,
} as const;

export interface AppConfig  { uploadsOpen: boolean; eventName: string }
export interface PublicStats{ approvedCount: number }
export interface UserDoc    { lastSubmitAt: Timestamp; lastPhotoId: string; submitCount: number }
export interface PhotoDoc {
  ownerUid: string;
  displayName: string;
  frameVariant: FrameVariant;
  status: PhotoStatus;
  storagePath: string;      // photos/{id}/strip.jpg
  createdAt: Timestamp;
  submittedAt?: Timestamp;
  reviewedAt?: Timestamp;
  reviewedBy?: string;
}
```

Storage layout: **one object per photo** — `photos/{photoId}/strip.jpg`. **[C]**

### 13.3 The design's own data sketch, for reference

DESIGN-D30 sketched a different shape before the backend existed:
`photos/{id}: { name ≤ 24, createdAt, sessionId, frame: f01-gdgoc|f02-aws|f03-partners,
status: visible|pending|removed, urls: {strip 1080×3400, thumb 240×756, display 480×1512} }`
plus `stats/counter`.

**The implemented backend wins.** The differences are catalogued in §20.5. The one piece worth
preserving from the sketch is the `frame` field carrying a real frame id — see §20.5 #1.

---

## 14. Interaction Specification

Format: `Trigger → State change → UI response → Side effect → Failure behaviour`

### 14.1 Guest

| Interaction | Spec |
|---|---|
| **Press any button** | → `:active` → `transform: translate(2px,2px)` and the hard shadow is removed, 80 ms; release 160 ms. Material Web ripple stays on. → none → — **[C]** |
| **Type a name** | → `session.displayName` → counter updates `n/24`, CTA enables at ≥1 char with consent → persist to IndexedDB (debounced) → >24 blocked by `maxlength` |
| **Toggle "Hiện tên"** | → `session.showName` → knob slides, track `#188038` ↔ `#DAD6CE` → — → — |
| **Tick consent** | → `session.consentGiven` → CTA leaves the disabled style → — → unticking re-disables the CTA |
| **Toggle the 3 s timer** | → `timerOn` → pill fills yellow / goes dark, `aria-pressed` flips → — → — |
| **Toggle mirror** | *Removed* **[I]**: the mirror follows the camera. Switching fades the video out and back in, and the flip lands with the new stream. Still `transform: scaleX(-1)` on the video **and on the captured frame** for the front camera. |
| **Switch camera** | → `facing` → viewfinder re-mounts → `getUserMedia` with the new `facingMode` → if the device has one camera, hide the control **[I]** |
| **Press the shutter** | → `candidateShot` → **white flash 120 ms** over the viewfinder, then navigate to S04 → grab a frame to a canvas at the native resolution → if the stream died, show E01 |
| **3 s timer fires** | → same as the shutter → 64 px counting ring in the viewfinder, **10 ms haptic per tick** → — → — **[C]** |
| **Pick from gallery** | → `candidateShot` → S04 → `<input type="file" accept="image/*">`; decode via `createImageBitmap` honouring EXIF → unsupported/undecodable → error toast, stay put |
| **Tap "Chụp lại"** | → `candidateShot = null` → back to S03 at the same `n`, `shot.retakes++` → — → — |
| **Tap "Dùng ảnh này"** | → `shots[n-1] = candidate` → the shot **animates into tray slot n over 400 ms**, then the slot border turns green → persist to IndexedDB → — **[C]** |
| **Tap a frame card** | → `selectedFrameId` → the 150 px preview swaps overlay **and** slot geometry, **crossfade 160 ms**; the four photos do not move; the box does not resize → — → a disabled frame is never rendered **[C]** |
| **Tap "Dùng khung này"** | → — → navigate to `/review` → — → — |
| **Tap retake tile N (S06)** | → `activeShotIndex = N` → navigate to `/camera/N`; the other three shots stay → — → — |
| **Tap "Chụp lại hết"** | → `shots = [null×4]` → confirm dialog first **[I]**, then `/camera/1` → clear IndexedDB shots → — |
| **Tap the name chip (S06)** | → — → navigate to `/name` with the current value prefilled → — → — **[C]** |
| **Tap "Gửi lên Wall"** | → `uploadProgress` → `/upload` → 1) compose canvas → JPEG; 2) `ensureGuest`; 3) `submitPhoto` → see the error table below |
| **Tap "Tải dải ảnh về"** | → — → browser download → `URL.createObjectURL(composedBlob)` + `<a download>`; **never re-fetch from the server** while the blob is in memory; after a reload use `photoUrl(backend, id)` → — **[C]** |
| **Tap "Chia sẻ"** | → — → native share sheet → `navigator.share({files:[jpeg]})`; if unsupported, hide the button **[I]** |
| **Tap "Gỡ dải ảnh của tôi"** | → — → destructive confirm dialog → **see §20.5 #9 — not currently permitted by the rules** → — |

#### Submit error handling — exact mapping **[C]**

| `SubmitError.code` | UI |
|---|---|
| `invalid-input` | A frontend bug (bad name length, non-JPEG, ≥ 2 MB). Log it; show the generic error and re-run the export step. |
| `uploads-closed` | Navigate to **E03**. Copy: *"Hiện chưa nhận ảnh, bạn quay lại sau nhé"* |
| `rate-limited` | Toast: *"Chờ {e.retryAfterSeconds} giây nữa để gửi tiếp"* |
| `quota-exceeded` | *"Bạn đã gửi đủ số ảnh"* |
| `upload-failed` | Navigate to **E02**. `Gửi lại` → `resumeSubmission(backend, e.photoId!, image)`. **Never call `submitPhoto` again.** |
| `unknown` | *"Có lỗi, thử lại sau"* |

### 14.2 Big screen

| Interaction | Spec |
|---|---|
| **Photo approved elsewhere** | `watchApproved` yields `added[]` → dim the viewport to 55 %, raise the arrival card 700 ms, hold 5 s, fly it to the head of the track 600 ms, leave a `MỚI` tag for 6 s; counter rolls `+1` in 400 ms → the marquee **never stops** → if ≥ 4 arrive at once, queue max 3 and merge the rest into `+N dải ảnh mới` **[C]** |
| **Photo removed elsewhere** | `removedIds[]` → the tile is dropped from the track immediately → counter −1 → no animation specified **[I]**: fade 150 ms |
| **Idle** | track translates `0 → -50%` over 70 s, `linear`, forever; content is duplicated | 
| **Hover** (debug only) | `animation-play-state: paused` **[C]** |
| **6 hours elapsed** | full page reload **[C]** |

### 14.3 Moderator

| Interaction | Spec |
|---|---|
| **Sign in** | `signInWithPopup(auth, GoogleAuthProvider)` → `isModerator()` → false ⇒ the M00 error banner naming the email |
| **Switch tab** | → `modTab` → tab fills ink; the table re-queries → — → — |
| **`Duyệt`** / key `A` | → optimistic row removal → `approve(backend, id)` → the photo appears on the big screen within ~1 s; `approvedCount +1` → `AlreadyReviewedError` ⇒ **swallow it silently**, the row is already gone **[C]** |
| **`Gỡ`** on a pending row | → confirm dialog → `reject(backend, id)` → **the stored JPEG is deleted**, so any leaked download URL dies → as above |
| **`Gỡ`** on an approved row | → confirm dialog with the reason radio group → `remove(backend, id)` → tile leaves the big screen immediately; `approvedCount −1`; object deleted → as above |
| **`Khôi phục`** | → — → — → **not supported by the rules — see §20.5 #9** |
| **Bulk approve/remove** | → — → run the individual calls in sequence, tolerating `AlreadyReviewedError` per item **[I]** |
| **Toggle "Đang nhận ảnh"** | → `appConfig.uploadsOpen` → pill flips green ↔ neutral → `setUploadsOpen(backend, bool)` → **"Tắt khi không có ai trực duyệt."** **[C]** |
| **`↑ / ↓`** | → move the row cursor → row highlight → — → — **[C]** |

---

## 15. Animation & Motion Specification

Every row is confirmed from DESIGN-D29 / D30. **Add nothing that is not on this list.**

| Element | Trigger | Type | Duration | Easing |
|---|---|---|---|---|
| Screen transition | route change | slide 24 px + fade. **No full-screen scale.** | 240 ms | `--pw-ease-std` |
| Button | press / release | `translate(2px,2px)` + drop shadow / restore | 80 / 160 ms | linear / decel |
| Capture flash | shutter | white overlay over the viewfinder | 120 ms | accel |
| Shot → tray | accept a shot | the thumbnail flies into tray slot `n`, then the slot border turns green | 400 ms | decel |
| Countdown ring | timer running | 64 px ring counts down; 10 ms haptic per tick | 3 s | linear |
| Frame swap | tap a frame card | crossfade of overlay + slots | 160 ms | std |
| Upload loader | uploading, indeterminate | 4 Google blocks run into the grid, stagger 120 ms | loop 1.2 s | ease-in-out |
| Success | upload approved | mini strip drops in with a slight overshoot; check pops; **7 confetti pieces, once, never looping** | 600 ms | overshoot |
| Counter | value changes | old digit slides up, new slides in; on the big screen the whole block pulses `scale(1.02)` | 400 ms | decel |
| Big-screen marquee | always | `translateX(0 → -50%)` on a duplicated track, ≈ 40 px/s | 70 s / loop | linear, infinite |
| Big-screen dim | a photo arrives | viewport background → `rgba(250,247,242,.55)` | 400 ms | ease-out |
| Arrival card | a photo arrives | `translateY(112% → 0)`, hold 5 s, then fly to the head of the track | 700 ms / 5 s / 600 ms | `cubic-bezier(.2,.8,.2,1)` |
| `+1` pill | counter increments | appears, auto-hides | 1.5 s visible | — |
| Toast | show / hide | slide up 16 px from the bottom | in 200 / out 150 ms | decel / accel |
| Dialog | open | `scale(.96 → 1)` + scrim fade | 200 ms | std |
| Welcome decor | always | 6 shapes float ±6–10 px on staggered 4.6–7.4 s loops | — | ease-in-out |

### `prefers-reduced-motion: reduce` — required behaviour **[C]**

- Drop every slide and scale; **fade 150 ms only**.
- Welcome decor: `animation: none`.
- **The big-screen marquee stops scrolling and becomes a paged slideshow, one page every 8 s.**
  (This is the one non-obvious rule — the design specifies it explicitly.)
- The only infinite loops permitted anywhere are the upload loader and the live dot.

---

## 16. Responsive Specification

### 16.1 Matrix

| Element | Mobile 360–430 | Tablet 768–1023 | Desktop ≥ 1024 | Big screen 1920×1080 |
|---|---|---|---|---|
| Page gutter | 20 | 32 | 32 | 64 |
| Capture flow | 1 column, **must not scroll** | 430 px centred column | 430 px centred column | n/a |
| Flow background | cream | cream + side pattern | cream + side pattern | cream |
| Buttons | full width (max 342 after gutters) | **do not stretch past 342** | same | n/a |
| Camera viewport | `min(100vw − 32, (100dvh − 420) × 4/3)` | same formula inside the 430 column | same | n/a |
| Camera tray | 4 cells in a row, 72×54, gap 12 | same | same | n/a |
| Frame select | preview 150 left, cards right | same | same | n/a |
| Strip tile grid | **2 col @ 167** | 4 col, gutter 16 | 6 col, gutter 24 | single row, height 740 |
| Photo Wall | **does not exist** | does not exist | does not exist | **the only place it exists** |
| Marquee | — | — | — | 1236×760 viewport + 516 right column |
| Moderation | **not supported** | not supported | fixed 1280 | n/a |
| Header logos | text strip only (S01/E03) | text strip | text strip | 6 logo discs, one row, 76 px, gap 20 |
| Min font size | 11 (uppercase Label) | 11 | 11 | **18** |

### 16.2 Rules that are easy to get wrong **[C]**

1. **Every strip everywhere uses `aspect-ratio: 1080 / 3400` (1 : 3.148).** Changing frame never
   changes tile size — the marquee must not reflow when a different frame arrives.
2. `padding-bottom: calc(32px + env(safe-area-inset-bottom))` on every screen with a bottom CTA.
3. Touch targets ≥ 48×48; ≥ 8 px between targets. The 32 px pills and 24 px tags are
   **display-only** and are exempt because they are not tappable.
4. Use `rem` for font sizes; the layout must survive **200 % browser zoom** — which it does
   because the capture flow is a single column.
5. Test explicitly at **360** (Galaxy A) and **430** (iPhone Pro Max), not just 390.
6. `/display` is a **separate route with its own layout** — it must not inherit the app shell.

---

## 17. Accessibility Requirements

All confirmed from DESIGN-D29 unless marked.

### Contrast
Text ≥ 4.5:1 (≥ 3:1 at 24 px+). Measured on DESIGN-D01: ink on cream **15.7:1**, white on
blue-700 **5.4:1**, text-secondary **6.3:1**, on-dark-2 **10:1**, on-dark-3 **8.4:1**.
**Never place white text on `--pw-blue-500` or on any yellow.**

### Never colour alone
Every container carries a 2 px ink outline, so state is never signalled by colour only.
Error and success messages always pair an **icon + words** with the colour.

### Focus
`:focus-visible` → `outline: 3px solid var(--pw-blue-700); outline-offset: 3px` on buttons,
icon buttons and inputs. Keyboard-only; never suppressed.

### Semantics
| Element | Requirement |
|---|---|
| Buttons | real `<button>` / `<a href>`, never a `div` with `onClick` |
| Icon-only controls | `aria-label` is **mandatory** — shutter, switch camera, gallery, close, share, back |
| Timer & mirror pills | `<button aria-pressed>` |
| Frame option | `<button aria-pressed>`, the group behaves as a radiogroup |
| Steps | display only, not focusable |
| Progress | `role="progressbar"` + `aria-valuenow` |
| Toast | `role="status"` |
| Dialog | `aria-modal`, `aria-labelledby`, focus trap, `Esc` closes, focus returns to the opener |
| Tabs | `role="tablist"` / `role="tab"` / `aria-selected` |
| Strip tile | the whole tile is an `<a>` with `aria-label="Mở dải ảnh của …"` |
| Decorative art | `aria-hidden="true"` — the whole Welcome decor zone, all confetti, all frame demo photos |
| Language | `<html lang="vi">` **[C]** — every artboard declares it |

### Required states
These must exist and be reachable, not just designed: camera denied, upload failed / offline,
photo pending moderation, uploads closed.

### Motion
Honour `prefers-reduced-motion` per §15 — including the marquee → slideshow swap.

### Not to be sacrificed
Accessibility must not change the visual design. The 2 px outlines, hard shadows and colour
roles already do most of the work; do not add focus rings that displace layout or "high
contrast" variants that are not in the design.

---

## 18. Image / Photo Rendering Architecture

### 18.1 Two rendering paths — keep them consistent

| Path | Technology | Used by |
|---|---|---|
| **Preview** | DOM. Absolutely positioned `<div>` slots in **percent**, `object-fit: cover`, plus an `<img>` overlay on top. | `pw-photowall-frame` at 18 / 40 / 44 / 84 / 90 / 150 / 168 / 186 / 230 px |
| **Export** | `<canvas>` 1080 × 3400, `drawImage` per slot, then the overlay, then `toBlob` | one time, at submit |

The design makes an explicit promise on S05: *"Xem trước đúng là ảnh sẽ tải về."* — the preview
is what you download. DESIGN-D30 goes further: *"Review dùng chính canvas thu nhỏ → thấy gì tải
về đúng vậy."* **[C]**

> **Recommendation:** implement the **percent-based DOM path** for all previews (it is what the
> design's artboards literally do, it is cheap, and it scales to any width from the same
> numbers), and derive the percentages from the very same `frames.json` pixel rectangles:
> `left = x/1080`, `top = y/3400`, `width = w/1080`, `height = h/3400`, `radius = r × (renderWidth/1080)`.
> This guarantees the two paths cannot drift. Verified: the artboards' percentages are exactly
> these divisions (e.g. f01 slot 1 `174/1080 = 16.111 %`, `341/3400 = 10.029 %`). **[C]**

**`html2canvas` is not needed and must not be used.** The export is a deterministic four-image
composite; rasterising the DOM would be slower, less accurate, and would bake in browser
rendering differences. **[I]**

### 18.2 Composition algorithm

```ts
// features/frames/compose.ts
const [CANVAS_W, CANVAS_H] = [1080, 3400];

export async function composeStrip(
  shots: readonly Blob[],          // exactly 4, in slot order
  frame: FrameTemplate,
): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = CANVAS_W;
  canvas.height = CANVAS_H;
  const ctx = canvas.getContext('2d', { alpha: false })!;

  // 1. Opaque ground so any 1 px seam is cream, never black.
  ctx.fillStyle = '#FAF7F2';
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

  // 2. Photos, bottom layer. EXIF orientation must be honoured.
  for (let i = 0; i < 4; i++) {
    const bmp = await createImageBitmap(shots[i], { imageOrientation: 'from-image' });
    const [x, y, w, h] = frame.slots[i];
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, frame.r);   // r = 36
    ctx.clip();
    drawCover(ctx, bmp, x, y, w, h);
    ctx.restore();
    bmp.close();
  }

  // 3. Overlay PNG on top — stickers, logos and borders are never covered.
  const overlay = await loadImage(`/frames/${frame.overlay}`);
  ctx.drawImage(overlay, 0, 0, CANVAS_W, CANVAS_H);

  // 4. Encode. Target <= 600 KB; hard ceiling 2 MB (enforced by storage.rules).
  let blob = await toBlob(canvas, 'image/jpeg', 0.82);
  if (blob.size > 600 * 1024) blob = await toBlob(canvas, 'image/jpeg', 0.75);
  return blob;
}

/** object-fit: cover, centre crop. */
function drawCover(ctx, img, x, y, w, h) {
  const scale = Math.max(w / img.width, h / img.height);
  const dw = img.width * scale;
  const dh = img.height * scale;
  ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
}
```

Every constant above is from the design: canvas `1080 × 3400`, quality `0.82`, fallback `0.75`,
target `≤ 600 KB`, hard limit `2 MB`, `createImageBitmap` for EXIF, overlay last. **[C]**

### 18.3 Resolutions

| Purpose | Size | Note |
|---|---|---|
| Export / download / storage | **1080 × 3400** | the only size the backend stores (`photos/{id}/strip.jpg`) **[C]** |
| Big-screen tile | 230 × 724 rendered | downscaled from the 1080 original |
| Moderation thumbnail | 44 wide | downscaled from the 1080 original |
| Mobile preview | 18–186 wide | downscaled from the 1080 original |

> The design's `thumb 240×756` and `display 480×1512` derivatives **do not exist** — there is no
> image-processing service. Everything downscales the single 1080-wide JPEG in the browser.
> For a wall of 200 tiles this matters: see §29. **[C]** / §20.5 #4

### 18.4 High-DPI

The export buffer is a fixed 1080 × 3400 pixel grid, so `devicePixelRatio` is irrelevant to the
downloaded file. For previews, the overlay `<img>` is a 1080-wide source rendered at ≤ 230 px,
so it is already over-sampled on every display. **Never multiply the export canvas by DPR** —
that would break the contract that the strip is exactly 1080 × 3400. **[I]**

### 18.5 Aspect ratio and crop loss — measured

Camera shots are **4:3** (1.3333). The slots are not all 4:3:

| Frame | Slot ratios (w/h) | Worst-case crop |
|---|---|---|
| f01-gdgoc | 1.326 · 1.285 · 1.384 · 1.347 | 3.6 % of width (slot 2) |
| f02-aws | 1.409 · 1.383 · 1.441 · 1.461 | **8.7 % of height** (slot 4) |
| f03-partners | 1.328 × 4 | 0.4 % |

DESIGN-D24 states the loss as *"≤ 5 % một chiều"*; the measured worst case on **f02 slot 4 is
8.7 %**. Not a defect — cover-cropping is correct and the design's own mitigation applies:
*"guide chụp giữ mặt ở 1/3 giữa"*, which the viewfinder's rule-of-thirds grid and the
`Đưa mặt vào giữa khung nhé` hint already enforce. Recorded so nobody "fixes" it later. **[C]**

### 18.6 Anti-distortion rules — never violate

- The overlay is drawn at **exactly** `0, 0, 1080, 3400`. Never `object-fit: fill`, never a
  non-uniform transform.
- Photos are **cover**, never `stretch`.
- Every preview box derives its height from `aspect-ratio: 1080 / 3400`, never from a hardcoded
  height that might drift.
- Logos: `object-fit: contain` (or `cover` for the AWS square). Never `width:100%;height:100%`.

---

## 19. Frame System Architecture

### 19.1 The canonical grid (F-SPEC, DESIGN-D23)

```
canvas          1080 x 3400        ratio 1 : 3.148
side margin     80
header          320
slot            920 x 690          (4:3)
gap             30
footer          230
slot y          y_i = 320 + i * 720        ->  320, 1040, 1760, 2480
safe area       inset 40 px from each slot edge
```

Arithmetic check: `320 + 4×690 + 3×30 + 230 = 3400`. ✔

**This is the box every frame must fit inside, and it is the size of the downloaded file.** **[C]**

### 19.2 The 6-pixel bleed — and the proof it is real

Every slot rectangle in `frames.json` is expanded by **6 px on each edge** relative to the
transparent window measured on the artwork, so the photo tucks *under* the frame's coloured
border and no background can ever show through. **[C]**

F03 was drawn natively on the F-SPEC grid, which makes the rule verifiable:

| | Canonical | `frames.json` for f03 | Difference |
|---|---|---|---|
| x | 80 | **74** | −6 |
| w | 920 | **932** | +12 (= 6 each side) |
| y₀ | 320 | **314** | −6 |
| h | 690 | **702** | +12 |
| y step | 720 | **720** | 0 |

Exactly the stated rule. Any future frame F04 drawn on the grid gets the slots
`[74, 314 + i*720, 932, 702]`.

### 19.3 Layer order — invariant

```
  FrameOverlay      <img>  PNG with real alpha, inset 0, pointer-events:none   ← TOP
  PhotoSlot04       photo, cover, centre crop, radius r
  PhotoSlot03
  PhotoSlot02
  PhotoSlot01                                                                   ← BOTTOM
  (PhotoWallFrame root: aspect-ratio 1080/3400, overflow clip)
```

Because the overlay is on top, **stickers, borders, logos and text can never be covered by a
guest's photo**. Never reorder these layers. **[C]**

### 19.4 The registry — `frontend/public/frames/frames.json`

Written to the repo by this handoff, transcribed verbatim from DESIGN-D24 (with `label` and
`title` added from DESIGN-D09's card copy):

```json
{
  "canvas": [1080, 3400],
  "frames": [
    { "id": "f01-gdgoc",    "overlay": "frame-f01-gdgoc.png",
      "slots": [[174,341,733,553],[174,951,734,571],[161,1579,746,539],[174,2178,734,545]], "r": 36 },
    { "id": "f02-aws",      "overlay": "frame-f02-aws.png",
      "slots": [[166,459,737,523],[168,1057,743,537],[165,1655,738,512],[168,2237,742,508]], "r": 36 },
    { "id": "f03-partners", "overlay": "frame-f03-partners.png",
      "slots": [[74,314,932,702],[74,1034,932,702],[74,1754,932,702],[74,2474,932,702]], "r": 36 }
  ]
}
```

### 19.5 Per-frame notes from DESIGN-D24

| Frame | Body @1080 | Background trim | Note |
|---|---|---|---|
| **F01 GDGoC · Build Together** | fills 1080×3400 exactly | cloud background trimmed **28 px/side** | source 725×2170, scaled 1.567× uniformly; no logo/text/sticker touched |
| **F02 AWS · Build on AWS** | fills 1080×3400 exactly | **horizontally compressed 4.9 %** instead of trimming | text sits close to both edges, so trimming would cut it. Below the visible threshold; recorded on the board |
| **F03 Đoàn hội · GDGoC · AWS** | fills 1080×3400 exactly | none — drawn natively on the F-SPEC grid | 6 partner logos are the organisers' original files, only scaled; slots land on the canonical grid |

Also verified on that board: slots meet the inner edge of the border within **±1 px**; the demo
photos sit below the overlay and cover no sticker; decorations stay inside the bleed; slot 3's
green outline on F01 is **real artwork**, not leftover chroma.

### 19.6 What each frame's artwork actually contains

Recorded so a future team can recognise a wrong or corrupted file:

- **F01 `frame-f01-gdgoc.png`** — white ground, pale blue clouds top-left and a large cloud band
  across the bottom. Header: the GDGoC brackets mark + *"Google Developer Group / On Campus ·
  Saigon University"* and a handwritten *"Build Together"*. Slot borders top→bottom:
  **red · blue · green · yellow**. Stickers: a Google Cloud speech bubble (upper left), a
  Firebase flame speech bubble (right of slot 2), a *"Gemini"* laptop (left of slot 3), a
  *"Code / Learn / Connect"* cloud badge (lower right), a Google "G", a red play triangle, a
  blue arc, dot grids, arrow triangles. Footer: *"Develop A Brighter Tomorrow"* handwritten with
  a yellow underline, and the GDGoC brackets mark bottom-right.
- **F02 `frame-f02-aws.png`** — white ground, pale blue clouds, a yellow sun arc top-left.
  Header: the AWS Student Builder Groups chip logo + *"AWS Student Builder Groups"* in navy,
  handwritten *"Build on AWS"*, and *"CONNECT • LEARN • LEAD"* with yellow bullets. Slot borders:
  **navy · yellow · navy-on-blue · yellow**. Side text: *"THINK CLOUD BIGGER"*, *"IDEAS to
  IMPACT"*, *"LEARN BUILD DEPLOY"*, *"STUDENTS BUILD A BRIGHTER TOMORROW"*. Stickers: cloud
  outline, a navy `</>` tile, a database cylinder, yellow cubes, dot grids. Footer: a dark navy
  cloud band with handwritten *"Dream Build Scale"* and the *"with aws"* logo.
- **F03 `frame-f03-partners.png`** — cream ground with a fine dot texture. Header: GDGoC
  brackets + the GDGoC on-Campus wordmark on a white sticker outline. Slot borders:
  **blue · red · yellow · green**, evenly spaced on the canonical grid. Small confetti squares
  and stars. Footer: the six partner logos in circles in the fixed order, then
  *"PHOTO WALL · Đoàn hội Khoa CNTT × GDGoC × AWS Student Club"*.

### 19.7 Adding frame F04 — the extensibility contract **[C]**

> *"mỗi khung mới (F04…) = thêm 1 PNG alpha 1080 × 3400 + 1 dòng frames.json, kích thước hộp,
> ô ảnh và layout Wall không đổi."*

1. Drop `frame-f04-xxx.png` (true-alpha, exactly 1080 × 3400) into `frontend/public/frames/`.
2. Add one object to `frames.json` with its four measured slot rectangles and `r`.
3. **Change no code.** The option list, preview, compositor and Wall all read the registry.

The frame set was **frozen after review on 24.09** ("Đã khoá · duyệt 24.09", DESIGN-D22). Adding
a frame after that date needs organiser approval.

### 19.8 Runtime validation — build this **[I]**

The registry is the one place a typo silently produces a wrong export. On load, assert:
`canvas == [1080,3400]` · ids unique and non-empty · exactly 4 slots · every slot inside
`0..1080 × 0..3400` · `r >= 0` · the overlay resolves to a fetchable 1080 × 3400 image.
Fail loudly in dev; in production fall back to the first valid frame and report to analytics.

---
## 20. Existing Repository Audit

### 20.1 What is actually in the repository

**Branch `main` (checked out, 1 commit `969ee1d`)**

```
/
├── Readme.md          16 bytes — "Đây là readme"
└── frontend/          EMPTY DIRECTORY
```

There is **no frontend code, no package.json, no build tooling, no components**. The frontend
is a greenfield build. (This handoff has since added `Claude/`, `frontend/public/frames/` and
`frontend/public/logos/`.)

**Branch `origin/backend` (the remote default branch, 5 commits, head `3faa188`)**

```
/
├── .firebaserc                       default: demo-photowall · prod: photowall-gdgoc-2026
├── .gitignore                        node_modules, dist, .firebase, .env*, service-account*
├── firebase.json                     hosting -> frontend/dist, SPA rewrite, emulator ports
├── docs/frontend-integration.md      ** the integration contract — read it **
└── backend/
    ├── package.json                  firebase ^12.19.0 · vitest ^5 · tsx · typescript ^7
    ├── tsconfig.json                 ES2022, Bundler resolution, strict
    ├── firestore.rules               ** the real access control **
    ├── firestore.indexes.json        3 composite indexes
    ├── storage.rules
    ├── storage.cors.json
    ├── src/{schema,client,init,firebase-config}.ts
    ├── tests/{firestore.rules,storage.rules,helpers}.ts
    └── scripts/{e2e-emulator,load-test,seed-emulator}.ts
```

> **The two branches have not been merged.** `main` has the empty `frontend/`; `backend` has
> everything else. Resolving this is **task P0.1** — nothing else can start until the frontend
> sits in the same tree as `backend/src` and `firebase.json`.

### 20.2 Existing and reusable — use as-is

| Item | Where | Why it is ready |
|---|---|---|
| `backend/src/client.ts` | `origin/backend` | The complete frontend-facing API: `ensureGuest`, `submitPhoto`, `resumeSubmission`, `watchMyPhotos`, `watchConfig`, `watchApproved`, `watchStats`, `photoUrl`, `isModerator`, `watchPending`, `approve`, `reject`, `remove`, `setUploadsOpen`. Typed, with a proper `SubmitError` taxonomy. |
| `backend/src/init.ts` | same | `initBackend({emulators})`. Initialises App Check **before** anything else. |
| `backend/src/schema.ts` | same | `LIMITS`, `paths`, `PhotoDoc`, `AppConfig`. **Import these; never re-declare.** |
| `backend/src/firebase-config.ts` | same | Public web config + reCAPTCHA Enterprise site key. |
| `firebase.json` | same | Hosting already points at `frontend/dist` with `** -> /index.html`. Nothing to change. |
| `firestore.indexes.json` | same | Already covers `status+reviewedAt desc`, `status+submittedAt asc`, `ownerUid+createdAt desc` — exactly the three queries the design's screens need. |
| `docs/frontend-integration.md` | same | Emulator workflow, App Check debug-token workflow, deploy commands, the `SubmitError` table. |
| Frame PNGs + `frames.json` + 6 logos | `frontend/public/**` | Extracted by this handoff (§9). |

### 20.3 Existing but requires modification

| Item | Change needed | Severity |
|---|---|---|
| `backend/src/schema.ts` → `FRAME_VARIANTS` | `['light','dark']` must become the real frame ids, or a frame-id field must be added | **Blocker** — §20.5 #1 |
| `backend/firestore.rules` → `d.frameVariant in ['light','dark']` | must accept the real frame ids | **Blocker** — §20.5 #1 |
| `backend/src/client.ts` | add `watchByStatus(status)` so the moderation console can render the *Đã duyệt* and *Đã gỡ* tabs | High — §20.5 #11 |
| `firestore.rules` `config/app` | `hasOnly(['uploadsOpen','eventName'])` blocks every other Admin setting | Medium — §20.5 #10 |
| `Readme.md` | placeholder text; replace with a real project readme pointing at this plan | Low |

### 20.4 Missing — everything below must be created

| Area | Items |
|---|---|
| Tooling | `frontend/package.json`, `vite.config.ts` (**with the mandatory `resolve.dedupe`**), `tsconfig.json`, ESLint, Prettier, `index.html` |
| Design system | `styles/tokens.css` (§7), `styles/reset.css`, font loading |
| Components | all 25 `pw-*` elements (§10) |
| Pages | all 13 routes (§5) |
| Frame engine | `frame-registry.ts`, `pw-photowall-frame.ts`, `compose.ts` |
| Session | `session.ts` + IndexedDB persistence + the 30-minute resume prompt |
| Big screen | marquee, arrival queue, counter, QR, logo strip, 6-hour reload |
| Moderation | table, tabs, bulk, dialog, keyboard shortcuts |
| Analytics | GA4 events (§20.7) |
| Tests | unit, component, and the export-integrity test (§27) |

### 20.5 Design ⇄ backend conflicts — **read this before writing any Firebase call**

The design was drawn against an imagined backend. A real one now exists and is stricter. These
are the concrete divergences, with a recommended resolution for each.

| # | Topic | Design says | Deployed backend does | Severity | Recommended resolution |
|---|---|---|---|---|---|
| **1** | **Frame identity** | `frame: 'f01-gdgoc' \| 'f02-aws' \| 'f03-partners'` | `frameVariant` is validated **in the security rules** as `in ['light','dark']` | **BLOCKER** | Change `FRAME_VARIANTS` in `schema.ts` **and** the matching literal in `firestore.rules` to the three frame ids (keep them in sync — the rules file says so in a comment). Do this in **P0.3**, before any upload code. A frontend-side mapping is **not** acceptable: the moderation console and any export need the real frame id, and `frameVariant` would then lie. |
| **2** | **Status vocabulary** | `visible \| pending \| removed` | `uploading \| pending \| approved \| rejected \| removed` | Low | Use the backend's. Map for display: `approved` → *"Đang hiển thị"*, `pending` → *"Chờ duyệt"*, `removed` → *"Đã gỡ"*, `rejected` → *"Đã gỡ"* (guests are never told which). |
| **3** | **Auto-approval** | SafeSearch in a Cloud Function auto-publishes clean photos; only flagged ones queue | **No Cloud Functions at all.** Every photo goes `pending` and needs a human `Duyệt` | **High — changes the UX** | **S08b (D13) is the default outcome, not S08 (D12).** `/done` must subscribe with `watchMyPhotos` and upgrade D13 → D12 live when the status flips. Remove the "SafeSearch · racy · POSSIBLE" reason chips from M01 (there is no such data) and keep only the manual reason chips the remove dialog collects. Tell the organisers the console must be staffed. |
| **4** | **Image derivatives** | `thumb 240×756`, `display 480×1512`, `strip 1080×3400` | one object only: `photos/{id}/strip.jpg` | Medium | Browser-side downscale. On `/display` this means up to 200 full-size JPEGs — see §29 for the mitigation (`loading="lazy"`, windowing, `decoding="async"`, capped `max`). |
| **5** | **Name length** | input `maxlength=24` | rules allow 1–40 | None | Keep **24** in the UI. It is stricter and the big-screen pill is sized for it. |
| **6** | **Rate limits** | "≤ 3 bộ / phiên, 1 bộ / phút" | `maxSubmitsPerUser: 20`, `submitIntervalSeconds: 60` | Low | The 60 s interval matches. The per-session cap differs (3 vs 20); M02 exposes it as a setting but the value is baked into `firestore.rules` (`submitCount <= 20`). Decide with the organisers (§31 Q4) and change the rule, not the UI. |
| **7** | **Counter** | Cloud Function increments `stats/counter` | Moderators increment `stats/public.approvedCount` inside the approve/remove transaction | None | Use `watchStats`. Note the counter therefore tracks **approved** photos, which is what the big screen shows anyway. |
| **8** | **SafeSearch** | Cloud Vision, thresholds configurable in M02 | does not exist | Medium | Drop the SafeSearch UI from M01/M02 for v1, or mark it disabled. Do not fabricate reason chips. |
| **9** | **Restore & guest self-remove** | M01 has `Khôi phục` (24 h); S09 has `Gỡ dải ảnh của tôi` | `firestore.rules` permits only `pending → approved\|rejected` and `approved → removed`, and only for a moderator. **There is no `removed → approved`, and a guest can only do `uploading → pending`.** Reject/remove also **deletes the storage object**, so a restore would have nothing to show | **High** | Two features are currently unbuildable. Either (a) cut them from v1 and remove the affordances, or (b) extend the rules: add a `removed → approved` moderator transition, stop deleting the object on `remove` (delete on a later sweep instead), and add an owner transition `approved → removed`. **This is a backend decision — raise it before Phase 8.** §31 Q2 |
| **10** | **Event settings** | ~18 settings across 6 sections | `config/app` accepts **only** `{uploadsOpen, eventName}`, enforced by `hasOnly(...)` | **High** | Build M02 in two tiers: tier 1 = `Đang nhận ảnh` (works today) + `eventName`; tier 2 = everything else, rendered disabled with a "sắp có" note, **or** the config schema is widened first. Do not ship controls that silently do nothing. |
| **11** | **Moderation tabs** | `Đã duyệt · 325` and `Đã gỡ · 2` | `client.ts` exposes `watchPending` and `watchApproved` (ordered by `reviewedAt desc`, capped at 200) but **nothing for `removed` / `rejected`** | Medium | Add `watchByStatus(b, status, max)` to `client.ts`. The rules already allow a moderator to read any photo, and the `status+reviewedAt` index already exists. |
| **12** | **Moderator management** | M02 can add/remove moderators with roles | `moderators/{email}` is **console-only** (`allow write: if false`), and there is no role field — everyone on the list has identical power | Medium | Render the list read-only (a moderator may read their own entry only, so the full list is not even readable client-side — see §31 Q6). The Admin/Kiểm duyệt distinction in DESIGN-D31 has no backend equivalent. |
| **13** | **Data export** | ZIP, timelapse, CSV, scheduled deletion | none | Low | Out of scope for the frontend. Mark as organiser tooling. |
| **14** | **Moment number** | *"Khoảnh khắc #129"*, *"Khoảnh khắc thứ 129"* | no such field on `PhotoDoc` | Low | Either derive from `approvedCount` at approval time (racy) or add a counter field. §31 Q5 |
| **15** | **Session identity** | `sessionId` per anonymous session | `ownerUid` from anonymous auth | None | Equivalent. Use `ownerUid`. |
| **16** | **Action log** | "mọi hành động BTC ghi log (ai · lúc nào · ảnh nào)" | partially: `reviewedBy` + `reviewedAt` on the photo. No separate log collection, no removal reason stored | Low | Show `reviewedBy`/`reviewedAt` in the row meta. The remove-reason radio has nowhere to persist — either add a field or drop the radio. §31 Q9 |
| **17** | **Big-screen limit** | "limit 60 / 80" | `watchApproved(..., max = 200)` | None | Pass a smaller `max` (e.g. 80) from `/display` for performance. The parameter already exists. |
| **18** | **App Check** | not mentioned | **mandatory from 26.09**; requests without a token are blocked, and localhost is blocked unless a debug token is registered | Operational | Follow `docs/frontend-integration.md`: develop against the emulator, or set `self.FIREBASE_APPCHECK_DEBUG_TOKEN = true` before `initBackend()` and have the printed token added to the console. |

### 20.6 Should be removed

| Item | Reason |
|---|---|
| The `Readme.md` placeholder | replace with a real readme |
| Nothing else | the repo is otherwise empty; there is no legacy code to delete |

### 20.7 Technical debt / risks affecting implementation

| Item | Impact | Mitigation |
|---|---|---|
| **`resolve.dedupe` in `vite.config.ts` is mandatory** | Without it there are two copies of the Firebase SDK (the frontend's and `backend/`'s) and Firestore throws *"Type does not match the expected instance"*. | Copy the `dedupe` array from `docs/frontend-integration.md` into `vite.config.ts` in **P0.2**. |
| Frontend must install `firebase@^12` (same major as `backend/`) | version skew breaks the shared client | pin `^12.19.0` |
| Dev server must run on **port 5173** | the storage bucket's CORS allowlist only opens that port in dev | keep `server.port = 5173` |
| F01/F02 artwork is an upscale of a 725×2170 source | the **downloaded** file is softer than it should be | ask the organisers for native ≥ 1080×3400 originals; drop-in replacement, no code change |
| The frame set is frozen ("Đã khoá · duyệt 24.09") | late artwork changes need approval | lock the files 3 days before the event, per DESIGN-D30's checklist |
| The two branches are unmerged | nothing can be built | **P0.1** |
| No CI | rules and export regressions go unnoticed | `backend/` already has `vitest` + emulator scripts; wire them plus the frontend build into CI in P0.5 |

### 20.8 Analytics contract (GA4) **[C]**

From DESIGN-D30 — implement these exact event names and parameters:

| Event | Params |
|---|---|
| `pw_start` | `{ utm_source: 'display' \| 'qr' }` |
| `pw_name_done` | — |
| `pw_capture` | `{ index, source: 'camera'\|'gallery', retakes }` |
| `pw_frame_select` | `{ variant }` |
| `pw_upload_ok` | `{ ms, bytes }` |
| `pw_upload_fail` | `{ reason }` |
| `pw_download` | — |

KPI: completion rate `pw_start → pw_upload_ok`; **median ≤ 45 s**; frame-choice distribution.

---

## 21. Proposed Final Folder Structure

```
PhotoWall-GDGoCxAWS/
├── Claude/
│   └── Claude-Plan.md                ← THIS FILE. The design handoff.
├── docs/
│   └── frontend-integration.md       ← from the backend branch. The Firebase contract.
├── firebase.json                     ← hosting -> frontend/dist (already correct)
├── .firebaserc
├── backend/                          ← from the backend branch. Do not fork its types.
│   ├── src/{schema,client,init,firebase-config}.ts
│   ├── firestore.rules · storage.rules · firestore.indexes.json
│   ├── tests/ · scripts/
│   └── package.json
└── frontend/                         React 19 + Vite, three apps, one hosting target
    ├── package.json
    ├── vite.config.ts                MUST keep resolve.dedupe + server.port 5173
    ├── tsconfig.json                 paths: @/* @backend/* firebase/*
    ├── index.html                    -> mobile app     (served at /)
    ├── display/index.html            -> big screen     (served at /display/)
    ├── admin/index.html              -> moderation     (served at /admin/)
    ├── public/
    │   ├── frames/                   frames.json + 3 overlay PNGs   (committed)
    │   ├── logos/                    6 partner logos                (committed)
    │   └── fonts/                    2 preloaded woff2              (to add)
    └── src/
        ├── apps/
        │   ├── mobile/               main.tsx + App.tsx (router, guards)
        │   ├── display/              main.tsx           (Phase 9)
        │   └── admin/                main.tsx           (Phase 10)
        ├── components/               DESIGN-D02 + D03, no Firebase in here
        │   ├── Button · IconButton · TopBar · Steps · Field
        │   ├── Controls (Toggle / CheckRow / SettingRow) · Dialog
        │   ├── Progress · StateBlock · PartnerLine · Splash
        │   └── Icon.tsx              inline Material Symbols paths
        ├── features/
        │   ├── capture/              useCamera · ShotTray · pendingShot
        │   ├── frames/               frameRegistry · useFrames ·
        │   │                         PhotoWallFrame · FrameOption · compose
        │   ├── submit/               useUpload · submission · download
        │   ├── display/              marquee, counter, QR, arrivals  (Phase 9)
        │   └── moderation/           table, rows, shortcuts          (Phase 10)
        ├── pages/                    one file per route (§5) + its .module.css
        ├── state/SessionContext.tsx  session + IndexedDB + resume prompt
        ├── lib/
        │   ├── backend/              types · mock · firebase · provider
        │   └── idb.ts · useBlobUrls.ts · analytics.ts
        ├── styles/{tokens,base}.css
        ├── types/{frame,session}.ts
        └── config.ts                 flags for backend-blocked features
```

### Two conventions worth knowing before you add a file

**`components/` has no Firebase in it.** Anything that talks to the backend lives in
`features/` or `pages/`. That is what keeps the component layer testable on its own.

**`lib/backend/` is a port, not a re-export.** The UI calls the `GuestApi` interface; two
implementations satisfy it. `mock.ts` is in-memory and is the default in development, so the
whole flow runs with no emulator and no Firebase — including the rate limiter, the
uploads-closed switch, every `SubmitError` code, and a simulated moderator approving after
6 seconds so `/done` can be watched upgrading from S08b to S08. `firebase.ts` adapts
`backend/src/client.ts` and is selected with `VITE_BACKEND=firebase`. It is imported
dynamically, so the 580 kB Firebase chunk stays out of the mock build entirely.

### Why these directories

| Directory | Reason |
|---|---|
| `Claude/` | Design knowledge, versioned with the code. Required by the task; also where a fresh Claude session looks first. |
| `frontend/public/frames/` | The registry must be **fetchable at runtime** so adding F04 is a file drop, not a rebuild. |
| `components/` vs `features/` | `components/` maps 1:1 to DESIGN-D02/D03 (generic, reusable, no Firebase). `features/` holds the domain logic (camera, frames, upload, display, moderation) and is where Firebase calls live. Keeping Firebase out of `components/` is what makes the component library independently testable. |
| `pages/` | One file per route in §5, so the route table and the filesystem agree. |
| `state/` | A single session store — deliberately not a state-management framework. |
| `types/` | Frontend-only types. **Backend types are imported from `backend/src/schema.ts`, never copied.** |

---

## 22. Implementation Phases

Ten phases. Each is sized so one developer (or one Claude session) can finish and verify it.

---

### PHASE 0 — Repository preparation

**Goal.** One working tree that contains the backend contract, the frontend skeleton, and a
dev loop that talks to the emulator.

**Preconditions.** None. This is the first work.

**Files to create.** `frontend/package.json`, `frontend/vite.config.ts`,
`frontend/tsconfig.json`, `frontend/index.html`, `frontend/src/app/pw-app.ts`,
`frontend/src/app/backend.ts`, `frontend/.env.example`, `.eslintrc`, `.prettierrc`, `Readme.md`.

**Files to modify.** `backend/src/schema.ts`, `backend/firestore.rules`.

**Tasks.**
- [ ] **P0.1** Merge `origin/backend` into `main` (or branch off `backend`) so `frontend/`, `backend/`, `firebase.json` and `docs/` share one tree. Confirm `git ls-files` shows all four.
- [ ] **P0.2** Scaffold Vite + TypeScript + Lit in `frontend/`. Install `firebase@^12.19.0` (same major as `backend/`), `lit@^3`, `@material/web`.
- [ ] **P0.3** Write `vite.config.ts` with **`server.port = 5173`** and the full `resolve.dedupe` array from `docs/frontend-integration.md`. *Skipping this produces the "Type does not match the expected instance" Firestore error.*
- [ ] **P0.4** **Fix the frame-id blocker (§20.5 #1).** In `backend/src/schema.ts` change `FRAME_VARIANTS` to `['f01-gdgoc','f02-aws','f03-partners']`; in `backend/firestore.rules` change `d.frameVariant in ['light','dark']` to the same list. Run `cd backend && npm test` — the rules tests must still pass.
- [ ] **P0.5** Create `src/app/backend.ts` exporting a **single** `initBackend({ emulators: import.meta.env.DEV && import.meta.env.VITE_EMULATORS === '1' })` instance.
- [ ] **P0.6** Verify the emulator loop: `cd backend && npm run emulators`, then `npm run seed -- <your-gmail>`, then `cd frontend && VITE_EMULATORS=1 npm run dev`.
- [ ] **P0.7** Confirm `npm run build` in `frontend/` emits to `frontend/dist` (what `firebase.json` serves).
- [ ] **P0.8** Add ESLint + Prettier + a `typecheck` script; wire `frontend build`, `frontend typecheck` and `backend test` into CI.
- [ ] **P0.9** Replace `Readme.md` with a real readme that links to `Claude/Claude-Plan.md` and `docs/frontend-integration.md`.

**Expected result.** `npm run dev` serves an empty shell that can reach the Firestore emulator.

**Validation.** Emulator UI at `:4000` shows a connection from the app; no duplicate-SDK error
in the console; `backend` tests green.

**Dependencies.** none · **Risks.** the dedupe trap; App Check on localhost.

**Definition of Done.** A second developer can clone, run three commands, and see the shell
talking to the emulator.

---

### PHASE 1 — Design foundations (DESIGN-D01, D30)

**Goal.** Every token, font and icon in place, so no component ever needs a raw hex or px.

**Preconditions.** P0.

**Files to create.** `src/styles/tokens.css`, `src/styles/reset.css`,
`src/components/icons/icon.ts`, `public/fonts/*`.

**Tasks.**
- [ ] **P1.1** Transcribe the `:root` token block from §7 into `tokens.css` — all 24 colours, 10 type tokens, 10 spacing, 8 radius, outline/shadow/focus, 3 control sizes, 4 icon sizes, 5 durations, 3 easings, and the 4 Material Web bridge variables.
- [ ] **P1.2** Load `Unbounded` (600/700/800) and `Be Vietnam Pro` (400/500/600/700) via Google Fonts `css2`, **subset `vietnamese`**, `display=swap`; `<link rel="preload">` the two woff2.
- [ ] **P1.3** `reset.css`: `box-sizing: border-box` everywhere, `body { margin:0; background: var(--pw-bg); color: var(--pw-ink); -webkit-font-smoothing: antialiased }`.
- [ ] **P1.4** Build the inline SVG icon helper over `@material-symbols/svg-500` at sizes 16/20/24/32/48. **No icon font, no emoji.**
- [ ] **P1.5** Add a dev-only `/tokens` page rendering every swatch, type style, spacing step and radius — the living copy of DESIGN-D01.
- [ ] **P1.6** Add a lint rule (or a CI grep) that fails on a raw `#rrggbb` inside `src/components/**` and `src/features/**`.

**Expected result.** `/tokens` matches DESIGN-D01 side by side.

**Validation.** Spot-check five contrast pairs against the ratios in §7.1. Vietnamese diacritics
render correctly in both families at 11 px and 132 px.

**Risks.** Missing Vietnamese subset → tofu on names like *"Đức Huy"*. Check early.

**DoD.** No hardcoded colour or size exists anywhere in `src/`.

---

### PHASE 2 — Control components (DESIGN-D02)

**Goal.** The 12 control elements, every variant and state, in a Storybook-style gallery.

**Preconditions.** P1.

**Files to create.** `src/components/controls/*.ts` (12 files) + their stories.

**Tasks.**
- [ ] **P2.1** `pw-button` — 6 variants × 3 sizes × 6 states (default, hover, pressed, focus-visible, disabled, loading) + `fullWidth`.
- [ ] **P2.2** `pw-icon-button` — 48 / 56 / 32, light / dark / accent, plus the 84 px `shutter` composite (white ring 4, `box-shadow 0 0 0 3px ink`, blue core 66 with a 3 px ink border). `aria-label` required — throw in dev if missing.
- [ ] **P2.3** `pw-input` + `pw-select` — L/M/S, prefix/suffix icon, counter, 5 states. Error must render border + halo + icon + text.
- [ ] **P2.4** `pw-toggle` (48×28, knob 20) and `pw-checkbox` (24, radius 8, check 16), each with a visually-hidden real input.
- [ ] **P2.5** `pw-setting-row` — the shared row shell (pad 12 16, radius 16, border 2 ink, title Body 700, sub Caption ink-2, optional `Admin` tag).
- [ ] **P2.6** `pw-pill` (28/32), `pw-tag` (24: `MỚI` / `BẠN` / `Admin`), status pill in 4 tones.
- [ ] **P2.7** `pw-steps` — done / current / todo, display-only.
- [ ] **P2.8** `pw-tabs` — h40, selected `bg ink`, hover `surface-2`, count badge 20, full `role=tablist` semantics.
- [ ] **P2.9** `pw-topbar` — light + dark, h76, **the right slot always occupies 48 px even when empty**.
- [ ] **P2.10** Gallery page rendering every component in every state (the executable version of DESIGN-D02).

**Validation.** Compare the gallery against §6/§7 measurements. Tab through every control and
confirm the 3 px focus ring with 3 px offset. Press-and-hold shows the 2 px translate.

**DoD.** No page code needs a bespoke button, input or pill.

---

### PHASE 3 — Pattern components (DESIGN-D03)

**Goal.** The composite blocks used across screens.

**Preconditions.** P2.

**Files to create.** `src/components/patterns/*.ts` (6 files).

**Tasks.**
- [ ] **P3.1** `pw-toast` — 4 tones, `role="status"`, auto-hide 4 s, errors sticky, sits above a CTA.
- [ ] **P3.2** `pw-progress` — determinate (bar h16, radius full, border 2 ink, fill blue-700, labels both ends) and indeterminate (4 blocks, stagger 120 ms). `role="progressbar"`.
- [ ] **P3.3** `pw-skeleton` — `bg surface-2`, `border line`, **no shimmer**.
- [ ] **P3.4** `pw-dialog` — 342 wide, pad 24, radius 20, shadow-2, scrim, 200 ms scale-in, focus trap, Esc/scrim cancel, focus restore, cancel left / destructive right.
- [ ] **P3.5** `pw-state` — empty / loading / error; disc 64 tinted + icon 32, H3, Body ink-2, exactly one action.
- [ ] **P3.6** `pw-photo-card` — pad 12, radius 20, shadow-2, 110 px strip, name Body 700, time Caption ink-2.
- [ ] **P3.7** Extend the gallery.

**Validation.** Dialog: Tab cannot escape; Esc cancels; focus returns to the opener.
Toast: a screen reader announces it without stealing focus.

**DoD.** Every blocking interaction in the product can be built from these.

---

### PHASE 4 — Frame system (DESIGN-D23, D24, D25, D02)

**Goal.** One component that renders any strip at any size, plus a validated registry. **This
is the highest-value phase — everything visual downstream depends on it.**

**Preconditions.** P1 (tokens). Independent of P2/P3.

**Files to create.** `src/types/frame.ts`, `src/features/frames/frame-registry.ts`,
`src/features/frames/pw-photowall-frame.ts`.

**Files involved.** `frontend/public/frames/frames.json` + the 3 PNGs (already committed).

**Tasks.**
- [ ] **P4.1** Define `FrameTemplate`, `SlotRect`, `FrameRegistry` exactly as in §13.1.
- [ ] **P4.2** `frame-registry.ts`: fetch `/frames/frames.json` once, cache it, and expose `getFrames()` / `getFrame(id)` / `defaultFrameId`.
- [ ] **P4.3** Runtime validation per §19.8 — canvas is `[1080,3400]`, ids unique, exactly 4 slots, slots inside bounds, overlay reachable. Loud in dev, graceful in prod.
- [ ] **P4.4** `pw-photowall-frame`: root `aspect-ratio: 1080 / 3400; overflow: clip; position: relative`, sized by a `width` prop only.
- [ ] **P4.5** Render slots from **percentages derived from the pixel rects** (`x/1080`, `y/3400`, `w/1080`, `h/3400`) — never hardcode the percentages.
- [ ] **P4.6** Slot content: `object-fit: cover`, centre crop, `background var(--pw-surface-2)` when empty, `border-radius: calc(r * width / 1080)`.
- [ ] **P4.7** Overlay `<img>` at `left:-1px; top:-1px; width:calc(100% + 2px); height:calc(100% + 2px); pointer-events:none`, `alt` = the frame title. **Keep the 1 px bleed.**
- [ ] **P4.8** Empty state: slot numbers 1–4, Unbounded 800, `opacity .35`, on `surface-2`.
- [ ] **P4.9** Gallery page rendering all 3 frames at 18 / 44 / 96 / 150 / 168 / 186 / 230 px, empty and filled.
- [ ] **P4.10** Test: for every frame, every slot, assert the computed percentage matches `frames.json ÷ canvas` to 3 decimals, and that all four slots are inside the canvas.

**Expected result.** The frame gallery is visually indistinguishable from DESIGN-D25 / D02.

**Validation checklist.**
- [ ] Every rendered box measures exactly `w : h = 1080 : 3400` (±1 px)
- [ ] Switching variant changes overlay **and** slots, and does **not** change the box size
- [ ] No photo ever appears on top of a sticker, logo or border
- [ ] At 18 px the thumbnail is still recognisable
- [ ] No white/transparent gap at any edge

**Risks.** Sub-pixel seams at fractional widths (mitigated by the 1 px overlay bleed);
2 MB PNGs on a slow connection (§29).

**DoD.** Adding a fourth frame is a PNG + a JSON line, with zero code change — prove it with a
throwaway F04 in dev.

---

### PHASE 5 — App shell, routing, session

**Goal.** Navigable skeleton with persistent session state.

**Preconditions.** P0, P1.

**Files to create.** `src/app/router.ts`, `src/state/session.ts`, `src/types/session.ts`,
one stub per page.

**Tasks.**
- [ ] **P5.1** Router covering all 13 routes in §5; 404 → `/`.
- [ ] **P5.2** Screen transition: slide 24 px + fade, 240 ms, `--pw-ease-std`; fade-only under reduced motion.
- [ ] **P5.3** `session.ts` holding `displayName`, `showName`, `consentGiven`, `shots[4]`, `selectedFrameId`, `startedAt`, exposed through `@lit/context`.
- [ ] **P5.4** IndexedDB persistence for the session (shot blobs included).
- [ ] **P5.5** The 30-minute resume prompt: *"Tiếp tục bộ đang chụp?"*.
- [ ] **P5.6** A global guard: subscribe to `watchConfig`; when `uploadsOpen === false`, redirect any guest capture route to `/closed`.
- [ ] **P5.7** `/display` renders outside the app shell (own layout, no top bar, cursor hidden).
- [ ] **P5.8** `padding-bottom: calc(32px + env(safe-area-inset-bottom))` applied through a shared page layout class.

**Validation.** Browser back/forward walks the flow correctly. A reload mid-flow restores the
shots. Turning uploads off in the emulator redirects a live client to `/closed`.

**DoD.** Every route renders its stub and keeps state across reloads.

---
### PHASE 6 — Guest flow, part 1: entry and capture (D04, D05, D06, D07, D08, D15)

**Goal.** A guest can arrive, give a name and consent, and shoot four photos.

**Preconditions.** P2, P3, P4, P5.

**Files to create.** `pages/page-welcome.ts`, `page-name.ts`, `page-camera.ts`,
`page-shot-review.ts`, `features/capture/{pw-camera,use-camera,shot-store}.ts`.

**Tasks.**
- [ ] **P6.1** S01 Welcome: partner text strip, 290 px decor zone with the 6 floating shapes at the exact coordinates in §6, the fanned trio of `pw-photowall-frame` at 58×183 rotated −15° / −2° / +12°, hero `PHOTO` + yellow `WALL` chip, promise line, CTA, helper line.
- [ ] **P6.2** Welcome float animations with the exact durations and negative delays; `prefers-reduced-motion` → none.
- [ ] **P6.3** S02 Enter name: top bar, steps, yellow icon disc, H1, input (maxlength 24 + counter), show-name toggle, consent checkbox on `--pw-yellow-100`, CTA gated on `name && consent`.
- [ ] **P6.4** `use-camera`: `getUserMedia` with `facingMode`, mirror, camera switch, and a distinguishable `denied` vs `unavailable` failure.
- [ ] **P6.5** `pw-camera` viewfinder: 4:3 box with the §16 size formula, rule-of-thirds lines at 33.3 %/66.6 %, 4 yellow corner brackets, top pill, bottom hint chip.
- [ ] **P6.6** The 4-cell tray with all three cell states (done / current / todo).
- [ ] **P6.7** Controls row: gallery ibtn 56, shutter 84, switch-camera ibtn 56, with Caption labels beneath; hide switch-camera on single-camera devices.
- [ ] **P6.8** 3-second timer: on by default, 64 px countdown ring, 10 ms haptic per tick, yellow pill toggles `aria-pressed`.
- [ ] **P6.9** Capture: white flash 120 ms, grab the frame at native resolution, honour the mirror state in the saved image.
- [ ] **P6.10** Gallery fallback via `<input type="file" accept="image/*">`, decoded with `createImageBitmap(..., {imageOrientation:'from-image'})`.
- [ ] **P6.11** S04 Shot review: frozen shot, `Vừa chụp` badge, H2, body, `Chụp lại` (secondary) + `Dùng ảnh này` (**success**).
- [ ] **P6.12** Accept animation: the shot flies into tray slot `n` over 400 ms, then the slot border turns green.
- [ ] **P6.13** `shot-store`: write each accepted shot to IndexedDB; revoke replaced object URLs.
- [ ] **P6.14** S03d variant: labels and tray state for shot 4 of 4.
- [ ] **P6.15** E01 camera denied: overlay copy, `Cho phép camera`, `Chọn từ thư viện`, the Safari hint line.
- [ ] **P6.16** Analytics: `pw_start`, `pw_name_done`, `pw_capture{index, source, retakes}`.

**Validation.** Shoot four photos on real iOS Safari and Android Chrome, front and back camera.
Deny permission and confirm E01. Leave at shot 3, return, and confirm the resume prompt keeps
shots 1–2. No screen scrolls at 360 px.

**Risks.** iOS Safari needs a user gesture before `getUserMedia`; HEIC from the iOS gallery;
`100dvh` behaviour with the Safari toolbar.

**DoD.** Four shots land in `session.shots` and render in the tray and in every preview.

---

### PHASE 7 — Guest flow, part 2: frame, review, export (D09, D10)

**Goal.** Pick a frame and produce the exact 1080×3400 JPEG that will be uploaded.

**Preconditions.** P4, P6.

**Files to create.** `pages/page-frame.ts`, `page-review.ts`,
`features/frames/{pw-frame-option,compose}.ts`.

**Tasks.**
- [ ] **P7.1** `pw-frame-option`: 184×73, pad `4 8 4 4`, gap 8, radius 12, 18×57 thumbnail in a 2 px ink / radius 4 wrapper, `.lbl` 10 px label + 12/700 name.
- [ ] **P7.2** Its four states: default (2 px ink), selected (blue border + 3 px blue-100 halo + 20 px check disc), hover (`surface-2`), pressed (`scale .98`), focus ring 3.
- [ ] **P7.3** S05 layout: 154 px left column (150×472 preview in a 2 px ink / radius 12 / shadow-2 wrapper + the 11 px caption), flexible right column with `.lbl "Khung có sẵn · N"` and the card list.
- [ ] **P7.4** Selecting a card swaps overlay **and** slot geometry with a 160 ms crossfade; the photos stay put; the box does not resize.
- [ ] **P7.5** Hide disabled frames; auto-select when only one remains; `aria-pressed` radiogroup semantics.
- [ ] **P7.6** S06 layout: 168×529 strip left, right column with `.lbl "Chụp lại một ô"`, the 2×2 retake grid (56 px tiles, number badge, 22 px retake disc), `.lbl "Khung"`, and the h36 frame chip linking back to `/frame`.
- [ ] **P7.7** The name pill in the S06 top bar links to `/name` with the value prefilled.
- [ ] **P7.8** `Chụp lại hết` → confirm dialog → clear shots → `/camera/1`.
- [ ] **P7.9** **`compose.ts`** exactly as specified in §18.2: cream fill, 4 cover-cropped photos clipped to `roundRect(r=36)`, overlay last, `toBlob('image/jpeg', 0.82)`, retry at `0.75` above 600 KB.
- [ ] **P7.10** Export test: for every frame, compose 4 synthetic images and assert the output is exactly 1080×3400, is `image/jpeg`, and is **< 2 MB**.
- [ ] **P7.11** Pixel test: the composed output and the DOM preview place slot corners within 1 % of each other.
- [ ] **P7.12** Analytics: `pw_frame_select{variant}`.

**Validation.** Switch frames repeatedly — the preview never resizes or reflows. The downloaded
JPEG matches what S06 shows. No sticker or logo is covered.

**Risks.** Slow `roundRect` support in older Safari (provide a path fallback); memory spikes
from four full-resolution bitmaps (close each `ImageBitmap`).

**DoD.** *"Xem trước đúng là ảnh sẽ tải về"* is literally true.

---

### PHASE 8 — Submit, results and error states (D11, D12, D13, D14, D16, D17)

**Goal.** The strip reaches Firestore + Storage, and every outcome has a screen.

**Preconditions.** P7. **Blocked on P0.4** (the frame-id rules fix).

**Files to create.** `pages/page-upload.ts`, `page-done.ts`, `page-me.ts`, `page-closed.ts`,
`features/submit/{upload-controller,download}.ts`.

**Tasks.**
- [ ] **P8.1** S07 layout: steps, the 110×96 loader card with 4 staggered Google blocks, 40×126 mini strip, H1, progress bar, `Huỷ`.
- [ ] **P8.2** `upload-controller`: compose → **`ensureGuest` (only now, never at page load)** → `submitPhoto({image, displayName, frameVariant: selectedFrameId})`.
- [ ] **P8.3** Determinate progress where `bytesTransferred` is available, otherwise the indeterminate 4-block variant.
- [ ] **P8.4** Map every `SubmitError.code` to its screen/toast exactly as in §14.1.
- [ ] **P8.5** E02: keep the blob in memory; `Gửi lại` calls **`resumeSubmission(backend, photoId, image)`**, never `submitPhoto`.
- [ ] **P8.6** `/done` subscribes with `watchMyPhotos` and renders **D13 while `pending`**, upgrading to **D12 on `approved`** in place (§20.5 #3).
- [ ] **P8.7** D12: 90×283 strip, green check disc, H1, moment pill, confetti ×7 **once**, 600 ms overshoot; buttons `Tải dải ảnh về` / `Chụp bộ khác` / `Chia sẻ` / `Dải ảnh của tôi`.
- [ ] **P8.8** D13: 84×264 strip, neutral disc, yellow queue pill, no confetti.
- [ ] **P8.9** Download from the in-memory blob via `createObjectURL` + `<a download>`; after a reload fall back to `photoUrl(backend, id)`.
- [ ] **P8.10** Share via `navigator.share({files})`; hide the button when unsupported.
- [ ] **P8.11** S09 `/me/:id`: dark, 186×586 strip, name, meta, download, and the red **text** `Gỡ dải ảnh của tôi`. **Check §20.5 #9 first** — if the backend transition is not added, remove the affordance rather than shipping a button that fails.
- [ ] **P8.12** E03 `/closed`: partner strip, green disc 96, copy, `Đã đóng lúc …` pill, two buttons.
- [ ] **P8.13** Analytics: `pw_upload_ok{ms,bytes}`, `pw_upload_fail{reason}`, `pw_download`.

**Validation.** Against the emulator: happy path; uploads-closed; a forced network failure
mid-upload followed by a successful `Gửi lại`; two submits inside 60 s producing
`rate-limited` with a sensible countdown.

**Risks.** Double-submitting on retry (the reason `resumeSubmission` exists); losing the blob on
a page reload during upload.

**DoD.** A photo appears in the emulator's `photos` collection with `status: pending`, the
correct `frameVariant`, and a `strip.jpg` under 2 MB.

---

### PHASE 9 — Big screen (D18, D19)

**Goal.** The kiosk screen runs unattended for 8 hours.

**Preconditions.** P4. Independent of P6–P8 — **can run in parallel.**

**Files to create.** `pages/page-display.ts`,
`features/display/{pw-marquee,pw-strip-tile,pw-counter,pw-qr,pw-arrival-card,pw-partner-logos,arrival-queue}.ts`.

**Tasks.**
- [ ] **P9.1** 1920×1080 layout: decor square, header (`PHOTO` + bordered `WALL` chip at 84 px, four 18 px dots), body row (gap 40), footer strip h112.
- [ ] **P9.2** `pw-marquee`: 1236×760 viewport (radius 24, border 3 ink), track with **duplicated content**, `translateX(0 → -50%)`, 70 s linear infinite, pause on hover, 80 px white edge fades both sides.
- [ ] **P9.3** `pw-strip-tile` at 230×724: radius 20, border 3 ink, name pill h38 (border 3, 18/700, ellipsis, inset 12), `MỚI` tag at `top 70 left 14` for 6 s.
- [ ] **P9.4** `pw-counter`: green card radius 32, border 3, shadow-2, number Unbounded 132, caption 32 with `.06em`; roll-up 400 ms; `+1` yellow pill for 1.5 s; block pulse `scale(1.02)`.
- [ ] **P9.5** `pw-qr` card + `Đến lượt bạn` (40/800) + `Quét QR để lên Wall` (24/600); QR generated at build time, quiet zone ≥ 4, nothing overlaid.
- [ ] **P9.6** `pw-partner-logos`: six 76 px discs, border 4 ink, gap 20, in the fixed order, with the **GDGoC padding 15.2** and the **AWS `cover` + `#3BB0FF`** exceptions, and the two `×` separators.
- [ ] **P9.7** Wire `watchApproved(backend, cb, 80)` and `watchStats`.
- [ ] **P9.8** `pw-arrival-card` + the dim layer, with the full 700 ms rise / 5 s hold / 600 ms fly sequence and the 7 fixed confetti chips.
- [ ] **P9.9** `arrival-queue`: at most 3 queued cards; overflow merges into `+N dải ảnh mới` (marked *"Trong spec"* on DESIGN-D32 — it is not drawn, build it from this rule).
- [ ] **P9.10** `removedIds` drops a tile immediately; **the marquee must not jump**.
- [ ] **P9.11** Hide the cursor; reload the page every 6 hours.
- [ ] **P9.12** Reduced motion: **the marquee becomes a paged slideshow, one page per 8 s.**
- [ ] **P9.13** Soak test: 8 hours with photos arriving; watch heap and frame rate.

**Validation.** Approve a photo in another tab — within ~1 s the dim + card + `+1` sequence
runs and the tile lands at the head of the track, without the marquee ever stopping.

**Risks.** Memory growth over 8 hours (window the DOM, cap `max`); 200 full-size JPEGs (§29);
the browser throttling animation in a background tab (the kiosk must stay foreground).

**DoD.** Runs 8 hours unattended with stable memory and no visible stutter.

---

### PHASE 10 — Moderation console (D20, D21, D22)

**Goal.** Staff can clear the queue fast, from a keyboard.

**Preconditions.** P2, P3, P4. **Read §20.5 #9, #10, #11, #12 before starting.**

**Files to create.** `pages/page-mod.ts`, `page-mod-settings.ts`,
`features/moderation/{pw-mod-row,pw-mod-table,pw-mod-shortcuts}.ts`.
**Files to modify.** `backend/src/client.ts` (add `watchByStatus`).

**Tasks.**
- [x] **P10.1** M00: sign-in screen plus the "not on the allowlist" error banner naming the email. `signInWithPopup` + `isModerator()`.
- [x] **P10.2** M01 header: logo tile 44, title block, and the pill cluster (count · uploads-open toggle · settings · user · sign out), all h36.
- [x] **P10.3** `pw-tabs` with live counts for `Chờ duyệt` / `Đã duyệt` / `Đã gỡ`.
- [x] **P10.4** Add `watchByStatus(b, status, max)` to `backend/src/client.ts` for the approved and removed tabs (the `status+reviewedAt` index already exists).
- [x] **P10.5** `pw-mod-table` with the exact grid `44px 96px minmax(0,1fr) 170px 330px 220px`, gap 16, pad `10 20`, 2 px `--pw-line` dividers, `surface-2` header with `.lbl` columns.
- [x] **P10.6** `pw-mod-row`: 44 px `pw-photowall-frame` thumb, name Body 700, meta Body S (`#131 · khung F03 · …`), time + waiting line that **turns red past 3 minutes**, status pill 32, S action buttons.
- [x] **P10.7** Per-mode actions: pending → `Duyệt` + `Gỡ`; approved → `Gỡ`; removed → `Khôi phục` (**gated on §20.5 #9**).
- [x] **P10.8** Confirm dialog for every destructive action, with the reason radio group (**persist it or drop it — §20.5 #16**).
- [x] **P10.9** Swallow `AlreadyReviewedError` silently; the row disappears via the snapshot anyway.
- [x] **P10.10** Keyboard: `A` approve, `R` remove, `↑ / ↓` move the row cursor, with a visible cursor state.
- [x] **P10.11** Bulk selection: checkbox 24, blue row tint, bulk bar with `Bỏ chọn` / `Duyệt N ảnh` / `Gỡ N ảnh`.
- [x] **P10.12** Empty / loading / error states via `pw-state`.
- [x] **P10.13** M02 tier 1: `Đang nhận ảnh` (wired to `setUploadsOpen`) and `eventName`. Everything else rendered **visibly disabled** with a note, until the config schema is widened. *Superseded by `8fe65e9`: the schema now takes every M02 field, so all are live; only SafeSearch stays disabled.*
- [x] **P10.14** M02 frame section: read the registry, show the `Đã khoá · duyệt 24.09` badge and each file name. Enable/disable is **frontend-only config** until there is somewhere to store it (§31 Q10).
- [x] **P10.15** Moderator list: read-only (`moderators/{email}` is console-managed and not client-listable). *Superseded by `8fe65e9`: `watchModerators` / `saveModerator` / `deleteModerator` exist, so the list is editable as drawn.*

**Validation.** Two moderators acting on the same photo: one succeeds, the other sees nothing
break. Approving puts the photo on the big screen within ~1 s. Removing takes it off and
decrements the counter.

**Risks.** Building UI for backend capabilities that do not exist — re-read §20.5 first.

**DoD.** A staffer can clear a 20-photo queue in under a minute using only the keyboard.

---

### PHASE 11 — Responsive, accessibility and polish

**Preconditions.** P6–P10.

**Tasks.**
- [ ] **P11.1** Verify every screen at 360 / 390 / 430 / 768 / 1024 / 1280 / 1920 against §16.
- [ ] **P11.2** Confirm the capture flow never scrolls at 360 with the browser chrome visible.
- [ ] **P11.3** Tablet/desktop: centre the flow in a 430 px column; buttons never exceed 342 px.
- [ ] **P11.4** Apply the safe-area padding on every CTA screen; test on a notched iPhone.
- [ ] **P11.5** Full keyboard pass on every screen; verify the 3 px / 3 px focus ring.
- [ ] **P11.6** Screen-reader pass: labels, roles, dialog semantics, live regions.
- [ ] **P11.7** Verify every contrast pair in §7.1 with a checker.
- [ ] **P11.8** Implement and verify every `prefers-reduced-motion` rule, **including the marquee → slideshow swap**.
- [ ] **P11.9** 200 % browser zoom on the whole guest flow.
- [ ] **P11.10** Confirm all Vietnamese diacritics render in both fonts at 11 px and 132 px.

**DoD.** §17 is satisfied without any visual change to the design.

---

### PHASE 12 — QA, hardening and event readiness

**Preconditions.** P11.

**Tasks.**
- [ ] **P12.1** Device matrix: **Safari iOS 16+**, **Chrome Android 12+**, front and back camera, **HEIC from the iOS gallery**, **throttled 3G**.
- [ ] **P12.2** Big screen: **8 hours continuous**, memory and frame-rate profile.
- [ ] **P12.3** Load: replay `backend/scripts/load-test.ts` (800 sessions) against the emulator with the real frontend export path.
- [ ] **P12.4** Full §28 visual QA against this document.
- [ ] **P12.5** Export integrity: for each frame, verify 1080×3400, < 2 MB, no covered sticker, correct slot order.
- [ ] **P12.6** App Check: register debug tokens for every dev machine and the kiosk; confirm production requests carry a token.
- [ ] **P12.7** Deploy a preview channel: `npx firebase hosting:channel:deploy review --project prod`.
- [ ] **P12.8** **Lock the frame set 3 days before the event**; request ≥ 1080×3400 originals of F01/F02 if available.
- [ ] **P12.9** On-site rehearsal one day before: real wifi, real projector, real phones.
- [ ] **P12.10** Write the run-book: how to open/close uploads, what to do if the big screen freezes, who is on the allowlist.

**DoD.** A rehearsal completes end to end on the venue network with the real hardware.

---

## 23. Atomic Development Tasks

The phase checkboxes above are already atomic. This section adds the finer granularity for the
three riskiest areas, where a single developer or Claude session should stop and verify.

### 23.1 Frame system (P4) — the critical path

- [ ] Create `types/frame.ts` with `SlotRect`, `FrameId`, `FrameTemplate`, `FrameRegistry`
- [ ] Write `frame-registry.ts` that fetches and caches `/frames/frames.json`
- [ ] Add registry validation: canvas equals `[1080,3400]`
- [ ] Add registry validation: ids unique and non-empty
- [ ] Add registry validation: exactly 4 slots per frame
- [ ] Add registry validation: every slot inside `0..1080 × 0..3400`
- [ ] Add registry validation: each `overlay` resolves to a reachable image
- [ ] Create `pw-photowall-frame` with the root box only (`aspect-ratio`, `overflow: clip`)
- [ ] Add the `width` property and derive height from the aspect ratio
- [ ] Add percentage computation `x/1080, y/3400, w/1080, h/3400`
- [ ] Render the four empty slots with `surface-2` and the scaled radius
- [ ] Add the numbered empty state (Unbounded 800, `opacity .35`)
- [ ] Add the overlay `<img>` with the `-1px / +2px` bleed and `pointer-events: none`
- [ ] Add the `photos` property and `object-fit: cover` rendering
- [ ] Verify at 18 px
- [ ] Verify at 230 px
- [ ] Verify the variant swap does not change the box size
- [ ] Write the percentage-vs-JSON unit test
- [ ] Build the frame gallery page

### 23.2 Composition & export (P7.9–P7.11)

- [ ] Create `compose.ts` with the 1080×3400 canvas and the cream fill
- [ ] Implement `drawCover(ctx, img, x, y, w, h)`
- [ ] Add per-slot `roundRect` clipping at `r = 36`
- [ ] Decode shots with `createImageBitmap(..., {imageOrientation:'from-image'})`
- [ ] Close every `ImageBitmap` after drawing
- [ ] Load and draw the overlay last, at exactly `0,0,1080,3400`
- [ ] Encode at quality `0.82`
- [ ] Add the `0.75` retry above 600 KB
- [ ] Assert the result is `< 2 MB` before returning
- [ ] Test: output is exactly 1080×3400 for all three frames
- [ ] Test: output MIME is `image/jpeg`
- [ ] Test: a portrait input and a landscape input both fill the slot with no letterboxing
- [ ] Test: composed slot corners match the DOM preview within 1 %

### 23.3 Big-screen arrival sequence (P9.8–P9.10)

- [ ] Render the dim layer and verify it covers only the marquee viewport
- [ ] Build the arrival card shell at 600×690 with the correct radii, border and offset shadow
- [ ] Place the 7 confetti chips at their fixed coordinates
- [ ] Add the rotated strip and the text column
- [ ] Wire `pw-rise` (700 ms, `cubic-bezier(.2,.8,.2,1)`)
- [ ] Hold 5 s, then run the 600 ms fly-to-track
- [ ] Add the `MỚI` tag for 6 s on the landed tile
- [ ] Wire the counter roll-up and the `+1` pill (1.5 s)
- [ ] Build `arrival-queue` with a maximum of 3
- [ ] Add the `+N dải ảnh mới` merge beyond 3
- [ ] Verify the marquee never pauses during the whole sequence
- [ ] Verify `removedIds` removes a tile without a layout jump

---

## 24. Recommended Implementation Order

```
P0.1 → P0.2 → P0.3 → P0.4 → P0.5 → P0.6 → P0.7 → P0.8 → P0.9
   |     (P0.4 unblocks every upload path — do not defer it)
   v
P1.1 → P1.2 → P1.3 → P1.4 → P1.5 → P1.6
   |
   +------------------+------------------+
   v                  v                  v
P2 (controls)      P4 (frames)        P5 (shell/routing)
   |                  |                  |
   v                  |                  |
P3 (patterns)         |                  |
   |                  |                  |
   +--------+---------+------------------+
            v
        P6 (welcome / name / camera)
            v
        P7 (frame select / review / compose)     <-- needs P4
            v
        P8 (upload / done / errors)              <-- needs P0.4
            |
            +-----------------------------+
            v                             v
        P10 (moderation)              P9 (big screen)   <-- needs only P4
            |                             |
            +--------------+--------------+
                           v
                      P11 (responsive / a11y)
                           v
                      P12 (QA / event readiness)
```

### Why this order

1. **P0.4 (the frame-id fix) is first among equals.** Every upload written before it carries a
   wrong `frameVariant`, and the rules will reject the correct value. Fixing it later means
   re-seeding the emulator and rewriting data.
2. **P1 before everything visual.** Any component built before the tokens exist will be full of
   hardcoded hexes that then have to be unpicked.
3. **P4 (frames) early and in parallel.** It is on the critical path for P7, P9 and P10
   simultaneously, and it is the piece most likely to reveal a measurement problem.
4. **P5 (shell) in parallel with P2/P3.** Routing and session have no visual dependencies.
5. **P9 (big screen) does not need the guest flow.** It only needs P4 plus `watchApproved`, so
   it can be built against seeded emulator data from day one.
6. **P11 last but not skipped.** Responsive and a11y are verification passes over finished
   screens, not a separate feature.

---

## 25. Parallel Work Opportunities

### Safe to run simultaneously, after P0 and P1

| Track | Developer | Owns | Touches |
|---|---|---|---|
| **A — Frames & export** | Dev A | `types/frame.ts`, `features/frames/**`, `public/frames/**` | P4, P7.1–P7.5, P7.9–P7.11 |
| **B — Control & pattern library** | Dev B | `components/controls/**`, `components/patterns/**` | P2, P3 |
| **C — Shell, routing, session** | Dev C | `app/**`, `state/**`, page stubs | P5 |
| **D — Big screen** | Dev D | `features/display/**`, `pages/page-display.ts` | P9 (needs A's `pw-photowall-frame`; can start against a stub) |
| **E — Moderation** | Dev E | `features/moderation/**`, `pages/page-mod*.ts`, `backend/src/client.ts` (`watchByStatus`) | P10 (needs B and A) |

After P2/P3/P4/P5 land, the guest flow (P6 → P7 → P8) is **inherently sequential** — each screen
consumes the state the previous one produces — so put your strongest developer on it and let the
others take D and E.

### Must NOT be done in parallel

| Conflict | Why |
|---|---|
| Two people editing `styles/tokens.css` | It is the root of everything; one owner, reviewed changes only. |
| Two people editing `pw-photowall-frame` | 12 artboards depend on it; a change to slot maths breaks preview, Wall, moderation and export at once. |
| Two people editing `frames.json` | One wrong digit silently produces a wrong export. |
| `backend/src/schema.ts` + `firestore.rules` | These two **must change in the same commit** — the rules file carries a comment saying so. One person does P0.4. |
| P6 and P7 in parallel | P7 consumes `session.shots`, which P6 defines. |
| P8 before P0.4 | The rules will reject the writes. |

---

## 26. Git / Collaboration Strategy

### Branch model

`backend` is the remote default and holds the Firebase contract. Merge it into `main` in P0.1
and treat `main` as the integration branch. Feature branches: `feat/<area>-<short>`.

### Commit boundaries

The existing backend history uses Conventional Commits in Vietnamese. Match that style.
One reviewable commit per atomic task or small group.

```
chore(repo): gộp nhánh backend vào main, thêm khung frontend
build(frontend): dựng Vite + Lit + TypeScript, thêm resolve.dedupe cho Firebase
fix(backend): đổi FRAME_VARIANTS sang id khung thật, cập nhật firestore.rules
feat(design-system): thêm token CSS và 10 style chữ
feat(ui): thêm pw-button với 6 variant và 6 state
feat(ui): thêm pw-input, pw-select và 5 state
feat(frames): thêm frames.json registry và kiểm tra hợp lệ
feat(frames): thêm PhotoWallFrame với 4 slot và overlay
feat(capture): thêm màn chụp 4 tấm với hẹn giờ 3 giây
feat(capture): giữ ảnh đã chụp trong IndexedDB
feat(frames): ghép 4 ảnh vào canvas 1080x3400 và xuất JPEG
feat(submit): nối luồng gửi ảnh với submitPhoto và xử lý lỗi
feat(display): thêm băng trượt màn hình lớn 70 giây
feat(display): thêm card "Vừa lên Wall" và bộ đếm
feat(mod): thêm bảng kiểm duyệt 3 tab và phím tắt
style(responsive): kiểm tra 360/430 và safe-area
test(export): kiểm tra ảnh xuất đúng 1080x3400 dưới 2 MB
docs(plan): cập nhật checkbox phase 4
```

### High-conflict files — coordinate before touching

| File | Owner | Rule |
|---|---|---|
| `frontend/src/styles/tokens.css` | design-system owner | PR + review, never a drive-by edit |
| `frontend/src/features/frames/pw-photowall-frame.ts` | Dev A | any change needs the frame gallery re-checked |
| `frontend/public/frames/frames.json` | Dev A | changes need the export test re-run |
| `backend/src/schema.ts` **+** `backend/firestore.rules` | one person | **always the same commit** |
| `frontend/src/app/router.ts` | Dev C | everyone adds routes through them |
| `frontend/vite.config.ts` | Dev C | the `dedupe` array must never be dropped |
| `Claude/Claude-Plan.md` | whoever finishes a phase | tick boxes; record decisions in §31/§32 |

### PR checklist

- [ ] No raw hex or px outside `tokens.css`
- [ ] Every new component has every state from DESIGN-D02/D03
- [ ] Icon-only controls have `aria-label`
- [ ] Nothing violates §33 Design Invariants
- [ ] Checkboxes in §22 updated
- [ ] If a design decision changed, §31 or §32 updated in the same PR

---
## 27. Testing Strategy

### 27.1 Unit tests

| Target | Scenarios |
|---|---|
| `frame-registry` | valid JSON loads; canvas must be `[1080,3400]`; duplicate id rejected; 3 or 5 slots rejected; a slot outside the canvas rejected; missing overlay rejected |
| slot geometry | for every frame × slot, `pct == px / canvas` to 3 dp; radius scales as `r × width / 1080` |
| `drawCover` | portrait source → fills, crops height; landscape source → fills, crops width; square source; 1×1 pixel source does not divide by zero |
| `compose` | output exactly 1080×3400; MIME `image/jpeg`; `< 2 MB`; quality falls back to 0.75 above 600 KB |
| session store | persists and restores all four shots; the 30-minute window expires correctly; "Chụp lại hết" clears everything |
| name validation | empty, whitespace-only, 24 chars, 25 chars, leading/trailing spaces trimmed |
| error mapping | each `SubmitErrorCode` maps to the screen/toast in §14.1 |
| arrival queue | 1 / 3 / 7 simultaneous arrivals; the 4th and beyond merge into `+N` |

### 27.2 Component tests

| Component | Assertions |
|---|---|
| `pw-button` | renders all 6 variants; disabled does not emit `click`; pressed applies the 2 px translate and drops the shadow |
| `pw-input` | error renders border **and** icon **and** text; counter tracks length; `maxlength` enforced |
| `pw-photowall-frame` | box ratio is 1080:3400 at 18 / 150 / 230 / 1080; the overlay is the last child; changing `variant` does not change the box size |
| `pw-frame-option` | selected renders the check disc and the halo; `aria-pressed` reflects state |
| `pw-dialog` | focus is trapped; `Esc` cancels; scrim click cancels; focus returns to the opener |
| `pw-steps` | the current index gets the ink chip; earlier steps get green |
| `pw-tabs` | `role`/`aria-selected` correct; counts render |
| `pw-marquee` | the item list is rendered twice; the animation targets `-50%` |
| `pw-topbar` | the right slot occupies 48 px even when empty |

### 27.3 Interaction / integration tests (against the emulator)

Reuse `backend/scripts/seed-emulator.ts` and the `firebase emulators:exec` pattern already in
`backend/package.json`.

| Flow | Assertions |
|---|---|
| Happy path | name → 4 shots → frame → review → send → `photos/{id}` exists with `status: pending`, the right `frameVariant`, and a `strip.jpg` < 2 MB |
| Retake | retaking slot 3 leaves slots 1, 2, 4 untouched |
| Frame switch | switching after all four shots keeps the shots and changes only overlay + slots |
| Uploads closed | `setUploadsOpen(false)` → a live client redirects to `/closed` |
| Rate limit | two submits within 60 s → `rate-limited` with a sensible `retryAfterSeconds` |
| Resume | kill the network mid-upload → E02 → `Gửi lại` succeeds **without** creating a second photo doc |
| Moderation | `approve` → the photo appears on `/display` within ~2 s and `approvedCount` increments |
| Concurrency | two moderators approve the same photo → one succeeds, the other gets `AlreadyReviewedError` and the UI does not break |
| Removal | `remove` → the tile leaves `/display`, the counter decrements, and the storage object is gone |
| Permissions | a guest cannot read another guest's `pending` photo; an unauthenticated client **can** read `approved` photos |

### 27.4 Visual QA
Run §28 against every artboard listed in §3.

### 27.5 Responsive QA
Every screen at 360 / 390 / 430 / 768 / 1024 / 1280 / 1920, per §16.

### 27.6 Image export QA

- [ ] For each of the 3 frames: compose, download, open at 100 % and confirm **1080×3400**
- [ ] No sticker, logo or border is covered by a photo
- [ ] No transparent or white gap at any slot edge (the 6 px bleed does its job)
- [ ] Portrait, landscape and square inputs all fill their slot without distortion
- [ ] A photo with EXIF rotation lands upright
- [ ] File size is comfortably under 2 MB on a mid-range Android
- [ ] The downloaded file is byte-identical to the one uploaded (same blob)

### 27.7 Cross-browser QA **[C]**

The design names the exact matrix: **Safari iOS 16+**, **Chrome Android 12+**, front and back
camera, **HEIC from the iOS photo library**, **simulated 3G**, and the **big screen running 8
hours continuously**. Test all of it — several of these are where photobooth apps usually break.

---

## 28. Visual QA Checklist

Tick these against the corresponding DESIGN-D## in §3.

### Global
- [ ] Page background is `#FAF7F2`, never pure white
- [ ] Every container has a **2 px** ink outline (3 px only on the big screen and the active capture slot)
- [ ] Shadows are hard offsets (`3 3 0` / `4 4 0` ink) — **no blur, no gradient, no glass**
- [ ] Only **one** primary (blue) button per screen
- [ ] Only the 10 type styles are used — no 14 / 16 body, no 18 / 22 / 30 heading
- [ ] Only the 4-8-12-16-20-24-32-40-48-64 spacing steps — **no 6 / 10 / 14 / 18 / 22 / 28**
- [ ] Mobile gutter is exactly 20; big-screen gutter exactly 64
- [ ] Bottom CTA blocks have `padding-bottom: 32 + safe-area`
- [ ] Vietnamese diacritics render correctly at 11 px and at 132 px

### Frames (DESIGN-D23/24/25)
- [ ] Every strip is exactly **1080 : 3400 (1 : 3.148)**, everywhere
- [ ] Slot positions match `frames.json` to the pixel
- [ ] Slot radius reads as 36 px at 1080 scale
- [ ] The overlay is always **above** the photos
- [ ] No photo bleeds past its slot into the artwork
- [ ] Changing frame does not change tile size on the Wall

### Welcome (D04)
- [ ] `WALL` chip is `#FBBC04`, radius 8, **no border**
- [ ] Hero is Unbounded 64 / .95, weight 800
- [ ] Three fanned strips at −15° / −2° / +12°, in the order f01 · f02 · f03
- [ ] Decor floats subtly and stops entirely under reduced motion

### Name (D05)
- [ ] Consent row background is `#FEEFC3`
- [ ] Toggle is 48×28 with a 20 px knob; on-state is `#188038`
- [ ] Counter reads `n/24`
- [ ] CTA is disabled until name + consent

### Camera (D06/D08)
- [ ] Screen background is `#1C1B33`
- [ ] Viewfinder is 4:3, radius 20, 2 px white border
- [ ] Corner brackets are 4 px `#FBBC04`
- [ ] Thirds lines are `rgba(255,255,255,.18)`
- [ ] Tray cells are 72×54, gap 12; current = 3 px yellow, todo = 2 px dashed, done = 2 px green + check
- [ ] Shutter is 84 with a 66 px blue core, white ring 4, ink ring 3
- [ ] Timer pill is on by default

### Frame select (D09)
- [ ] Preview is 150 px wide with a 4 4 0 shadow
- [ ] Cards are 184×73, pad `4 8 4 4`, radius 12
- [ ] Thumbnails are 18×57
- [ ] Selected = blue border + 3 px blue-100 halo + 20 px check disc
- [ ] Preview swaps in 160 ms and the box does not resize

### Review (D10)
- [ ] Strip is 168 px wide
- [ ] Retake tiles are 56 px tall in a 2×2 grid, gap 8
- [ ] The number badge is top-left, the retake disc bottom-right
- [ ] The frame chip is h36 and links back to `/frame`

### Done (D12/D13)
- [ ] D12 strip 90 px with a **green** check disc; D13 strip 84 px with a **neutral** disc
- [ ] Confetti fires exactly once on D12 and never on D13
- [ ] D13's queue pill uses yellow-100 background + yellow-700 text

### Big screen (D18/D19)
- [ ] Hero is 84 px; the `WALL` chip **does** have a 3 px border here
- [ ] Marquee viewport is 1236×760, radius 24, border 3
- [ ] Tiles are 230×724, gap 24
- [ ] Name pill is h38, border 3, 18/700, ellipsised
- [ ] Edge fades are 80 px
- [ ] Counter card is `#34A853`, number at 132, caption at 32 with `.06em`
- [ ] Six logos, 76 px, border 4, gap 20, **in the fixed order**
- [ ] GDGoC disc uses padding 15.2; AWS disc uses `cover` on `#3BB0FF`
- [ ] Arrival card is 600×690, yellow, border 4, shadow `8px 0 0`
- [ ] The marquee never stops, not even during an arrival
- [ ] Smallest text anywhere is 18 px

### Moderation (D21)
- [ ] Grid is `44 96 1fr 170 330 220`, gap 16
- [ ] Row dividers are 2 px `#DAD6CE`; header is `surface-2`
- [ ] Action buttons are size **S** only
- [ ] Waiting time turns red past 3 minutes
- [ ] `A` / `R` / `↑↓` work

---

## 29. Performance Considerations

| Concern | Reality | Action |
|---|---|---|
| **Frame PNGs are 2 MB each** | F01 1.99 MB, F02 2.03 MB, F03 236 KB. On booth wifi that is a slow first paint. | Preload only the **default** frame; lazy-load the others when `/frame` mounts. Serve with a long `Cache-Control`. Consider a `<picture>` WebP for *previews* while keeping the PNG for the **export** (the export must stay the organiser's original file). |
| **Four full-resolution bitmaps at compose time** | A 12 MP phone camera → ~4 × 48 MB of decoded RGBA. | `createImageBitmap` → draw → **`bitmap.close()`** immediately. Never hold all four decoded at once if it can be avoided; draw them one at a time (the algorithm in §18.2 already does). |
| **Big screen holds up to 200 full-size JPEGs** | There are no thumbnail derivatives (§20.5 #4). | Pass a smaller `max` (80) to `watchApproved`. Window the DOM: render only the tiles near the viewport plus the duplicate needed for the loop. Use `loading="lazy"` and `decoding="async"`. |
| **8-hour marquee** | Memory creep and layout thrash. | Animate `transform` only (already the case), never `left`. Recycle tile nodes rather than appending forever. Reload every 6 hours as a safety net. |
| **Re-renders on snapshot** | `watchApproved` fires the whole list each time. | Diff by id and patch; never rebuild the track wholesale, or the animation restarts and the Wall visibly jumps. |
| **Font loading** | Two families, Vietnamese subset. | `display=swap`, preload the two woff2, subset to `latin` + `vietnamese` only. |
| **JPEG encode on a low-end phone** | `toBlob` at 1080×3400 can take a second or two. | It happens on `/upload`, which already shows a progress state. Encode **before** calling `ensureGuest` so the rate-limit clock starts as late as possible. |
| **IndexedDB blobs** | Four camera shots per session. | Clear on successful submit and on "Chụp lại hết"; expire anything older than 30 minutes. |

---

## 30. Risks & Edge Cases

| Risk | Likelihood | Handling |
|---|---|---|
| **HEIC from the iOS gallery** | High | `createImageBitmap` handles HEIC in modern Safari; on failure show an error toast and suggest retaking. Explicitly in the design's test matrix. |
| **Very large image (48 MP)** | Medium | Downscale to at most ~2000 px on the long edge before storing the shot; the slot is only 746 px wide at most. |
| **Portrait vs landscape input** | Certain | Cover-crop handles both. Worst measured loss is 8.7 % (§18.5). |
| **EXIF rotation ignored** | Medium | Always `createImageBitmap(blob, {imageOrientation:'from-image'})`. |
| **Camera permission denied** | High at an event | E01 exists, with the Safari instruction line and the gallery fallback. |
| **Single-camera device** | Medium | Hide the switch-camera control. |
| **Mirror confusion** | Medium | Whatever is previewed mirrored must be **saved** mirrored — otherwise the guest's text/gesture flips in the export. |
| **Network drops mid-upload** | High on venue wifi | E02 + `resumeSubmission` with the retained blob. **Never re-`submitPhoto`.** |
| **Guest reloads during upload** | Medium | The blob is lost; the photo doc is stuck at `uploading`. Offer "start over"; `uploading` photos are invisible to everyone. |
| **Anonymous-auth IP quota** | **High** — the whole venue shares one wifi IP | Call `ensureGuest` **only on Send**. This is the single most important operational rule in `docs/frontend-integration.md`. |
| **App Check blocks localhost** | Certain | Use the emulator, or register a debug token. |
| **Two moderators, one photo** | High | `AlreadyReviewedError` → swallow silently. |
| **Nobody staffing moderation** | **High** — nothing auto-approves | Nothing reaches the Wall. Operationally: keep the console staffed, and **turn uploads off when it is not**. |
| **Big screen frozen** | Medium | 6-hour reload + a documented manual refresh in the run-book. |
| **Browser zoom / 200 %** | Low | Single-column flow survives it. |
| **Frame overflow / distortion** | Low | Fixed `aspect-ratio` + `cover` + uniform overlay draw. |
| **Logo distortion** | Low | `object-fit: contain`; never set both width and height to 100 %. |
| **Fonts fail to load** | Medium | `display=swap` + a system fallback stack; the layout must not shift catastrophically. Test with fonts blocked. |
| **Very long name** | Medium | `maxlength 24` + `text-overflow: ellipsis` in the big-screen pill. |
| **Empty Wall at the start** | Certain | `pw-state` empty: *"Chưa có dải ảnh nào — Hãy là người đầu tiên để lại khoảnh khắc!"* |
| **F01/F02 are upscales** | Certain | Downloads are softer than ideal. Ask for native originals (§31 Q1). |
| **Frame set changes late** | Medium | Frozen 24.09; lock files 3 days before the event. |
| **Storage object deleted on reject/remove** | Certain | Any restore feature must account for this (§20.5 #9). |

---

## 31. Unresolved Design Questions

Genuinely open items. Everything else in this document is settled.

| # | Question | Why it matters | Current evidence | Recommendation |
|---|---|---|---|---|
| **Q1** | Are native ≥ 1080×3400 originals of F01/F02 available? | The downloaded strip is currently a 1.567× upscale of a 725×2170 source. | DESIGN-D24 explicitly asks the organisers for them. | Ask before the event. Drop-in replacement, no code change. |
| **Q2** | Do we build **restore** (M01) and **guest self-remove** (S09)? | Both are drawn, neither is permitted by the current rules, and both would need the storage object to survive. | `firestore.rules` allows only `pending→approved\|rejected` and `approved→removed`; `reject`/`remove` delete the object. | Decide before Phase 8/10. If yes: add the transitions, stop deleting on `remove`, sweep later. If no: remove both affordances rather than shipping dead buttons. |
| **Q3** | Is `logo-gdgoc-lockup.png` needed? | Named in DESIGN-D30's asset list but never uploaded or used. | Not referenced by any artboard. | Skip unless a horizontal lockup is wanted somewhere. |
| **Q4** | Per-session submit cap: **3** (design) or **20** (backend)? | Affects the rules constant and the M02 label. | DESIGN-D31 says "≤ 3 bộ / phiên"; `firestore.rules` enforces `submitCount <= 20`. | Confirm with the organisers, then change **the rule**, not the UI. |
| **Q5** | Where does *"Khoảnh khắc #129"* come from? | Shown on S08, S08b, S09, D19 and every moderation row. | No such field on `PhotoDoc`. | Simplest: assign `approvedCount` at approval time inside the existing transaction. Otherwise drop the number. |
| **Q6** | Can the moderator list be shown at all? | M02 renders four moderators with roles. | `moderators/{email}`: a signed-in user may read **only their own** entry; `allow write: if false`. | Show only the current user, plus a line pointing at the Firebase console. The Admin/Moderator role split has no backend equivalent. |
| **Q7** | Is the "7 days" retention promise on E03 real? | It is a commitment made to the user in copy. | No lifecycle rule exists in the repo. | Either configure a Storage lifecycle rule, or change the copy. |
| **Q8** | Favicon, app icon, OG image? | Needed for a shareable link. | Not in the design. | Derive from the GDGoC brackets mark, with organiser approval. |
| **Q9** | Where does the removal **reason** get stored? | M01's dialog collects it and says it is logged. | `moderatorReviews()` allows only `status`, `reviewedAt`, `reviewedBy`. | Either add a `reviewReason` field (and allow it in the rules) or drop the radio group. |
| **Q10** | Where is per-frame enable/disable stored? | M02 toggles frames; S05 must hide disabled ones. | `config/app` accepts only `{uploadsOpen, eventName}`. | Add `enabledFrames: string[]` to the config document and to the rules, or keep it a build-time constant for v1. |
| **Q11** | Exact marquee speed: 70 s/loop or 40 px/s? | They disagree once the tile count is known. | DESIGN-D29 states both. | Ship **70 s per loop** (the literal animation value) and expose the M02 px/s control later. |
| **Q12** | Minimum big-screen font: 18 or 22? | DESIGN-D30 says 18, DESIGN-D29 says 22. | The smallest text actually drawn is **18** (the name pill). | Use **18** as the floor; it is what the artboard does. |

---

## 32. Confirmed Design Decisions

These are settled. **A future session must not "improve" them.**

### DO NOT

- ❌ **Do not add a photo wall, feed or gallery to the phone.** Removed deliberately so people
  gather at the booth; also removed from the backend (`3faa188`).
- ❌ **Do not add sticker/text/decoration editing.** Guests choose a frame, nothing more.
- ❌ **Do not add a guest login.** Anonymous auth, invisible, triggered only on Send.
- ❌ **Do not add a "report photo" button for guests.**
- ❌ **Do not add a minigame.**
- ❌ **Do not change the frame canvas** from 1080×3400, or the slot count from 4.
- ❌ **Do not reorder the six partner logos**, and do not recreate any of them.
- ❌ **Do not redraw the frame artwork** or composite anything above the overlay layer.
- ❌ **Do not introduce new type sizes** (no 14/16 body, no 18/22/30 heading) or new spacing
  steps (no 6/10/14/18/22/28).
- ❌ **Do not add blur, gradients or glassmorphism.** Shadows are hard ink offsets.
- ❌ **Do not use more than one primary button per screen.**
- ❌ **Do not use the Success button variant** outside `Dùng ảnh này` and `Duyệt`.
- ❌ **Do not call `ensureGuest()` on page load.**
- ❌ **Do not call `submitPhoto` again after an `upload-failed`** — use `resumeSubmission`.
- ❌ **Do not poll Firestore.** Everything is `onSnapshot`.
- ❌ **Do not write to `photos/` directly** with `setDoc`/`uploadBytes` — only via `client.ts`.
- ❌ **Do not drop `resolve.dedupe`** from `vite.config.ts`.
- ❌ **Do not add routes** beyond the 13 in §5.

### MUST

- ✅ **Preserve 1080 : 3400 (1 : 3.148)** for every strip rendering, everywhere.
- ✅ **Keep the layer order**: 4 photo slots below, frame overlay above.
- ✅ **Keep the 6 px slot bleed** — it is what stops background showing through.
- ✅ **Use the original logo and frame PNGs** from `frontend/public/`.
- ✅ **Keep the flow at three steps** (Tên → Chụp → Gửi) and the ≤ 45 s median target.
- ✅ **Keep the per-shot review** — a guest must be able to retake one shot without losing the rest.
- ✅ **Keep the 3-second timer on by default.**
- ✅ **Keep consent explicit** and the show-name toggle available.
- ✅ **Keep the capture flow scroll-free** at 360 px.
- ✅ **Keep the marquee running** — it never stops, not even during an arrival.
- ✅ **Keep every error message paired with a fix.**
- ✅ **Keep the copy Vietnamese, second person, one sentence per screen, verbs on buttons.**
- ✅ **Keep `html lang="vi"`.**

---

## 33. Design Invariants

Nine rules. If a change would break one of these, it is a redesign and needs the organisers.

| # | Invariant | Where it comes from |
|---|---|---|
| **I1** | Every photobooth strip is **1080 × 3400 px**, ratio **1 : 3.148**, in preview, on the Wall, in moderation and in the export. Changing a frame never changes a tile's size. | D23, D24, D29 |
| **I2** | Exactly **4 photo slots**, ordered top to bottom, indices 1–4. | D23, D24 |
| **I3** | Layer order is **PhotoSlot01–04 below, FrameOverlay above**, always. A guest photo can never cover a sticker, logo, border or word of the artwork. | D23, D24 |
| **I4** | Each slot's geometry comes **only** from `frames.json`, expanded by the **6 px bleed**. Never hardcode percentages. | D24, verified against F03's canonical grid |
| **I5** | Official logos are used as **supplied PNGs**, never recreated in CSS/SVG/AI/text, never recoloured, never non-uniformly scaled. `object-fit: contain` (`cover` only for the square AWS badge). | D25, D18, D28 |
| **I6** | The six partner logos appear in this order, with `×` after the 4th and the 5th: **Đoàn · SGU · HSV · ISF/CNTT × GDGoC × AWS**. | D18, D19, D28 |
| **I7** | Only the **24 colour tokens, 10 type styles, 10 spacing steps, 8 radii, 3 control sizes** exist. No raw values in components. | D01, D30 |
| **I8** | Every container carries a **2 px ink outline** (3 px only on the big screen and the active capture slot). Elevation is a **hard offset ink shadow**. No blur, no gradient, no glass. | D01 |
| **I9** | The Photo Wall exists **only** on `/display`. The phone never shows other people's photos. | D32, canvas note `t2`, backend commit `3faa188` |

---

## 34. Instructions for Future Claude Sessions

You are working on the PhotoWall frontend. The original Claude Design canvas may no longer be
reachable. **This file is the design.**

### Before you modify any frontend code

1. **Read this entire file.** At minimum: §32 (Confirmed Decisions), §33 (Design Invariants),
   §20.5 (design ⇄ backend conflicts).
2. **Check the current state of the repo.** `main` may still be missing the merge from
   `backend` — if `backend/src/client.ts` is not in your tree, that is task **P0.1**.
3. **Find the phase you are in.** §22 is ordered and its checkboxes are the progress tracker.
   If the user has not named a phase, find the first phase with unticked boxes and confirm.
4. **Do not redesign anything in §32.** If a change seems like an improvement, it is almost
   certainly one of the things the organisers deliberately cut. Say so and ask.
5. **Do not violate §33.** Especially: the 1080:3400 ratio, the 4 slots, the layer order, the
   logo order, and never recreating a logo.
6. **Never invent a measurement.** Every value you need is in §6, §7 or `frames.json`. If it is
   genuinely absent, it belongs in §31 — add it there rather than guessing.
7. **Never write raw hex or px** in a component. Use the tokens from §7.
8. **Never touch `backend/src/schema.ts` without `backend/firestore.rules` in the same commit.**
   The rules file says so in a comment, and the constants are duplicated by design.

### While you work

- Prefer **importing** backend types over redeclaring them.
- Every Firebase call goes through `backend/src/client.ts`. If you need a query it does not
  expose (for example the removed-photos tab), **add a function there** rather than reaching
  into Firestore from a page.
- Every new component needs every state shown on DESIGN-D02/D03 — not just the default.
- Icon-only controls need `aria-label`. Dialogs need a focus trap and focus restore.

### After you finish

9. **Tick the checkboxes** you completed in §22.
10. **Record decisions.** If you resolved an item in §31, move it to §32 with the answer. If you
    discovered a new conflict with the backend, add a row to §20.5.
11. **Update §21** if you changed the folder structure, and §11 if you changed the component
    tree.
12. **Do not delete evidence.** The measurements in §6/§7/§19 are the only surviving record of
    the design — correct them if they are wrong, never trim them for brevity.

### Where the design assets are

```
frontend/public/frames/frames.json          slot geometry — the source of truth
frontend/public/frames/frame-f0*.png        1080x3400 RGBA overlays
frontend/public/logos/*.png                 6 partner logos
Claude/Claude-Plan.md                       this file
docs/frontend-integration.md                the Firebase contract (backend branch)
```

### What to do if someone asks for a new frame

Follow §19.7. One PNG plus one JSON line. Do not write code. Note that the frame set was frozen
on 24.09 and additions need organiser approval.

---

## 35. Developer Quick Start

**If you are new to this project, here is your first hour.**

### 1. Read (20 minutes)
- §2 Product Overview — what this is
- §4 Complete User Flow — how a guest moves through it
- §33 Design Invariants — the nine rules you must not break
- `docs/frontend-integration.md` — how the frontend talks to Firebase

### 2. Understand the shape
- The **backend already exists** and has no server. All rules live in `firestore.rules` /
  `storage.rules`, and the frontend calls `backend/src/client.ts`.
- The **frontend does not exist yet**. You are building it.
- There are **three surfaces**: a guest phone flow, a 1920×1080 kiosk screen, and a 1280 px
  moderation console.
- The core object is a **1080 × 3400 photobooth strip**: four photos below, one PNG frame above.

### 3. Run it
```bash
git clone <repo> && cd PhotoWall-GDGoCxAWS

# terminal 1 — Firebase emulators
cd backend && npm install && npm run emulators

# terminal 2 — seed yourself as a moderator
cd backend && npm run seed -- your.email@gmail.com

# terminal 3 — the frontend (after Phase 0 exists)
cd frontend && npm install && VITE_EMULATORS=1 npm run dev   # must be port 5173
```
Emulator UI: `http://localhost:4000` · App: `http://localhost:5173`

### 4. Look at the assets
Open `frontend/public/frames/frame-f01-gdgoc.png` — that is the artwork, with four transparent
windows. Open `frames.json` — those four rectangles are where the photos go. That pairing is the
whole product.

### 5. Start here
- **Nothing exists yet?** → §22 **Phase 0**, task **P0.1** (merge `backend` into `main`).
- **Phase 0 done?** → **Phase 1** (tokens), then pick a parallel track from §25.
- **Want the highest-value single task?** → **Phase 4**, `pw-photowall-frame`. Twenty-one of the
  thirty-two artboards depend on it, and it is the piece most likely to surface a measurement
  problem early.

### 6. Three gotchas that will cost you an afternoon
1. **`resolve.dedupe` in `vite.config.ts`** — without it Firestore throws *"Type does not match
   the expected instance"*.
2. **App Check blocks localhost** — use the emulator, or register a debug token.
3. **`ensureGuest()` only on Send** — never on page load, or the venue's shared IP burns through
   the anonymous-account quota.

---

## 36. Traceability Matrix

Design → component → file → phase. Use this to find the code for any artboard, or the artboard
for any file.

| Design | Element | Component | File | Phase |
|---|---|---|---|---|
| DESIGN-D01 | Colour / type / spacing tokens | — | `src/styles/tokens.css` + `base.css` | P1 [done] |
| DESIGN-D02 | Button | `Button` / `ButtonLink` | `src/components/Button.tsx` | P2.1 [done] |
| DESIGN-D02 | Icon button | `IconButton` | `src/components/IconButton.tsx` | P2.2 [done] |
| DESIGN-D02 | Input + label / helper / counter | `Field` | `src/components/Field.tsx` | P2.3 [done] |
| DESIGN-D02 | Toggle / Checkbox | `Toggle`, `CheckRow` | `src/components/Controls.tsx` | P2.4 [done] |
| DESIGN-D02 | Setting row | `SettingRow` | `src/components/Controls.tsx` | P2.5 [done] |
| DESIGN-D02 | Pill / Tag | `.pill` / `.tag` classes | `src/styles/base.css` | P2.6 [done] |
| DESIGN-D02 | Steps | `Steps` | `src/components/Steps.tsx` | P2.7 [done] |
| DESIGN-D02 | Tabs | `Tabs` | *not built — admin app, Phase 10* | P2.8 |
| DESIGN-D02 | Top bar | `TopBar` | `src/components/TopBar.tsx` | P2.9 [done] |
| DESIGN-D02 | Frame option | `FrameOption` | `src/features/frames/FrameOption.tsx` | P7.1 [done] |
| DESIGN-D02 | PhotoWallFrame | `PhotoWallFrame` | `src/features/frames/PhotoWallFrame.tsx` | P4.4 [done] |
| DESIGN-D03 | Camera block | `useCamera` + `ShotTray` | `src/features/capture/`, `src/pages/CameraPage.tsx` | P6.5 [done] |
| DESIGN-D03 | Toast | `Toast` | *not built — no mobile screen needs it yet* | P3.1 |
| DESIGN-D03 | Progress | `Progress` | `src/components/Progress.tsx` | P3.2 [done] |
| DESIGN-D03 | Skeleton | `Skeleton` | *not built — Phase 9 / 10* | P3.3 |
| DESIGN-D03 | Dialog | `Dialog` | `src/components/Dialog.tsx` | P3.4 [done] |
| DESIGN-D03 | Empty / Loading / Error | `StateBlock` | `src/components/StateBlock.tsx` | P3.5 [done] |
| DESIGN-D03 | Photo card | inline on /done | `src/pages/Done.tsx` | P3.6 [done] |
| DESIGN-D03 | Strip tile | `pw-strip-tile` | `src/features/display/pw-strip-tile.ts` | P9.3 |
| DESIGN-D03 | Moderation row | `pw-mod-row` | `src/features/moderation/pw-mod-row.ts` | P10.6 |
| DESIGN-D04 | S01 Welcome | `Welcome` | `src/pages/Welcome.tsx` | P6.1–P6.2 [done] |
| DESIGN-D05 | S02 Enter name | `EnterName` | `src/pages/EnterName.tsx` | P6.3 [done] |
| DESIGN-D06 | S03 Camera | `CameraPage` | `src/pages/CameraPage.tsx` | P6.4–P6.10 [done] |
| DESIGN-D07 | S04 Shot review | `ShotReview` | `src/pages/ShotReview.tsx` | P6.11 [done] |
| DESIGN-D08 | S03d Last shot + countdown | `CameraPage` (variant) | `src/pages/CameraPage.tsx` | P6.8, P6.14 [done] |
| DESIGN-D09 | S05 Frame select | `FrameSelect` | `src/pages/FrameSelect.tsx` | P7.1–P7.5 [done] |
| DESIGN-D10 | S06 Review strip | `Review` | `src/pages/Review.tsx` | P7.6–P7.8 [done] |
| DESIGN-D11 | S07 Uploading | `Upload` | `src/pages/Upload.tsx`, `features/submit/useUpload.ts` | P8.1–P8.3 [done] |
| DESIGN-D12 | S08 Success | `Done` (approved) | `src/pages/Done.tsx` | P8.7 [done] |
| DESIGN-D13 | S08b Pending | `Done` (pending) | `src/pages/Done.tsx` | P8.6, P8.8 [done] |
| DESIGN-D14 | S09 My strip | `MyStrip` | `src/pages/MyStrip.tsx` | P8.11 [done, self-remove gated — §20.5 #9] |
| DESIGN-D15 | E01 Camera denied | `CameraDenied` | `src/pages/CameraPage.tsx` | P6.15 [done] |
| DESIGN-D16 | E02 Upload failed | `UploadFailed` | `src/pages/Upload.tsx` | P8.5 [done] |
| DESIGN-D17 | E03 Uploads closed | `Closed` | `src/pages/Closed.tsx` | P8.12 [done] |
| DESIGN-D18 | D01 Big screen normal | `page-display`, `pw-marquee`, `pw-counter`, `pw-qr`, `pw-partner-logos` | `src/pages/page-display.ts`, `src/features/display/**` | P9.1–P9.7 |
| DESIGN-D19 | D02 Big screen arrival | `pw-arrival-card`, `arrival-queue` | `src/features/display/pw-arrival-card.ts`, `arrival-queue.ts` | P9.8–P9.10 |
| DESIGN-D20 | M00 Moderator login | `page-mod` (signed out) | `src/pages/page-mod.ts` | P10.1 |
| DESIGN-D21 | M01 Moderation queue | `pw-mod-table`, `pw-mod-shortcuts` | `src/features/moderation/**`, `src/pages/page-mod.ts` | P10.2–P10.12 |
| DESIGN-D22 | M02 Event settings | `page-mod-settings` | `src/pages/page-mod-settings.ts` | P10.13–P10.15 |
| DESIGN-D23 | Frame spec / grid + export | `composeStrip` | `public/frames/frames.json`, `src/features/frames/compose.ts` | P4.1, P7.9 [done] |
| DESIGN-D24 | Frame registry + measurements | `frameRegistry` | `src/features/frames/frameRegistry.ts` | P4.2–P4.3 [done] |
| DESIGN-D25 | Frame set overview | frame gallery page | `src/pages/dev-frames.ts` | P4.9 |
| DESIGN-D26/27/28 | F01 / F02 / F03 artwork | — | `frontend/public/frames/frame-f0*.png` | committed |
| DESIGN-D29 | Motion / responsive / a11y | — | `src/styles/tokens.css` + per-component | P11 |
| DESIGN-D30 | Token block, asset list, analytics | — | `src/styles/tokens.css`, `src/lib/analytics.ts` | P1, P6.16, P7.12, P8.13 [done] |
| DESIGN-D31 | Permission matrix | — | `backend/firestore.rules` (see §20.5 #12) | P10 |
| DESIGN-D32 | UX audit decisions | — | §32 of this document | — |

---

## Appendix A — Design source fidelity statement

| Question | Answer |
|---|---|
| Was the intended design accessed? | **Yes.** `https://claude.ai/code/artifact/68fc6c75-6b13-4d0d-8093-6acfe1275fd1`, version `1790059353-e701`. |
| How much was inspected? | The canvas index (`project/canvas.json`) and **all 32** artboard source files, read in full. |
| What was recovered? | Exact CSS values (colours, sizes, radii, shadows, animations), full Vietnamese copy, the complete design-token block, the literal `frames.json`, the per-frame measurement table, the screen/route/component inventories, the permission matrix, and the 16-item UX audit. |
| Were the assets recovered? | **Yes.** 9 of the canvas's 21 stored PNGs are the ones in use; all 9 were downloaded and committed to `frontend/public/`. The other 12 are superseded iterations. |
| What could not be recovered? | Nothing from the design itself. The open items in §31 are questions the **design never answered**, not things that failed to transfer. |
| Was anything rendered or screenshotted? | The three frame PNGs were opened and visually described (§19.6); the six logos were opened and identified (§8). The artboards were read as source, which is more precise than a screenshot. |

---

*End of document. Keep it in sync with the code — it is the only surviving record of the design.*
