import { readFileSync, readdirSync } from 'node:fs';

import { data, err, validate } from '@peter-schweitzer/ez-utils';

import { Component } from './Component.js';
import LexedComponent from './LexedComponent.js';
import { Lexer } from './lexer.js';

export function render_prop(prop) {
  if (typeof prop === 'object') return JSON.stringify(prop);
  else return `${prop}`;
}

/**
 * @param {LUT<Component>} components_ref
 * @param {SegmentItem} dep
 * @param {LUT<any>} ext_props
 * @param {LUT<string>} [inline_props_lut=null]
 * @returns {ErrorOr<string>}
 */
export function render_dependency(components_ref, { type, info }, ext_props, inline_props_lut = null) {
  const { id } = info;

  const props = Object.assign({}, ext_props);
  if (inline_props_lut !== null) Object.assign(props, inline_props_lut);

  //#region render prop
  if (type === 'prop')
    if (!Object.hasOwn(props, id)) return err(`missing prop '${id}'`);
    else if (!validate(props, { [id]: info.type })) return err(`invalid type of prop '${id}', should be '${info.type}'`);
    else return data(render_prop(props[id]));
  //#endregion

  //#region attr / attrs
  //#region render attr
  if (type === 'attr') {
    if (!Object.hasOwn(props, id)) return err(`missing prop '${id}'`);
    else return data(` ${id}="${render_prop(props[id])}"`);
  }
  //#endregion

  //#region render attrs
  if (type === 'attrs') {
    if (inline_props_lut === null) return data('');
    return data(Object.keys(inline_props_lut).reduce((s, p) => (s += ` ${p}="${render_prop(inline_props_lut[p])}"`), ''));
  }
  //#endregion
  //#endregion

  //#region sub / subs
  const { name, inline_props } = info;

  if (!Object.hasOwn(components_ref, name)) return err(`unknown component '${name}'`);
  const sub_component = components_ref[name];

  /** @type {LUT<any>} */
  const sub_props = Object.hasOwn(props, id) ? props[id] : {};
  /** @type {LUT<string>} */
  const rendered_inline_props = {};

  //#region render sub
  if (type === 'sub') {
    for (const prop in inline_props) {
      const { err: inline_render_err, data: rendered_inline_prop } = inline_props[prop].render(props);
      if (inline_render_err !== null) return err(`error while rendering inline prop '${prop}' for component '${name}' (id: ${id})\n  > ${inline_render_err}`);

      rendered_inline_props[prop] = rendered_inline_prop;
    }

    const { err: render_err, data: rendered_sub_component } = sub_component.render(sub_props, rendered_inline_props);
    if (render_err !== null) return err(`encountered error while rendering sub component '${name}' with id '${id}'\n  > ${render_err}`);

    return data(rendered_sub_component);
  }
  //#endregion

  //#region render subs
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

    const { err: render_err, data: rendered_sub_component } = sub_component.render(arr_sub_props, rendered_inline_props);
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
 * @param {string} [prefix='']
 */
export function add_components(component_lut, dir_path, prefix = '') {
  for (const f of readdirSync(dir_path, { encoding: 'utf8', withFileTypes: true }))
    if (f.isDirectory()) add_components(component_lut, `${dir_path}/${f.name}`, `${prefix}${f.name}/`);
    else if (f.name.endsWith('.html')) component_lut[prefix + f.name.slice(0, -5)] = new Component(component_lut, readFileSync(`${dir_path}/${f.name}`, 'utf8'));
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
