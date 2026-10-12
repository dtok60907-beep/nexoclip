const { chromium } = require('playwright');
const fs = require('node:fs');
const assert = require('node:assert/strict');

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const origin = process.env.STUDIO_TEST_URL || 'http://127.0.0.1:3210';
    await page.goto(origin, { waitUntil: 'domcontentloaded' });
    if (process.argv.includes('--posters')) {
      for (const name of ['coffee', 'wardah', 'ootd']) {
        const base64 = await page.evaluate(async name => {
          const video = document.createElement('video');
          video.muted = true;
          video.preload = 'auto';
          document.body.append(video);
          await new Promise((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error('Video load timed out: ' + name)), 15000);
            video.onloadeddata = () => { clearTimeout(timeout); resolve(); };
            video.onerror = () => { clearTimeout(timeout); reject(new Error('Cannot decode ' + name)); };
            video.src = `/showcase/${name}.mp4`;
          });
          await new Promise(resolve => { video.onseeked = resolve; video.currentTime = 1; });
          const canvas = document.createElement('canvas');
          canvas.width = 640;
          canvas.height = Math.round(640 * video.videoHeight / video.videoWidth);
          canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
          return canvas.toDataURL('image/webp', .85).split(',')[1];
        }, name);
        fs.writeFileSync(`nexoclip-app/public/showcase/${name}.webp`, Buffer.from(base64, 'base64'));
      }
      console.log('Generated three video posters.');
      return;
    }
    // Mock only authentication and paid APIs: exercise the actual studio UI.
    let authenticated = false;
    let generationCalls = 0;
    await page.route('**/api/auth/session', route => route.fulfill({ json: { authenticated } }));
    await page.route('**/api/auth/login', route => { authenticated = true; return route.fulfill({ json: { user: { id: 'browser-test' } } }); });
    await page.route('**/api/workspaces', route => route.fulfill({ json: { workspaces: [{ id: 'test-workspace' }] } }));
    await page.route('**/api/usage?*', route => route.fulfill({ json: { balance: 100, items: [] } }));
    await page.route('**/api/generations', route => { generationCalls++; return route.fulfill({ status: 400, json: { error: 'Paid generation intentionally disabled in browser test' } }); });
    await page.reload();
    await page.getByRole('heading', { name: 'What are we making today?' }).waitFor();
    assert.equal(new URL(page.url()).pathname, '/');
    await page.screenshot({ path: '/tmp/nexoclip-home-desktop.png' });
    assert.equal(await page.locator('.suite-home img').evaluateAll(images => images.filter(img => !img.complete || !img.naturalWidth).length), 0);
    await page.locator('.suite-filters').getByRole('button', { name: 'Video', exact: true }).click();
    assert.equal(await page.locator('.suite-starter-card').count(), 3);
    await page.getByRole('button', { name: 'Preview Made for the everyday' }).click();
    await page.locator('dialog[open] video').waitFor();
    await page.keyboard.press('Escape');
    await page.getByRole('tab', { name: /Image/ }).click();
    const homePrompt = page.getByRole('textbox', { name: 'Describe what you want to create' });
    await homePrompt.fill('A beautiful coffee product photograph');
    await page.getByRole('button', { name: /^Create/ }).click();
    const prompt = page.locator('textarea:visible').first();
    await prompt.waitFor();
    assert.equal(await prompt.inputValue(), 'A beautiful coffee product photograph');
    await page.getByRole('button', { name: /^Generate/ }).click();
    await page.getByRole('dialog', { name: 'Welcome to your studio.' }).waitFor();
    assert.equal(generationCalls, 0);
    await page.screenshot({ path: '/tmp/nexoclip-login-popup.png' });
    await page.keyboard.press('Escape');
    assert.equal(await prompt.inputValue(), 'A beautiful coffee product photograph');
    await page.getByRole('button', { name: /^Generate/ }).click();
    await page.getByRole('dialog').getByLabel('Email', { exact: true }).fill('test@example.com');
    await page.getByRole('dialog').getByLabel('Password', { exact: true }).fill('test-password-123');
    await page.getByRole('dialog').getByRole('button', { name: /^Sign in/ }).click();
    await page.locator('dialog[open]').waitFor({ state: 'hidden' });
    assert.equal(await prompt.inputValue(), 'A beautiful coffee product photograph');
    assert.equal(generationCalls, 0);
    await page.getByRole('button', { name: /^Generate/ }).click();
    await page.waitForFunction(() => document.body.textContent.includes('Paid generation intentionally disabled'));
    assert.equal(generationCalls, 1);
    await page.setViewportSize({ width: 390, height: 844 });
    authenticated = false;
    await page.goto(origin);
    await page.getByRole('heading', { name: 'What are we making today?' }).waitFor();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.screenshot({ path: '/tmp/nexoclip-home-mobile.png' });
    await page.getByRole('button', { name: 'Toggle Navigation Menu' }).click();
    await page.getByRole('link', { name: 'Video Studio', exact: true }).click();
    await page.getByRole('button', { name: /^Generate/ }).click();
    await page.getByRole('dialog', { name: 'Welcome to your studio.' }).waitFor();
    await page.keyboard.press('Escape');
    for (const tab of ['cinema', 'marketing', 'ai-influencer']) {
      await page.goto(`${origin}/studio/${tab}`);
      assert.equal(new URL(page.url()).pathname, `/studio/${tab}`);
      if (tab === 'cinema') await page.locator('textarea:visible').first().fill('A cinematic product photograph');
      await page.getByRole('button', { name: tab === 'cinema' ? /^Shoot/ : /^Generate/ }).click();
      await page.getByRole('dialog', { name: 'Welcome to your studio.' }).waitFor();
      await page.keyboard.press('Escape');
    }
    console.log('PASS: public home, assets, gallery filters, video preview, guest Generate gate, dismiss + draft preservation, login + generation, and mobile navigation.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
