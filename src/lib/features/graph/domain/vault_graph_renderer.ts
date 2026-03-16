import type {
  Application,
  Container,
  Graphics,
  Sprite,
  Text,
  Texture,
} from "pixi.js";
import type { Viewport } from "pixi-viewport";
import { SpatialIndex } from "$lib/features/graph/domain/spatial_index";
import type { SemanticEdge } from "$lib/features/graph/ports";

const LOD_FULL_ZOOM = 0.6;
const LOD_MEDIUM_ZOOM = 0.3;
const NODE_RADIUS = 8;
const NODE_RADIUS_MEDIUM = 4;
const NODE_RADIUS_SMALL = 2;
const HIT_AREA_RADIUS = 14;
const WORLD_SIZE = 10_000;

type NodeEntry = {
  id: string;
  label_text: string;
  container: Container;
  circle: Sprite;
  label: Text;
  x: number;
  y: number;
};

type EdgeDef = { source: string; target: string };
type SemanticEdgeDef = SemanticEdge;

export class VaultGraphRenderer {
  private pixi: typeof import("pixi.js") | null = null;
  private app: Application | null = null;
  private vp: Viewport | null = null;
  private edges_gfx: Graphics | null = null;
  private nodes_layer: Container | null = null;
  private node_map = new Map<string, NodeEntry>();
  private edge_defs: EdgeDef[] = [];
  private semantic_edge_defs: SemanticEdgeDef[] = [];
  private show_semantic = false;
  private spatial = new SpatialIndex();
  private circle_texture: Texture | null = null;
  private filter_set: Set<string> | null = null;
  private selected_id: string | null = null;
  private hovered_id: string | null = null;
  private hovered_connections = new Set<string>();
  private colors = {
    node: 0x888888,
    primary: 0x6366f1,
    edge: 0x888888,
    semantic_edge: 0xf59e0b,
    bg: 0x1a1a2e,
    label_fill: 0xffffff,
  };
  private destroyed = false;
  private container_el: HTMLElement | null = null;
  private raf_id = 0;
  private edges_dirty = true;
  private last_lod_tier = -1;

  on_node_click: (id: string) => void = () => {};
  on_node_hover: (id: string | null) => void = () => {};
  on_node_dblclick: (id: string) => void = () => {};

  async initialize(container: HTMLElement): Promise<void> {
    // @ts-expect-error pixi.js/unsafe-eval is a side-effect-only module that
    // patches Pixi prototypes to avoid new Function() — required for strict CSP
    await import("pixi.js/unsafe-eval");
    const [pixi, { Viewport }] = await Promise.all([
      import("pixi.js"),
      import("pixi-viewport"),
    ]);
    if (this.destroyed) return;
    this.pixi = pixi;

    this.container_el = container;
    this.read_theme_colors(container);

    const w = container.clientWidth || 300;
    const h = container.clientHeight || 300;

    this.app = new pixi.Application();
    await this.app.init({
      preference: "webgl",
      width: w,
      height: h,
      background: this.colors.bg,
      antialias: true,
      resolution: window.devicePixelRatio,
      autoDensity: true,
    });

    if (this.destroyed) {
      this.app.destroy(true, { children: true });
      this.app = null;
      return;
    }

    container.appendChild(this.app.canvas);

    this.vp = new Viewport({
      screenWidth: w,
      screenHeight: h,
      worldWidth: WORLD_SIZE,
      worldHeight: WORLD_SIZE,
      events: this.app.renderer.events,
    });

    this.vp
      .drag({ mouseButtons: "left" })
      .pinch()
      .wheel()
      .decelerate()
      .clampZoom({ minScale: 0.05, maxScale: 4 });

    this.vp.moveCenter(0, 0);

    this.app.stage.addChild(this.vp);

    this.vp.on("moved", () => this.request_render());
    this.vp.on("zoomed", () => this.request_render());

    this.edges_gfx = new pixi.Graphics();
    this.nodes_layer = new pixi.Container();

    const g = new pixi.Graphics();
    g.circle(0, 0, NODE_RADIUS);
    g.fill(0xffffff);
    this.circle_texture = this.app.renderer.generateTexture(g);
    g.destroy();

    this.vp.addChild(this.edges_gfx);
    this.vp.addChild(this.nodes_layer);
  }

