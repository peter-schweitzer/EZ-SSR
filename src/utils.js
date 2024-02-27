import { readFileSync, readdirSync } from 'node:fs';

import { data, err, validate } from '@peter-schweitzer/ez-utils';

import { Component } from './Component.js';

function render_prop(prop) {
  if (typeof prop === 'object') return JSON.stringify(prop);
  else return `${prop}`;
}

/**
 * @param {LUT<Component>} components_ref
 * @param {SegmentItem} dep
 * @param {LUT<any>} props
 * @returns {ErrorOr<string>}
 */
export function render_dependency(components_ref, { type, info }, props) {
  const { id } = info;

  //#region render prop
  if (type === 'prop')
    if (!Object.hasOwn(props, id)) return err(`missing prop '${id}'`);
    else if (!validate(props, { [id]: info.type })) return err(`invalid type of prop '${id}', should be '${info.type}'`);
    else return data(render_prop(props[id]));
  //#endregion

  //#region render attr
  if (type === 'attr') {
    if (!Object.hasOwn(props, id)) return err(`missing prop '${id}'`);
    else return data(` ${id}="${render_prop(props[id])}"`);
  }
  //#endregion

  //#region sub / subs
  const { name, inline_props } = info;

  if (!Object.hasOwn(components_ref, name)) return err(`unknown component '${name}'`);
  const sub_component = components_ref[name];

  const sub_props = Object.hasOwn(props, id) ? props[id] : {};
  const rendered_inline_props = {};

  //#region sub
  if (type === 'sub') {
    for (const prop in inline_props) {
      const { err: inline_render_err, data: rendered_inline_prop } = inline_props[prop].render(sub_props);
      if (inline_render_err !== null) return err(`error while rendering inline prop '${prop}' for component '${name}' (id: ${id})\n  > ${inline_render_err}`);

      rendered_inline_props[prop] = rendered_inline_prop;
    }

    const { err: render_err, data: rendered_sub_component } = sub_component.render(Object.assign(rendered_inline_props, sub_props));
    if (render_err !== null) return err(`encountered error while rendering sub component '${name}' with id '${id}'\n  > ${render_err}`);

    return data(rendered_sub_component);
  }
  //#endregion

  //#region subs
  if (!Array.isArray(sub_props)) return err(`invalid type of prop '${id}', should be an array`);

  /** @type {string[]} */
  const rendered_sub_components = new Array(sub_props.length);
  for (let i = 0; i < sub_props.length; i++) {
    /** @type {LUT<any>} */
    const arr_sub_props = sub_props[i];
    if (!Object.hasOwn(arr_sub_props, 'i')) arr_sub_props.i = i;

    for (const prop in inline_props) {
      const { err: inline_render_err, data: rendered_inline_prop } = inline_props[prop].render(arr_sub_props);
      if (inline_render_err !== null) return err(`error while rendering inline prop '${prop}' for component '${name}' (id: ${id})\n  > ${inline_render_err}`);

      rendered_inline_props[prop] = rendered_inline_prop;
    }

    const { err: render_err, data: rendered_sub_component } = sub_component.render(Object.assign(rendered_inline_props, arr_sub_props));
    if (render_err !== null) return err(`encountered error while rendering sub component '${name}' with id '${id}'\n  ${render_err}`);

    rendered_sub_components[i] = rendered_sub_component;
  }

  return data(rendered_sub_components.join('\n'));
  //#endregion
  //#endregion
}

/**
 * @param {string} dir_path
 * @param {LUT<Component>} component_lut
 * @param {string} prefix
 * @returns {void}
 */
export function add_components(component_lut, dir_path, prefix = '') {
  for (const f of readdirSync(dir_path, { encoding: 'utf8', withFileTypes: true }))
    if (f.isDirectory()) add_components(component_lut, `${dir_path}/${f.name}`, `${prefix}${f.name}/`);
    else if (f.name.endsWith('.html')) component_lut[prefix + f.name.slice(0, -5)] = new Component(component_lut, readFileSync(`${dir_path}/${f.name}`, 'utf8'));
}
