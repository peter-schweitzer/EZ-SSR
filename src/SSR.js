import { err } from '@peter-schweitzer/ez-utils';

import LexedComponent from './LexedComponent.js';
import { add_lexed_components } from './utils.js';

export class SSR {
  /**@type {LUT<LexedComponent>} */
  #components = {};
  /** @type {string} */
  #component_pth;

  /** @param {string?} [componentDirPath="./components"] relative path to the directory containing the component HTML-files (won't parse components when set to null) */
  constructor(componentDirPath = null) {
    if (componentDirPath === null) componentDirPath = './components';
    this.#component_pth = componentDirPath;

    add_lexed_components(this.#components, componentDirPath);
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

  reloadComponents() {
    this.#components = {};
    add_lexed_components(this.#components, this.#component_pth);
  }
}
