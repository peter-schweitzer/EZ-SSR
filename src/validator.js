class Validator {
  /**
   * @param {LUT<any>} schema
   * @param {LUT<any>} obj
   * @returns {FalseOr<LUT<any>>}
   */
  validate(schema, obj) {
    return this.#validate_layer(schema, obj);
  }

  /**
   * @param {LUT<any>} schema
   * @param {LUT<any>} obj
   * @returns {FalseOr<LUT<any>>}
   */
  #validate_layer(schema, obj) {
    /** @type {LUT<any>} */
    let obj_layer = {};

    for (const key in schema)
      if (!obj.hasOwnProperty(key)) return false;
      else if (typeof schema[key] === 'object' && (obj_layer[key] = this.#validate_layer(schema[key], obj[key])) === false) return false;
      else if (schema[key] === 'any' || typeof obj[key] === schema[key]) obj_layer[key] = obj[key];
      else if (typeof obj[key] !== 'object') return false;
      else if (schema[key] === 'array' && Array.isArray(obj[key])) obj_layer[key] = obj[key];
      else if (obj[key] === null) obj_layer[key] = obj[key];
      else return false;

    return obj_layer;
  }
}

module.exports = { Validator };
