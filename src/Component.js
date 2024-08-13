import { data, err } from '@peter-schweitzer/ez-utils';

import { InlineProp } from './InlineProp.js';
import { render_dependency } from './utils.js';

export class Component {
  //#region fields
  /**@type {LUT<Component>}*/
  #components_ptr;

  /**@type {string[]}*/
  #strings;
  /**@type {SegmentItem[]}*/
  #dependencies;
  //#endregion

  /**
   * @param {LUT<Component>} components_ptr
   * @param {string} content
   */
  constructor(components_ptr, content) {
    this.#components_ptr = components_ptr;

    this.#strings = [];
    this.#dependencies = [];

    const span = { start: 0, end: 0 };
    for (const { 0: str, index: start } of content.matchAll(
      /\${ ?[\w][\w-]*(?: ?: ?(?:string|number|boolean|object|any))? ?}| \$(?:[\w][\w-]+|\*)|<ez(?:-for)? (?:name="[\w/-]+" id="[\w/-]+"|id="[\w/-]+" name="[\w/-]+")(?: +[\w][\w/-]*="(?:[^"]|\\")+")* \/>/g,
    )) {
      span.start = start;
      this.#strings.push(content.slice(span.end, span.start));
      span.end = start + str.length;

      if (str.startsWith('${')) {
        /** @type {{groups: {id: string, t?: PropTypeStr}}} */
        //@ts-ignore ts(2322) tsserver can't comprehend RegEx
        const {
          groups: { id, t },
        } = str.slice(2, -1).match(/ ?(?<id>[\w/-]+)(?: ?: ?(?<t>string|number|boolean|object|any))?/);
        this.#dependencies.push({ type: 'prop', info: { id, type: t ?? 'any' } });
      } else if (str.startsWith(' $'))
        if (str === ' $*') this.#dependencies.push({ type: 'attrs', info: { id: null } });
        else this.#dependencies.push({ type: 'attr', info: { id: str.slice(2) } });
      else {
        const name = str.match(/name="([\w/-]+)"/)[1];
        const id = str.match(/id="([\w/-]+)"/)[1];

        /** @type {LUT<InlineProp>} */
        const inline_props = {};

        for (const {
          groups: { n, v },
        } of str.slice(14 + name.length + id.length).matchAll(/ (?<n>[\w/-]+)="(?<v>(?:[^\\"]|\\.)+)"/g))
          inline_props[n] = new InlineProp(v.replaceAll('\\"', '"'));

        this.#dependencies.push({
          type: str[3] === '-' ? 'subs' : 'sub',
          info: { name, id, inline_props },
        });
      }
    }

    this.#strings.push(content.slice(span.end));
  }

  /**
   * @param {LUT<any>} props
   * @param {LUT<string>} rendered_inline_props_lut
   * @returns {ErrorOr<string>}
   */
  render(props, rendered_inline_props_lut = null) {
    /** @type {string[]} */
    const rendered_segments = new Array(this.#strings.length + this.#dependencies.length);

    for (let i = 0; i < this.#strings.length; i++) {
      rendered_segments[i * 2] = this.#strings[i];
    }

    for (let i = 0; i < this.#dependencies.length; i++) {
      const { err: render_err, data: rendered_dependency } = render_dependency(this.#components_ptr, this.#dependencies[i], props, rendered_inline_props_lut);
      if (render_err !== null) return err(render_err);

      rendered_segments[i * 2 + 1] = rendered_dependency;
    }

    return data(rendered_segments.join(''));
  }
}