  set_graph(nodes: { id: string; label: string }[], edges: EdgeDef[]): void {
    if (!this.pixi || !this.nodes_layer || !this.circle_texture) return;
    const { Container: C, Sprite: S, Text: T } = this.pixi;

    for (const entry of this.node_map.values()) {
      entry.container.destroy({ children: true });
    }
    this.node_map.clear();
    this.nodes_layer.removeChildren();
    this.edge_defs = edges;
    this.edges_dirty = true;

    for (const node of nodes) {
      const c = new C();
      c.position.set(0, 0);

      const circle = new S(this.circle_texture);
      circle.anchor.set(0.5);
      circle.tint = this.colors.node;
      c.addChild(circle);

      const label = new T({
        text: node.label,
        style: {
          fontSize: 11,
          fill: this.colors.label_fill,
          fontFamily: "system-ui, sans-serif",
        },
      });
      label.anchor.set(0.5, 0);
      label.position.set(0, NODE_RADIUS + 4);
      label.visible = false;
      c.addChild(label);

      c.eventMode = "static";
      c.cursor = "pointer";
      c.hitArea = {
        contains: (x: number, y: number) =>
          x * x + y * y < HIT_AREA_RADIUS * HIT_AREA_RADIUS,
      };

      const id = node.id;
      c.on("pointertap", () => this.on_node_click(id));
      c.on("pointerover", () => {
        this.on_node_hover(id);
      });
      c.on("pointerout", () => {
        this.on_node_hover(null);
      });

      let last_tap = 0;
      c.on("pointertap", () => {
        const now = Date.now();
        if (now - last_tap < 350) {
          this.on_node_dblclick(id);
        }
        last_tap = now;
      });

      this.nodes_layer.addChild(c);
      this.node_map.set(node.id, {
        id: node.id,
        label_text: node.label,
        container: c,
        circle,
        label,
        x: 0,
        y: 0,
      });
    }

    this.request_render();
  }

  update_positions(positions: Map<string, { x: number; y: number }>): void {
    const spatial_nodes: { id: string; x: number; y: number }[] = [];
    for (const [id, pos] of positions) {
      const entry = this.node_map.get(id);
      if (entry) {
        entry.x = pos.x;
        entry.y = pos.y;
        entry.container.position.set(pos.x, pos.y);
        spatial_nodes.push({ id, x: pos.x, y: pos.y });
      }
    }
    this.spatial.rebuild(spatial_nodes);
    this.edges_dirty = true;
    this.request_render();
  }

  set_semantic_edges(edges: SemanticEdgeDef[], visible: boolean): void {
    this.semantic_edge_defs = edges;
    this.show_semantic = visible;
    this.edges_dirty = true;
    this.request_render();
  }

  highlight_node(id: string | null): void {
    this.hovered_id = id;
    this.rebuild_hovered_connections();
    this.edges_dirty = true;
    this.request_render();
  }

  select_node(id: string | null): void {
    this.selected_id = id;
    this.request_render();
  }

  set_filter(matching_ids: Set<string> | null): void {
    this.filter_set = matching_ids;
    this.edges_dirty = true;
    this.request_render();
  }

  resize(): void {
    if (!this.container_el || !this.app || !this.vp) return;
    const w = this.container_el.clientWidth;
    const h = this.container_el.clientHeight;
    if (w === 0 || h === 0) return;
    this.app.renderer.resize(w, h);
    this.vp.resize(w, h);
    this.request_render();
  }

  destroy(): void {
    this.destroyed = true;
    cancelAnimationFrame(this.raf_id);
    if (this.app) {
      this.app.destroy(true, { children: true });
      this.app = null;
    }
    this.vp = null;
    this.node_map.clear();
    this.circle_texture = null;
    this.container_el = null;
  }

  private get zoom(): number {
    return this.vp?.scale.x ?? 1;
  }

  private request_render(): void {
    if (this.destroyed) return;
    cancelAnimationFrame(this.raf_id);
    this.raf_id = requestAnimationFrame(() => this.render());
  }

  private lod_tier(): number {
    const z = this.zoom;
    return z > LOD_FULL_ZOOM ? 2 : z > LOD_MEDIUM_ZOOM ? 1 : 0;
  }

  private render(): void {
    if (this.destroyed || !this.app) return;
    const tier = this.lod_tier();
    if (tier !== this.last_lod_tier) {
      this.last_lod_tier = tier;
      this.edges_dirty = true;
    }
    this.apply_culling();
    this.draw_edges();
    this.apply_visual_state();
  }

  private graph_viewport(): {
    x: number;
    y: number;
    width: number;
    height: number;
  } {
    if (!this.vp) return { x: 0, y: 0, width: 800, height: 600 };
    const margin = 50;
    const corner = this.vp.corner;
    return {
      x: corner.x - margin,
      y: corner.y - margin,
      width: this.vp.screenWidth / this.zoom + margin * 2,
      height: this.vp.screenHeight / this.zoom + margin * 2,
    };
  }

