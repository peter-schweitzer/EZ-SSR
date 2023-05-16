'use strict';

export const { log: LOG, table: TAB, warn: WRN, error: ERR } = console;

/**
 * @param {string} err
 * @returns {Err}
 */
export function err(err = '') {
  return { err, data: null };
}

/**
 * @param {T} data
 * @returns {Data<T>}
 * @template T
 */
export function data(data) {
  return { err: null, data };
}

/**
 * @param {Promise<T>} promise
 * @returns {AsyncErrorOr<T>}
 * @template T
 */
export async function p2eo(promise) {
  try {
    return Promise.resolve(data(await promise));
  } catch ({ code: e }) {
    return Promise.resolve(err(e));
  }
}
