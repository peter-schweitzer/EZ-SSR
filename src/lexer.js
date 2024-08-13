import { ERR } from '@peter-schweitzer/ez-utils';

//#region constants
/** @type {{LITERAL: 'literal', ATTR: 'attr', ATTRS: 'attrs', PROP: 'prop', SUB: 'sub', SUBS: 'subs'}} */
export const TOKEN_TYPES = Object.seal({
  LITERAL: 'literal',
  ATTR: 'attr',
  PROP: 'prop',
  ATTRS: 'attrs',
  SUB: 'sub',
  SUBS: 'subs',
});

export const PROP_TYPES = {
  BOOLEAN: 'boolean',
  NUMBER: 'number',
  STRING: 'string',
  OBJECT: 'object',
  ANY: 'any',
};

export const STATES = {
  ERROR: -1,
  PLAIN: 0,
  PROP: 1,
  SUB: 2,
  SUBS: 3,
};

export const PROP_STATES = {
  PRE_NAME_WHITESPACE: 0,
  NAME: 1,
  COLON_OR_END: 2,
  PRE_TYPE_WHITESPACE: 3,
  TYPE: 4,
  END: 5,
};

export const COMPONENT_STATES = {
  PRE_NAME_OR_ID_WHITESPACE: 0,
  NAME_OR_ID: 1,
  NAME: 2,
  ID: 3,
  END_OR_INLINE_ARG: 4,
  INLINE_ARG_KEY: 5,
  INLINE_ARG_VAL: 6,
  INLINE_ARG_VAL_PROP: 7,
};
//#endregion

class TokenizationHelper {
  /** @type {string} str */
  #str;
  /** @type {LexerToken[]} */
  #tokens = [];

  /** @type {number} str */
  #idx = 0;
  /** @type {number} str */
  #peek_offset = 0;
  /** @type {number} str */
  #last_flush_idx = 0;

  constructor() {}

  /** @param {string} str */
  set str(str) {
    this.#str = str;
    this.#tokens = [];
    this.#idx = 0;
    this.#peek_offset = 0;
    this.#last_flush_idx = 0;
  }

  get chars_left() {
    return this.#str.length - this.#idx;
  }

  /** @param {number} [n=1] */
  take(n = 1) {
    this.#peek_offset = 0;
    this.#idx += n;
  }

  take_all() {
    this.#idx += this.#peek_offset;
    this.#peek_offset = 0;
  }

  /** @param {number} [n=1] */
  peek(n = 1) {
    if (n === 1) return this.#str[this.#idx + this.#peek_offset++];
    else return this.#str.slice(this.#idx + this.#peek_offset, this.#idx + (this.#peek_offset += n));
  }

  flush() {
    const slice = this.#str.slice(this.#last_flush_idx, this.#idx);
    this.#peek_offset = 0;
    this.#last_flush_idx = this.#idx;
    return slice;
  }

  /** @param {number} n */
  skip(n = 1) {
    this.#peek_offset = 0;
    this.#idx = this.#last_flush_idx += n;
  }

  /**
   * @param {TokenType} type
   * @param {any} data
   */
  emit_token(type, data) {
    switch (type) {
      case TOKEN_TYPES.LITERAL:
        if (!!data) this.#tokens.push({ type, data });
        break;
      case TOKEN_TYPES.ATTR:
        this.#tokens.push({ type, data });
        break;
      case TOKEN_TYPES.ATTRS:
        this.#tokens.push({ type, data });
        break;
      case TOKEN_TYPES.PROP:
        data.type ??= 'any';
        this.#tokens.push({ type, data });
        break;
      case TOKEN_TYPES.SUB:
        this.#tokens.push({ type, data });
        break;
      case TOKEN_TYPES.SUBS:
        this.#tokens.push({ type, data });
        break;
      default:
        ERR(`unknown token type '${type}'`);
        break;
    }
  }

  get_tokens() {
    return this.#tokens;
  }
}

class Buff {
  /** @type {string[]} */
  #buff = [];

  constructor() {}

  /** @param {String} str */
  add(str) {
    this.#buff.push(str);
  }

