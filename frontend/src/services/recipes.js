// Compatibility wrapper: re-export canonical crafts APIs under the old `recipes` names
import * as crafts from "./crafts";
import { uploadImage, reverseGeocode } from "./media";

export const fetchRecipes = (opts) => crafts.fetchCrafts(opts);
export const fetchRecipeById = (id) => crafts.fetchCraftById(id);
export const createRecipe = (payload) => crafts.createCraft(payload);
export const updateRecipe = (id, payload) => crafts.updateCraft(id, payload);
export const deleteRecipe = (id) => crafts.deleteCraft(id);

export const toggleLike = (id) => crafts.toggleLike(id);
export const toggleDislike = (id) => crafts.toggleDislike(id);

export const addComment = (recipeId, opts) => crafts.addComment(recipeId, opts);
export const deleteComment = (recipeId, commentId) =>
  crafts.deleteComment(recipeId, commentId);

export const fetchMyRecipes = () => crafts.fetchMyCrafts();
export const seedDev = () => crafts.seedDev();

export { uploadImage, reverseGeocode };
