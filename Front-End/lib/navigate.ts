/** Full page load (menus and layouts re-read the session), e.g. after switching roles. */
export function hardNavigate(url: string) {
  window.location.assign(url);
}
