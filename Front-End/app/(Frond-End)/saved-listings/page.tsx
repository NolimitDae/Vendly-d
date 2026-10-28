import { redirect } from "next/navigation";

/** Saved listings moved to Favorites → Services; old links still work. */
export default function SavedListingsPage() {
  redirect("/favorites?tab=services");
}
