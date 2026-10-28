// src/dev/bindConfig.ts — DEV sections that edit a config object in place (VISUAL.life, VISUAL.hand, VILLAGE.HAND ...)
//
// The sim and the renderer hold a reference to the config object and read it where they use it, so writing a number
// into the object is the edit. The shipped value at panel start is the reset value; nothing is saved.
import {
  bindColor,
  bindSpecs,
  mountSection,
  type RangeSpec,
  rangeRowHtml,
  subsectionHtml,
  syncColor,
  syncSpecs,
} from './bindRange';

/** A slider for the number at `path` in a config object: path, label, min, max, step, digits shown. */
export type ConfigRow = readonly [
  path: string,
  label: string,
  min: number,
  max: number,
  step: number,
  digits?: number,
];

/** A colour picker for the hex string at `path`. */
export type ConfigColorRow = readonly [path: string, label: string];

export interface ConfigGroup {
  title: string;
  hint?: string;
  open?: boolean;
  /** The object the paths start from (the section's `root` when omitted). */
  root?: object;
  rows?: readonly ConfigRow[];
  colors?: readonly ConfigColorRow[];
}

interface ConfigSpec extends RangeSpec {
  root: object;
  path: string;
}

interface ConfigColor {
  id: string;
  label: string;
  root: object;
  path: string;
  defaultValue: string;
}

type Bag = Record<string, unknown>;

function locate(root: object, path: string): { parent: Bag; key: string } {
  const keys = path.split('.');
  const key = keys.pop() as string;
  let parent = root as Bag;
  for (const k of keys) parent = parent[k] as Bag;
  return { parent, key };
}

const read = (root: object, path: string): unknown => {
  const { parent, key } = locate(root, path);
  return parent[key];
};

const write = (root: object, path: string, value: unknown): void => {
  const { parent, key } = locate(root, path);
  parent[key] = value;
};

const slug = (path: string) => path.replace(/[^A-Za-z0-9]+/g, '-').toLowerCase();

function configSpecs(prefix: string, root: object, rows: readonly ConfigRow[]): ConfigSpec[] {
  return rows.map(([path, label, min, max, step, digits = 2]) => {
    const value = read(root, path);
    if (typeof value !== 'number') throw new Error(`[dev] ${prefix}: ${path} is not a number`);
    if (value < min || value > max) {
      console.warn(`[dev] ${prefix}: ${path} = ${value} is outside its slider ${min}..${max}`);
    }
    return {
      id: `${prefix}-${slug(path)}`,
      label,
      min,
      max,
      step,
      defaultValue: value,
      format: (v) => v.toFixed(digits),
      root,
      path,
    };
  });
}

function configColors(
  prefix: string,
  root: object,
  rows: readonly ConfigColorRow[],
): ConfigColor[] {
  return rows.map(([path, label]) => {
    const value = read(root, path);
    if (typeof value !== 'string') throw new Error(`[dev] ${prefix}: ${path} is not a colour`);
    return { id: `${prefix}-${slug(path)}`, label, root, path, defaultValue: value };
  });
}

const colorRowHtml = (c: ConfigColor) =>
  `<label class="dev-row"><span>${c.label}</span><input type="color" id="${c.id}" value="${c.defaultValue}" /></label>`;

export interface ConfigGroups {
  /** The markup of the groups (subsections of sliders and colour pickers). */
  html: string;
  /** Binds the controls to the config objects; returns the disposer. */
  bind: (panel: HTMLDivElement) => () => void;
  /** Writes the shipped values back and moves the controls to them. */
  reset: (panel: HTMLDivElement) => void;
}

/** Builds the controls for groups of config numbers and colours; the caller mounts `html` and calls `bind`. */
export function buildConfigGroups(
  idPrefix: string,
  root: object,
  groups: readonly ConfigGroup[],
): ConfigGroups {
  const built = groups.map((g, i) => {
    const prefix = `${idPrefix}-${i}`;
    const groupRoot = g.root ?? root;
    return {
      group: g,
      specs: configSpecs(prefix, groupRoot, g.rows ?? []),
      colors: configColors(`${prefix}c`, groupRoot, g.colors ?? []),
    };
  });
  return {
    html: built
      .map(({ group, specs, colors }) =>
        subsectionHtml(
          group.title,
          `${group.hint ? `<p class="dev-hint">${group.hint}</p>` : ''}${colors.map(colorRowHtml).join('')}${specs.map(rangeRowHtml).join('')}`,
          group.open,
        ),
      )
      .join(''),
    bind: (panel) => {
      const disposers: Array<() => void> = [];
      for (const { specs, colors } of built) {
        disposers.push(...bindSpecs(panel, specs, (s, v) => write(s.root, s.path, v)));
        for (const c of colors) {
          disposers.push(bindColor(panel, c.id, (hex) => write(c.root, c.path, hex)));
        }
      }
      return () => {
        for (const fn of disposers) fn();
      };
    },
    reset: (panel) => {
      for (const { specs, colors } of built) {
        for (const s of specs) write(s.root, s.path, s.defaultValue);
        for (const c of colors) {
          write(c.root, c.path, c.defaultValue);
          syncColor(panel, c.id, c.defaultValue);
        }
        syncSpecs(panel, specs, (s) => s.defaultValue);
      }
    },
  };
}

export interface ConfigSection {
  hostId: string;
  title: string;
  hint: string;
  /** Prefix of the element ids (unique per section). */
  idPrefix: string;
  root: object;
  groups: readonly ConfigGroup[];
  /** Markup after the groups (buttons ...), and what binds it; the binder returns its disposer. */
  extraHtml?: string;
  bindExtra?: (body: HTMLElement) => () => void;
}

/** Mounts a section of config groups with a reset button. */
export function mountConfigSection(panel: HTMLDivElement, section: ConfigSection): () => void {
  const { idPrefix } = section;
  const groups = buildConfigGroups(idPrefix, section.root, section.groups);
  const body = mountSection(panel, {
    hostId: section.hostId,
    title: section.title,
    open: false,
    body: `
      <p class="dev-hint">${section.hint}</p>
      ${groups.html}
      ${section.extraHtml ?? ''}
      <div class="dev-actions">
        <button type="button" id="${idPrefix}-reset">Reset ${section.title}</button>
      </div>
    `,
  });
  if (!body) return () => {};

  const unbind = groups.bind(panel);
  const unbindExtra = section.bindExtra?.(body);
  const resetBtn = panel.querySelector(`#${idPrefix}-reset`) as HTMLButtonElement | null;
  const onReset = () => groups.reset(panel);
  resetBtn?.addEventListener('click', onReset);

  return () => {
    unbind();
    unbindExtra?.();
    resetBtn?.removeEventListener('click', onReset);
  };
}
