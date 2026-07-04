import { describe, expect, it } from "vitest";
import {
  build_type_sections,
  DEFAULT_TYPE_COLOR,
  DEFAULT_TYPE_ICON,
  DEFAULT_TYPE_ORDER,
} from "$lib/features/types/domain/type_sections";
import type {
  BackendTypeCount,
  TypeDefinition,
} from "$lib/features/types/ports";

function def(
  name: string,
  overrides: Partial<TypeDefinition> = {},
): TypeDefinition {
  return { name, path: `${name}.md`, ...overrides };
}

describe("build_type_sections", () => {
  it("collects distinct backend type names with their counts", () => {
    const backend: BackendTypeCount[] = [
      { name: "Person", count: 3 },
      { name: "Project", count: 5 },
    ];

    const sections = build_type_sections(backend, []);

    expect(sections.map((s) => [s.name, s.count])).toEqual([
      ["Person", 3],
      ["Project", 5],
    ]);
  });

  it("includes zero-note definition types not present in backend counts", () => {
    const backend: BackendTypeCount[] = [{ name: "Person", count: 2 }];
    const definitions = [def("Meeting")];

    const sections = build_type_sections(backend, definitions);

    const meeting = sections.find((s) => s.name === "Meeting");
    expect(meeting).toBeDefined();
    expect(meeting?.count).toBe(0);
  });

  it("excludes the Type definition marker itself from backend counts", () => {
    const backend: BackendTypeCount[] = [
      { name: "Type", count: 4 },
      { name: "Note", count: 1 },
    ];

    const sections = build_type_sections(backend, []);

    expect(sections.map((s) => s.name)).toEqual(["Note"]);
  });

  it("sorts by order, then name for ties", () => {
    const backend: BackendTypeCount[] = [
      { name: "Zebra", count: 1 },
      { name: "Apple", count: 1 },
      { name: "Mango", count: 1 },
    ];
    const definitions = [
      def("Zebra", { order: 1 }),
      def("Apple", { order: 5 }),
      def("Mango", { order: 5 }),
    ];

    const sections = build_type_sections(backend, definitions);

    expect(sections.map((s) => s.name)).toEqual(["Zebra", "Apple", "Mango"]);
  });

  it("filters out types whose definition marks them not visible", () => {
    const backend: BackendTypeCount[] = [
      { name: "Public", count: 1 },
      { name: "Hidden", count: 1 },
    ];
    const definitions = [def("Hidden", { visible: false })];

    const sections = build_type_sections(backend, definitions);

    expect(sections.map((s) => s.name)).toEqual(["Public"]);
  });

  it("retains hidden types when include_hidden is set", () => {
    const backend: BackendTypeCount[] = [
      { name: "Public", count: 1 },
      { name: "Hidden", count: 1 },
    ];
    const definitions = [def("Hidden", { visible: false })];

    const sections = build_type_sections(backend, definitions, {
      include_hidden: true,
    });

    expect(sections.map((s) => [s.name, s.visible])).toEqual([
      ["Hidden", false],
      ["Public", true],
    ]);
  });

  it("resolves metadata from the matching definition note", () => {
    const backend: BackendTypeCount[] = [{ name: "Person", count: 2 }];
    const definitions = [
      def("Person", {
        icon: "user",
        color: "#ff0000",
        order: 1,
        label: "People",
      }),
    ];

    const [section] = build_type_sections(backend, definitions);

    expect(section).toMatchObject({
      name: "Person",
      icon: "user",
      color: "#ff0000",
      order: 1,
      label: "People",
      count: 2,
      visible: true,
    });
  });

  it("applies built-in defaults for types without a definition", () => {
    const backend: BackendTypeCount[] = [{ name: "Person", count: 2 }];

    const [section] = build_type_sections(backend, []);

    expect(section).toMatchObject({
      icon: DEFAULT_TYPE_ICON,
      color: DEFAULT_TYPE_COLOR,
      order: DEFAULT_TYPE_ORDER,
      label: "Person",
      visible: true,
    });
  });
});
