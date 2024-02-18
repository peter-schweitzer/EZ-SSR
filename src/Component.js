import { data, err } from '@peter-schweitzer/ez-utils';

import { render_dependency } from './utils.js';

export class Component {
  //#region fields
  /**@type {string[]}*/
  #strings;

  /**@type {SegmentItem[]}*/
  #dependencies;

  /**@type {LUT<Component>}*/
  #components_ptr;
  //#endregion

  /**
   * @param {LUT<Component>} components_ptr
   * @param {string} content
   */
  constructor(components_ptr, content) {
    this.#components_ptr = components_ptr;

    this.#strings = [];
    this.#dependencies = [];

    const matches = [];
    for (const { 0: str, index } of content.matchAll(
      /\${ ?[\w-]+(?: ?: ?(?:string|number|boolean|object|any))? ?}|<ez(?:-for)? (?:name="[\w-/]+" id="[\w-/]+"|id="[\w-/]+" name="[\w-/]+") \/>/g,
    ))
      matches.push({ str: str, start: index, end: index + str.length });

    const span = { start: 0, end: 0 };

    for (const { str: str, start, end } of matches) {
      span.start = start;
      this.#strings.push(content.slice(span.end, span.start));
      span.end = end;

      if (str[0] === '$') {
        const { groups: info } = str.slice(2, -1).match(/ ?(?<id>[\w-]+)(?: ?: ?(?<type>string|number|boolean|object|any))?/);
        //@ts-ignore ts(2322) tsserver can't comprehend RegEx, info.type is 'string', 'number', 'boolean', 'object' or 'any'
        this.#dependencies.push({ type: 'prop', info: { id: info.id, type: info.type || 'any' } });
      } else {
        this.#dependencies.push({
          type: str.startsWith('<ez ') ? 'sub' : 'subs',
          info: { id: str.match(/id="([\w-/]+)"/)[1], name: str.match(/name="([\w-/]+)"/)[1] },
        });
      }
    }

    this.#strings.push(content.slice(span.end));
  }

  /**
   * @param {LUT<any>} props
   * @returns {ErrorOr<string>}
   */
  render(props) {
    /** @type {string[]} */
    const rendered_segments = new Array(this.#strings.length + this.#dependencies.length + 1);
    rendered_segments[rendered_segments.length - 1] = '\n';

    for (let i = 0; i < this.#strings.length; i++) {
      rendered_segments[i * 2] = this.#strings[i];
    }

    for (let i = 0; i < this.#dependencies.length; i++) {
      const { err: render_err, data: rendered_dependency } = render_dependency(this.#components_ptr, this.#dependencies[i], props);
      if (render_err !== null) return err(render_err);

      rendered_segments[i * 2 + 1] = rendered_dependency;
    }

    return data(rendered_segments.join(''));
  }
}
