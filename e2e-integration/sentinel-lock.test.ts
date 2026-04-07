import * as fs from 'fs';
import * as path from 'path';

const DATA_FOLDER = process.env['TEST_DATA_FOLDER'] ?? '';
const LOCK_FILE = path.join(DATA_FOLDER, 'garbanzobeans.lock');

describe('Sentinel Lock — real binary', function () {
  this.timeout(15_000);

  afterEach(function () {
    // Clean up lock file between tests to restore fresh state
    if (fs.existsSync(LOCK_FILE)) {
      fs.unlinkSync(LOCK_FILE);
    }
  });

  it('opens in read-write mode when no lock file exists', async function () {
    // Ensure no lock file before launch (afterEach from previous test handles this)
    if (fs.existsSync(LOCK_FILE)) fs.unlinkSync(LOCK_FILE);

    // wdio runner launches the app; navigate to settings
    // @ts-expect-error — $() is a WebdriverIO global injected at test runtime
    const banner = await $('[data-testid="read-only-banner"]');
    expect(await banner.isExisting()).toBe(false);
  });

  it('opens in read-only mode when lock file already exists', async function () {
    // Pre-create lock file to simulate a running instance
    fs.writeFileSync(LOCK_FILE, 'locked\n');

    // wdio runner re-launches; the sentinel check fires in Rust setup
    // @ts-expect-error — $() is a WebdriverIO global injected at test runtime
    const banner = await $('[data-testid="read-only-banner"]');
    await banner.waitForExist({ timeout: 5_000 });
    const text: string = await banner.getText();
    expect(text).toContain('Read-Only');
  });

  it('writes lock file on launch', async function () {
    // Verify the app creates its lock file when launched normally
    // (Tests lock creation without relying on OS-level close events,
    // which are unreliable via browser.closeWindow() in tauri-driver)
    if (fs.existsSync(LOCK_FILE)) fs.unlinkSync(LOCK_FILE);

    // Wait for the app to initialise and write the lock
    await new Promise((resolve) => setTimeout(resolve, 1_000));
    expect(fs.existsSync(LOCK_FILE)).toBe(true);
  });
});
