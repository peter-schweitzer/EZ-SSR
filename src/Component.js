import { WRN } from '@peter-schweitzer/ez-utils';

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

    for (const prop_fragments of this.#content.matchAll(/\${(\w+)( ?: ?(boolean|number|string|object|any))?}/g)) {
      const [prop_str, prop, opt_type, type] = prop_fragments;
      this.#props[prop] = opt_type === undefined ? 'any' : type;
      this.#content = this.#content.replace(prop_str, `\${${prop}}`);
    }

    for (const sub_component_fragments of this.#content.matchAll(/<ez-for *(name|id)="([\w-]+)" +(name|id)="([\w-]+)" *\/>/g)) {
      /** @type {[string, "name"|"id", string, "name"|"id", string]} */
      // @ts-ignore why the fuck is matchAll() so fucking fucky :rage:
      const [raw_str, attr1, val1, attr2, val2] = sub_component_fragments;
      if (attr1 === attr2) {
        WRN(`invalid component ("${raw_str}"):\n  has to have exactly one "name" and one "id" property`);
        continue;
      }

      // @ts-ignore attr1 is "name" or "id" and attr2 is the other one -> both are set
      this.#dependencies.push({ [attr1]: val1, [attr2]: val2, is_ez_for: true });
    }

    for (const sub_component_fragments of this.#content.matchAll(/<ez *(name|id)="([\w-]+)" +(name|id)="([\w-]+)" *\/>/g)) {
      /** @type {[string, "name"|"id", string, "name"|"id", string]} */
      // @ts-ignore why the fuck is matchAll() so fucking fucky :rage:
      const [raw_str, attr1, val1, attr2, val2] = sub_component_fragments;
      if (attr1 === attr2) {
        WRN(`invalid component ("${raw_str}"):\n  has to have exactly one "name" and one "id" property`);
        continue;
      }

      // @ts-ignore attr1 is "name" or "id" and attr2 is the other one -> both are set
      this.#dependencies.push({ [attr1]: val1, [attr2]: val2, is_ez_for: true });
    }
  }
}
