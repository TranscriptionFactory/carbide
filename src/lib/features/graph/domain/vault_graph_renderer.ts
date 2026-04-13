import type {
  Application,
  Container,
  Graphics,
  Sprite,
  Text,
  Texture,
} from "pixi.js";
import type { Viewport } from "pixi-viewport";
import { point_to_segment_distance } from "$lib/features/graph/domain/edge_hit_test";
import { SpatialIndex } from "$lib/features/graph/domain/spatial_index";
import {
  convex_hull,
  offset_polygon,
} from "$lib/features/graph/domain/geometry";
import type {
  SemanticEdge,
  SmartLinkEdge,
  SmartLinkRuleMatchInfo,
} from "$lib/features/graph/ports";

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
  kind?: "hit" | "neighbor";
  score?: number;
  group?: string;
};

type EdgeDef = { source: string; target: string };
type SemanticEdgeDef = SemanticEdge;
type SmartLinkEdgeDef = SmartLinkEdge;

export type EdgeHoverInfo = {
  source: string;
  target: string;
  score: number;
  rules: SmartLinkRuleMatchInfo[];
  screen_x: number;
  screen_y: number;
};

export class VaultGraphRenderer {
  private pixi: typeof import("pixi.js") | null = null;
  private app: Application | null = null;
  private vp: Viewport | null = null;
  private cluster_gfx: Graphics | null = null;
  private edges_gfx: Graphics | null = null;
  private nodes_layer: Container | null = null;
  private node_map = new Map<string, NodeEntry>();
  private edge_defs: EdgeDef[] = [];
  private semantic_edge_defs: SemanticEdgeDef[] = [];
  private show_semantic = false;
  private smart_link_edge_defs: SmartLinkEdgeDef[] = [];
  private show_smart_links = false;
  private spatial = new SpatialIndex();
  private circle_texture: Texture | null = null;
  private filter_set: Set<string> | null = null;
  private selected_id: string | null = null;
  private hovered_id: string | null = null;
  private hovered_connections = new Set<string>();
  private has_search_meta = false;
  private colors = {
    node: 0x888888,
    primary: 0x6366f1,
    edge: 0x888888,
    semantic_edge: 0xf59e0b,
    smart_link_edge: 0x22d3ee,
    bg: 0x1a1a2e,
    label_fill: 0xffffff,
    hit: 0x6366f1,
    neighbor: 0x888888,
    cluster_fill: 0x334155,
  };
  private destroyed = false;
  private container_el: HTMLElement | null = null;
  private raf_id = 0;
  private edges_dirty = true;
  private last_lod_tier = -1;

  on_node_click: (id: string) => void = () => {};
  on_node_hover: (id: string | null) => void = () => {};
  on_node_dblclick: (id: string) => void = () => {};
  on_node_contextmenu: (
    id: string,
    screen_x: number,
    screen_y: number,
  ) => void = () => {};
  on_edge_hover: (info: EdgeHoverInfo | null) => void = () => {};

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

    this.cluster_gfx = new pixi.Graphics();
    this.edges_gfx = new pixi.Graphics();
    this.nodes_layer = new pixi.Container();

    const g = new pixi.Graphics();
    g.circle(0, 0, NODE_RADIUS);
    g.fill(0xffffff);
    this.circle_texture = this.app.renderer.generateTexture(g);
    g.destroy();

    this.vp.addChild(this.cluster_gfx);
    this.vp.addChild(this.edges_gfx);
    this.vp.addChild(this.nodes_layer);

