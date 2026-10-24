/**
 * Which of a vendor's active contracts a package uses. A contract can name packages, name whole
 * categories (so packages added to them later are covered too), or apply to all packages.
 *
 * Precedence: a contract naming the package > one naming the package's category > "all packages".
 * Within the same rule the newest version wins.
 */
export interface ScopedContract {
  version: number;
  applies_to_all: boolean;
  category_ids?: string[] | null;
  /** the contract's package assignments (callers may load only the one for this package) */
  listings?: { listing_id: string }[];
}

/** 1 = names the package, 2 = names its category, 3 = all packages, null = doesn't cover it. */
export function contractRule(c: ScopedContract, listingId?: string | null, categoryId?: string | null): 1 | 2 | 3 | null {
  if (c.applies_to_all) return 3;
  if (listingId && c.listings?.some((l) => l.listing_id === listingId)) return 1;
  if (categoryId && (c.category_ids ?? []).includes(categoryId)) return 2;
  return null;
}

export function pickContractForListing<T extends ScopedContract>(
  contracts: T[],
  listingId?: string | null,
  categoryId?: string | null,
): T | null {
  let best: { c: T; rule: number } | null = null;
  for (const c of contracts) {
    const rule = contractRule(c, listingId, categoryId);
    if (rule === null) continue;
    if (!best || rule < best.rule || (rule === best.rule && c.version > best.c.version)) best = { c, rule };
  }
  return best?.c ?? null;
}
