import { data, err } from '@peter-schweitzer/ez-utils';

export class InlineProp {
  /** @type{string[]} */
  #str;
  /** @type{string[]} */
  #prop;

  /**
   * @param {string} str
   */
  constructor(str) {
    this.#str = [];
    this.#prop = [];

    let end_idx = 0;
    for (const {
      groups: { p },
      index,
    } of str.matchAll(/\${(?<p>[^}]+)}/g)) {
      this.#str.push(str.slice(end_idx, index));
      this.#prop.push(p);
      end_idx = index + p.length + 3;
    }
    this.#str.push(str.slice(end_idx));
  }

  /**
   * @param {LUT<*>} props
   * @returns {ErrorOr<string>}
   */
  render(props) {
    const rendered_segments = new Array(this.#str.length + this.#prop.length);

    let i = 0;
    for (let prop = this.#prop[i]; i < this.#prop.length; prop = this.#prop[++i])
      if (!Object.hasOwn(props, prop)) return err(`missing prop '${prop}' for inline prop`);
      else {
        rendered_segments[i * 2] = this.#str[i];
        rendered_segments[i * 2 + 1] = props[prop];
      }
    rendered_segments[i * 2] = this.#str[i];

    return data(rendered_segments.join(''));
  }
}
