import { readFileSync, readdirSync } from 'node:fs';

import { data, err, validate } from '@peter-schweitzer/ez-utils';

import LexedComponent from './LexedComponent.js';
import { Lexer } from './lexer.js';

/**
 * @param {any} prop
 * @returns {string}
 */
export function render_prop(prop) {
  if (typeof prop === 'object') return JSON.stringify(prop);
  else return `${prop}`;
}

/**
 * @param {LUT<any>} props
 * @param {InlineArgs[]} args
 * @returns {ErrorOr<LUT<string>>}
 */
export function render_inline_props(props, args) {
  /** @type {LUT<string>} */
  const rendered_inline_props = {};
  for (const { name, data: args_data } of args)
    if (name === '$*') for (const prop in props) rendered_inline_props[prop] = render_prop(prop);
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

/**
 * @param {string} dir_path
 * @param {LUT<LexedComponent>} component_lut
 * @param {string} [prefix='']
 */
export function add_lexed_components(component_lut, dir_path, prefix = '') {
  const lexer = new Lexer();
  for (const f of readdirSync(dir_path, { encoding: 'utf8', withFileTypes: true }))
    if (f.isDirectory()) add_lexed_components(component_lut, `${dir_path}/${f.name}`, `${prefix}${f.name}/`);
    else if (f.name.endsWith('.html')) component_lut[prefix + f.name.slice(0, -5)] = new LexedComponent(component_lut, lexer, readFileSync(`${dir_path}/${f.name}`, 'utf8'));
}
