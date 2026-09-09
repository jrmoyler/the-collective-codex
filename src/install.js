/* A new deployment waits until all existing windows close. Never replace the
 * running rules/module graph underneath an active match. Registration is
 * progressive enhancement: a denied cache cannot prevent normal play. */
if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator && globalThis.isSecureContext && !globalThis.Capacitor?.isNativePlatform?.()) {
  const register = () => navigator.serviceWorker.register('./sw.js', { scope: './', updateViaCache: 'none' }).catch(() => {});
  if (document.readyState === 'complete') register();
  else globalThis.addEventListener('load', register, { once: true });
}
