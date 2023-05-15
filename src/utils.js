'use strict';
import './types.js';

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
 * @returns {Promise<ErrorOr<T>>}
 * @template T
 */
export async function p2eo(promise) {
  try {
    const d = await promise;
    return Promise.resolve(data(d));
  } catch ({ code: e }) {
    return Promise.resolve(err(e));
  }
}
