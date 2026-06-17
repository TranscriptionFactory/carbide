import { build_theme_vars } from "$lib/features/document/domain/html_theme_vars";
import type { Theme } from "$lib/shared/types/theme";

export interface EpubTypography {
  font_scale: number;
  line_height: number;
}

export function build_book_css(
  theme: Theme,
  typography: EpubTypography,
): string {
  const v = build_theme_vars(theme);
  return `
    html {
      color-scheme: ${v["--carbide-scheme"]};
      font-size: ${typography.font_scale}%;
    }
    html, body {
      background: ${v["--carbide-bg"]};
      color: ${v["--carbide-fg"]};
      font-family: ${v["--carbide-font-sans"]};
    }
    a:any-link { color: ${v["--carbide-link"]}; }
    code, pre, kbd, samp { font-family: ${v["--carbide-font-mono"]}; }
    pre { white-space: pre-wrap; }
    img, svg, video { max-width: 100%; height: auto; }
    p, li, blockquote, dd { line-height: ${typography.line_height}; }
  `;
}
