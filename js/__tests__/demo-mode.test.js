// Hosted demo (?demo=1): isolated storage, fictional workspace, permanent banner,
// no Team Sync. Modules read the URL when they load, so each test re-imports the
// app fresh under the URL it wants.
import fs from 'node:fs';
import path from 'node:path';
import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import config from '../../config.json';

const html = fs.readFileSync(path.join(process.cwd(), 'index.html'), 'utf8');

async function load(search) {
  history.pushState({}, '', `/${search}`);
  vi.resetModules();
  const [demoMode, state, storage, demo, sync, launchPlan] = await Promise.all([
    import('../demoMode.js'), import('../state.js'), import('../storage.js'),
    import('../demo.js'), import('../sync.js'), import('../launchPlan.js'),
  ]);
  const orgData = structuredClone(config.orgData);
  orgData.departments.forEach(d => d.tasks.forEach(t => { t._configName = t.name; }));
  state.setOrgData(orgData);
  state.setOwnerColors(config.ownerColors);
  state.setDefaultAffinities(config.defaultAffinities);
  return { demoMode, state, storage, demo, sync, launchPlan };
}

beforeEach(() => {
  document.body.innerHTML = html.match(/<body[^>]*>([\s\S]*)<\/body>/)[1];
  document.body.className = '';
  document.title = 'PM Ops Map';
  localStorage.clear();
  vi.stubGlobal('alert', () => {});
});

