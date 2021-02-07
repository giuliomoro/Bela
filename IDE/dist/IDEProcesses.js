"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.run = exports.build = exports.syntax = void 0;
var MakeProcess_1 = require("./MakeProcess");
exports.syntax = new MakeProcess_1.MakeProcess('syntax');
exports.build = new MakeProcess_1.MakeProcess('all');
exports.run = new MakeProcess_1.MakeProcess('runide');
