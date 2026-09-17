# Stop the installed Android app reverting the theme

## Confirmed cause

- The live site serves its startup HTML with `no-cache, must-revalidate`, and the current project does not register a service worker.
- The evidence points to Android restoring the home-screen installation from an old 0.7.7 page/process snapshot before the current network response wins.
- The 0.7.7 code writes its theme to the shared `nectarine-theme` key immediately on render. The current guard cannot stop that write because the old bundle is the code executing during the brief flash.
- The current app also renders before its cold-start version check finishes, so a stale bundle can become visible before reload begins.

## Changes

1. **Protect the chosen theme from old bundles**
   - Introduce a new durable theme preference key that 0.7.7 does not know about.
   - Read the new key first and migrate the legacy value only when the new key has never been created.
   - Save explicit theme selections to the new key. A briefly restored 0.7.7 page may still alter its legacy key, but the current app will no longer trust that overwritten value.
   - Because 0.7.7 may overwrite the old key before this fix runs for the first time, the theme may need to be selected once after the update; subsequent stale launches cannot change it.

2. **Gate current cold starts before rendering**
   - On the published standalone app, run the existing freshness comparison before mounting the React interface.
   - If the loaded bundle is stale, clear browser-held workers/caches and replace the page with the clean current URL before any old theme can be painted.
   - Preserve the existing one-reload loop guard, background-audio protection, update polling, preview exclusions, and clean URL behavior.
   - If the freshness request fails, render normally rather than leaving the app blank.

3. **Cover the startup regression**
   - Add focused tests for legacy-theme migration, durable-key priority, and failed freshness checks falling through to normal startup.
   - Run `bunx tsc --noEmit` and the full Vitest suite.

## Installed-app note

The code will protect the theme even if Android briefly revives 0.7.7. Because Android retains important installed-app state outside the page code, the existing home-screen installation may need to be removed and added again once after this release to eliminate the old visual flash itself; changing `start_url` would not reliably repair an already-installed copy.
