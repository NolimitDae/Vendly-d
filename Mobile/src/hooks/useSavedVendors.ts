import { useCallback, useEffect, useState } from 'react';
import { MarketplaceService } from '../services/marketplace.service';
import { guestSession, needsAccount } from '../context/guest';

/** The signed-in user's saved vendor ids, with optimistic toggling for the heart on a vendor's page. */
export function useSavedVendors(enabled = true) {
  const [ids, setIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    // nothing saved without an account
    if (guestSession.isGuest()) return;
    if (!enabled) return;
    MarketplaceService.savedVendorIds()
      .then((r) => setIds(new Set(r.data?.data ?? [])))
      .catch(() => {});
  }, [enabled]);

  const toggle = useCallback(async (id: string) => {
    if (needsAccount('save this')) return;
    let wasSaved = false;
    setIds((prev) => {
      wasSaved = prev.has(id);
      const next = new Set(prev);
      wasSaved ? next.delete(id) : next.add(id);
      return next;
    });
    try {
      await (wasSaved ? MarketplaceService.unsaveVendor(id) : MarketplaceService.saveVendor(id));
    } catch {
      // put it back the way it was
      setIds((prev) => {
        const next = new Set(prev);
        wasSaved ? next.add(id) : next.delete(id);
        return next;
      });
    }
  }, []);

  return { has: (id: string) => ids.has(id), toggle };
}
