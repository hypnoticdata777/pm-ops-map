// Checks the PRODUCTION BUILD (dist/), which is exactly what gets published to
// GitHub Pages and what the downloadable ZIP contains. Run it with
//   npm run test:e2e:pages
// (builds first, then serves dist/ under /pm-ops-map/ like a Pages project site).
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { test, expect } from '@playwright/test';

const DIST = path.resolve('dist');
const indexHtml = () => fs.readFileSync(path.join(DIST, 'index.html'), 'utf8');

test.describe('what is in dist/', () => {
  test('index.html is a classic script with config.json inlined (works without a server)', () => {
    const html = indexHtml();
    expect(html).toContain('window.__PM_OPS_CONFIG__');
    expect(html).not.toContain('type="module"');
    expect(html).toMatch(/<script src="js\/app\.js" defer><\/script>/);
  });

  test('every local asset the page references exists', () => {
    const html = indexHtml();
    const refs = [...html.matchAll(/(?:src|href)="([^"#?]+)(?:[?#][^"]*)?"/g)].map(m => m[1])
      .filter(ref => !/^(https?:|data:|mailto:|\/\/)/.test(ref) && ref !== './');
    expect(refs.length).toBeGreaterThan(3);
    refs.forEach(ref => {
      expect(ref.startsWith('/'), `${ref} must be relative so it works under a sub-path`).toBe(false);
      expect(fs.existsSync(path.join(DIST, ref)), ref).toBe(true);
    });
  });

  test('social-card URLs point at the Pages site, not the old placeholder', () => {
    const html = indexHtml();
    expect(html).not.toContain('your-deployment-url');
    expect(html).toContain('https://hypnoticdata777.github.io/pm-ops-map/og-image.png');
    expect(fs.existsSync(path.join(DIST, 'og-image.png'))).toBe(true);
  });

  test('ships the pages the site needs and nothing it should not', () => {
    ['index.html', '404.html', 'config.json', 'robots.txt', 'favicon.ico', 'site.webmanifest', 'css/style.css', 'js/app.js'].forEach(file => {
      expect(fs.existsSync(path.join(DIST, file)), file).toBe(true);
    });
    ['server', 'node_modules', 'e2e', 'docs', '.github', 'package.json'].forEach(name => {
      expect(fs.existsSync(path.join(DIST, name)), `${name} must not be published`).toBe(false);
    });
  });
});

test.describe('opened straight from disk (file://), no server at all', () => {
  const fileUrl = search => `${pathToFileURL(path.join(DIST, 'index.html')).href}${search}`;

  test('the app loads and renders the full map', async ({ page }) => {
    const problems = [];
    page.on('pageerror', e => problems.push(e.message));
    await page.goto(fileUrl(''));
    await expect(page.locator('#departments .department')).toHaveCount(17);
    await expect(page.locator('#departments .task-item')).toHaveCount(262);
    expect(problems).toEqual([]);
  });

  test('the demo works from disk too', async ({ page }) => {
    await page.goto(fileUrl('?demo=1'));
    await expect(page.getByRole('heading',{name:'What would you like to try?'})).toBeVisible();
    await page.getByRole('button',{name:'Explore freely',exact:true}).click();
    await expect(page.locator('#demo-banner')).toBeVisible();
    await expect(page.locator('#company-heading')).toHaveText('DEMO DOOR PROPERTY MANAGEMENT');
    await expect(page.locator('#stat-unowned')).toHaveText('32');
    await expect(page.locator('#demo-details')).not.toHaveAttribute('open');
    await page.locator('#demo-details summary').click();
    await page.locator('#demo-banner').getByRole('link',{name:/Use your own workspace/}).click();
    await expect(page.locator('#demo-banner')).toBeHidden();
    await expect(page.locator('#onboarding-modal')).toHaveClass(/visible/);
  });
});

test.describe('served under a Pages-style sub-path', () => {
  test('the 404 page exists and is served for unknown URLs inside the site', async ({ request, baseURL }) => {
    const res = await request.get(new URL('does-not-exist', baseURL).href);
    expect(res.status()).toBe(404);
  });

  test('nothing is requested outside the sub-path (no absolute asset URLs)', async ({ page, baseURL }) => {
    const outside = [];
    const prefix = new URL(baseURL).pathname;
    page.on('request', req => {
      const url = new URL(req.url());
      if (url.origin === new URL(baseURL).origin && !url.pathname.startsWith(prefix)) outside.push(req.url());
    });
    await page.goto('index.html?demo=1');
    await page.getByRole('button',{name:'Explore freely',exact:true}).click();
    await expect(page.locator('#departments .task-item')).toHaveCount(262);
    expect(outside).toEqual([]);
  });
});

test('downloaded build provides the user glossary without HTTP requests', async ({page}) => {
  const network=[]; page.on('request', request=>{ if (/^https?:/.test(request.url())) network.push(request.url()); });
  await page.goto(pathToFileURL(path.join(DIST, 'index.html')).href);
  await page.waitForSelector('#departments .department');
  await page.getByRole('button',{name:'Return to workspace',exact:true}).click();
  await page.locator('#glossary-open').click();
  await expect(page.locator('#glossary-count')).toHaveText('40 of 40 terms');
  await page.fill('#glossary-search','tenant');
  await expect(page.locator('#glossary-term-resident p')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('#glossary-open')).toBeFocused();
  expect(network).toEqual([]);
});
