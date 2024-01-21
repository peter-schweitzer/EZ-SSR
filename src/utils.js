import { data, err } from '@peter-schweitzer/ez-utils';

/**
 * @param {string} component_string
 * @returns {ErrorOr<{name: string, id: string}>}
 */
export function parse_component_string(component_string) {
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
