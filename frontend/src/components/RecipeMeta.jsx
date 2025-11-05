// Compatibility wrapper re-exporting CraftMeta with legacy recipe prop mapping
import CraftMeta from "./CraftMeta";

/**
 * @deprecated Use CraftMeta component instead.
 * This is a compatibility wrapper that will be removed in a future version.
 */
const RecipeMeta = ({ timeFa, difficulty, servings, category }) => (
  <CraftMeta
    timeFa={timeFa}
    type={difficulty}
    size={servings ? `مناسب برای ${servings} نفر` : undefined}
    category={category}
  />
);

export default RecipeMeta;
