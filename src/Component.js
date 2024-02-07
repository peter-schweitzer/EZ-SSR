import { data, err, validate } from '@peter-schweitzer/ez-utils';

export class Component {
  //#region fields
  /**@type {string[]}*/
  #strings;

  /**@type {SegmentItem[]}*/
  #dependencies;

  /**@type {LUT<Component>}*/
  #components_ref;
  //#endregion

  /** @param {string} content */
  constructor(components_ref, content) {
    this.#components_ref = components_ref;

    this.#strings = [];
    this.#dependencies = [];

    const matches = [];
    for (const { 0: raw_str, index } of content.matchAll(
      /\${ ?[\w-]+(?: ?: ?(?:string|number|boolean|object|any))? ?}|<ez(?:-for)? (?:name="[\w-]+" id="[\w-]+"|id="[\w-]+" name="[\w-]+") \/>/g,
    ))
      matches.push({ raw_str, start: index, end: index + raw_str.length });

    const span = { start: 0, end: 0 };

    for (const { raw_str, start, end } of matches) {
      span.start = start;
      this.#strings.push(content.slice(span.end, span.start));
      span.end = end;

      if (raw_str[0] === '$') {
        const { groups: info } = raw_str.slice(2, -1).match(/ ?(?<id>[\w-]+)(?: ?: ?(?<type>string|number|boolean|object|any))?/);

        //@ts-ignore ts(2322) tsserver can't comprehend RegEx, type is 'string', 'number', 'boolean', 'object' or 'any'
        this.#dependencies.push({ type: 'prop', info });
      } else {
        const {
          groups: { multi, attrs },
        } = raw_str.slice(3, -3).match(/(?<multi>-for)? (?<attrs>name="[\w-]+" id="[\w-]+"|id="[\w-]+" name="[\w-]+")/);

        this.#dependencies.push({
          type: multi === undefined ? 'sub' : 'subs',
          info: { id: attrs.match(/id="(?<id>[\w-]+)"/).groups.id, name: attrs.match(/name="(?<name>[\w-]+)"/).groups.name },
        });
      }
    }

    this.#strings.push(content.slice(span.end));
  }

  /**
   * @param {SegmentItem} dep
   * @param {LUT<any>} props
   * @returns {ErrorOr<string>}
   */
  #render_dependency({ type, info }, props) {
    if (!Object.hasOwn(props, info.id)) return err(`missing prop '${info.id}'`);
    const sub_prop = props[info.id];

    //#region render prop
    if (type === 'prop')
      if (!validate(props, { [info.id]: info.type })) return err(`invalid type of prop '${info.id}', should be '${info.type}'`);
      else return data(sub_prop);
    //#endregion

    //#region sub / subs
    const { name, id } = info;

    if (Object.hasOwn(this.#components_ref, name)) return err(`unknown component '${name}'`);
    const sub_component = this.#components_ref[name];

    //#region sub
    if (type === 'sub') {
      const { err: render_err, data: rendered_sub_component } = sub_component.render(sub_prop);
      if (render_err !== null) return err(`encountered error while rendering sub component '${name}' with id '${id}'\n  ${render_err}`);

      return data(rendered_sub_component);
    }
    //#endregion

    //#region subs
    if (!Array.isArray(sub_prop)) return err(`invalid type of prop '${id}', should be an array`);

    const rendered_sub_components = new Array(sub_prop.length);
    for (let i = 0; i < sub_prop.length; i++) {
      const { err: render_err, data: rendered_sub_component } = sub_component.render(sub_prop[i]);
      if (render_err !== null) return err(`encountered error while rendering sub component '${name}' with id '${id}'\n  ${render_err}`);

      rendered_sub_components[i] = rendered_sub_component;
    }

    return data(rendered_sub_components.join('\n'));
    //#endregion
    //#endregion
  }

  /**
   * @param {LUT<any>} props
   * @returns {ErrorOr<string>}
   */
  render(props) {
    const rendered_segments = new Array(this.#strings.length + this.#dependencies.length);

    for (let i = 0; i < this.#strings.length; i++) {
      rendered_segments[i * 2] = this.#strings[i];
    }

    for (let i = 0; i < this.#dependencies.length; i++) {
      const { err: render_err, data: rendered_dependency } = this.#render_dependency(this.#dependencies[i], props);
      if (render_err !== null) return err(render_err);

      rendered_segments[i * 2 + 1] = rendered_dependency;
    }

    return data(rendered_segments.join(''));
  }
}