  flush() {
    const buff_str = this.#buff.join('');
    this.#buff = [];
    return buff_str;
  }
}

class InlineArgsBuffer {
  /** @type {InlineArgs[]} */
  #args = [];
  /** @type {InlineArgs} */
  #cur = null;

  constructor() {}

  /** @param {string} name */
  new(name) {
    if (this.#cur !== null) return ERR(`invalid State in InlineArgsBuffer, new() was called while '${this.#cur[0]}' has no value yet`);
    this.#cur = { name, data: [] };
  }

  /** @param {string} val */
  add_str(val) {
    if (this.#cur === null) return ERR('invalid State in InlineArgsBuffer, add_str() was called before new()');
    if (val.length === 0) return;

    const data_len = this.#cur.data.length;
    if (data_len === 0) return void this.#cur.data.push({ type: 'str', val });

    const last_entry = this.#cur.data[data_len - 1];
    if (last_entry.type === 'str') last_entry.val += val;
  }

  add_prop(val) {
    if (this.#cur === null) return ERR('invalid State in InlineArgsBuffer, add_prop() was called before new()');
    this.#cur.data.push({ type: 'prop', val });
  }

  build() {
    if (this.#cur === null) return ERR('invalid State in InlineArgsBuffer, finalize() was called before new()'), false;
    if (this.#cur.data.length === 0) return false;
    this.#args.push(this.#cur);
    this.#cur = null;
    return true;
  }

  new_wildcard() {
    this.#args.push({ name: '$*', data: [{ type: 'props', val: '$*' }] });
  }

  flush() {
    const args = this.#args;
    this.#args = [];
    return args;
  }
}

export class Lexer {
  #th = new TokenizationHelper();
  #buff = new Buff();
  #args_buff = new InlineArgsBuffer();

  constructor() {}

  /** @param {string} [str=''] */
  lex(str = '') {
    this.#th.str = str;

    let state = STATES.PLAIN;

    let prop_state = -1;
    let inline_name = null;
    let inline_type = null;

    let component_state = -1;
    let component_name = null;
    let component_id = null;

    while (this.#th.chars_left > 0) {
      switch (state) {
        case STATES.PLAIN:
          switch (this.#th.peek()) {
            case '\\':
              if (this.#th.peek() === '$' && this.#th.peek() === '{') {
                this.#buff.add(this.#th.flush());
                this.#buff.add('${');
                this.#th.skip(3);
              } else this.#th.take();
              break;
            case '$':
              switch (this.#th.peek()) {
                case '{':
                  state = STATES.PROP;

                  prop_state = PROP_STATES.PRE_NAME_WHITESPACE;
                  inline_name = null;
                  inline_type = null;

                  this.#buff.add(this.#th.flush());
                  this.#th.emit_token(TOKEN_TYPES.LITERAL, this.#buff.flush());
                  this.#th.skip(2);
                  this.#buff.add('${');
                  break;
                case '*':
                  this.#buff.add(this.#th.flush());
                  this.#th.emit_token(TOKEN_TYPES.LITERAL, this.#buff.flush());
                  this.#th.skip(2);
                  this.#th.emit_token(TOKEN_TYPES.ATTRS, '$*');
                  break;
                case '"':
                case '$':
                case ':':
                case '}':
                case '<':
                case '>':
                case '/':
                case '\\':
                case '&':
                case '|':
                  this.#th.take();
                  break;
                default:
                  this.#buff.add(this.#th.flush());
                  this.#th.emit_token(TOKEN_TYPES.LITERAL, this.#buff.flush());
                  this.#th.skip();
                  this.#buff.add('$');
                  state = STATES.ATTR;
                  break;
              }
              break;
            case '<':
              if (this.#th.peek() === 'e' && this.#th.peek() === 'z') {
                switch (this.#th.peek()) {
                  case ' ':
                  case '\t':
                  case '\r':
                  case '\n':
                    state = STATES.SUB;
                    component_state = COMPONENT_STATES.PRE_NAME_OR_ID_WHITESPACE;
                    component_name = null;
                    component_id = null;

                    this.#buff.add(this.#th.flush());
                    this.#th.emit_token(TOKEN_TYPES.LITERAL, this.#buff.flush());
                    this.#th.take(4);
                    this.#buff.add(this.#th.flush());
                    break;
                  case '-':
                    if (this.#th.peek() === 'f' && this.#th.peek() === 'o' && this.#th.peek() === 'r') {
                      state = STATES.SUB_S;
                      component_state = COMPONENT_STATES.PRE_NAME_OR_ID_WHITESPACE;
                      component_name = null;
                      component_id = null;

                      this.#buff.add(this.#th.flush());
                      this.#th.emit_token(TOKEN_TYPES.LITERAL, this.#buff.flush());
                      this.#th.take(7);
                      this.#buff.add(this.#th.flush());
                    } else this.#th.take_all();
                    break;
                  default:
                    this.#th.take_all();
                    break;
                }
              } else this.#th.take_all();
              break;
            default:
              this.#th.take();
              break;
          }
          break;
        case STATES.ATTR:
          switch (this.#th.peek()) {
            case '"':
            case '*':
            case '$':
            case '{':
            case ':':
            case '}':
            case '<':
            case '>':
            case '/':
            case '\\':
            case '&':
            case '|':
              state = STATES.PLAIN;
              this.#buff.add(this.#th.flush());
              this.#th.emit_token(TOKEN_TYPES.LITERAL, this.#buff.flush());
              break;
            case ' ':
            case '\r':
            case '\n':
            case '\t':
              state = STATES.PLAIN;
              this.#th.emit_token(TOKEN_TYPES.ATTR, this.#th.flush());
              this.#buff.flush();
              this.#th.take();
            default:
              this.#th.take();
          }
          break;
        case STATES.PROP:
          switch (prop_state) {
            case PROP_STATES.PRE_NAME_WHITESPACE:
              switch (this.#th.peek()) {
                case ' ':
                case '\t':
                case '\r':
                case '\n':
                  this.#th.take();
                  break;
                default:
                  prop_state = PROP_STATES.NAME;
                  this.#buff.add(this.#th.flush());
                  break;
              }
              break;
            case PROP_STATES.NAME:
              switch (this.#th.peek()) {
                case ' ':
                case '\t':
                case '\r':
                case '\n':
                  inline_name = this.#th.flush();
                  if (inline_name.length === 0) {
                    this.#th.take_all();
                    this.#buff.add(this.#th.flush());
                    this.#th.emit_token(TOKEN_TYPES.LITERAL, this.#buff.flush());
                    state = STATES.PLAIN;
                    break;
                  }

                  prop_state = PROP_STATES.COLON_OR_END;
                  this.#buff.add(inline_name);
                  break;
                case ':':
                  inline_name = this.#th.flush();
                  if (inline_name.length === 0) {
                    this.#th.take();
                    this.#buff.add(this.#th.flush());
                    this.#th.emit_token(TOKEN_TYPES.LITERAL, this.#buff.flush());
                    state = STATES.PLAIN;
                    break;
                  }

                  prop_state = PROP_STATES.PRE_TYPE_WHITESPACE;
                  this.#buff.add(inline_name);
                  this.#th.take();
                  this.#buff.add(this.#th.flush());
                  break;
                case '}':
                  inline_name = this.#th.flush();
                  if (inline_name.length === 0) {
                    this.#th.take_all();
                    this.#buff.add(this.#th.flush());
                    this.#th.emit_token(TOKEN_TYPES.LITERAL, this.#buff.flush());
                    state = STATES.PLAIN;
                    break;
                  }

                  this.#buff.flush();
                  this.#th.skip();
                  this.#th.emit_token(TOKEN_TYPES.PROP, { name: inline_name });
                  state = STATES.PLAIN;
                  break;
                case '$':
                case '{':
                case '<':
                case '/':
                case '>':
                case '&':
                  this.#th.take();
                  this.#buff.add(this.#th.flush());
                  this.#th.emit_token(TOKEN_TYPES.LITERAL, this.#buff.flush());
                  state = STATES.PLAIN;
                  break;
                default:
                  this.#th.take();
                  break;
              }
              break;
            case PROP_STATES.COLON_OR_END:
              switch (this.#th.peek()) {
                case ' ':
                case '\t':
                case '\r':
                case '\n':
                  this.#th.take();
                  break;
                case ':':
                  this.#th.take();
                  prop_state = PROP_STATES.PRE_TYPE_WHITESPACE;
                  break;
                case '}':
                  this.#th.take();
                  this.#th.flush();
                  this.#th.emit_token(TOKEN_TYPES.PROP, { name: inline_name });
                  state = STATES.PLAIN;
                  break;
                default:
                  this.#th.take();
                  this.#buff.add(this.#th.flush());
                  this.#th.emit_token(TOKEN_TYPES.LITERAL, this.#buff.flush());
                  state = STATES.PLAIN;
                  break;
              }
              break;
            case PROP_STATES.PRE_TYPE_WHITESPACE:
              switch (this.#th.peek()) {
                case ' ':
                case '\t':
                case '\r':
                case '\n':
                  this.#th.take();
                  break;
                case '$':
                case '{':
                case ':':
                case '}':
                case '<':
                case '/':
                case '>':
                case '&':
                  this.#th.take();
                  this.#buff.add(this.#th.flush());
                  this.#th.emit_token(TOKEN_TYPES.LITERAL, this.#buff.flush());
                  state = STATES.PLAIN;
                  break;
                default:
                  prop_state = PROP_STATES.TYPE;
                  this.#buff.add(this.#th.flush());
                  break;
              }
              break;
            case PROP_STATES.TYPE:
              switch (this.#th.peek()) {
                // string
                case 's':
                  if (this.#th.peek() === 't' && this.#th.peek() === 'r' && this.#th.peek() === 'i' && this.#th.peek() === 'n' && this.#th.peek() === 'g') {
                    inline_type = PROP_TYPES.STRING;
                    prop_state = PROP_STATES.END;
                    this.#th.skip(6);
                  } else {
                    this.#th.take();
                    this.#buff.add(this.#th.flush());
                    this.#th.emit_token(TOKEN_TYPES.LITERAL, this.#buff.flush());
                    state = STATES.PLAIN;
                  }
                  break;
                // number
                case 'n':
                  if (this.#th.peek() === 'u' && this.#th.peek() === 'm' && this.#th.peek() === 'b' && this.#th.peek() === 'e' && this.#th.peek() === 'r') {
                    inline_type = PROP_TYPES.NUMBER;
                    prop_state = PROP_STATES.END;
                    this.#th.skip(6);
                  } else {
                    this.#th.take();
                    this.#buff.add(this.#th.flush());
                    this.#th.emit_token(TOKEN_TYPES.LITERAL, this.#buff.flush());
                    state = STATES.PLAIN;
                  }
                  break;
                // boolean
                case 'b':
                  if (this.#th.peek() === 'o' && this.#th.peek() === 'o' && this.#th.peek() === 'l' && this.#th.peek() === 'e' && this.#th.peek() === 'a' && this.#th.peek() === 'n') {
                    inline_type = PROP_TYPES.BOOLEAN;
                    prop_state = PROP_STATES.END;
                    this.#th.skip(7);
                  } else {
                    this.#th.take();
                    this.#buff.add(this.#th.flush());
                    this.#th.emit_token(TOKEN_TYPES.LITERAL, this.#buff.flush());
                    state = STATES.PLAIN;
                  }
                  break;
                // object
                case 'o':
                  if (this.#th.peek() === 'b' && this.#th.peek() === 'j' && this.#th.peek() === 'e' && this.#th.peek() === 'c' && this.#th.peek() === 't') {
                    inline_type = PROP_TYPES.OBJECT;
                    prop_state = PROP_STATES.END;
                    this.#th.skip(6);
                  } else {
                    this.#th.take();
                    this.#buff.add(this.#th.flush());
                    this.#th.emit_token(TOKEN_TYPES.LITERAL, this.#buff.flush());
                    state = STATES.PLAIN;
                  }
                  break;
                // any
                case 'a':
                  if (this.#th.peek() === 'n' && this.#th.peek() === 'y') {
                    inline_type = PROP_TYPES.ANY;
                    prop_state = PROP_STATES.END;
                    this.#th.skip(3);
                  } else {
                    this.#th.take();
                    this.#buff.add(this.#th.flush());
                    this.#th.emit_token(TOKEN_TYPES.LITERAL, this.#buff.flush());
                    state = STATES.PLAIN;
                  }
                  break;
                // invalid char
                default:
                  this.#th.take();
                  this.#buff.add(this.#th.flush());
                  this.#th.emit_token(TOKEN_TYPES.PROP, { name: this.#buff.flush() });
                  state = STATES.PLAIN;
                  break;
              }
              break;
            case PROP_STATES.END:
              switch (this.#th.peek()) {
                case ' ':
                case '\t':
                case '\r':
                case '\n':
                  this.#th.take();
                  break;
                case '}':
                  this.#buff.flush();
                  this.#th.skip();
                  this.#th.emit_token(TOKEN_TYPES.PROP, { name: inline_name, type: inline_type });
                  state = STATES.PLAIN;
                  break;
                default:
                  this.#th.take();
                  this.#buff.add(this.#th.flush());
                  this.#th.emit_token(TOKEN_TYPES.LITERAL, this.#buff.flush());
                  state = STATES.PLAIN;
                  break;
              }
              break;
            default:
              ERR(`INVALID inline_state: ${prop_state}`);
              state = STATES.ERROR;
              break;
          }
          break;
        case STATES.SUB:
        case STATES.SUBS:
          switch (component_state) {
            case COMPONENT_STATES.PRE_NAME_OR_ID_WHITESPACE:
              switch (this.#th.peek()) {
                case ' ':
                case '\t':
                case '\r':
                case '\n':
                  this.#th.take();
                  break;
                default:
                  component_state = COMPONENT_STATES.NAME_OR_ID;
                  this.#buff.add(this.#th.flush());
                  break;
              }
              break;
            case COMPONENT_STATES.NAME_OR_ID:
              switch (this.#th.peek()) {
                case 'n':
                  if (this.#th.peek() === 'a' && this.#th.peek() === 'm' && this.#th.peek() === 'e' && this.#th.peek() === '=' && this.#th.peek() === '"') {
                    component_state = COMPONENT_STATES.NAME;
                    this.#th.take_all();
                    this.#buff.add(this.#th.flush());
                  } else {
                    this.#th.take_all();
                    this.#buff.add(this.#th.flush());
                    this.#th.emit_token(TOKEN_TYPES.LITERAL, this.#buff.flush());
                    state = STATES.PLAIN;
                  }
                  break;
                case 'i':
                  if (this.#th.peek() === 'd' && this.#th.peek() === '=' && this.#th.peek() === '"') {
                    component_state = COMPONENT_STATES.ID;
                    this.#th.take_all();
                    this.#buff.add(this.#th.flush());
                  } else {
                    this.#th.take_all();
                    this.#buff.add(this.#th.flush());
                    this.#th.emit_token(TOKEN_TYPES.LITERAL, this.#buff.flush());
                    state = STATES.PLAIN;
                  }
                  break;
                default:
                  this.#buff.add(this.#th.flush());
                  this.#th.emit_token(TOKEN_TYPES.LITERAL, this.#buff.flush());
                  state = STATES.PLAIN;
                  break;
              }
              break;
            case COMPONENT_STATES.NAME:
              if (component_name !== null) {
                this.#buff.add(this.#th.flush());
                this.#th.emit_token(TOKEN_TYPES.LITERAL, this.#buff.flush());
                state = STATES.PLAIN;
                break;
              }

              switch (this.#th.peek()) {
                case '"':
                  component_state = component_id === null ? COMPONENT_STATES.PRE_NAME_OR_ID_WHITESPACE : COMPONENT_STATES.END_OR_INLINE_ARG;
                  component_name = this.#th.flush();
                  this.#buff.add(component_name);
                  this.#th.skip();
                  this.#buff.add('"');

                  if (component_name.length === 0) {
                    this.#th.emit_token(TOKEN_TYPES.LITERAL, this.#buff.flush());
                    state = STATES.PLAIN;
                  }
                  break;
                case ' ':
                case '\t':
                case '\r':
                case '\n':
                case '$':
                case '{':
                case ':':
                case '}':
                case '<':
                case '>':
                case '&':
                  this.#buff.add(this.#th.flush());
                  this.#th.emit_token(TOKEN_TYPES.LITERAL, this.#buff.flush());
                  state = STATES.PLAIN;
                  break;
                case '/': // allow slash in name for components in subdir for components dir
                default:
                  this.#th.take();
                  break;
              }
              break;
            case COMPONENT_STATES.ID:
              if (component_id !== null) {
                this.#buff.add(this.#th.flush());
                this.#th.emit_token(TOKEN_TYPES.LITERAL, this.#buff.flush());
                state = STATES.PLAIN;
                break;
              }

              switch (this.#th.peek()) {
                case '"':
                  component_state = component_name === null ? COMPONENT_STATES.PRE_NAME_OR_ID_WHITESPACE : COMPONENT_STATES.END_OR_INLINE_ARG;
                  component_id = this.#th.flush();
                  this.#buff.add(component_id);
                  this.#th.skip();
                  this.#buff.add('"');

                  if (component_id.length === 0) {
                    this.#th.emit_token(TOKEN_TYPES.LITERAL, this.#buff.flush());
                    state = STATES.PLAIN;
                  }
                  break;
                case ' ':
                case '\t':
                case '\r':
                case '\n':
                case '$':
                case '{':
                case ':':
                case '}':
                case '<':
                case '/':
                case '>':
                case '&':
                  this.#buff.add(this.#th.flush());
                  this.#th.emit_token(TOKEN_TYPES.LITERAL, this.#buff.flush());
                  state = STATES.PLAIN;
                  break;
                default:
                  this.#th.take();
                  break;
              }
              break;
            case COMPONENT_STATES.END_OR_INLINE_ARG:
              switch (this.#th.peek()) {
                case '/': // end
                  if (this.#th.peek() === '>') {
                    this.#th.take_all();
                    this.#th.flush();
                    this.#buff.flush();
                    this.#th.emit_token(state == STATES.SUB ? TOKEN_TYPES.SUB : TOKEN_TYPES.SUBS, { name: component_name, id: component_id, args: this.#args_buff.flush() });
                    state = STATES.PLAIN;
                  } else {
                    this.#th.take();
                    this.#buff.add(this.#th.flush());
                    this.#th.emit_token(TOKEN_TYPES.LITERAL, this.#buff.flush());
                  }
                  break;
                case ' ':
                case '\t':
                case '\r':
                case '\n':
                  this.#th.take();
                  break;
                case '$':
                  if (this.#th.peek() === '*') {
                    this.#args_buff.new_wildcard();
                    this.#th.take(2);
                    this.#buff.add(this.#th.flush());
                    break;
                  } else component_state = COMPONENT_STATES.INLINE_ARG_RELAY;
                  break;
                case '"':
                case '{':
                case ':':
                case '}':
                case '<':
                case '>':
                case '&':
                  this.#buff.add(this.#th.flush());
                  this.#th.emit_token(TOKEN_TYPES.LITERAL, this.#buff.flush());
                  state = STATES.PLAIN;
                  break;
                default:
                  this.#buff.add(this.#th.flush());
                  component_state = COMPONENT_STATES.INLINE_ARG_KEY;
                  break;
              }
              break;
            case COMPONENT_STATES.INLINE_ARG_RELAY:
              switch (this.#th.peek()) {
                case ' ':
                case '\t':
                case '\r':
                case '\n':
                  const id = this.#th.flush();
                  if (id.length === 0) {
                    this.#th.emit_token(TOKEN_TYPES.LITERAL, this.#buff.flush());
                    state = STATES.PLAIN;
                    break;
                  }
                  this.#buff.add(id);

                  this.#args_buff.new(id);
                  this.#args_buff.add_prop(id);
                  this.#args_buff.build();
                  break;
                case '*':
                case '"':
                case '$':
                case ':':
                case '{':
                case '}':
                case '<':
                case '>':
                case '/':
                case '&':
                  this.#buff.add(this.#th.flush());
                  this.#th.emit_token(TOKEN_TYPES.LITERAL, this.#buff.flush());
                  state = STATES.PLAIN;
                  break;
                default:
                  this.#th.take();
                  break;
              }
              break;
            case COMPONENT_STATES.INLINE_ARG_KEY:
              switch (this.#th.peek()) {
                case ' ':
                case '\t':
                case '\r':
                case '\n':
                case '"':
                case '$':
                case '{':
                case ':':
                case '}':
                case '<':
                case '/':
                case '>':
                case '&':
                  this.#buff.add(this.#th.flush());
                  this.#th.emit_token(TOKEN_TYPES.LITERAL, this.#buff.flush());
                  state = STATES.PLAIN;
                  break;
                case '=':
                  if (this.#th.peek() === '"') {
                    component_state = COMPONENT_STATES.INLINE_ARG_VAL;
                    const key = this.#th.flush();
                    this.#args_buff.new(key);
                    this.#buff.add(key);
                    this.#th.skip(2);
                    this.#buff.add('="');

                    if (key.length === 0) {
                      this.#th.emit_token(TOKEN_TYPES.LITERAL, this.#buff.flush());
                      state = STATES.PLAIN;
                    }
                  } else {
                    this.#th.take();
                    this.#buff.add(this.#th.flush());
                    this.#th.emit_token(TOKEN_TYPES.LITERAL, this.#buff.flush());
                    state = STATES.PLAIN;
                  }
                  break;
                default:
                  this.#th.take();
                  break;
              }
              break;
            case COMPONENT_STATES.INLINE_ARG_VAL:
              switch (this.#th.peek()) {
                case '"':
                  component_state = COMPONENT_STATES.END_OR_INLINE_ARG;
                  const val = this.#th.flush();
                  this.#args_buff.add_str(val);
                  this.#buff.add(val);
                  this.#th.skip();
                  this.#buff.add('"');

                  if (!this.#args_buff.build()) {
                    this.#th.emit_token(TOKEN_TYPES.LITERAL, this.#buff.flush());
                    state = STATES.PLAIN;
                  }
                  break;
                case '\\':
                  if (this.#th.peek() === '$') {
                    const val = this.#th.flush();
                    this.#args_buff.add_str(val);
                    this.#buff.add(val);
                    this.#th.skip();
                    this.#buff.add('\\');
                  }
                  this.#th.take();
                  break;
                case '$':
                  if (this.#th.peek() === '{') {
                    component_state = COMPONENT_STATES.INLINE_ARG_VAL_PROP;
                    const val = this.#th.flush();
                    this.#args_buff.add_str(val);
                    this.#buff.add(val);
                    this.#th.skip(2);
                    this.#buff.add('${');
                  } else this.#th.take();
                  break;
                default:
                  this.#th.take();
                  break;
              }
              break;
            case COMPONENT_STATES.INLINE_ARG_VAL_PROP:
              switch (this.#th.peek()) {
                case '"':
                  this.#th.take_all();
                  this.#buff.add(this.#th.flush());
                  this.#th.emit_token(TOKEN_TYPES.LITERAL, this.#buff.flush());
                  state = STATES.PLAIN;
                  break;
                case '}':
                  component_state = COMPONENT_STATES.INLINE_ARG_VAL;
                  const prop = this.#th.flush();
                  this.#args_buff.add_prop(prop);
                  this.#buff.add(prop);
                  this.#th.skip();
                  this.#buff.add('}');
                  if (prop.length === 0) {
                    this.#th.emit_token(TOKEN_TYPES.LITERAL, this.#buff.flush());
                    state = STATES.PLAIN;
                  }
                  break;
                default:
                  this.#th.take();
                  break;
              }
              break;
            default:
              ERR(`INVALID component_state: ${component_state}`);
              state = STATES.ERROR;
              break;
          }
          break;
        case STATES.ERROR:
        default:
          ERR('ERROR STATE OHHH nOOOOOOO');
          return [];
      }
    }

    this.#th.take_all();
    this.#buff.add(this.#th.flush());
    this.#th.emit_token(TOKEN_TYPES.LITERAL, this.#buff.flush());
    return this.#th.get_tokens();
  }
}
