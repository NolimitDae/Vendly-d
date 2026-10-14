import { useCallback, useEffect, useState } from 'react';
import { MarketplaceService } from '../services/marketplace.service';

/** The signed-in user's saved listing ids, with optimistic toggling for the heart buttons. */
export function useSaved() {
  const [ids, setIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    MarketplaceService.savedIds()
      .then((r) => setIds(new Set(r.data?.data ?? [])))
      .catch(() => {});
  }, []);

  const toggle = useCallback(async (id: string) => {
    let wasSaved = false;
    setIds((prev) => {
      wasSaved = prev.has(id);
      const next = new Set(prev);
      wasSaved ? next.delete(id) : next.add(id);
      return next;
    });
    try {
      await (wasSaved ? MarketplaceService.unsave(id) : MarketplaceService.save(id));
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
