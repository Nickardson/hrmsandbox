/** hrmsandbox Engine
 *
 * Copyright (C) 2015 Christopher A Watford
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 * THE SOFTWARE.
 */
"use strict";

var hrm = require('./hrm.pegjs.js');

var MAX_ITERATIONS = 1000;

var HrmProgram = function (program, options) {
  if (!(this instanceof HrmProgram)) {
    return new HrmProgram(options);
  }

  options = options || {};

  this._program = program || { statements: [] };
  this.maxIterations = options.maxIterations || MAX_ITERATIONS;
  this.debug = options.debug;
  this.inbox = [];
  this.variables = {};
  this.outbox = [];
  this._hand = undefined;
  this._ip = 0; // instruction pointer

  // assign labels to their instruction offsets
  this._instructionCount = 0;
  this._labels = {};
  for (var ix = 0; ix < this._program.statements.length; ++ix) {
    var stmt = this._program.statements[ix];
    if (stmt.type == 'label') {
      this._labels[stmt.name] = ix;
    }
    else {
      this._instructionCount++;
    }
  }
};

HrmProgram.prototype.execute = function (options) {
  options = options || {};

  this.inbox = options.inbox || [];
  this.variables = options.variables || {};
  this.outbox = [];

  this._ip = 0;
  this._hand = undefined;

  var statements = this._program.statements;
  var iterations = 0, labelHit = 0;
  while (this._ip >= 0 &&
         this._ip < statements.length &&
         iterations++ < this.maxIterations) {
    var stmt = statements[this._ip++];
    switch (stmt.type) {
      case 'label':
        labelHit++;
        continue;

      case 'inbox':
        this._hand = this.do_inbox();
        break;

      case 'outbox':
        this._hand = this.do_outbox();
        break;

      case 'copyfrom':
        this._hand = this.do_copyfrom(stmt.var);
        break;

      case 'copyto':
        this._hand = this.do_copyto(stmt.var);
        break;

      case 'add':
      case 'sub':
      case 'bump+':
      case 'bump-':
        this._hand = this.do_math(stmt.type, stmt.var);
        break;

      case 'jump':
        this._ip = this.do_jump(stmt.label);
        break;

      case 'jump_zero':
        this._ip = this.do_jumpz(stmt.label);
        break;

      case 'jump_negative':
        this._ip = this.do_jumpneg(stmt.label);
        break;

      default:
        throw new Error('Unknown instruction: ' + stmt.type);
    }
  }

  return {
    iterations: iterations - labelHit,
    instructions: this._instructionCount,
    inbox: this.inbox,
    outbox: this.outbox,
    variables: this.variables
  };
};

HrmProgram.prototype.do_inbox = function () {
  if (this.inbox.length) {
    return this.inbox.shift();
  } else {
    this._ip = -1;
    return undefined;
  }
};

HrmProgram.prototype.do_outbox = function () {
  if (this._hand !== undefined) {
    this.outbox.unshift(this._hand);
    return undefined;
  }
  else {
    throw new Error('Nothing in your hand to outbox!');
  }
};

HrmProgram.prototype.isDefined = function (variable) {
  return this.variables.hasOwnProperty(variable) &&
         this.variables[variable] !== undefined;
};

HrmProgram.prototype.do_copyfrom = function (variable) {
  if (this.isDefined(variable)) {
    return this.variables[variable];
  }
  else {
    throw new Error('Cannot copyfrom empty or non-existent variable: ' + variable);
  }
};

HrmProgram.prototype.do_copyto = function (variable) {
  if (this._hand !== undefined) {
    /*jshint -W093 */
    return this.variables[variable] = this._hand;
  }
  else {
    throw new Error('Cannot copy to variable with an empty hand');
  }
};

HrmProgram.prototype.do_jump = function (label) {
  if (!this._labels.hasOwnProperty(label)) {
    throw new Error('Unknown label: ' + label);
  }

  return this._labels[label];
};

HrmProgram.prototype.do_jumpz = function (label) {
  if (this._hand === undefined) {
    throw new Error('Cannot jumpz with an empty hand');
  }
  else if (!this._labels.hasOwnProperty(label)) {
    throw new Error('Unknown label: ' + label);
  }

  if (this._hand === 0) {
    return this._labels[label];
  }
  else {
    return this._ip;
  }
};

HrmProgram.prototype.do_jumpneg = function (label) {
  if (this._hand === undefined) {
    throw new Error('Cannot jumpneg with an empty hand');
  }
  else if (!this._labels.hasOwnProperty(label)) {
    throw new Error('Unknown label: ' + label);
  }

  if (this._hand < 0) {
    return this._labels[label];
  }
  else {
    return this._ip;
  }
};

HrmProgram.prototype.do_math = function(op, variable) {
  if (this._hand === undefined) {
    throw new Error('Cannot ' + op + ' with an empty hand.');
  }
  else if (!this.isDefined(variable)) {
    throw new Error('Cannot ' + op + ' with an undefined variable: ' + variable);
  }

  switch (op) {
    case 'add':
      return this._hand + this.variables[variable];
    case 'sub':
      return this._hand - this.variables[variable];
    case 'bump+':
      return ++this.variables[variable];
    case 'bump-':
      return --this.variables[variable];
    default:
      throw new Error('Unsupported math operation: ' + op);
  }
};

function Parse(source, options) {
  var program = hrm.parse(source);
  return new HrmProgram(program, options);
}

module.exports = {
  parse: Parse
};