export async function rasterize_svg_to_png(
  svg: string,
): Promise<{ data_url: string; width: number; height: number }> {
  const parser = new DOMParser();
  const svg_doc = parser.parseFromString(svg, "image/svg+xml");
  const svg_el = svg_doc.documentElement;

  let width = parseFloat(svg_el.getAttribute("width") ?? "0");
  let height = parseFloat(svg_el.getAttribute("height") ?? "0");

  if ((!width || !height) && svg_el.hasAttribute("viewBox")) {
    const parts = svg_el.getAttribute("viewBox")!.split(/[\s,]+/);
    if (parts.length >= 4) {
      width = width || parseFloat(parts[2]!);
      height = height || parseFloat(parts[3]!);
    }
  }

  if (!width || !height) {
    width = width || 400;
    height = height || 300;
  }

  const scale = 2;
  const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);

  try {
    const img = new Image();
    img.width = width;
    img.height = height;

    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("Failed to load SVG as image"));
      img.src = url;
    });

    const canvas = document.createElement("canvas");
    canvas.width = width * scale;
    canvas.height = height * scale;
    const ctx = canvas.getContext("2d")!;
    ctx.scale(scale, scale);
    ctx.drawImage(img, 0, 0, width, height);

    return {
      data_url: canvas.toDataURL("image/png"),
      width,
      height,
    };
  } finally {
    URL.revokeObjectURL(url);
  }
}
