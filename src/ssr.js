const { readFile, readdir } = require('node:fs/promises');

const { Component } = require('./component.js');
const { WRN, data, err, p2eo } = require('@peter-schweitzer/ez-utils');

class EZSSR {
  /**@type {LUT<Component>} */
  #components = {};

  /**
   * @param {string} componentDirPath relative path to the directory containing the component HTML-files (defaults to ./frontend/components)
   * @throws {string}
   */
  constructor(componentDirPath = './frontend/components') {
    p2eo(readdir(componentDirPath)).then(async ({ err: component_dir_err, data: files }) => {
      if (component_dir_err !== null) throw `error (${component_dir_err}) while reading the component directory`;

      for (const f of files) {
        if (!f.endsWith('.html')) continue;

        const { err: file_err, data: file_content } = await p2eo(readFile(`${componentDirPath}/${f}`, { encoding: 'utf8' }));
        if (file_err !== null) {
          WRN(file_err);
          continue;
        }

        Object.defineProperty(this.#components, f.slice(0, -5), { value: new Component(file_content) });
      }
    });
  }

  /**
   * @param {string} component_string
   * @returns {ErrorOr<{name: string, id: string}>}
   */
  #parse_component_string(component_string) {
    const span = { start: 0, end: 0 };

    /**@type {{name: string, id: string}} */
    const ret = { name: '', id: '' };

    for (const attr of ['name', 'id']) {
      const search_str = ` ${attr}="`;
      span.start = component_string.indexOf(search_str);

      if (span.start === -1) return err(`invalid component definition "${component_string}"\n  missing '${attr}' attribute`);
      span.start += search_str.length;

      span.end = component_string.indexOf('"', span.start);
      Object.defineProperty(ret, attr, { value: component_string.slice(span.start, span.end) });
    }

    return data(ret);
  }

  /**
   * @param {string} name
   * @param {LUT<any>} props
   * @returns {ErrorOr<string>}
   */
  #render_component(name, props) {
    if (!this.#components.hasOwnProperty(name)) return err(`component "${name}" is unknown (was not parsed on EZSSR instantiation)`);

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

      const { err: parse_error, data: parse_data } = this.#parse_component_string(nested_string);
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
   * @returns {AsyncErrorOr<string>}
   */
  async render(main, props) {
    const { err: file_err, data: raw_main_string } = await p2eo(readFile(main, 'utf8'));
    if (file_err !== null) return Promise.resolve(err(`error while reading main file (${file_err})`));

    let main_string = raw_main_string;
    for (const prop in props) main_string = main_string.replace(`\${${prop}}`, props[prop]);

    const rendered_page = [];
    const span = { start: 0, end: 0 };

    while ((span.start = main_string.indexOf('<ez', span.end)) !== -1) {
      rendered_page.push(main_string.slice(span.end, span.start - 1));

      span.end = main_string.indexOf('/>', span.start) + 2;
      const nested_string = main_string.slice(span.start, span.end);

      const { err: parse_error, data: parse_data } = this.#parse_component_string(nested_string);
      if (parse_error !== null) return Promise.resolve(err(`error while parsing component string\n  ${parse_error}`));

      if (!props.hasOwnProperty(parse_data.id)) return Promise.resolve(err(`prop "${parse_data.id}" is missing`));
      const nested_props = props[parse_data.id];

      if (nested_string.startsWith('<ez-for ')) {
        if (!Array.isArray(nested_props)) return Promise.resolve(err('ez-for components need an array of props to be rendered'));
        for (const for_props of nested_props) {
          const { err: nested_render_err, data: rendered_component } = this.#render_component(parse_data.name, for_props);
          if (nested_render_err !== null) return Promise.resolve(err(nested_render_err));
          rendered_page.push(rendered_component);
        }
      } else {
        const { err: nested_render_err, data: rendered_component } = this.#render_component(parse_data.name, nested_props);
        if (nested_render_err !== null) return Promise.resolve(err(nested_render_err));
        rendered_page.push(rendered_component);
      }
    }
    rendered_page.push(main_string.slice(span.end));

    return Promise.resolve(data(rendered_page.join('')));
  }
}

module.exports = { EZSSR };
