import { navigationRef } from './navigationRef';

type Nav = { navigate: (...args: any[]) => void };

/** The tab showing now (CustomerTabs, VendorTabs and EventPlannerTabs all name their tabs `…Tab`). */
export function currentTab(state: any): string | undefined {
  let s = state;
  while (s?.routes) {
    const r = s.routes[s.index ?? 0];
    if (!r) return undefined;
    if (typeof r.name === 'string' && r.name.endsWith('Tab')) return r.name;
    s = r.state;
  }
  return undefined;
}

/**
 * Opens `screen` in another tab's stack. Back from it returns to the tab it was opened from (the page
 * that was showing there), not to the first page of the tab it landed in. See `backToOrigin`.
 */
export function openInTab(nav: Nav, tab: string, screen: string, params?: object) {
  const from = navigationRef.isReady() ? currentTab(navigationRef.getRootState()) : undefined;
  nav.navigate(tab, { screen, initial: false, params: from && from !== tab ? { ...params, backTo: from } : params });
}

/**
 * For every stack in the tabs: going back from a page opened from another tab (openInTab) also
 * switches back to that tab, where the page it came from is still open.
 */
export const backToOrigin = ({ navigation, route }: { navigation: any; route: any }) => ({
  beforeRemove: (e: any) => {
    const to = route.params?.backTo;
    const type = e.data?.action?.type;
    if (typeof to !== 'string' || (type !== 'GO_BACK' && type !== 'POP')) return;
    navigation.getParent()?.navigate(to);
  },
});
