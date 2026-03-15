import type {
  Application,
  Container,
  Graphics,
  Sprite,
  Text,
  Texture,
} from "pixi.js";
import { SpatialIndex } from "$lib/features/graph/domain/spatial_index";
import type { SemanticEdge } from "$lib/features/graph/ports";

const LOD_FULL_ZOOM = 0.6;
const LOD_MEDIUM_ZOOM = 0.3;
const NODE_RADIUS = 8;
const NODE_RADIUS_MEDIUM = 4;
const NODE_RADIUS_SMALL = 2;
const HIT_AREA_RADIUS = 14;

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
  private edges_gfx: Graphics | null = null;
  private nodes_layer: Container | null = null;
  private node_map = new Map<string, NodeEntry>();
  private edge_defs: EdgeDef[] = [];
  private semantic_edge_defs: SemanticEdgeDef[] = [];
  private show_semantic = false;
  private spatial = new SpatialIndex();
  private circle_texture: Texture | null = null;
  private viewport = { x: 0, y: 0, width: 800, height: 600 };
  private zoom = 1;
  private pan = { x: 0, y: 0 };
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
  private dragging = false;
  private drag_start = { x: 0, y: 0, px: 0, py: 0 };
  private destroyed = false;
  private container_el: HTMLElement | null = null;
  private raf_id = 0;

  on_node_click: (id: string) => void = () => {};
  on_node_hover: (id: string | null) => void = () => {};
  on_node_dblclick: (id: string) => void = () => {};

  async initialize(container: HTMLElement): Promise<void> {
    const pixi = await import("pixi.js");
    if (this.destroyed) return;
    this.pixi = pixi;

    this.container_el = container;
    this.read_theme_colors(container);

    this.app = new pixi.Application();
    await this.app.init({
      resizeTo: container,
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
    this.app.canvas.style.touchAction = "none";

    this.edges_gfx = new pixi.Graphics();
    this.nodes_layer = new pixi.Container();

    const g = new pixi.Graphics();
    g.circle(0, 0, NODE_RADIUS);
    g.fill(0xffffff);
    this.circle_texture = this.app.renderer.generateTexture(g);
    g.destroy();

    this.app.stage.addChild(this.edges_gfx);
    this.app.stage.addChild(this.nodes_layer);

    this.viewport.width = container.clientWidth;
    this.viewport.height = container.clientHeight;
    this.pan.x = this.viewport.width / 2;
    this.pan.y = this.viewport.height / 2;
    this.apply_transform();

    this.setup_input(container);
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
    this.request_render();
  }

  set_semantic_edges(edges: SemanticEdgeDef[], visible: boolean): void {
    this.semantic_edge_defs = edges;
    this.show_semantic = visible;
    this.request_render();
  }

  highlight_node(id: string | null): void {
    this.hovered_id = id;
    this.rebuild_hovered_connections();
    this.request_render();
  }

  select_node(id: string | null): void {
    this.selected_id = id;
    this.request_render();
  }

  set_filter(matching_ids: Set<string> | null): void {
    this.filter_set = matching_ids;
    this.request_render();
  }

  resize(): void {
    if (!this.container_el || !this.app) return;
    this.viewport.width = this.container_el.clientWidth;
    this.viewport.height = this.container_el.clientHeight;
    this.app.renderer.resize(this.viewport.width, this.viewport.height);
    this.request_render();
  }

  destroy(): void {
    this.destroyed = true;
    cancelAnimationFrame(this.raf_id);
    this.teardown_input();
    if (this.app) {
      this.app.destroy(true, { children: true });
      this.app = null;
    }
    this.node_map.clear();
    this.circle_texture = null;
    this.container_el = null;
  }

  private request_render(): void {
    if (this.destroyed) return;
    cancelAnimationFrame(this.raf_id);
    this.raf_id = requestAnimationFrame(() => this.render());
  }

  private render(): void {
    if (this.destroyed || !this.app) return;
    this.apply_culling();
    this.draw_edges();
    this.apply_visual_state();
  }

  private apply_transform(): void {
    if (!this.app) return;
    this.app.stage.position.set(this.pan.x, this.pan.y);
    this.app.stage.scale.set(this.zoom);
  }

  private graph_viewport(): {
    x: number;
    y: number;
    width: number;
    height: number;
  } {
    const margin = 50;
    return {
      x: -this.pan.x / this.zoom - margin,
      y: -this.pan.y / this.zoom - margin,
      width: this.viewport.width / this.zoom + margin * 2,
      height: this.viewport.height / this.zoom + margin * 2,
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
    const show_labels = this.zoom > LOD_FULL_ZOOM;
    const base_scale =
      this.zoom > LOD_FULL_ZOOM
        ? 1
        : this.zoom > LOD_MEDIUM_ZOOM
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
        show_labels && (is_hovered || is_selected || is_connected);
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
    this.edges_gfx.clear();

    const gv = this.graph_viewport();
    const visible_ids = new Set(
      this.spatial.query_viewport(gv.x, gv.y, gv.width, gv.height),
    );

    const edge_alpha =
      this.zoom > LOD_FULL_ZOOM
        ? 0.55
        : this.zoom > LOD_MEDIUM_ZOOM
          ? 0.35
          : 0.2;
    const edge_width =
      this.zoom > LOD_FULL_ZOOM ? 1 : this.zoom > LOD_MEDIUM_ZOOM ? 0.5 : 0.3;

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

      const alpha = is_dimmed ? 0.08 : is_highlighted ? 0.9 : edge_alpha;
      const width = is_highlighted ? 1.5 : edge_width;
      const color = is_highlighted ? this.colors.primary : this.colors.edge;

      this.edges_gfx.moveTo(src.x, src.y);
      this.edges_gfx.lineTo(tgt.x, tgt.y);
      this.edges_gfx.stroke({ width, color, alpha });
    }

    if (this.show_semantic) {
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

        const alpha = is_dimmed ? 0.1 : is_highlighted ? 1 : 0.7;
        const width = is_highlighted ? 2 : 1.5;

        draw_dashed_line(
          this.edges_gfx,
          src.x,
          src.y,
          tgt.x,
          tgt.y,
          5,
          4,
          width,
          this.colors.semantic_edge,
          alpha,
        );
      }
    }
  }

  private setup_input(container: HTMLElement): void {
    container.addEventListener("wheel", this.handle_wheel, { passive: false });
    container.addEventListener("pointerdown", this.handle_pointer_down);
    container.addEventListener("pointermove", this.handle_pointer_move);
    container.addEventListener("pointerup", this.handle_pointer_up);
    container.addEventListener("pointercancel", this.handle_pointer_up);
  }

  private teardown_input(): void {
    if (!this.container_el) return;
    this.container_el.removeEventListener("wheel", this.handle_wheel);
    this.container_el.removeEventListener(
      "pointerdown",
      this.handle_pointer_down,
    );
    this.container_el.removeEventListener(
      "pointermove",
      this.handle_pointer_move,
    );
    this.container_el.removeEventListener("pointerup", this.handle_pointer_up);
    this.container_el.removeEventListener(
      "pointercancel",
      this.handle_pointer_up,
    );
  }

  private handle_wheel = (e: WheelEvent): void => {
    e.preventDefault();
    const factor = e.deltaY > 0 ? 0.9 : 1.1;
    const next_zoom = Math.min(4, Math.max(0.05, this.zoom * factor));

    const rect = this.container_el?.getBoundingClientRect();
    if (rect) {
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      this.pan.x = mx - ((mx - this.pan.x) / this.zoom) * next_zoom;
      this.pan.y = my - ((my - this.pan.y) / this.zoom) * next_zoom;
    }

    this.zoom = next_zoom;
    this.apply_transform();
    this.request_render();
  };

  private handle_pointer_down = (e: PointerEvent): void => {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    if (target !== this.app?.canvas) return;

    this.dragging = true;
    this.drag_start = {
      x: e.clientX,
      y: e.clientY,
      px: this.pan.x,
      py: this.pan.y,
    };
    this.container_el?.setPointerCapture(e.pointerId);
    if (this.container_el) this.container_el.style.cursor = "grabbing";
  };

  private handle_pointer_move = (e: PointerEvent): void => {
    if (!this.dragging) return;
    this.pan.x = this.drag_start.px + (e.clientX - this.drag_start.x);
    this.pan.y = this.drag_start.py + (e.clientY - this.drag_start.y);
    this.apply_transform();
    this.request_render();
  };

  private handle_pointer_up = (e: PointerEvent): void => {
    if (!this.dragging) return;
    this.dragging = false;
    this.container_el?.releasePointerCapture(e.pointerId);
    if (this.container_el) this.container_el.style.cursor = "grab";
  };

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

  ctx.fillStyle = raw.includes(",") ? raw : `hsl(${raw})`;
  ctx.fillRect(0, 0, 1, 1);
  const [r = 0, g = 0, b = 0] = ctx.getImageData(0, 0, 1, 1).data;
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
