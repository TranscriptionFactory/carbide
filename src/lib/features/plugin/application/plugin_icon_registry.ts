import type { Component } from "svelte";
import type { IconProps } from "@lucide/svelte";

// Navigation & UI
import ArrowLeft from "@lucide/svelte/icons/arrow-left";
import ArrowRight from "@lucide/svelte/icons/arrow-right";
import ChevronDown from "@lucide/svelte/icons/chevron-down";
import ChevronRight from "@lucide/svelte/icons/chevron-right";
import ExternalLink from "@lucide/svelte/icons/external-link";
import Home from "@lucide/svelte/icons/home";
import Menu from "@lucide/svelte/icons/menu";
import Search from "@lucide/svelte/icons/search";
import Settings from "@lucide/svelte/icons/settings";
import SlidersHorizontal from "@lucide/svelte/icons/sliders-horizontal";

// Files & Documents
import File from "@lucide/svelte/icons/file";
import FileText from "@lucide/svelte/icons/file-text";
import FileCode from "@lucide/svelte/icons/file-code";
import Folder from "@lucide/svelte/icons/folder";
import FolderOpen from "@lucide/svelte/icons/folder-open";

// Data & Charts
import BarChart from "@lucide/svelte/icons/bar-chart";
import Database from "@lucide/svelte/icons/database";
import LineChart from "@lucide/svelte/icons/line-chart";
import PieChart from "@lucide/svelte/icons/pie-chart";
import Table from "@lucide/svelte/icons/table";

// Tools & Actions
import Blocks from "@lucide/svelte/icons/blocks";
import Bookmark from "@lucide/svelte/icons/bookmark";
import Clipboard from "@lucide/svelte/icons/clipboard";
import Download from "@lucide/svelte/icons/download";
import Filter from "@lucide/svelte/icons/filter";
import Link from "@lucide/svelte/icons/link";
import Pencil from "@lucide/svelte/icons/pencil";
import Plus from "@lucide/svelte/icons/plus";
import RefreshCw from "@lucide/svelte/icons/refresh-cw";
import Trash from "@lucide/svelte/icons/trash";
import Upload from "@lucide/svelte/icons/upload";
import Wrench from "@lucide/svelte/icons/wrench";
import Zap from "@lucide/svelte/icons/zap";

// Layout
import Grid from "@lucide/svelte/icons/grid-3x3";
import Columns from "@lucide/svelte/icons/columns-3";
import LayoutDashboard from "@lucide/svelte/icons/layout-dashboard";
import Layers from "@lucide/svelte/icons/layers";
import Sidebar from "@lucide/svelte/icons/panel-left";

// Media
import Image from "@lucide/svelte/icons/image";
import Music from "@lucide/svelte/icons/music";
import Play from "@lucide/svelte/icons/play";
import Video from "@lucide/svelte/icons/video";

// Status & Feedback
import AlertCircle from "@lucide/svelte/icons/circle-alert";
import CheckCircle from "@lucide/svelte/icons/circle-check";
import Clock from "@lucide/svelte/icons/clock";
import Eye from "@lucide/svelte/icons/eye";
import Info from "@lucide/svelte/icons/info";
import Star from "@lucide/svelte/icons/star";

// Communication
import Bell from "@lucide/svelte/icons/bell";
import Globe from "@lucide/svelte/icons/globe";
import Mail from "@lucide/svelte/icons/mail";
import MessageSquare from "@lucide/svelte/icons/message-square";

// Misc
import Calendar from "@lucide/svelte/icons/calendar";
import Hash from "@lucide/svelte/icons/hash";
import Key from "@lucide/svelte/icons/key";
import Map from "@lucide/svelte/icons/map";
import Palette from "@lucide/svelte/icons/palette";
import Shield from "@lucide/svelte/icons/shield";
import Tag from "@lucide/svelte/icons/tag";
import Terminal from "@lucide/svelte/icons/terminal";
import User from "@lucide/svelte/icons/user";
import Users from "@lucide/svelte/icons/users";

const PLUGIN_ICONS: Record<string, Component<IconProps>> = {
  "arrow-left": ArrowLeft,
  "arrow-right": ArrowRight,
  "chevron-down": ChevronDown,
  "chevron-right": ChevronRight,
  "external-link": ExternalLink,
  home: Home,
  menu: Menu,
  search: Search,
  settings: Settings,
  "sliders-horizontal": SlidersHorizontal,

  file: File,
  "file-text": FileText,
  "file-code": FileCode,
  folder: Folder,
  "folder-open": FolderOpen,

  "bar-chart": BarChart,
  database: Database,
  "line-chart": LineChart,
  "pie-chart": PieChart,
  table: Table,

  blocks: Blocks,
  bookmark: Bookmark,
  clipboard: Clipboard,
  download: Download,
  filter: Filter,
  link: Link,
  pencil: Pencil,
  plus: Plus,
  "refresh-cw": RefreshCw,
  trash: Trash,
  upload: Upload,
  wrench: Wrench,
  zap: Zap,

  grid: Grid,
  columns: Columns,
  "layout-dashboard": LayoutDashboard,
  layers: Layers,
  sidebar: Sidebar,

  image: Image,
  music: Music,
  play: Play,
  video: Video,

  "alert-circle": AlertCircle,
  "check-circle": CheckCircle,
  clock: Clock,
  eye: Eye,
  info: Info,
  star: Star,

  bell: Bell,
  globe: Globe,
  mail: Mail,
  "message-square": MessageSquare,

  calendar: Calendar,
  hash: Hash,
  key: Key,
  map: Map,
  palette: Palette,
  shield: Shield,
  tag: Tag,
  terminal: Terminal,
  user: User,
  users: Users,
};

export function resolve_plugin_icon(
  name: string | undefined,
): Component<IconProps> {
  if (name && name in PLUGIN_ICONS) {
    return PLUGIN_ICONS[name]!;
  }
  return Blocks;
}
