export { register_theme_actions } from "$lib/features/theme/application/theme_actions";
export { ThemeService } from "$lib/features/theme/application/theme_service";
export type { Theme } from "$lib/shared/types/theme";
export {
  STYLE_DESCRIPTORS,
  STYLE_CATEGORY_ORDER,
  STYLE_CATEGORY_LABELS,
} from "$lib/features/theme/domain/theme_style_descriptors";
export type {
  ThemeStyleDescriptor,
  ThemeStyleCategory,
  ThemeStyleControl,
} from "$lib/features/theme/domain/theme_style_descriptors";
export {
  filter_descriptors,
  group_filtered,
  ordered_categories,
} from "$lib/features/theme/domain/theme_style_filter";
