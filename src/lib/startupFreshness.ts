import { checkForNewVersion, forceReloadForNewVersion } from "./versionCheck";

const COLD_RELOAD_KEY = "nectarine-cold-reload";

export type StartupFreshnessDependencies = {
  check: typeof checkForNewVersion;
  reload: typeof forceReloadForNewVersion;
};

const defaultDependencies: StartupFreshnessDependencies = {
  check: checkForNewVersion,
  reload: forceReloadForNewVersion,
};

/** Returns true when the app should render, or false when navigation started. */
export async function prepareFreshStartup(
  dependencies: StartupFreshnessDependencies = defaultDependencies,
): Promise<boolean> {
  try {
    const result = await dependencies.check();
    if (!result.stale) {
      try { sessionStorage.removeItem(COLD_RELOAD_KEY); } catch { /* ignore */ }
      return true;
    }

    let alreadyReloaded = false;
    try { alreadyReloaded = sessionStorage.getItem(COLD_RELOAD_KEY) === "1"; } catch { /* ignore */ }
    if (alreadyReloaded) return true;

    try { sessionStorage.setItem(COLD_RELOAD_KEY, "1"); } catch { /* ignore */ }
    await dependencies.reload();
    return false;
  } catch {
    return true;
  }
}