import { readFileSync, readdirSync } from 'node:fs';

import { data, err, validate } from '@peter-schweitzer/ez-utils';

import { Component } from './Component.js';

/**
 * @param {LUT<Component>} components_ref
 * @param {SegmentItem} dep
 * @param {LUT<any>} props
 * @returns {ErrorOr<string>}
 */
export function render_dependency(components_ref, { type, info }, props) {
  if (!Object.hasOwn(props, info.id)) return err(`missing prop '${info.id}'`);
  const sub_props = props[info.id];

  //#region render prop
  if (type === 'prop')
    if (!validate(props, { [info.id]: info.type })) return err(`invalid type of prop '${info.id}', should be '${info.type}'`);
    else if (info.type === 'object' || typeof sub_props === 'object') return data(JSON.stringify(sub_props));
    else return data(`${sub_props}`);
  //#endregion

  //#region sub / subs
  const { name, id } = info;

  if (!Object.hasOwn(components_ref, name)) return err(`unknown component '${name}'`);
  const sub_component = components_ref[name];

  //#region sub
  if (type === 'sub') {
    const { err: render_err, data: rendered_sub_component } = sub_component.render(sub_props);
    if (render_err !== null) return err(`encountered error while rendering sub component '${name}' with id '${id}'\n  ${render_err}`);
    else return data(rendered_sub_component);
  }
  //#endregion

  //#region subs
  if (!Array.isArray(sub_props)) return err(`invalid type of prop '${id}', should be an array`);

  /** @type {string[]} */
  const rendered_sub_components = new Array(sub_props.length);
  for (let i = 0; i < sub_props.length; i++) {
    const sub_prop = sub_props[i];
    sub_prop.i ??= i;
    const { err: render_err, data: rendered_sub_component } = sub_component.render(sub_prop);
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
