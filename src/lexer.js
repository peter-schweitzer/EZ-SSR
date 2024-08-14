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
  /** @type {string} str */
  #str;

  /** @type {string[]} */
  #buff = [];
  #args_buff = new InlineArgsBuffer();

  /** @type {LexerToken[]} */
  #tokens = [];
  /** @type {number} str */
  #idx = 0;
  /** @type {number} str */
  #peek_offset = 0;
  /** @type {number} str */
  #last_flush_idx = 0;

  constructor() {}

  /** @param {number} [n=1] */
  #take(n = 1) {
    this.#peek_offset = 0;
    this.#idx += n;
  }

  #take_all() {
    this.#idx += this.#peek_offset;
    this.#peek_offset = 0;
  }

  /** @param {number} [n=1] */
  #peek(n = 1) {
    if (n === 1) return this.#str[this.#idx + this.#peek_offset++];
    else return this.#str.slice(this.#idx + this.#peek_offset, this.#idx + (this.#peek_offset += n));
  }

  #empty() {
    const slice = this.#str.slice(this.#last_flush_idx, this.#idx);
    this.#peek_offset = 0;
    this.#last_flush_idx = this.#idx;
    return slice;
  }

  /** @param {number} n */
  #skip(n = 1) {
    this.#peek_offset = 0;
    this.#idx = this.#last_flush_idx += n;
  }

  /**
   * @param {TokenType} type
   * @param {any} data
   */
  #emit_token(type, data) {
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

  #flush() {
    const buff_str = this.#buff.join('');
    this.#buff = [];
    return buff_str;
  }

  /** @param {string} [str=''] */
  lex(str = '') {
    this.#str = str;
    this.#tokens = [];
    this.#idx = 0;
    this.#peek_offset = 0;
    this.#last_flush_idx = 0;

    let state = STATES.PLAIN;

    let prop_state = -1;
    let inline_name = null;
    let inline_type = null;

    let component_state = -1;
    let component_name = null;
    let component_id = null;

    while (this.#str.length - this.#idx > 0) {
      switch (state) {
        case STATES.PLAIN:
          switch (this.#peek()) {
            case '\\':
              if (this.#peek() === '$' && this.#peek() === '{') {
                this.#buff.push(this.#empty());
                this.#buff.push('${');
                this.#skip(3);
              } else this.#take();
              break;
            case '$':
              switch (this.#peek()) {
                case '{':
                  state = STATES.PROP;

                  prop_state = PROP_STATES.PRE_NAME_WHITESPACE;
                  inline_name = null;
                  inline_type = null;

                  this.#buff.push(this.#empty());
                  this.#emit_token(TOKEN_TYPES.LITERAL, this.#flush());
                  this.#skip(2);
                  this.#buff.push('${');
                  break;
                case '*':
                  this.#buff.push(this.#empty());
                  this.#emit_token(TOKEN_TYPES.LITERAL, this.#flush());
                  this.#skip(2);
                  this.#emit_token(TOKEN_TYPES.ATTRS, '$*');
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
                  this.#take();
                  break;
                default:
                  this.#buff.push(this.#empty());
                  this.#emit_token(TOKEN_TYPES.LITERAL, this.#flush());
                  this.#skip();
                  this.#buff.push('$');
                  state = STATES.ATTR;
                  break;
              }
              break;
            case '<':
              if (this.#peek(2) === 'ez') {
                switch (this.#peek()) {
                  case ' ':
                  case '\t':
                  case '\r':
                  case '\n':
                    state = STATES.SUB;
                    component_state = COMPONENT_STATES.PRE_NAME_OR_ID_WHITESPACE;
                    component_name = null;
                    component_id = null;

                    this.#buff.push(this.#empty());
                    this.#emit_token(TOKEN_TYPES.LITERAL, this.#flush());
                    this.#take(4);
                    this.#buff.push(this.#empty());
                    break;
                  case '-':
                    if (this.#peek(4) === 'for ') {
                      state = STATES.SUBS;
                      component_state = COMPONENT_STATES.PRE_NAME_OR_ID_WHITESPACE;
                      component_name = null;
                      component_id = null;

                      this.#buff.push(this.#empty());
                      this.#emit_token(TOKEN_TYPES.LITERAL, this.#flush());
                      this.#take(8);
                      this.#buff.push(this.#empty());
                    } else this.#take_all();
                    break;
                  default:
                    this.#take_all();
                    break;
                }
              } else this.#take_all();
              break;
            default:
              this.#take();
              break;
          }
          break;
        case STATES.ATTR:
          switch (this.#peek()) {
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
              this.#buff.push(this.#empty());
              this.#emit_token(TOKEN_TYPES.LITERAL, this.#flush());
              break;
            case ' ':
            case '\r':
            case '\n':
            case '\t':
              state = STATES.PLAIN;
              this.#emit_token(TOKEN_TYPES.ATTR, this.#empty());
              this.#flush();
              this.#take();
            default:
              this.#take();
              break;
          }
          break;
        case STATES.PROP:
          switch (prop_state) {
            case PROP_STATES.PRE_NAME_WHITESPACE:
              switch (this.#peek()) {
                case ' ':
                case '\t':
                case '\r':
                case '\n':
                  this.#take();
                  break;
                default:
                  prop_state = PROP_STATES.NAME;
                  this.#buff.push(this.#empty());
                  break;
              }
              break;
            case PROP_STATES.NAME:
              switch (this.#peek()) {
                case ' ':
                case '\t':
                case '\r':
                case '\n':
                  inline_name = this.#empty();
                  if (inline_name.length === 0) {
                    this.#take_all();
                    this.#buff.push(this.#empty());
                    this.#emit_token(TOKEN_TYPES.LITERAL, this.#flush());
                    state = STATES.PLAIN;
                    break;
                  }

                  prop_state = PROP_STATES.COLON_OR_END;
                  this.#buff.push(inline_name);
                  break;
                case ':':
                  inline_name = this.#empty();
                  if (inline_name.length === 0) {
                    this.#take();
                    this.#buff.push(this.#empty());
                    this.#emit_token(TOKEN_TYPES.LITERAL, this.#flush());
                    state = STATES.PLAIN;
                    break;
                  }

                  prop_state = PROP_STATES.PRE_TYPE_WHITESPACE;
                  this.#buff.push(inline_name);
                  this.#take();
                  this.#buff.push(this.#empty());
                  break;
                case '}':
                  inline_name = this.#empty();
                  if (inline_name.length === 0) {
                    this.#take_all();
                    this.#buff.push(this.#empty());
                    this.#emit_token(TOKEN_TYPES.LITERAL, this.#flush());
                    state = STATES.PLAIN;
                    break;
                  }

                  this.#flush();
                  this.#skip();
                  this.#emit_token(TOKEN_TYPES.PROP, { name: inline_name });
                  state = STATES.PLAIN;
                  break;
                case '$':
                case '{':
                case '<':
                case '/':
                case '>':
                case '&':
                  this.#take();
                  this.#buff.push(this.#empty());
                  this.#emit_token(TOKEN_TYPES.LITERAL, this.#flush());
                  state = STATES.PLAIN;
                  break;
                default:
                  this.#take();
                  break;
              }
              break;
            case PROP_STATES.COLON_OR_END:
              switch (this.#peek()) {
                case ' ':
                case '\t':
                case '\r':
                case '\n':
                  this.#take();
                  break;
                case ':':
                  this.#take();
                  prop_state = PROP_STATES.PRE_TYPE_WHITESPACE;
                  break;
                case '}':
                  this.#take();
                  this.#empty();
                  this.#emit_token(TOKEN_TYPES.PROP, { name: inline_name });
                  state = STATES.PLAIN;
                  break;
                default:
                  this.#take();
                  this.#buff.push(this.#empty());
                  this.#emit_token(TOKEN_TYPES.LITERAL, this.#flush());
                  state = STATES.PLAIN;
                  break;
              }
              break;
            case PROP_STATES.PRE_TYPE_WHITESPACE:
              switch (this.#peek()) {
                case ' ':
                case '\t':
                case '\r':
                case '\n':
                  this.#take();
                  break;
                case '$':
                case '{':
                case ':':
                case '}':
                case '<':
                case '/':
                case '>':
                case '&':
                  this.#take();
                  this.#buff.push(this.#empty());
                  this.#emit_token(TOKEN_TYPES.LITERAL, this.#flush());
                  state = STATES.PLAIN;
                  break;
                default:
                  prop_state = PROP_STATES.TYPE;
                  this.#buff.push(this.#empty());
                  break;
              }
              break;
            case PROP_STATES.TYPE:
              switch (this.#peek()) {
                // string
                case 's':
                  if (this.#peek() === 't' && this.#peek() === 'r' && this.#peek() === 'i' && this.#peek() === 'n' && this.#peek() === 'g') {
                    inline_type = PROP_TYPES.STRING;
                    prop_state = PROP_STATES.END;
                    this.#skip(6);
                  } else {
                    this.#take();
                    this.#buff.push(this.#empty());
                    this.#emit_token(TOKEN_TYPES.LITERAL, this.#flush());
                    state = STATES.PLAIN;
                  }
                  break;
                // number
                case 'n':
                  if (this.#peek() === 'u' && this.#peek() === 'm' && this.#peek() === 'b' && this.#peek() === 'e' && this.#peek() === 'r') {
                    inline_type = PROP_TYPES.NUMBER;
                    prop_state = PROP_STATES.END;
                    this.#skip(6);
                  } else {
                    this.#take();
                    this.#buff.push(this.#empty());
                    this.#emit_token(TOKEN_TYPES.LITERAL, this.#flush());
                    state = STATES.PLAIN;
                  }
                  break;
                // boolean
                case 'b':
                  if (this.#peek() === 'o' && this.#peek() === 'o' && this.#peek() === 'l' && this.#peek() === 'e' && this.#peek() === 'a' && this.#peek() === 'n') {
                    inline_type = PROP_TYPES.BOOLEAN;
                    prop_state = PROP_STATES.END;
                    this.#skip(7);
                  } else {
                    this.#take();
                    this.#buff.push(this.#empty());
                    this.#emit_token(TOKEN_TYPES.LITERAL, this.#flush());
                    state = STATES.PLAIN;
                  }
                  break;
                // object
                case 'o':
                  if (this.#peek() === 'b' && this.#peek() === 'j' && this.#peek() === 'e' && this.#peek() === 'c' && this.#peek() === 't') {
                    inline_type = PROP_TYPES.OBJECT;
                    prop_state = PROP_STATES.END;
                    this.#skip(6);
                  } else {
                    this.#take();
                    this.#buff.push(this.#empty());
                    this.#emit_token(TOKEN_TYPES.LITERAL, this.#flush());
                    state = STATES.PLAIN;
                  }
                  break;
                // any
                case 'a':
                  if (this.#peek() === 'n' && this.#peek() === 'y') {
                    inline_type = PROP_TYPES.ANY;
                    prop_state = PROP_STATES.END;
                    this.#skip(3);
                  } else {
                    this.#take();
                    this.#buff.push(this.#empty());
                    this.#emit_token(TOKEN_TYPES.LITERAL, this.#flush());
                    state = STATES.PLAIN;
                  }
                  break;
                // invalid char
                default:
                  this.#take();
                  this.#buff.push(this.#empty());
                  this.#emit_token(TOKEN_TYPES.PROP, { name: this.#flush() });
                  state = STATES.PLAIN;
                  break;
              }
              break;
            case PROP_STATES.END:
              switch (this.#peek()) {
                case ' ':
                case '\t':
                case '\r':
                case '\n':
                  this.#take();
                  break;
                case '}':
                  this.#flush();
                  this.#skip();
                  this.#emit_token(TOKEN_TYPES.PROP, { name: inline_name, type: inline_type });
                  state = STATES.PLAIN;
                  break;
                default:
                  this.#take();
                  this.#buff.push(this.#empty());
                  this.#emit_token(TOKEN_TYPES.LITERAL, this.#flush());
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
              switch (this.#peek()) {
                case ' ':
                case '\t':
                case '\r':
                case '\n':
                  this.#take();
                  break;
                default:
                  component_state = COMPONENT_STATES.NAME_OR_ID;
                  this.#buff.push(this.#empty());
                  break;
              }
              break;
            case COMPONENT_STATES.NAME_OR_ID:
              switch (this.#peek()) {
                case 'n':
                  if (this.#peek(5) === 'ame="') {
                    component_state = COMPONENT_STATES.NAME;
                    this.#take_all();
                    this.#buff.push(this.#empty());
                  } else {
                    state = STATES.PLAIN;
                    this.#take_all();
                    this.#buff.push(this.#empty());
                    this.#emit_token(TOKEN_TYPES.LITERAL, this.#flush());
                  }
                  break;
                case 'i':
                  if (this.#peek(3) === 'd="') {
                    component_state = COMPONENT_STATES.ID;
                    this.#take_all();
                    this.#buff.push(this.#empty());
                  } else {
                    state = STATES.PLAIN;
                    this.#take_all();
                    this.#buff.push(this.#empty());
                    this.#emit_token(TOKEN_TYPES.LITERAL, this.#flush());
                  }
                  break;
                default:
                  state = STATES.PLAIN;
                  this.#buff.push(this.#empty());
                  this.#emit_token(TOKEN_TYPES.LITERAL, this.#flush());
                  break;
              }
              break;
            case COMPONENT_STATES.NAME:
              if (component_name !== null) {
                state = STATES.PLAIN;
                this.#buff.push(this.#empty());
                this.#emit_token(TOKEN_TYPES.LITERAL, this.#flush());
                break;
              }

              switch (this.#peek()) {
                case '"':
                  component_state = component_id === null ? COMPONENT_STATES.PRE_NAME_OR_ID_WHITESPACE : COMPONENT_STATES.END_OR_INLINE_ARG;
                  component_name = this.#empty();
                  this.#buff.push(component_name);
                  this.#skip();
                  this.#buff.push('"');

                  if (component_name.length === 0) {
                    this.#emit_token(TOKEN_TYPES.LITERAL, this.#flush());
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
                  state = STATES.PLAIN;
                  this.#buff.push(this.#empty());
                  this.#emit_token(TOKEN_TYPES.LITERAL, this.#flush());
                  break;
                case '/': // allow slash in name for components in subdir for components dir
                default:
                  this.#take();
                  break;
              }
              break;
            case COMPONENT_STATES.ID:
              if (component_id !== null) {
                state = STATES.PLAIN;
                this.#buff.push(this.#empty());
                this.#emit_token(TOKEN_TYPES.LITERAL, this.#flush());
                break;
              }

              switch (this.#peek()) {
                case '"':
                  component_state = component_name === null ? COMPONENT_STATES.PRE_NAME_OR_ID_WHITESPACE : COMPONENT_STATES.END_OR_INLINE_ARG;
                  component_id = this.#empty();
                  this.#buff.push(component_id);
                  this.#skip();
                  this.#buff.push('"');

                  if (component_id.length === 0) {
                    this.#emit_token(TOKEN_TYPES.LITERAL, this.#flush());
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
                  state = STATES.PLAIN;
                  this.#buff.push(this.#empty());
                  this.#emit_token(TOKEN_TYPES.LITERAL, this.#flush());
                  break;
                default:
                  this.#take();
                  break;
              }
              break;
            case COMPONENT_STATES.END_OR_INLINE_ARG:
              switch (this.#peek()) {
                case '/': // end
                  if (this.#peek() === '>') {
                    this.#take_all();
                    this.#empty();
                    this.#flush();
                    const args = this.#args_buff.flush();
                    this.#emit_token(state === STATES.SUB ? TOKEN_TYPES.SUB : TOKEN_TYPES.SUBS, { name: component_name, id: component_id, args });
                  } else {
                    this.#take();
                    this.#buff.push(this.#empty());
                    this.#emit_token(TOKEN_TYPES.LITERAL, this.#flush());
                  }
                  state = STATES.PLAIN; // state is used when emiting sub(s) token
                  break;
                case ' ':
                case '\t':
                case '\r':
                case '\n':
                  this.#take();
                  break;
                case '$':
                  if (this.#peek() === '*') {
                    this.#args_buff.new_wildcard();
                    this.#take(2);
                    this.#buff.push(this.#empty());
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
                  state = STATES.PLAIN;
                  this.#buff.push(this.#empty());
                  this.#emit_token(TOKEN_TYPES.LITERAL, this.#flush());
                  break;
                default:
                  component_state = COMPONENT_STATES.INLINE_ARG_KEY;
                  this.#buff.push(this.#empty());
                  break;
              }
              break;
            case COMPONENT_STATES.INLINE_ARG_RELAY:
              switch (this.#peek()) {
                case ' ':
                case '\t':
                case '\r':
                case '\n':
                  const id = this.#empty();
                  if (id.length === 0) {
                    state = STATES.PLAIN;
                    this.#emit_token(TOKEN_TYPES.LITERAL, this.#flush());
                    break;
                  }
                  this.#buff.push(id);

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
                  state = STATES.PLAIN;
                  this.#buff.push(this.#empty());
                  this.#emit_token(TOKEN_TYPES.LITERAL, this.#flush());
                  break;
                default:
                  this.#take();
                  break;
              }
              break;
            case COMPONENT_STATES.INLINE_ARG_KEY:
              switch (this.#peek()) {
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
                  state = STATES.PLAIN;
                  this.#buff.push(this.#empty());
                  this.#emit_token(TOKEN_TYPES.LITERAL, this.#flush());
                  break;
                case '=':
                  if (this.#peek() === '"') {
                    component_state = COMPONENT_STATES.INLINE_ARG_VAL;
                    const key = this.#empty();
                    this.#args_buff.new(key);
                    this.#buff.push(key);
                    this.#skip(2);
                    this.#buff.push('="');

                    if (key.length === 0) {
                      state = STATES.PLAIN;
                      this.#emit_token(TOKEN_TYPES.LITERAL, this.#flush());
                    }
                  } else {
                    state = STATES.PLAIN;
                    this.#take();
                    this.#buff.push(this.#empty());
                    this.#emit_token(TOKEN_TYPES.LITERAL, this.#flush());
                  }
                  break;
                default:
                  this.#take();
                  break;
              }
              break;
            case COMPONENT_STATES.INLINE_ARG_VAL:
              switch (this.#peek()) {
                case '"':
                  component_state = COMPONENT_STATES.END_OR_INLINE_ARG;
                  const val = this.#empty();
                  this.#args_buff.add_str(val);
                  this.#buff.push(val);
                  this.#skip();
                  this.#buff.push('"');

                  if (!this.#args_buff.build()) {
                    state = STATES.PLAIN;
                    this.#emit_token(TOKEN_TYPES.LITERAL, this.#flush());
                  }
                  break;
                case '\\':
                  if (this.#peek() === '$') {
                    const val = this.#empty();
                    this.#args_buff.add_str(val);
                    this.#buff.push(val);
                    this.#skip();
                    this.#buff.push('\\');
                  }
                  this.#take();
                  break;
                case '$':
                  if (this.#peek() === '{') {
                    component_state = COMPONENT_STATES.INLINE_ARG_VAL_PROP;
                    const val = this.#empty();
                    this.#args_buff.add_str(val);
                    this.#buff.push(val);
                    this.#skip(2);
                    this.#buff.push('${');
                  } else this.#take();
                  break;
                default:
                  this.#take();
                  break;
              }
              break;
            case COMPONENT_STATES.INLINE_ARG_VAL_PROP:
              switch (this.#peek()) {
                case '"':
                  state = STATES.PLAIN;
                  this.#take_all();
                  this.#buff.push(this.#empty());
                  this.#emit_token(TOKEN_TYPES.LITERAL, this.#flush());
                  break;
                case '}':
                  component_state = COMPONENT_STATES.INLINE_ARG_VAL;
                  const prop = this.#empty();
                  this.#args_buff.add_prop(prop);
                  this.#buff.push(prop);
                  this.#skip();
                  this.#buff.push('}');
                  if (prop.length === 0) {
                    state = STATES.PLAIN;
                    this.#emit_token(TOKEN_TYPES.LITERAL, this.#flush());
                  }
                  break;
                default:
                  this.#take();
                  break;
              }
              break;
            default:
              state = STATES.ERROR;
              ERR(`INVALID component_state: ${component_state}`);
              break;
          }
          break;
        case STATES.ERROR:
        default:
          ERR('ERROR STATE OHHH nOOOOOOO');
          return [];
      }
    }

    this.#take_all();
    this.#buff.push(this.#empty());
    this.#emit_token(TOKEN_TYPES.LITERAL, this.#flush());
    return this.#tokens;
  }
}
