"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.set_verbose = exports.set_local_dev = exports.verbose = exports.local_dev = void 0;
exports.local_dev = false;
exports.verbose = 0;
function set_local_dev(state) { exports.local_dev = state; }
exports.set_local_dev = set_local_dev;
;
function set_verbose(vb) { exports.verbose = vb; }
exports.set_verbose = set_verbose;
;
