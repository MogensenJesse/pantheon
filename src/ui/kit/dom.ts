// src/ui/kit/dom.ts — a tiny element helper (the UI is plain DOM, no framework)

export type Child = Node | string | number | null | undefined | false;

type Listeners = { [K in keyof HTMLElementEventMap]?: (event: HTMLElementEventMap[K]) => void };

export interface ElProps {
  class?: string;
  text?: string;
  /** `true` sets a boolean attribute; `null`, `undefined` and `false` skip it. */
  attrs?: Record<string, string | number | boolean | null | undefined>;
  on?: Listeners;
  style?: Partial<CSSStyleDeclaration>;
}

export function append(parent: Node, children: readonly Child[]): void {
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    parent.appendChild(typeof child === 'object' ? child : document.createTextNode(String(child)));
  }
}

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: ElProps | null = null,
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (props) {
    if (props.class) el.className = props.class;
    if (props.text !== undefined) el.textContent = props.text;
    if (props.attrs) {
      for (const [name, value] of Object.entries(props.attrs)) {
        if (value === null || value === undefined || value === false) continue;
        el.setAttribute(name, value === true ? '' : String(value));
      }
    }
    if (props.style) Object.assign(el.style, props.style);
    if (props.on) {
      for (const [type, listener] of Object.entries(props.on)) {
        el.addEventListener(type, listener as EventListener);
      }
    }
  }
  append(el, children);
  return el;
}
