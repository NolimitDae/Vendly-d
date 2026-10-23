export interface PickerCategory {
  id: string;
  name: string;
  sub_categories?: { id: string; name: string }[];
}

export interface CategoryRow {
  key: string;
  categoryId: string;
  subId: string | null;
  title: string;
  subtitle?: string;
}

/** Rows for every category and sub-category that match the search (a matching category shows all of its own). */
export function categoryRows(categories: PickerCategory[], query: string): CategoryRow[] {
  const q = query.trim().toLowerCase();
  const rows: CategoryRow[] = [];
  for (const c of categories) {
    const catHit = !q || c.name.toLowerCase().includes(q);
    const subs = (c.sub_categories ?? []).filter((s) => catHit || s.name.toLowerCase().includes(q));
    if (!catHit && !subs.length) continue;
    rows.push({ key: c.id, categoryId: c.id, subId: null, title: c.name, subtitle: q && !catHit ? undefined : "Any type" });
    for (const s of subs) rows.push({ key: `${c.id}/${s.id}`, categoryId: c.id, subId: s.id, title: s.name, subtitle: c.name });
  }
  return rows;
}

/** "Photography & Video › Wedding Photography", or just the category. */
export function categoryLabel(categories: PickerCategory[], categoryId: string, subCategoryId: string) {
  const cat = categories.find((c) => c.id === categoryId);
  if (!cat) return "";
  const sub = cat.sub_categories?.find((s) => s.id === subCategoryId);
  return sub ? `${cat.name} › ${sub.name}` : cat.name;
}
