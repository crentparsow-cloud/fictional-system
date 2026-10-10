"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { requestPersistence } from "@/lib/draft-store";
import { readOnboarding, updateOnboarding, type KeyValueStore } from "@/lib/onboarding";
import { IOS_INSTALL_STEPS, SAFARI_SEVEN_DAY_RULE, installPromptFor, isIosSafari, isStandaloneDisplay, type InstallPrompt as Kind } from "@/lib/pwa";

/** The browser's install event, which is not in the DOM typings. */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

function local(): KeyValueStore | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/**
 * Install prompt (10.1) and iOS install guide (13.18), on the reader's pages.
 *
 * Nothing shows on a first visit. From the second visit, a card explains
 * what installing does and asks first: this is the pre-permission screen,
 * and the browser's own install dialogue opens only after the reader taps
 * "Add to home screen" on it. On an iPhone or iPad there is no such dialogue,
 * so the card is the install guide: Share, then Add to Home Screen, with the
 * Safari seven-day rule in plain words (lib/pwa.ts SAFARI_SEVEN_DAY_RULE).
 * "Not now" is remembered for 90 days. Nothing counts, nothing nags, and the
 * card never appears inside the installed app.
 *
 * Once the app is installed, or when it opens installed, the browser is
 * asked to keep this site's storage (navigator.storage.persist) so unsaved
 * drafts are the last thing cleared.
 */
export function InstallPrompt() {
  const [kind, setKind] = useState<Kind>("none");
  const deferred = useRef<BeforeInstallPromptEvent | null>(null);

  const decide = useCallback(() => {
    const standalone = isStandaloneDisplay({
      displayModeStandalone: typeof window.matchMedia === "function" && window.matchMedia("(display-mode: standalone)").matches,
      navigatorStandalone: (navigator as Navigator & { standalone?: boolean }).standalone,
    });
    setKind(
      installPromptFor(readOnboarding(local()), {
        standalone,
        nativeAvailable: deferred.current !== null,
        iosSafari: isIosSafari(navigator.userAgent, navigator.platform, navigator.maxTouchPoints),
        now: Date.now(),
      }),
    );
    return standalone;
  }, []);

  useEffect(() => {
    // Opened from the home screen: ask the browser to keep storage.
    if (decide()) void requestPersistence();

    const onPrompt = (e: Event) => {
      e.preventDefault();
      deferred.current = e as BeforeInstallPromptEvent;
      decide();
    };
    const onInstalled = () => {
      updateOnboarding(local(), { installedAt: Date.now() });
      deferred.current = null;
      setKind("none");
      void requestPersistence();
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, [decide]);

  if (kind === "none") return null;

  function notNow() {
    updateOnboarding(local(), kind === "native" ? { installDismissedAt: Date.now() } : { iosGuideDismissedAt: Date.now() });
    setKind("none");
  }

  async function install() {
    const event = deferred.current;
    if (!event) return;
    // The browser's own dialogue opens here, and only here.
    await event.prompt();
    const choice = await event.userChoice.catch(() => ({ outcome: "dismissed" as const }));
    deferred.current = null;
    if (choice.outcome === "accepted") {
      updateOnboarding(local(), { installedAt: Date.now() });
      void requestPersistence();
    } else {
      updateOnboarding(local(), { installDismissedAt: Date.now() });
    }
    setKind("none");
  }

  if (kind === "native") {
    return (
      <section className="card install-card" aria-labelledby="install-title">
        <h2 id="install-title">Keep Akana on your home screen?</h2>
        <p>It opens like an app, with no browser bar, and it is the safer place for answers you have not saved yet. Your browser will ask you to confirm. You can say no.</p>
        <div className="install-actions">
          <button type="button" className="btn" onClick={() => void install()}>
            Add to home screen
          </button>
          <button type="button" className="btn secondary" onClick={notNow}>
            Not now
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="card install-card" aria-labelledby="install-title">
      <h2 id="install-title">Add Akana to your home screen</h2>
      <ol className="install-steps">
        {IOS_INSTALL_STEPS.map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ol>
      <p className="small muted">{SAFARI_SEVEN_DAY_RULE}</p>
      <div className="install-actions">
        <button type="button" className="btn secondary" onClick={notNow}>
          Not now
        </button>
        <Link className="btn-link" href="/help/install">
          More about this
        </Link>
      </div>
    </section>
  );
}
