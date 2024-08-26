import { err } from '@peter-schweitzer/ez-utils';

import { Component } from './Component.js';
import LexedComponent from './LexedComponent.js';
import { add_components, add_lexed_components } from './utils.js';

export class SSR {
  /**@type {LUT<Component>|LUT<LexedComponent>} */
  #components = {};
  /** @type {string} */
  #component_pth;
  /** @type {boolean} */
  #use_lexer;

  /** @param {string?} [componentDirPath="./components"] relative path to the directory containing the component HTML-files (won't parse components when set to null) */
  constructor(componentDirPath = null, use_lexer = false) {
    if (componentDirPath === null) componentDirPath = './components';

    this.#component_pth = componentDirPath;
    this.#use_lexer = use_lexer;

    // @ts-ignore ts(2345)
    if (use_lexer) add_lexed_components(this.#components, componentDirPath);
    // @ts-ignore ts(2345)
    else add_components(this.#components, componentDirPath);
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
    // @ts-ignore ts(2345)
    if (this.#use_lexer) add_lexed_components(this.#components, this.#component_pth);
    // @ts-ignore ts(2345)
    else add_components(this.#components, this.#component_pth);
  }
}
