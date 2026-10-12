import test from 'node:test';
import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import nextConfig from '../../next.config.mjs';

test('legacy login and register URLs open the matching Studio auth popup', async () => {
  const redirects = await nextConfig.redirects();
  assert.deepEqual(redirects, [
    { source: '/login', destination: '/studio/home?auth=login', permanent: false },
    { source: '/register', destination: '/studio/home?auth=register&next=%2Fonboarding', permanent: false },
  ]);
  const shell = await readFile(new URL('../../components/StandaloneShell.js', import.meta.url), 'utf8');
  assert.match(shell, /intent === 'login' \|\| intent === 'register'/);
  assert.match(shell, /initialMode=\{authMode\}/);
});

test('standalone login and register page modules are removed', async () => {
  for (const path of ['../../app/(auth)/login/page.js', '../../app/(auth)/register/page.js']) {
    await assert.rejects(access(new URL(path, import.meta.url)), { code: 'ENOENT' });
  }
});

test('logout clears the session and returns to Studio Home rather than login', async () => {
  const [menu, shell, account] = await Promise.all([
    readFile(new URL('../../components/AccountMenu.js', import.meta.url), 'utf8'),
    readFile(new URL('../../components/StandaloneShell.js', import.meta.url), 'utf8'),
    readFile(new URL('../../app/account/page.js', import.meta.url), 'utf8'),
  ]);
  assert.match(menu, /fetch\('\/api\/auth\/logout'/);
  assert.match(menu, /router\.replace\('\/studio\/home'\)/);
  assert.match(shell, /window\.addEventListener\('nexoclip:auth-logout'/);
  assert.match(shell, /setAuthStatus\('guest'\)/);
  assert.match(account, /router\.replace\('\/studio\/home'\)/);
  assert.doesNotMatch(menu, /router\.replace\('\/login'\)/);
  assert.doesNotMatch(account, /router\.replace\('\/login'\)/);
});
