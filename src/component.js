'use strict';
import './types.js';
import { WRN } from './utils.js';

export class Component {
  //#region fields
  /**@type {{name: string, id: string, is_ez_for: boolean}[]} */
  #dependencies;
  get dependencies() {
    return this.#dependencies;
  }

  /**@type {LUT<string>} */
  #props;
  get props() {
    return this.#props;
  }

  /**@type {string} */
  #content;
  get content() {
    return this.#content;
  }
  //#endregion

  /** @param {string} content */
  constructor(content) {
    this.#props = {};
    this.#dependencies = [];

    this.#content = content;
    for (const prop_fragments of this.#content.matchAll(/\${(\w+)( *: *(boolean|number|string|object|any))?}/g)) {
      Object.defineProperty(this.#props, prop_fragments[1], { value: prop_fragments[3] || 'any' });
      this.#content = this.#content.replace(prop_fragments[0], `\${${prop_fragments[1]}}`);
    }

    for (const sub_component_fragments of this.#content.matchAll(/<ez *((name|id)="([\w-]+)" *)((name|id)="([\w-]+)" *)\/>/g)) {
      if (sub_component_fragments[2] === sub_component_fragments[5]) {
        WRN(`invalid component ("${sub_component_fragments[0]}"):\n  has to have exactly one "name" and one "id" property`);
        continue;
      }
      const component_descriptor = { name: '', id: '', is_ez_for: false };
      component_descriptor[sub_component_fragments[2]] = sub_component_fragments[3];
      component_descriptor[sub_component_fragments[5]] = sub_component_fragments[6];

      this.#dependencies.push(component_descriptor);
    }

    for (const sub_component_fragments of this.#content.matchAll(/<ez-for *((name|id)="([\w-]+)" *)((name|id)="([\w-]+)" *)\/>/g)) {
      if (sub_component_fragments[2] === sub_component_fragments[5]) {
        WRN(`invalid component ("${sub_component_fragments[0]}"):\n  has to have exactly one "name" and one "id" property`);
        continue;
      }

      const component_descriptor = { name: '', id: '', is_ez_for: true };
      component_descriptor[sub_component_fragments[2]] = sub_component_fragments[3];
      component_descriptor[sub_component_fragments[5]] = sub_component_fragments[6];

      this.#dependencies.push(component_descriptor);
    }
  }
}
