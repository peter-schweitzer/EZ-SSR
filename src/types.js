/** @typedef {'string'|'number'|'boolean'|'object'|'any'} PropTypeStr */

/** @typedef {{type: 'prop', info: {id: string, type: PropTypeStr}} | {type: 'attr', info: {id: string}} | {type: 'sub' | 'subs', info: {name: string, id: string, inline_props: LUT<InlineProp>}}} SegmentItem */

/** @typedef {import('./Component').Component} Component */

/** @typedef {import('./InlineProp').InlineProp} InlineProp */
