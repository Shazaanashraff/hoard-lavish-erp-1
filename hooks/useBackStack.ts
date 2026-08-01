// Lets the Android/iOS PWA back button close the current mobile sheet/drawer/
// detail-pane instead of exiting the app. No react-router: the app is also
// loaded via file:// in Electron, and the existing ViewState switch in
// App.tsx doesn't need real routes — only "back closes the topmost open
// layer" needs solving. Works identically under Electron's `base: './'` and
// the web build's `base: '/'` because it never touches the URL, only
// history state.
type CloseHandler = () => void;

const stack: CloseHandler[] = [];
let suppressNextPop = false;
let attached = false;

function attachListener() {
  if (attached || typeof window === 'undefined') return;
  attached = true;
  window.addEventListener('popstate', () => {
    if (suppressNextPop) {
      suppressNextPop = false;
      return;
    }
    const onClose = stack.pop();
    onClose?.();
  });
}
attachListener();

/**
 * Call when opening a mobile sheet/drawer/detail-pane. `onClose` runs when
 * the user presses back (hardware/gesture back, or the browser/PWA chrome's
 * back button) and should restore the state to before this layer opened.
 */
export function pushBack(onClose: CloseHandler): void {
  stack.push(onClose);
  window.history.pushState({ backStackDepth: stack.length }, '');
}

/**
 * Call when a layer closes WITHOUT the user pressing back — an in-app
 * close/X/cancel button, or the app closing it programmatically (e.g. after
 * a checkout completes). Consumes the matching `pushBack` history entry so
 * it isn't left dangling for a later back-press to hit. Safe to call even if
 * nothing is on the stack (no-ops).
 */
export function dismissBack(): void {
  if (stack.length === 0) return;
  stack.pop();
  suppressNextPop = true;
  window.history.back();
}
