import { readFile, readdir } from 'node:fs/promises';

import { WRN, data, err, p2eo } from '@peter-schweitzer/ez-utils';

import { readFileSync } from 'node:fs';
import { Component } from './Component.js';
import { parse_component_string } from './utils.js';

export class SSR {
  /**@type {LUT<Component>} */
  #components = {};

  /**
   * @param {string} [componentDirPath="./frontend/components"] relative path to the directory containing the component HTML-files
   * @throws {string}
   */
  constructor(componentDirPath = './frontend/components') {
    p2eo(readdir(componentDirPath)).then(async ({ err: component_dir_err, data: files }) => {
      if (component_dir_err !== null) throw `error (${component_dir_err}) while reading the component directory`;

      for (const f of files) {
        if (!f.endsWith('.html')) continue;

        const { err: file_err, data: file_content } = await p2eo(readFile(`${componentDirPath}/${f}`, { encoding: 'utf8' }));
        if (file_err !== null) WRN(file_err);
        else this.#components[f.slice(0, -5)] = new Component(file_content);
      }
    });
  }

  /**
   * @param {string} name
   * @param {LUT<any>} props
   * @returns {ErrorOr<string>}
   */
  #render_component(name, props) {
    if (!Object.hasOwn(this.#components, name)) return err(`component "${name}" is unknown (was not parsed on EZSSR instantiation)`);

    let content = this.#components[name].content;

    for (const prop in props) {
      content = content.replace(`\${${prop}}`, props[prop]);
    }

    const span = { start: 0, end: 0 };
    const rendered_fragments = [];

    while ((span.start = content.indexOf('<ez', span.end)) !== -1) {
      rendered_fragments.push(content.slice(span.end, span.start));

      span.end = content.indexOf('/>', span.start) + 2;
      const nested_string = content.slice(span.start, span.end);

      const { err: parse_error, data: parse_data } = parse_component_string(nested_string);
      if (parse_error !== null) return err(`error while parsing component string\n  ${parse_error}`);

      const nested_props = nested_string.startsWith('<ez-for ') ? props[parse_data.id] : [props[parse_data.id]];

      for (const for_props of nested_props) {
        const { err: nested_render_err, data: rendered_component } = this.#render_component(parse_data.name, for_props);
        if (nested_render_err !== null) return err(nested_render_err);

        rendered_fragments.push(rendered_component);
      }
    }
    rendered_fragments.push(content.slice(span.end));

    return data(rendered_fragments.join(''));
  }

  /**
   * @param {string} main relative path to the main HTML-file of the site that should be rendered
   * @param {LUT<any>} props Object with all the needed props to render the site
   * @returns {ErrorOr<string>}
   */
  render(main, props) {
    let main_string;
    try {
      main_string = readFileSync(main, { encoding: 'utf8' });
    } catch (e) {
      return err(`error while reading main file (${typeof e === 'string' ? e : JSON.stringify(e)})`);
    }

    for (const prop in props) main_string = main_string.replace(`\${${prop}}`, props[prop]);

    const rendered_page = [];
    const span = { start: 0, end: 0 };

    while ((span.start = main_string.indexOf('<ez', span.end)) !== -1) {
      if (span.end === span.start - 1) rendered_page.push(main_string.slice(span.end, span.start));

      span.end = main_string.indexOf('/>', span.start) + 2;
      const nested_string = main_string.slice(span.start, span.end);

      const { err: parse_error, data: parse_data } = parse_component_string(nested_string);
      if (parse_error !== null) return err(`error while parsing component string\n  ${parse_error}`);

      if (!Object.hasOwn(props, parse_data.id)) return err(`prop "${parse_data.id}" is missing`);
      const nested_props = props[parse_data.id];

      if (nested_string.startsWith('<ez-for ')) {
        if (!Array.isArray(nested_props)) return err('ez-for components need an array of props to be rendered');
        for (const [i, for_props] of nested_props.entries()) {
          if (!Object.hasOwn(for_props, 'i')) Object.defineProperty(for_props, 'i', { value: i });
          const { err: nested_render_err, data: rendered_component } = this.#render_component(parse_data.name, for_props);
          if (nested_render_err !== null) return err(nested_render_err);
          rendered_page.push(rendered_component);
        }
      } else {
        const { err: nested_render_err, data: rendered_component } = this.#render_component(parse_data.name, nested_props);
        if (nested_render_err !== null) return err(nested_render_err);
        rendered_page.push(rendered_component);
      }
    }
    rendered_page.push(main_string.slice(span.end));

    return data(rendered_page.join(''));
  }
}