afterEach(() => {
  history.pushState({}, '', '/');
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('detecting demo mode', () => {
  test.each([
    ['?demo=1', true], ['?demo=1&x=2', true], ['?x=2&demo=1', true], ['?demo=0', false], ['?demo=true', false],
    ['?demo=', false], ['?demonstration=1', false], ['', false], ['?x=1', false],
  ])('%j -> %s', async (search, expected) => {
    const { demoMode } = await load(search);
    expect(demoMode._detectDemoMode(search)).toBe(expected);
    expect(demoMode.DEMO_MODE).toBe(expected);
  });
});

describe('storage isolation', () => {
  test('normal mode keeps the real key names exactly', async () => {
    const { storage } = await load('');
    expect(storage.STORAGE_KEY).toBe('pm-ops-data-v1');
    expect(storage.BACKUP_KEY).toBe('pm-ops-backups-v1');
    expect(storage.SYNC_CONFIG_KEY).toBe('pm-ops-sync-config-v1');
  });

  test('demo mode moves every key under pm-ops-demo-', async () => {
    const { storage } = await load('?demo=1');
    expect(storage.ALL_STORAGE_KEYS).toHaveLength(13);
    storage.ALL_STORAGE_KEYS.forEach(key => expect(key, key).toMatch(/^pm-ops-demo-/));
    expect(storage.STORAGE_KEY).toBe('pm-ops-demo-data-v1');
  });

  test('the demo and real key sets never overlap', async () => {
    const real = (await load('')).storage.ALL_STORAGE_KEYS;
    const demo = (await load('?demo=1')).storage.ALL_STORAGE_KEYS;
    expect(real.filter(key => demo.includes(key))).toEqual([]);
    expect(demo.every(key => !key.startsWith('pm-ops-data') && !key.startsWith('pm-ops-company'))).toBe(true);
  });

  test('launch checklist and sync config use the single namespaced key set (no stray literals)', async () => {
    const { launchPlan, storage } = await load('?demo=1');
    launchPlan.toggleLaunchChecklistItem('some-step', true);
    expect(localStorage.getItem(storage.LAUNCH_CHECKLIST_KEY)).not.toBeNull();
    expect(localStorage.getItem('pm-ops-launch-checklist-v1')).toBeNull();
  });

  test('no source file other than storage.js and demoMode.js spells out a storage key', () => {
    const files = fs.readdirSync(path.join(process.cwd(), 'js'), { recursive: true })
      .filter(f => f.endsWith('.js') && !f.includes('__tests__') && !['storage.js', 'demoMode.js'].includes(path.basename(f)));
    expect(files.length).toBeGreaterThan(10);
    files.forEach(file => {
      const source = fs.readFileSync(path.join(process.cwd(), 'js', file), 'utf8');
      // 'pm-ops-map-state' is the export file schema name, not a storage key.
      expect(source.match(/['"`]pm-ops-(?!map-state)[a-z]+(-[a-z0-9]+)*['"`]/g), file).toBeNull();
    });
  });
});

describe('seeding the fictional workspace', () => {
  test('loads team, portfolio, work orders and assigned tasks, persisted under demo keys only', async () => {
    const { demo, state, storage } = await load('?demo=1');
    demo.seedShowcaseWorkspace(new Date('2026-10-06T12:00:00Z'));
    expect(state.teamData.employees).toHaveLength(3);
    expect(state.portfolio.tenants).toHaveLength(4);
    expect(state.workOrders).toHaveLength(6);
    const unowned = state.orgData.departments.flatMap(d => d.tasks).filter(t => t.owner === 'UNOWNED').length;
    expect(unowned).toBeGreaterThan(20);
    expect(localStorage.getItem(storage.COMPANY_KEY)).toBe('Demo Door Property Management');
    const keys = Object.keys(localStorage);
    expect(keys.length).toBeGreaterThanOrEqual(5);
    keys.forEach(key => expect(key, key).toMatch(/^pm-ops-demo-/));
  });

  test('a reload sees the seeded workspace (company key present, so it is not re-seeded over edits)', async () => {
    const { demo, storage } = await load('?demo=1');
    demo.seedShowcaseWorkspace();
    expect(localStorage.getItem(storage.COMPANY_KEY)).toBeTruthy();
  });
});

describe('banner and page chrome', () => {
  test('demo mode shows the banner, tags the page, and hides Team Sync', async () => {
    const { demo } = await load('?demo=1');
    expect(document.getElementById('demo-banner').hidden).toBe(true);
    demo.initDemoMode();
    const banner = document.getElementById('demo-banner');
    expect(banner.hidden).toBe(false);
    expect(banner.textContent).toMatch(/Fictional data only/);
    expect(banner.textContent).toMatch(/don.t enter real tenant information/i);
    expect(document.body.classList.contains('demo-mode')).toBe(true);
    expect(document.title).toMatch(/Demo/);
    expect(document.getElementById('sync-status-pill').hidden).toBe(true);
  });

  test('the banner has no way to dismiss it', async () => {
    const banner = document.getElementById('demo-banner');
    const labels = [...banner.querySelectorAll('button, a')].map(el => el.textContent.trim());
    expect(labels).toEqual(['Reset demo', 'Use your own workspace →']);
    expect(banner.querySelector('[aria-label*="lose"], .close')).toBeNull();
  });

  test('"Use your own workspace" links to the page without the demo flag', () => {
    expect(document.querySelector('#demo-banner a').getAttribute('href')).toBe('./');
  });

  test('normal mode leaves the banner hidden and the page untouched', async () => {
    const { demo } = await load('');
    demo.initDemoMode();
    expect(document.getElementById('demo-banner').hidden).toBe(true);
    expect(document.body.classList.contains('demo-mode')).toBe(false);
    expect(document.title).toBe('PM Ops Map');
    expect(document.getElementById('sync-status-pill').hidden).toBe(false);
  });
});

describe('Reset demo', () => {
  test('removes only demo keys and reloads; a real workspace on the same origin survives', async () => {
    const { demo, storage } = await load('?demo=1');
    vi.spyOn(storage.pageControl, 'reload').mockImplementation(() => {});
    vi.stubGlobal('confirm', () => true);
    localStorage.setItem('pm-ops-data-v1', '[{"real":"workspace"}]');
    localStorage.setItem('pm-ops-company-name', 'Real Company');
    localStorage.setItem('pm-ops-backups-v1', '[{"real":"backup"}]');
    demo.seedShowcaseWorkspace();
    expect(Object.keys(localStorage).some(k => k.startsWith('pm-ops-demo-'))).toBe(true);

    demo.resetDemo();

    expect(Object.keys(localStorage).filter(k => k.startsWith('pm-ops-demo-'))).toEqual([]);
    expect(localStorage.getItem('pm-ops-data-v1')).toBe('[{"real":"workspace"}]');
    expect(localStorage.getItem('pm-ops-company-name')).toBe('Real Company');
    expect(localStorage.getItem('pm-ops-backups-v1')).toBe('[{"real":"backup"}]');
    expect(storage.pageControl.reload).toHaveBeenCalledTimes(1);
  });

  test('asks first, and cancelling changes nothing', async () => {
    const { demo, storage } = await load('?demo=1');
    vi.spyOn(storage.pageControl, 'reload').mockImplementation(() => {});
    const confirmSpy = vi.fn(() => false);
    vi.stubGlobal('confirm', confirmSpy);
    demo.seedShowcaseWorkspace();
    const before = JSON.stringify(localStorage);
    demo.resetDemo();
    expect(confirmSpy.mock.calls[0][0]).toMatch(/edits to the demo workspace will be discarded/i);
    expect(JSON.stringify(localStorage)).toBe(before);
    expect(storage.pageControl.reload).not.toHaveBeenCalled();
  });

  test('does nothing at all outside demo mode (it can never wipe a real workspace)', async () => {
    const { demo, storage } = await load('');
    vi.spyOn(storage.pageControl, 'reload').mockImplementation(() => {});
    const confirmSpy = vi.fn(() => true);
    vi.stubGlobal('confirm', confirmSpy);
    localStorage.setItem('pm-ops-data-v1', 'real');
    demo.resetDemo();
    expect(confirmSpy).not.toHaveBeenCalled();
    expect(localStorage.getItem('pm-ops-data-v1')).toBe('real');
    expect(storage.pageControl.reload).not.toHaveBeenCalled();
  });
});

describe('Team Sync is unavailable in the demo', () => {
  test('the dialog will not open and connecting does nothing', async () => {
    const { sync } = await load('?demo=1');
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    sync.openSyncModal();
    expect(document.getElementById('sync-modal').classList.contains('visible')).toBe(false);
    document.getElementById('sync-server-url').value = 'https://sync.example.com';
    document.getElementById('sync-workspace').value = 'demo-team';
    document.getElementById('sync-passphrase').value = 'abcd1234';
    await sync.connectSync();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  test('a saved connection is ignored, so the auto-sync loop never starts', async () => {
    const { sync, storage } = await load('?demo=1');
    const fetchSpy = vi.fn(() => new Promise(() => {}));
    vi.stubGlobal('fetch', fetchSpy);
    vi.useFakeTimers();
    localStorage.setItem(storage.SYNC_CONFIG_KEY, JSON.stringify({ serverUrl: 'https://sync.example.com', workspace: 'w', passphrase: 'pw', version: 1 }));
    sync.initSync();
    vi.advanceTimersByTime(60_000);
    vi.useRealTimers();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  test('outside the demo the dialog still opens', async () => {
    const { sync } = await load('');
    sync.openSyncModal();
    expect(document.getElementById('sync-modal').classList.contains('visible')).toBe(true);
  });
});
