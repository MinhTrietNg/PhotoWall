/**
 * What the fit check visits: the target viewports, and the walk through the
 * guest flow. This is the file to edit when the app gains a screen.
 *
 * check.mjs reads the route table out of src/apps/mobile/App.tsx and fails if
 * a guest route never appears as a `route` below, so a new screen cannot
 * quietly escape the budget.
 */

/**
 * Heights are what the browser leaves the PAGE, not the device height the
 * artboards are drawn at. An iPhone 14 is a 844pt device but Safari hands the
 * document about 745 of that with both bars showing, so measuring 844 would
 * pass a screen that scrolls in the hand.
 */
export const VIEWPORTS = [
  // --- height stress -------------------------------------------------------
  // The design draws at 390 and asks for a QA pass at 360 and 430 ("05 Motion ·
  // Responsive"). These walk that band down to where the page runs out of room.

  // Below any phone we expect at the booth. Kept as the floor: here a screen
  // is allowed to scroll inside itself, and the point of measuring it is that
  // it degrades that way instead of clipping or pushing the CTA out of reach.
  { name: 'sàn', w: 360, h: 500 },
  { name: 'iPhone SE · Safari', w: 375, h: 553 },
  { name: 'Galaxy A54 · Chrome', w: 360, h: 640 },
  { name: 'iPhone 13 mini · Safari', w: 375, h: 693 },
  { name: 'iPhone 14 · Safari', w: 390, h: 745 },
  { name: 'iPhone 15 Pro Max · Safari', w: 430, h: 833 },
  { name: 'artboard', w: 390, h: 844 },

  // --- width stress --------------------------------------------------------
  // Heights here are the browser's, not the device's. These widths exist
  // because a fixed-size row — the 4-cell tray, a two-button CTA — breaks on
  // width, not on height, and the band above only ever sees 360/375/390/430.
  { name: 'iPhone SE (2016)', w: 320, h: 454 },
  { name: 'Pixel 8 · Chrome', w: 393, h: 727 },
  { name: 'Pixel 7 Pro · Chrome', w: 412, h: 740 },
  { name: 'iPhone 8 Plus · Safari', w: 414, h: 628 },
];

const settle = (page, ms = 250) => page.waitForTimeout(ms);

/** The shutter fires immediately once the 3s timer is off. */
async function turnTimerOff(page) {
  const timer = page.locator('button[aria-pressed="true"]').first();
  if (await timer.count()) await timer.click();
}

async function shoot(page, slot) {
  await page.getByRole('button', { name: 'Chụp ảnh' }).click();
  await page.waitForURL(new RegExp(`/camera/${slot}/review$`), { timeout: 10_000 });
  await settle(page);
}

async function keepShot(page) {
  await page.getByRole('button', { name: /Dùng ảnh này/ }).click();
}

/**
 * The steps run in order against one page, each continuing from where the last
 * one stopped, and the screen is measured when `go` returns. `route` is both
 * the coverage claim and an assertion: the runner checks the browser really is
 * on that route afterwards, so a change to the flow fails loudly instead of
 * silently measuring the same screen twice.
 */
export const STEPS = [
  {
    id: 'S01 Welcome',
    route: '/',
    async go(page, { base }) {
      await page.goto(`${base}/`, { waitUntil: 'networkidle' });
      await page.waitForSelector('.screen', { timeout: 15_000 });
    },
  },
  {
    id: 'S02 Nhập tên',
    route: '/name',
    async go(page) {
      await page.getByRole('link', { name: /Bắt đầu chụp/ }).click();
      await page.waitForSelector('input.input');
      // Measured with the field filled: that is the state whose CTA has to be
      // reachable, and an empty one hides the consent block behind a disabled
      // button.
      await page.locator('input.input').first().fill('Minh Triết');
      await settle(page);
    },
  },
  {
    id: 'S03 Chụp ảnh · tấm 1',
    route: '/camera/:n',
    async go(page) {
      await page.getByRole('button', { name: /Tiếp tục/ }).click();
      await page.waitForURL(/\/camera\/1$/);
      await page.waitForSelector('video', { timeout: 15_000 });
      await settle(page, 600);
      await turnTimerOff(page);
    },
  },
  {
    id: 'S04 Kiểm tra ảnh',
    route: '/camera/:n/review',
    async go(page) {
      await shoot(page, 1);
    },
  },
  {
    id: 'S03 Chụp ảnh · tấm 4',
    route: '/camera/:n',
    async go(page) {
      // Three more rounds. The tray fills as it goes, and a full tray is the
      // tallest the camera screen ever is.
      for (const slot of [2, 3]) {
        await keepShot(page);
        await page.waitForURL(new RegExp(`/camera/${slot}$`), { timeout: 10_000 });
        await shoot(page, slot);
      }
      await keepShot(page);
      await page.waitForURL(/\/camera\/4$/, { timeout: 10_000 });
      await settle(page, 400);
    },
  },
  {
    id: 'S05 Hoàn thiện',
    route: '/finish',
    async go(page) {
      await shoot(page, 4);
      await keepShot(page);
      await page.waitForURL(/\/finish$/, { timeout: 10_000 });
      // frames.json plus four overlay PNGs decide the height here.
      await settle(page, 800);
    },
  },
  {
    id: 'S06 Đang gửi',
    route: '/upload',
    async go(page) {
      await page.getByRole('button', { name: /Gửi lên Wall/ }).click();
      await page.waitForURL(/\/upload$/, { timeout: 10_000 });
      await settle(page, 200);
    },
  },
  {
    id: 'S08b Đã nhận, đang duyệt',
    route: '/done',
    async go(page) {
      await page.waitForURL(/\/done$/, { timeout: 25_000 });
      await settle(page, 400);
    },
  },
  {
    id: 'S08 Thành công',
    route: '/done',
    async go(page) {
      // The mock backend approves after 6s and the same route upgrades in place.
      await page.getByText('Bạn đã lên Wall!').waitFor({ timeout: 25_000 });
      await settle(page, 400);
    },
  },
  {
    id: 'S09 Dải ảnh của tôi',
    route: '/me/:id',
    async go(page) {
      await page.getByRole('link', { name: /Dải ảnh của tôi/ }).first().click();
      await page.waitForURL(/\/me\//, { timeout: 10_000 });
      await settle(page, 600);
    },
  },
  {
    id: 'E03 Đã đóng nhận ảnh',
    route: '/closed',
    async go(page, { base }) {
      await page.goto(`${base}/closed`, { waitUntil: 'networkidle' });
      await settle(page, 300);
    },
  },
];