  private apply_culling(): void {
    const gv = this.graph_viewport();
    const visible_ids = new Set(
      this.spatial.query_viewport(gv.x, gv.y, gv.width, gv.height),
    );

    for (const [id, entry] of this.node_map) {
      entry.container.visible = visible_ids.has(id);
    }
  }

  private apply_visual_state(): void {
    const z = this.zoom;
    const show_labels = z > LOD_FULL_ZOOM;
    const base_scale =
      z > LOD_FULL_ZOOM
        ? 1
        : z > LOD_MEDIUM_ZOOM
          ? NODE_RADIUS_MEDIUM / NODE_RADIUS
          : NODE_RADIUS_SMALL / NODE_RADIUS;

    for (const entry of this.node_map.values()) {
      if (!entry.container.visible) continue;

      const is_selected = entry.id === this.selected_id;
      const is_hovered = entry.id === this.hovered_id;
      const is_connected = this.hovered_connections.has(entry.id);
      const is_dimmed =
        this.filter_set !== null && !this.filter_set.has(entry.id);

      if (is_dimmed) {
        entry.circle.tint = this.colors.node;
        entry.circle.alpha = 0.15;
        entry.circle.scale.set(base_scale);
      } else if (is_selected) {
        entry.circle.tint = this.colors.primary;
        entry.circle.alpha = 1;
        entry.circle.scale.set(base_scale * 1.8);
      } else if (is_hovered) {
        entry.circle.tint = this.colors.primary;
        entry.circle.alpha = 1;
        entry.circle.scale.set(base_scale * 1.5);
      } else if (is_connected) {
        entry.circle.tint = this.colors.primary;
        entry.circle.alpha = 1;
        entry.circle.scale.set(base_scale);
      } else {
        entry.circle.tint = this.colors.node;
        entry.circle.alpha = 1;
        entry.circle.scale.set(base_scale);
      }

      entry.label.visible =
        is_hovered || is_selected || (show_labels && is_connected);
    }
  }

  private rebuild_hovered_connections(): void {
    this.hovered_connections.clear();
    if (!this.hovered_id) return;
    for (const edge of this.edge_defs) {
      if (edge.source === this.hovered_id)
        this.hovered_connections.add(edge.target);
      if (edge.target === this.hovered_id)
        this.hovered_connections.add(edge.source);
    }
  }

