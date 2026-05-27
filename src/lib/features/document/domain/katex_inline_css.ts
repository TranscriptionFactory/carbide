import katexCss from "katex/dist/katex.min.css?inline";
import amsRegular from "katex/dist/fonts/KaTeX_AMS-Regular.woff2?url";
import caligraphicBold from "katex/dist/fonts/KaTeX_Caligraphic-Bold.woff2?url";
import caligraphicRegular from "katex/dist/fonts/KaTeX_Caligraphic-Regular.woff2?url";
import frakturBold from "katex/dist/fonts/KaTeX_Fraktur-Bold.woff2?url";
import frakturRegular from "katex/dist/fonts/KaTeX_Fraktur-Regular.woff2?url";
import mainBold from "katex/dist/fonts/KaTeX_Main-Bold.woff2?url";
import mainBoldItalic from "katex/dist/fonts/KaTeX_Main-BoldItalic.woff2?url";
import mainItalic from "katex/dist/fonts/KaTeX_Main-Italic.woff2?url";
import mainRegular from "katex/dist/fonts/KaTeX_Main-Regular.woff2?url";
import mathBoldItalic from "katex/dist/fonts/KaTeX_Math-BoldItalic.woff2?url";
import mathItalic from "katex/dist/fonts/KaTeX_Math-Italic.woff2?url";
import sansSerifBold from "katex/dist/fonts/KaTeX_SansSerif-Bold.woff2?url";
import sansSerifItalic from "katex/dist/fonts/KaTeX_SansSerif-Italic.woff2?url";
import sansSerifRegular from "katex/dist/fonts/KaTeX_SansSerif-Regular.woff2?url";
import scriptRegular from "katex/dist/fonts/KaTeX_Script-Regular.woff2?url";
import size1Regular from "katex/dist/fonts/KaTeX_Size1-Regular.woff2?url";
import size2Regular from "katex/dist/fonts/KaTeX_Size2-Regular.woff2?url";
import size3Regular from "katex/dist/fonts/KaTeX_Size3-Regular.woff2?url";
import size4Regular from "katex/dist/fonts/KaTeX_Size4-Regular.woff2?url";
import typewriterRegular from "katex/dist/fonts/KaTeX_Typewriter-Regular.woff2?url";

const FONT_URLS: Record<string, string> = {
  "KaTeX_AMS-Regular.woff2": amsRegular,
  "KaTeX_Caligraphic-Bold.woff2": caligraphicBold,
  "KaTeX_Caligraphic-Regular.woff2": caligraphicRegular,
  "KaTeX_Fraktur-Bold.woff2": frakturBold,
  "KaTeX_Fraktur-Regular.woff2": frakturRegular,
  "KaTeX_Main-Bold.woff2": mainBold,
  "KaTeX_Main-BoldItalic.woff2": mainBoldItalic,
  "KaTeX_Main-Italic.woff2": mainItalic,
  "KaTeX_Main-Regular.woff2": mainRegular,
  "KaTeX_Math-BoldItalic.woff2": mathBoldItalic,
  "KaTeX_Math-Italic.woff2": mathItalic,
  "KaTeX_SansSerif-Bold.woff2": sansSerifBold,
  "KaTeX_SansSerif-Italic.woff2": sansSerifItalic,
  "KaTeX_SansSerif-Regular.woff2": sansSerifRegular,
  "KaTeX_Script-Regular.woff2": scriptRegular,
  "KaTeX_Size1-Regular.woff2": size1Regular,
  "KaTeX_Size2-Regular.woff2": size2Regular,
  "KaTeX_Size3-Regular.woff2": size3Regular,
  "KaTeX_Size4-Regular.woff2": size4Regular,
  "KaTeX_Typewriter-Regular.woff2": typewriterRegular,
};

const WOFF2_URL_PATTERN = /url\(fonts\/(KaTeX_[A-Za-z0-9-]+\.woff2)\)/g;

function array_buffer_to_base64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

async function fetch_font_data_uri(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`font fetch failed: ${url} (${String(res.status)})`);
  }
  const base64 = array_buffer_to_base64(await res.arrayBuffer());
  return `data:font/woff2;base64,${base64}`;
}

let cached: string | null = null;

export async function get_inlined_katex_css(): Promise<string> {
  if (cached !== null) return cached;
  try {
    const entries = await Promise.all(
      Object.entries(FONT_URLS).map(
        async ([name, url]) => [name, await fetch_font_data_uri(url)] as const,
      ),
    );
    const data_uris = new Map(entries);
    cached = katexCss.replace(WOFF2_URL_PATTERN, (whole, file: string) => {
      const data_uri = data_uris.get(file);
      return data_uri ? `url(${data_uri})` : whole;
    });
  } catch {
    cached = katexCss;
  }
  return cached;
}