    this.vp.on("pointermove", (e) => {
      if (!this.show_smart_links || !this.vp) return;
      const world = this.vp.toWorld(e.global.x, e.global.y);
      const hit = this.find_nearest_smart_link_edge(world.x, world.y);
      if (hit) {
        this.on_edge_hover({
          source: hit.source,
          target: hit.target,
          score: hit.score,
          rules: hit.rules,
          screen_x: e.global.x,
          screen_y: e.global.y,
        });
      } else {
        this.on_edge_hover(null);
      }
    });
  }

  set_graph(
    nodes: {
      id: string;
      label: string;
      kind?: "hit" | "neighbor";
      score?: number;
      group?: string;
    }[],
    edges: EdgeDef[],
  ): void {
    if (!this.pixi || !this.nodes_layer || !this.circle_texture) return;
    const { Container: C, Sprite: S, Text: T } = this.pixi;

    for (const entry of this.node_map.values()) {
      entry.container.destroy({ children: true });
    }
    this.node_map.clear();
    this.nodes_layer.removeChildren();
    this.edge_defs = edges;
    this.edges_dirty = true;
    this.has_search_meta = nodes.some((n) => n.kind != null);

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
      c.on("rightclick", (e) => {
        e.preventDefault?.();
        const global = e.global ?? e;
        this.on_node_contextmenu(id, global.x, global.y);
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
      const entry: NodeEntry = {
        id: node.id,
        label_text: node.label,
        container: c,
        circle,
        label,
        x: 0,
        y: 0,
      };
      if (node.kind != null) entry.kind = node.kind;
      if (node.score != null) entry.score = node.score;
      if (node.group != null) entry.group = node.group;
      this.node_map.set(node.id, entry);
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

  set_smart_link_edges(edges: SmartLinkEdgeDef[], visible: boolean): void {
    this.smart_link_edge_defs = edges;
    this.show_smart_links = visible;
    this.edges_dirty = true;
    this.request_render();
  }

  highlight_node(id: string | null): void {
    this.hovered_id = id;
    this.rebuild_hovered_connections();
    this.edges_dirty = true;
    this.request_render();
  }

  update_colors(): void {
    if (!this.container_el || !this.app) return;
    this.read_theme_colors(this.container_el);
    this.app.renderer.background.color = this.colors.bg;

    for (const entry of this.node_map.values()) {
      entry.circle.tint = this.colors.node;
      entry.label.style.fill = this.colors.label_fill;
    }

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
    this.draw_clusters();
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

      if (this.has_search_meta && entry.kind != null) {
        this.apply_search_visual(
          entry,
          base_scale,
          show_labels,
          is_selected,
          is_hovered,
          is_connected,
        );
      } else {
        this.apply_vault_visual(
          entry,
          base_scale,
          show_labels,
          is_selected,
          is_hovered,
          is_connected,
        );
      }
    }
  }

  private apply_vault_visual(
    entry: NodeEntry,
    base_scale: number,
    show_labels: boolean,
    is_selected: boolean,
    is_hovered: boolean,
    is_connected: boolean,
  ): void {
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

  private apply_search_visual(
    entry: NodeEntry,
    base_scale: number,
    show_labels: boolean,
    is_selected: boolean,
    is_hovered: boolean,
    is_connected: boolean,
  ): void {
    const is_hit = entry.kind === "hit";
    const score = entry.score ?? 0;

    if (is_selected) {
      entry.circle.tint = this.colors.primary;
      entry.circle.alpha = 1;
      entry.circle.scale.set(base_scale * 1.8);
      entry.label.visible = true;
    } else if (is_hovered) {
      entry.circle.tint = this.colors.primary;
      entry.circle.alpha = 1;
      entry.circle.scale.set(base_scale * 1.5);
      entry.label.visible = true;
    } else if (is_hit) {
      const score_factor = 0.7 + 0.6 * score;
      entry.circle.tint = this.colors.hit;
      entry.circle.alpha = 1;
      entry.circle.scale.set(base_scale * score_factor * 1.4);
      entry.label.visible = show_labels || is_connected;
    } else {
      entry.circle.tint = this.colors.neighbor;
      entry.circle.alpha = is_connected ? 0.8 : 0.4;
      entry.circle.scale.set(base_scale * 0.7);
      entry.label.visible = is_hovered || is_connected;
    }
  }

  private draw_clusters(): void {
    if (!this.cluster_gfx) return;
    if (!this.has_search_meta || !this.edges_dirty) {
      if (!this.has_search_meta) this.cluster_gfx.clear();
      return;
    }

    this.cluster_gfx.clear();

    const groups = new Map<string, { x: number; y: number }[]>();
    for (const entry of this.node_map.values()) {
      if (!entry.container.visible || entry.group == null) continue;
      let arr = groups.get(entry.group);
      if (!arr) {
        arr = [];
        groups.set(entry.group, arr);
      }
      arr.push({ x: entry.x, y: entry.y });
    }

    for (const points of groups.values()) {
      if (points.length < 3) continue;
      const hull = convex_hull(points);
      if (hull.length < 3) continue;
      const padded = offset_polygon(hull, 30);

      this.cluster_gfx.moveTo(padded[0]!.x, padded[0]!.y);
      for (let i = 1; i < padded.length; i++) {
        this.cluster_gfx.lineTo(padded[i]!.x, padded[i]!.y);
      }
      this.cluster_gfx.closePath();
      this.cluster_gfx.fill({ color: this.colors.cluster_fill, alpha: 0.08 });
    }
  }

  private find_nearest_smart_link_edge(
    wx: number,
    wy: number,
  ): SmartLinkEdgeDef | null {
    const threshold = 8 / this.zoom;
    let best: SmartLinkEdgeDef | null = null;
    let best_dist = threshold;

    for (const edge of this.smart_link_edge_defs) {
      const src = this.node_map.get(edge.source);
      const tgt = this.node_map.get(edge.target);
      if (!src || !tgt) continue;

      const dist = point_to_segment_distance(
        wx,
        wy,
        src.x,
        src.y,
        tgt.x,
        tgt.y,
      );
      if (dist < best_dist) {
        best_dist = dist;
        best = edge;
      }
    }

    return best;
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
    if (this.show_smart_links) {
      for (const edge of this.smart_link_edge_defs) {
        if (edge.source === this.hovered_id)
          this.hovered_connections.add(edge.target);
        if (edge.target === this.hovered_id)
          this.hovered_connections.add(edge.source);
      }
    }
  }

  private edge_kind_alpha(source_id: string, target_id: string): number {
    if (!this.has_search_meta) return 1;
    const src = this.node_map.get(source_id);
    const tgt = this.node_map.get(target_id);
    const src_hit = src?.kind === "hit";
    const tgt_hit = tgt?.kind === "hit";
    if (src_hit && tgt_hit) return 1;
    if (src_hit || tgt_hit) return 0.4;
    return 0.2;
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

    type EdgeEndpoints = {
      x1: number;
      y1: number;
      x2: number;
      y2: number;
      kind_alpha: number;
    };
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

      const kind_alpha = this.edge_kind_alpha(edge.source, edge.target);
      const ep = { x1: src.x, y1: src.y, x2: tgt.x, y2: tgt.y, kind_alpha };
      if (is_dimmed) dimmed.push(ep);
      else if (is_highlighted) highlighted.push(ep);
      else normal.push(ep);
    }

    if (this.has_search_meta) {
      for (const ep of dimmed) {
        this.edges_gfx.moveTo(ep.x1, ep.y1);
        this.edges_gfx.lineTo(ep.x2, ep.y2);
        this.edges_gfx.stroke({
          width: edge_width,
          color: this.colors.edge,
          alpha: 0.08 * ep.kind_alpha,
        });
      }
      for (const ep of normal) {
        this.edges_gfx.moveTo(ep.x1, ep.y1);
        this.edges_gfx.lineTo(ep.x2, ep.y2);
        this.edges_gfx.stroke({
          width: edge_width,
          color: this.colors.edge,
          alpha: edge_alpha * ep.kind_alpha,
        });
      }
      for (const ep of highlighted) {
        this.edges_gfx.moveTo(ep.x1, ep.y1);
        this.edges_gfx.lineTo(ep.x2, ep.y2);
        this.edges_gfx.stroke({
          width: 1.5,
          color: this.colors.primary,
          alpha: 0.9,
        });
      }
    } else {
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
    }

    if (!this.show_semantic) return;

    type SimpleEdgeEndpoints = {
      x1: number;
      y1: number;
      x2: number;
      y2: number;
    };
    const sem_dimmed: SimpleEdgeEndpoints[] = [];
    const sem_normal: SimpleEdgeEndpoints[] = [];
    const sem_highlighted: Array<SimpleEdgeEndpoints & { width: number }> = [];

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

    if (!this.show_smart_links) return;

    const sl_dimmed: SimpleEdgeEndpoints[] = [];
    const sl_normal: SimpleEdgeEndpoints[] = [];
    const sl_highlighted: Array<SimpleEdgeEndpoints & { width: number }> = [];

    for (const edge of this.smart_link_edge_defs) {
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
      if (is_dimmed) sl_dimmed.push(ep);
      else if (is_highlighted) sl_highlighted.push({ ...ep, width: 2 });
      else sl_normal.push(ep);
    }

    for (const ep of sl_dimmed) {
      draw_dashed_line(
        this.edges_gfx,
        ep.x1,
        ep.y1,
        ep.x2,
        ep.y2,
        8,
        5,
        1.5,
        this.colors.smart_link_edge,
        0.1,
      );
    }
    for (const ep of sl_normal) {
      draw_dashed_line(
        this.edges_gfx,
        ep.x1,
        ep.y1,
        ep.x2,
        ep.y2,
        8,
        5,
        1.5,
        this.colors.smart_link_edge,
        0.6,
      );
    }
    for (const ep of sl_highlighted) {
      draw_dashed_line(
        this.edges_gfx,
        ep.x1,
        ep.y1,
        ep.x2,
        ep.y2,
        8,
        5,
        ep.width,
        this.colors.smart_link_edge,
        1,
      );
    }
  }

  private read_theme_colors(el: HTMLElement): void {
    this.colors.node = resolve_css_color(
      el,
      "--graph-node",
      resolve_css_color(el, "--muted-foreground", 0x888888),
    );
    this.colors.primary = resolve_css_color(
      el,
      "--graph-node-primary",
      resolve_css_color(el, "--primary", 0x6366f1),
    );
    this.colors.edge = resolve_css_color(
      el,
      "--graph-edge",
      resolve_css_color(el, "--muted-foreground", 0x888888),
    );
    this.colors.semantic_edge = resolve_css_color(
      el,
      "--graph-edge-semantic",
      resolve_css_color(el, "--semantic-edge", 0xf59e0b),
    );
    this.colors.smart_link_edge = resolve_css_color(
      el,
      "--graph-edge-smart-link",
      0x22d3ee,
    );
    this.colors.bg = resolve_css_color(el, "--background", 0x1a1a2e);
    this.colors.label_fill = resolve_css_color(
      el,
      "--graph-label",
      resolve_css_color(el, "--foreground", 0xffffff),
    );
    this.colors.hit = resolve_css_color(
      el,
      "--graph-node-hit",
      this.colors.primary,
    );
    this.colors.neighbor = resolve_css_color(
      el,
      "--graph-node-neighbor",
      this.colors.node,
    );
    this.colors.cluster_fill = resolve_css_color(
      el,
      "--graph-cluster-fill",
      0x334155,
    );
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
