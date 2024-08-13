import { data, err, validate } from '@peter-schweitzer/ez-utils';
import { Lexer, TOKEN_TYPES } from './lexer.js';
import { render_prop } from './utils.js';

/**
 * @param {LUT<any>} props
 * @param {InlineArgs[]} args
 * @returns {ErrorOr<LUT<string>>}
 */
function render_inline_props(props, args) {
  /** @type {LUT<string>} */
  const rendered_inline_props = {};
  for (const { name, data: args_data } of args)
    if (name === '$*') props;
    else {
      const prop_parts = [];
      for (const { type, val } of args_data)
        if (type === 'str') prop_parts.push(val);
        else if (!Object.hasOwn(props, val)) return err(`can't render '${name}', prop '${val}' is missing`);
        else prop_parts.push(render_prop(props[val]));

      rendered_inline_props[name] = prop_parts.join('');
    }
  return data(rendered_inline_props);
}

export default class LexedComponent {
  #components_lut;
  #parts;

  /**
   * @param {LUT<LexedComponent>} components_ptr
   * @param {Lexer} lexer
   * @param {string} raw_str
   */
  constructor(components_ptr, lexer, raw_str) {
    this.#components_lut = components_ptr;
    this.#parts = lexer.lex(raw_str);
  }

  /**
   * @param {LUT<any>} ext_props
   * @param {LUT<string>} rendered_inline_props_lut
   * @returns {ErrorOr<string>}
   */
  render(ext_props, rendered_inline_props_lut = null, DBG = false) {
    const props = Object.assign({}, ext_props);
    if (rendered_inline_props_lut !== null) Object.assign(props, rendered_inline_props_lut);

    let _DBG = true;
    /** @type {string[]} */
    const rendered_parts = [];
    for (const { type: t, data: d } of this.#parts)
      switch (t) {
        case TOKEN_TYPES.LITERAL:
          DBG && rendered_parts.push(`\x1b[${_DBG ? '34' : '36'};4m`);
          _DBG = !_DBG;
          rendered_parts.push(d);
          DBG && rendered_parts.push(`\x1b[0m`);
          break;
        case TOKEN_TYPES.ATTR:
          DBG && rendered_parts.push('\x1b[35;1m');
          rendered_parts.push(`${d}="${render_prop(props[d])}"`);
          DBG && rendered_parts.push('\x1b[0m');
          break;
        case TOKEN_TYPES.ATTRS:
          DBG && rendered_parts.push('\x1b[31;1m');
          for (const prop in rendered_inline_props_lut) rendered_parts.push(` ${prop}="${props[prop]}"`);
          DBG && rendered_parts.push('\x1b[0m');
          break;
        case TOKEN_TYPES.PROP:
          {
            const { name, type } = d;
            if (validate(props, { [name]: type })) {
              DBG && rendered_parts.push('\x1b[33;1m');
              rendered_parts.push(props[name]);
              DBG && rendered_parts.push('\x1b[0m');
            } else if (!Object.hasOwn(props, name)) return err(`prop '${name}' missing in props`);
            else return err(`prop '${name}' has invalid type, expecting '${type}'`);
          }
          break;
        case TOKEN_TYPES.SUB:
          {
            const { name, id, args } = d;
            if (!Object.hasOwn(this.#components_lut, name)) return err(`unknown component '${name}'`);

            const sub_props = Object.hasOwn(props, id) ? props[id] : {};

            const { err: inline_render_error, data: rendered_inline_sub_props } = render_inline_props(props, args);
            if (inline_render_error !== null) return err('error while rendering inline props:\n  ' + inline_render_error);

            const { err: render_err, data: rendered_subcomponent } = this.#components_lut[name].render(sub_props, rendered_inline_sub_props, DBG);
            if (render_err !== null) return err(`error while rendering sub component:\n  ${render_err}`);
            DBG && rendered_parts.push('\x1b[32;1m');
            rendered_parts.push(rendered_subcomponent);
            DBG && rendered_parts.push('\x1b[0m');
          }
          break;
        case TOKEN_TYPES.SUBS:
          const { name, id, args } = d;
          if (!Object.hasOwn(this.#components_lut, name)) return err(`unknown component '${name}'`);
          if (!Object.hasOwn(props, id)) return err(`sub props missing for for-component '${id}' ('${name}')`);
          if (!Array.isArray(props[id])) return err(`sub props type should be array but isn't (id: '${id}' name: '${name}')`);

          for (let i = 0; i < props[id].length; i++) {
            const sub_props = Object.assign({}, props[id][i]);
            const { err: inline_render_error, data: rendered_inline_sub_props } = render_inline_props(props, args);
            if (inline_render_error !== null) return err('error while rendering inline props:\n  ' + inline_render_error);

            const { err: render_err, data: rendered_subcomponent } = this.#components_lut[name].render(sub_props, rendered_inline_sub_props, DBG);
            if (render_err !== null) return err(`error while rendering sub component:\n  ${render_err}`);
            DBG && rendered_parts.push('\x1b[32;1m');
            rendered_parts.push(rendered_subcomponent);
            DBG && rendered_parts.push('\x1b[0m');
          }
          break;
      }

    return data(rendered_parts.join(''));
  }
}
