/**
 * @typedef {{[x: string]: T}} LUT<T>
 * @template T
 */

/**
 * @typedef {(false|T)} FalseOr<T>
 * @template T
 */

/**
 * @typedef {{err: string, data: null}} Err
 */

/**
 * @typedef {{err: null, data: T}} Data<T>
 * @template T
 */

/**
 * @typedef {Err|Data<T>} ErrorOr<T>
 * @template T
 */

/**
 * the Promise should always resolve, never reject!
 * @typedef {Promise<ErrorOr<T>>} AsyncErrorOr<T>
 * @template T
 */