  private draw_edges(): void {
    if (!this.edges_gfx) return;
    if (!this.edges_dirty) return;
    this.edges_dirty = false;
    this.edges_gfx.clear();

    const gv = this.graph_viewport();
    const visible_ids = new Set(
      this.spatial.query_viewport(gv.x, gv.y, gv.width, gv.height),
    );

    const z = this.zoom;
    const edge_alpha =
      z > LOD_FULL_ZOOM ? 0.55 : z > LOD_MEDIUM_ZOOM ? 0.35 : 0.2;
    const edge_width = z > LOD_FULL_ZOOM ? 1 : z > LOD_MEDIUM_ZOOM ? 0.5 : 0.3;

    type EdgeEndpoints = { x1: number; y1: number; x2: number; y2: number };
    const dimmed: EdgeEndpoints[] = [];
    const normal: EdgeEndpoints[] = [];
    const highlighted: EdgeEndpoints[] = [];

    for (const edge of this.edge_defs) {
      const src = this.node_map.get(edge.source);
      const tgt = this.node_map.get(edge.target);
      if (!src || !tgt) continue;
      if (!visible_ids.has(edge.source) && !visible_ids.has(edge.target))
        continue;

      const is_highlighted =
        this.hovered_id !== null &&
        (edge.source === this.hovered_id || edge.target === this.hovered_id);
      const is_dimmed =
        this.filter_set !== null &&
        (!this.filter_set.has(edge.source) ||
          !this.filter_set.has(edge.target));

      const ep = { x1: src.x, y1: src.y, x2: tgt.x, y2: tgt.y };
      if (is_dimmed) dimmed.push(ep);
      else if (is_highlighted) highlighted.push(ep);
      else normal.push(ep);
    }

    for (const ep of dimmed) {
      this.edges_gfx.moveTo(ep.x1, ep.y1);
      this.edges_gfx.lineTo(ep.x2, ep.y2);
    }
    if (dimmed.length > 0) {
      this.edges_gfx.stroke({
        width: edge_width,
        color: this.colors.edge,
        alpha: 0.08,
      });
    }

    for (const ep of normal) {
      this.edges_gfx.moveTo(ep.x1, ep.y1);
      this.edges_gfx.lineTo(ep.x2, ep.y2);
    }
    if (normal.length > 0) {
      this.edges_gfx.stroke({
        width: edge_width,
        color: this.colors.edge,
        alpha: edge_alpha,
      });
    }

    for (const ep of highlighted) {
      this.edges_gfx.moveTo(ep.x1, ep.y1);
      this.edges_gfx.lineTo(ep.x2, ep.y2);
    }
    if (highlighted.length > 0) {
      this.edges_gfx.stroke({
        width: 1.5,
        color: this.colors.primary,
        alpha: 0.9,
      });
    }

    if (!this.show_semantic) return;

    const sem_dimmed: EdgeEndpoints[] = [];
    const sem_normal: EdgeEndpoints[] = [];
    const sem_highlighted: Array<EdgeEndpoints & { width: number }> = [];

    for (const edge of this.semantic_edge_defs) {
      const src = this.node_map.get(edge.source);
      const tgt = this.node_map.get(edge.target);
      if (!src || !tgt) continue;
      if (!visible_ids.has(edge.source) && !visible_ids.has(edge.target))
        continue;

      const is_highlighted =
        this.hovered_id !== null &&
        (edge.source === this.hovered_id || edge.target === this.hovered_id);
      const is_dimmed =
        this.filter_set !== null &&
        (!this.filter_set.has(edge.source) ||
          !this.filter_set.has(edge.target));

      const ep = { x1: src.x, y1: src.y, x2: tgt.x, y2: tgt.y };
      if (is_dimmed) sem_dimmed.push(ep);
      else if (is_highlighted) sem_highlighted.push({ ...ep, width: 2 });
      else sem_normal.push(ep);
    }

    for (const ep of sem_dimmed) {
      draw_dashed_line(
        this.edges_gfx,
        ep.x1,
        ep.y1,
        ep.x2,
        ep.y2,
        5,
        4,
        1.5,
        this.colors.semantic_edge,
        0.1,
      );
    }
    for (const ep of sem_normal) {
      draw_dashed_line(
        this.edges_gfx,
        ep.x1,
        ep.y1,
        ep.x2,
        ep.y2,
        5,
        4,
        1.5,
        this.colors.semantic_edge,
        0.7,
      );
    }
    for (const ep of sem_highlighted) {
      draw_dashed_line(
        this.edges_gfx,
        ep.x1,
        ep.y1,
        ep.x2,
        ep.y2,
        5,
        4,
        ep.width,
        this.colors.semantic_edge,
        1,
      );
    }
  }

  private read_theme_colors(el: HTMLElement): void {
    this.colors.node = resolve_css_color(el, "--muted-foreground", 0x888888);
    this.colors.primary = resolve_css_color(el, "--primary", 0x6366f1);
    this.colors.edge = resolve_css_color(el, "--muted-foreground", 0x888888);
    this.colors.semantic_edge = resolve_css_color(
      el,
      "--semantic-edge",
      0xf59e0b,
    );
    this.colors.bg = resolve_css_color(el, "--background", 0x1a1a2e);
    this.colors.label_fill = resolve_css_color(el, "--foreground", 0xffffff);
  }
}

function resolve_css_color(
  el: HTMLElement,
  name: string,
  fallback: number,
): number {
  const raw = getComputedStyle(el).getPropertyValue(name).trim();
  if (!raw) return fallback;

  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 1;
  const ctx = canvas.getContext("2d");
  if (!ctx) return fallback;

  ctx.fillStyle = raw;
  ctx.fillRect(0, 0, 1, 1);
  const [r = 0, g = 0, b = 0, a = 0] = ctx.getImageData(0, 0, 1, 1).data;
  if (a === 0) return fallback;
  return (r << 16) | (g << 8) | b;
}

function draw_dashed_line(
  gfx: Graphics,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  dash: number,
  gap: number,
  width: number,
  color: number,
  alpha: number,
): void {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len === 0) return;
  const ux = dx / len;
  const uy = dy / len;
  let drawn = 0;
  while (drawn < len) {
    const seg_end = Math.min(drawn + dash, len);
    gfx.moveTo(x1 + ux * drawn, y1 + uy * drawn);
    gfx.lineTo(x1 + ux * seg_end, y1 + uy * seg_end);
    gfx.stroke({ width, color, alpha });
    drawn = seg_end + gap;
  }
}
