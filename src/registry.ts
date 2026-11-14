/**
 * Isolated layout plugin registry with fail-loud unknown plugin handling.
 */

import { assertValidGraphInput, assertValidLayoutOptions, deepFreeze } from "./geometry.js";
import type {
  GraphInput,
  LayoutOptions,
  LayoutPlugin,
  LayoutRegistry,
  PositionedScene,
} from "./types.js";

function assertValidPlugin(plugin: LayoutPlugin): void {
  if (typeof plugin !== "object" || plugin === null || Array.isArray(plugin)) {
    throw new TypeError("layout plugin must be a non-null object");
  }
  if (typeof plugin.id !== "string" || plugin.id.length === 0) {
    throw new TypeError("layout plugin must have a non-empty string id");
  }
  if (typeof plugin.label !== "string" || typeof plugin.description !== "string") {
    throw new TypeError(`layout plugin "${plugin.id}" must have string label and description`);
  }
  if (typeof plugin.compute !== "function") {
    throw new TypeError(`layout plugin "${plugin.id}" must provide a compute function`);
  }
}

function clonePlugin(plugin: LayoutPlugin): LayoutPlugin {
  return {
    id: plugin.id,
    label: plugin.label,
    description: plugin.description,
    compute: (graph, options) => plugin.compute(graph, options),
  };
}

/**
 * Creates an isolated registry of graph layout plugins.
 */
export function createLayoutRegistry(initialPlugins: readonly LayoutPlugin[] = []): LayoutRegistry {
  if (!Array.isArray(initialPlugins)) {
    throw new TypeError("createLayoutRegistry initialPlugins must be an array");
  }
  const plugins = new Map<string, LayoutPlugin>();
  for (const plugin of initialPlugins) {
    assertValidPlugin(plugin);
    plugins.set(plugin.id, clonePlugin(plugin));
  }

  return {
    register(plugin: LayoutPlugin): void {
      assertValidPlugin(plugin);
      plugins.set(plugin.id, clonePlugin(plugin));
    },
    get(id: string): LayoutPlugin | undefined {
      if (typeof id !== "string") {
        throw new TypeError("registry.get plugin id must be a string");
      }
      return plugins.get(id);
    },
    list(): readonly LayoutPlugin[] {
      return deepFreeze(Array.from(plugins.values(), clonePlugin));
    },
    compute(pluginId: string, graph: GraphInput, options?: LayoutOptions): PositionedScene {
      if (typeof pluginId !== "string" || pluginId.length === 0) {
        throw new TypeError("registry.compute pluginId must be a non-empty string");
      }
      assertValidGraphInput(graph);
      assertValidLayoutOptions(options);
      const plugin = plugins.get(pluginId);
      if (plugin === undefined) {
        const available = Array.from(plugins.keys()).sort().join(", ");
        throw new Error(
          `Unknown layout plugin "${pluginId}" (available: ${available.length > 0 ? available : "none"})`,
        );
      }
      return deepFreeze(plugin.compute(graph, options));
    },
  };
}
