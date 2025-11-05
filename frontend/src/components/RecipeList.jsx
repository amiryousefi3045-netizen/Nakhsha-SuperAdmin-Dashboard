// Compatibility wrapper re-exporting CraftList
import CraftList from "./CraftList";

/**
 * @deprecated Use CraftList component instead.
 * This is a compatibility wrapper that will be removed in a future version.
 */
const RecipeList = ({ items = [], loading = false }) => (
  <CraftList
    items={items.map((r) => ({
      ...r,
      // map old recipe fields to craft equivalents where helpful
      craftingTime: r.cookingTime,
      type: r.difficulty,
    }))}
    loading={loading}
  />
);

export default RecipeList;
