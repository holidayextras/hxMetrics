/*
Copyright 2014 Holiday Extras

This file is part of hxMetrics.

hxMetrics is free software: you can redistribute it and/or modify
it under the terms of the GNU General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

hxMetrics is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU General Public License for more details.

You should have received a copy of the GNU General Public License
along with hxMetrics.  If not, see <http://www.gnu.org/licenses/>.
*/

var metrics = { };
module.exports = metrics;

metrics.debug = false;
var topLevelModule = module;
while (topLevelModule.parent) topLevelModule = topLevelModule.parent;
topLevelModule.children.push({ filename: 'http.js', exports: require('http') });
topLevelModule.children.push({ filename: 'https.js', exports: require('https') });
topLevelModule.children.push({ filename: 'fs.js', exports: require('fs') });
metrics._topLevelModule = topLevelModule;

metrics.watch = function(url, callback) {
  var path = '';
  var file = '';
  if ((typeof url == 'string') && (url != '1234567890')) {
    file = url.split(':')[0];
    file = new RegExp(file.replace(/\./g, '\\.').replace(/\*/g, '.*?'));
    path = new RegExp(url.replace(/\./g, '\\.').replace(/\*/g, '.*?'));
  }
  return metrics._findModules(path, file, callback, metrics._topLevelModule, [ ], [ ]);
};

metrics.listVectors = function() {
  metrics.watch('1234567890');
};

metrics._findModules = function(path, file, callback, mod, seen, infected) {
  if (seen.indexOf(mod) !== -1) return;
  seen.push(mod);
  if (mod.children) {
    mod.children.map(function(child) {
      metrics._findModules(path, file, callback, child, seen, infected);
    });
  }
  if (mod.exports && mod.filename.match(file) && (!mod.filename.toLowerCase().match('hxmetrics/metrics.js'))) {
    metrics._findFunctions(path, callback, mod, 'exports', mod.filename+':exports', seen, infected);
  }
};

metrics._findFunctions = function(path, callback, item, prop, funcUri, seen, infected) {
  if (!item.hasOwnProperty(prop) || Object.getOwnPropertyDescriptor(item, prop).get) return;
  var original = item[prop];
  if (seen.indexOf(original) !== -1) return;
  if (funcUri.split(':')[1].split('.').length > 4) return;
  seen.push(original);
  if (item[prop] instanceof Function) {
    if (funcUri.match(path)) {
      metrics._infectFunction(callback, item, prop, funcUri, seen, infected);
      for (var i in original) {
        if (!original.hasOwnProperty(i) || Object.getOwnPropertyDescriptor(original, i).get) continue;
        item[prop][i] = original[i];
      }
    }
    if (path == '1234567890') console.log(funcUri);
    if (item[prop].prototype) {
      metrics._findFunctions(path, callback, item[prop], 'prototype', funcUri+'.prototype', seen, infected);
    }
  }
  if (item[prop] instanceof Object) {
    for (var j in item[prop]) {
      metrics._findFunctions(path, callback, item[prop], j, funcUri+'.'+j, seen, infected);
    }
  }
  return item;
};

metrics._infectFunction = function(clback, item, prop, funcUri, seen, infected) {
  var original = item[prop];
  if (metrics.debug) console.log('hxmetrics: tracking', funcUri);
  if (infected.indexOf(original) !== -1) return;
  infected.push(original);
  item[prop] = function() {
    return (function() {
      var functionInvokedAt = metrics._meaningfulTime();
      var functionArgs = Array.prototype.slice.call(arguments);

      var newFunctionArgs = functionArgs.map(function(arg) {
        if (!(arg instanceof Function)) return arg;
        return function() {
          metrics._emitData(clback, item, funcUri, functionArgs.indexOf(arg), functionArgs, Array.prototype.slice.call(arguments), metrics._timeDiff(metrics._meaningfulTime(), functionInvokedAt));
          return arg.apply(this, Array.prototype.slice.call(arguments));
        };
      });

      var out = original.apply(this, newFunctionArgs);
      metrics._emitData(clback, item, funcUri, true, functionArgs, [ out ], metrics._timeDiff(metrics._meaningfulTime(), functionInvokedAt));
      return out;
    }).apply(this, Array.prototype.slice.call(arguments));
  };

  var dependencies = original.toString().match(/^function .*?\((.*?)\)/);
  if (dependencies) {
    var newFunc = item[prop].toString();
    newFunc = '(function() { return '+newFunc.replace('function ()', 'function ('+dependencies[1]+')')+ '; })()';
    try {
      item[prop] = eval(newFunc);
    } catch(e) { }
  }

  item[prop].prototype = original.prototype;
};

metrics._emitData = function(callback, self, funcUri, type, input, output, duration) {
  return callback.call(self, funcUri, {
    returned: typeof type == 'boolean',
    argInvoked: typeof type == 'number' ? type : null
  }, {
    input: input,
    output: output
  }, duration);
};

metrics._timeDiff = function(newest, oldest) {
  var diff = (parseFloat(newest) - parseFloat(oldest));
  if (diff < 0) {
    diff = ((10000 + parseFloat(newest)) - parseFloat(oldest));
  }
  return parseFloat(diff.toFixed(2));
};

metrics._meaningfulTime = function() {
  var parts = process.hrtime();
  return (((parts[0]*1000)+(parts[1]/1000000))%10000).toFixed(2) + 'ms';
};
