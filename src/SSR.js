import { readFileSync } from 'node:fs';

import { data, err } from '@peter-schweitzer/ez-utils';

import { Component } from './Component.js';
import { add_components } from './utils.js';

export class SSR {
  /**@type {LUT<Component>} */
  #components = {};

  /**
   * @param {string?} [componentDirPath="./components"] relative path to the directory containing the component HTML-files (won't parse components when set to null)
   * @throws
   */
  constructor(componentDirPath = './components') {
    if (componentDirPath !== null) add_components(this.#components, componentDirPath);
  }

  /**
   * @param {string} [name=null]
   * @param {LUT<any>} [props={}]
   * @returns {ErrorOr<string>}
   */
  renderComponent(name = null, props = {}) {
    if (name === null) return err('no component name given');
    else if (!Object.hasOwn(this.#components, name)) return err(`component "${name}" is unknown (was not parsed on instantiation)`);
    else return this.#components[name].render(props);
  }

  /**
   * @param {string} [filePath=null] relative path to the main HTML-file of the site that should be rendered
   * @param {LUT<any>} [props={}] Object with all the needed props to render the site
   * @returns {ErrorOr<string>}
   */
  renderFile(filePath = null, props = {}) {
    if (filePath === null) return err('no file path given');

    /**@type {string}*/
    let file_content;
    try {
      file_content = readFileSync(filePath, { encoding: 'utf8' });
    } catch (e) {
      return err(`error while reading file '${filePath}' (${typeof e === 'string' ? e : JSON.stringify(e)})`);
    }

    for (const prop in props) file_content = file_content.replace(new RegExp(`\\\${ ?${prop}(?: ?: ?(?:string|number|boolean|object|any))? ?}`, 'g'), props[prop]);

    const rendered_page = [];
    const span = { start: 0, end: 0 };

    while ((span.start = file_content.indexOf('<ez', span.end)) !== -1) {
      if (span.end < span.start - 1) rendered_page.push(file_content.slice(span.end, span.start));

      span.end = file_content.indexOf('/>', span.start) + 2;
      const nested_string = file_content.slice(span.start, span.end);

      const name = nested_string.match(/ name="(?<name>[\w_]+)"/).groups.name;
      if (name === undefined) return err("invalid component, missing 'name' attribute");

      const id = nested_string.match(/ id="(?<id>[\w_]+)"/).groups.id;
      if (id === undefined) return err("invalid component, missing 'id' attribute");

      if (!Object.hasOwn(props, id)) return err(`prop "${id}" is missing`);
      const nested_props = props[id];

      if (nested_string.startsWith('<ez-for ')) {
        if (!Array.isArray(nested_props)) return err('ez-for components need an array of props to be rendered');
        for (const [i, for_props] of nested_props.entries()) {
          if (!Object.hasOwn(for_props, 'i')) for_props.i = i;
          const { err: nested_render_err, data: rendered_component } = this.renderComponent(name, for_props);
          if (nested_render_err !== null) return err(nested_render_err);
          rendered_page.push(rendered_component);
        }
      } else {
        const { err: nested_render_err, data: rendered_component } = this.renderComponent(name, nested_props);
        if (nested_render_err !== null) return err(nested_render_err);
        rendered_page.push(rendered_component);
      }
    }
    rendered_page.push(file_content.slice(span.end));

    return data(rendered_page.join(''));
  }
}
