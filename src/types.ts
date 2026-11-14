/**
 * Core data contracts for @apnex/graph-arrange.
 */

export interface Point2D {
  readonly x: number;
  readonly y: number;
}

export interface Rect2D {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export type SnapFn = (point: Point2D, bounds: Rect2D) => Point2D;

export interface GraphNode {
  readonly id: string;
  readonly label: string;
  readonly shortLabel?: string;
  readonly kind?: string;
  readonly badge?: string;
  readonly sublabel?: string;
  readonly accentColor?: string;
  readonly highlighted?: boolean;
  readonly dimmed?: boolean;
  readonly width?: number;
  readonly height?: number;
  readonly groupId?: string | null;
  readonly parentGroupId?: string | null;
  readonly laneIndex?: number;
  readonly priority?: number;
  readonly weight?: number;
  readonly point?: Point2D;
  readonly pinned?: boolean;
  readonly dataAttrs?: Readonly<Record<string, string>>;
}

export interface GraphGroup {
  readonly id: string;
  readonly label: string;
  readonly sublabel?: string;
  readonly role?: string;
  readonly depth?: number;
  readonly parentGroupId?: string | null;
  readonly memberNodeIds: readonly string[];
  readonly memberGroupIds?: readonly string[];
  readonly collapsed?: boolean;
  readonly collapsible?: boolean;
  readonly badgeSummary?: string;
  readonly accentColor?: string;
  readonly dataAttrs?: Readonly<Record<string, string>>;
}

export interface GraphLink {
  readonly id: string;
  readonly sourceId: string;
  readonly targetId: string;
  readonly category: string;
  readonly strokeColor?: string;
  readonly dashed?: boolean;
  readonly label?: string;
  readonly weight?: number;
  readonly dataAttrs?: Readonly<Record<string, string>>;
}

export interface GraphInput {
  readonly nodes: readonly GraphNode[];
  readonly groups: readonly GraphGroup[];
  readonly links: readonly GraphLink[];
}

export interface LayoutOptions {
  readonly nodeWidth?: number;
  readonly nodeHeight?: number;
  readonly padding?: number;
  readonly ringGap?: number;
  readonly clusterGap?: number;
  readonly bundleLinks?: boolean;
  readonly bundleCrossCluster?: boolean;
  readonly collapseGroups?: ReadonlySet<string>;
  readonly clusterRoleFilter?: readonly string[];
  readonly laneOrder?: readonly number[];
  readonly laneLabels?: ReadonlyMap<number, string>;
  readonly selectedNodeId?: string | null;
  readonly selectedLinkId?: string | null;
  readonly snap?: SnapFn;
  readonly maxLabelChars?: number;
}

export interface LinkBundleOptions {
  readonly bundleParallel?: boolean;
  readonly bundleCrossCluster?: boolean;
  readonly selectedLinkId?: string | null;
}

export interface LayoutSlot {
  readonly point: Point2D;
  readonly groupId?: string;
  readonly ring?: number;
  readonly slot?: number;
}

export interface PositionedNode {
  readonly node: GraphNode;
  readonly point: Point2D;
  readonly bounds: Rect2D;
  readonly displayLabel: string;
}

export interface PositionedGroup {
  readonly group: GraphGroup;
  readonly shape: "rect" | "circle";
  readonly point: Point2D;
  readonly bounds: Rect2D;
  readonly radius?: number;
  readonly collapsed: boolean;
  readonly hiddenChildCount: number;
}

export interface PositionedLink {
  readonly id: string;
  readonly sourceId: string;
  readonly targetId: string;
  readonly linkIds: readonly string[];
  readonly count: number;
  readonly category: string;
  readonly strokeColor?: string;
  readonly dashed: boolean;
  readonly pathD: string;
  readonly label: string;
  readonly labelPoint: Point2D;
  readonly bundled: boolean;
  readonly dataAttrs?: Readonly<Record<string, string>>;
}

export interface PositionedScene {
  readonly layoutId: string;
  readonly nodes: readonly PositionedNode[];
  readonly groups: readonly PositionedGroup[];
  readonly links: readonly PositionedLink[];
  readonly slots: readonly LayoutSlot[];
  readonly bounds: Rect2D;
}

export interface LayoutPlugin {
  readonly id: string;
  readonly label: string;
  readonly description: string;
  compute(graph: GraphInput, options?: LayoutOptions): PositionedScene;
}

export interface LayoutRegistry {
  register(plugin: LayoutPlugin): void;
  get(id: string): LayoutPlugin | undefined;
  list(): readonly LayoutPlugin[];
  compute(pluginId: string, graph: GraphInput, options?: LayoutOptions): PositionedScene;
}
