import { Suspense } from "react";
import FavoritesPageContent from "./FavoritesPageContent";

export default function FavoritesPage() {
  return (
    <Suspense>
      <FavoritesPageContent />
    </Suspense>
  );
}
