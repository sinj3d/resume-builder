import { check } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';
import { ask } from '@tauri-apps/plugin-dialog';

const AUTO_CHECK_KEY = 'autoUpdateCheck';

/** Whether launch-time update checks are enabled (default: on). */
export const autoCheckEnabled = (): boolean =>
    localStorage.getItem(AUTO_CHECK_KEY) !== 'false';

export const setAutoCheck = (enabled: boolean): void => {
    localStorage.setItem(AUTO_CHECK_KEY, String(enabled));
};

/**
 * Check GitHub Releases' latest.json for a newer version, prompt the user,
 * and install + relaunch if they accept.
 *
 * Returns 'none' when already up to date (or before the first updater-enabled
 * release exists, in which case the check 404s — callers should swallow
 * errors from this rather than surface them, since that's an expected state
 * for v0.1.0 installs and offline users, not a failure).
 */
export async function checkAndPromptForUpdate(): Promise<'updated' | 'declined' | 'none'> {
    const update = await check();
    if (!update) return 'none';

    const shouldInstall = await ask(
        `Resume Builder ${update.version} is available (you have ${update.currentVersion}).\n\nInstall and restart now?`,
        { title: 'Update available', kind: 'info' },
    );
    if (!shouldInstall) return 'declined';

    await update.downloadAndInstall();
    await relaunch();
    return 'updated';
}
