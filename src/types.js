/** @typedef {'string'|'number'|'boolean'|'object'|'any'} PropTypeStr */

/** @typedef {{type: 'prop', info: {id: string, type: PropTypeStr}} | {type: 'attr', info: {id: string}} | {type: 'attrs', info: {id: string}} | {type: 'sub', info: {name: string, id: string, inline_props: LUT<InlineProp>}} | {type: 'subs', info: {name: string, id: string, inline_props: LUT<InlineProp>}}} SegmentItem */

/** @typedef {import('./Component').Component} Component */

/** @typedef {import('./InlineProp').InlineProp} InlineProp */

/** @typedef {'literal'|'attr'|'attrs'|'prop'|'sub'|'subs'} TokenType */

/** @typedef {{type: "str"|"prop"|"props", val: string}} InlineArgData */
/** @typedef {{name: string, data: InlineArgData[]}} InlineArgs */

/** @typedef {{type: 'literal', data: string}} LiteralLexerToken */
/** @typedef {{type: 'attr', data: string }} AttrLexerToken */
/** @typedef {{type: 'attrs', data: '$*'}} AttrsLexerToken */
/** @typedef {{type: 'prop', data: {name: string, type: PropTypeStr}}} PropLexerToken */
/** @typedef {{type: 'sub'|'subs', data: {name: string, id: string, args: InlineArgs[]}}} ComponentLexerToken */

/** @typedef {LiteralLexerToken | AttrLexerToken | AttrsLexerToken | PropLexerToken | ComponentLexerToken} LexerToken */
