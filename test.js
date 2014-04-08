var metrics = require('./metrics.js');
var assert = require('assert');
var util = require('util');

var props = { };
for (var i in metrics) {
  props[i] = metrics[i];
}

module.exports = {
  'afterEach': function() {
    for (var i in props) { metrics[i] = props[i]; }
  },
  'testing watch': {
    'module, seen and infected are passed through': function(done) {
      metrics._topLevelModule = { foo: 'bar' };
      var callback = function() { return 'test'; };
      metrics._findModules = function(path, file, cb, topLevelModule, seen, infected) {
        assert.equal(callback, cb);
        assert.deepEqual(topLevelModule, { foo: 'bar' });
        assert.deepEqual(seen, [ ]);
        assert.deepEqual(infected, [ ]);
        done();
      };
      metrics.watch(null, callback);
    },
    'when url only contains the path': function(done) {
      metrics._findModules = function(path, file) {
        assert.equal(path.toString(), '//path/to/file\\.js/');
        assert.equal(file.toString(), '//path/to/file\\.js/');
        done();
      };
      metrics.watch('/path/to/file.js');
    },
    'replaces * in path': function(done) {
      metrics._findModules = function(path, file) {
        assert.equal(path.toString(), '//path/.*?/file\\.js/');
        assert.equal(file.toString(), '//path/.*?/file\\.js/');
        done();
      };
      metrics.watch('/path/*/file.js');
    },
    'splits the url': function(done) {
      metrics._findModules = function(path, file) {
        assert.equal(path.toString(), '//path/to/file\\.js:exports\\.path\\.to\\.function/');
        assert.equal(file.toString(), '//path/to/file\\.js/');
        done();
      };
      metrics.watch('/path/to/file.js:exports.path.to.function');
    },
    'to replace * when the string only contains *': function(done) {
      metrics._findModules = function(path, file) {
        assert.equal(path.toString(), '/.*?/');
        assert.equal(file.toString(), '/.*?/');
        done();
      };
      metrics.watch('*');
    },
    'when path is an empty string': function(done) {
      metrics._findModules = function(path, file) {
        assert.equal(path.toString(), '/(?:)/');
        assert.equal(file.toString(), '/(?:)/');
        done();
      };
      metrics.watch('');
    },
  },
  'testing listUris': {
    'to list uris': function(done) {
      metrics.watch = function(number) {
        assert.equal(number, '1234567890');
        done();
      };
      metrics.listUris();
    },
  },
  'testing _findModules': {
    'full test': function(done) {
      var mod =
        { filename: 'foo1', exports: { }, children: [
          { filename: 'foo2', exports: { }, children: [
            { filename: 'bar3', exports: { }, children: [ ] },
            { filename: 'foo4', exports: { }, children: [ ] }
          ] }
        ] };
      mod.children.push(mod);
      var callCount = 3;
      var args = [ ];
      metrics._findFunctions = function(path, callback, item, prop, funcUri, seen, infected) {
        callCount--;
        args.push(arguments);
        if(callCount === 0) checkAndFinish();
      }
      var checkAndFinish = function() {
        var allChildren = [ mod, mod.children[0], mod.children[0].children[0], mod.children[0].children[1] ];
        assert.equal(args[0]['0'], 'foo');
        assert.equal(args[0]['1'], 'bar');
        assert.deepEqual(args[0]['2'], { filename: 'foo4', exports: {}, children: [] });
        assert.equal(args[0]['3'], 'exports');
        assert.equal(args[0]['4'], 'foo4:exports');
        assert.deepEqual(args[0]['5'], allChildren);
        assert.deepEqual(args[0]['6'], []);

        assert.equal(args[1]['0'], 'foo');
        assert.equal(args[1]['1'], 'bar');
        assert.deepEqual(args[1]['2'], { filename: 'foo2', exports: {}, children: mod.children[0].children });
        assert.equal(args[1]['3'], 'exports');
        assert.equal(args[1]['4'], 'foo2:exports');
        assert.deepEqual(args[1]['5'], allChildren);
        assert.deepEqual(args[1]['6'], []);

        assert.equal(args[2]['0'], 'foo');
        assert.equal(args[2]['1'], 'bar');
        assert.deepEqual(args[2]['2'], { filename: 'foo1', exports: {}, children: mod.children });
        assert.equal(args[2]['3'], 'exports');
        assert.equal(args[2]['4'], 'foo1:exports');
        assert.deepEqual(args[2]['5'], allChildren);
        assert.deepEqual(args[2]['6'], []);

        done();
      };
      metrics._findModules('foo', /foo/, 'bar', mod, [ ], [ ]);
    }
  },
  'testing _findFunctions': {
    'skips getters': function(done) {
      var tmp = metrics._findFunctions;
      metrics._findFunctions = function() { throw new Error('nope'); };
      metrics._infectFunction = function() { throw new Error('nope'); };
      var obj = { };
      var getterCount = 0;
      Object.defineProperty(obj, 'getter', {
        get: function() { getterCount++; }
      });
      tmp.call(metrics, null, null, obj, 'getter');
      assert.equal(getterCount, 0);
      done();
    },
    'stops on deja-vu': function(done) {
      var tmp = metrics._findFunctions;
      metrics._findFunctions = function() { throw new Error('nope'); };
      metrics._infectFunction = function() { throw new Error('nope'); };
      var obj = { foo: 'bar' };
      tmp.call(metrics, null, null, obj, 'foo', null, [ 'bar' ]);
      done();
    },
    'stops after 4 property levels': function(done) {
      var tmp = metrics._findFunctions;
      metrics._findFunctions = function() { throw new Error('nope'); };
      metrics._infectFunction = function() { throw new Error('nope'); };
      var obj = { foo: 'bar' };
      tmp.call(metrics, null, null, obj, 'foo', ':exports.a.b.c.d.e', [ ]);
      done();
    },
    'invoked with matching function': function(done) {
      var tmp = metrics._findFunctions;
      var callback = function() { };
      metrics._findFunctions = function(path, cb, item, prop) {
        if (['prototype', 'sampleProperty'].indexOf(prop) === -1) throw new Error('nope');
      };
      metrics._infectFunction = function(cb, item, prop, funcUri, seen, infected) {
        assert.equal(callback, cb);
        assert.equal(item, obj);
        assert.equal(prop, 'foo');
        assert.equal(funcUri, ':exports.foo');
        assert.deepEqual(seen, [ 1, obj.foo ]);
        assert.deepEqual(infected, [ 2 ]);
        item[prop] = function() { return 'test' ;};
      };
      var obj = { foo: function() { return 'bar'; } };
      Object.defineProperty(obj.foo, 'getter', {
        get: function() { throw new Error('nope'); }
      });
      obj.foo.sampleProperty = 'foobar';
      tmp.call(metrics, /exports.foo/, callback, obj, 'foo', ':exports.foo', [ 1 ], [ 2 ]);
      assert.equal(obj.foo.sampleProperty, 'foobar');
      assert.equal(obj.foo(), 'test');
      // the getter should be stripped out
      assert.ok(!obj.foo.hasOwnProperty('getter'));
      done();
    },
    'invoked with non-matching function': function(done) {
      var tmp = metrics._findFunctions;
      var callback = function() { };
      metrics._findFunctions = function(path, cb, item, prop) {
        if (['prototype', 'sampleProperty'].indexOf(prop) === -1) throw new Error('nope');
      };
      metrics._infectFunction = function() { throw new Error('nope') };
      var obj = { foo: function() { return 'bar'; } };
      Object.defineProperty(obj.foo, 'getter', {
        get: function() { throw new Error('nope'); }
      });
      obj.foo.sampleProperty = 'foobar';
      tmp.call(metrics, /exports.bar/, callback, obj, 'foo', ':exports.foo', [ 1 ], [ 2 ]);
      assert.equal(obj.foo.sampleProperty, 'foobar');
      assert.equal(obj.foo(), 'bar');
      assert.ok(obj.foo.hasOwnProperty('getter'));
      done();
    },
    'invoked with object': function(done) {
      var tmp = metrics._findFunctions;
      var callback = function() { };
      var foundCount = 0;
      metrics._findFunctions = function(path, cb, item, prop) {
        if (['a', 'b', 'c'].indexOf(prop) === -1) throw new Error('nope');
        foundCount++;
      };
      metrics._infectFunction = function() { throw new Error('nope') };
      var obj = { foo: { a: 1, b: 2, c: 2 } };
      tmp.call(metrics, /exports.foo.d/, callback, obj, 'foo', ':exports.foo', [ 1 ], [ 2 ]);
      assert.equal(foundCount, 3);
      done();
    },
  },
  'testing _infectFunction': {
    'if its already infected, stop': function() {
      var obj = { };
      obj.func = function(a, b, callback) {
        return callback('test');
      };
      metrics._infectFunction(null, obj, 'func', null, null, [ obj.func ]);
    },
    'should time a function': function() {
      metrics._meaningfulTime = function() { return 'time'; }
      metrics._timeDiff = function() { return 'timediff'; }
      var obj = { };
      obj.func = function(a, b, callback) {
        return callback('test');
      };
      obj.func.prototype = 'test';

      var args = [ ];
      metrics._infectFunction(function() {
        args.push(Array.prototype.slice.call(arguments));
      }, obj, 'func', 'funcUri', [ ], [ ]);

      var callback = function(result) {
        assert.equal(result, 'test');
        return 'foobar';
      };
      obj.func(1, 2, callback);

      assert.deepEqual(args, [ [
        'funcUri',
        { returned: false, argInvoked: 2 },
        { input: [ 1, 2, callback ], output: [ 'test' ] },
        'timediff'
      ], [
        'funcUri',
        { returned: true, argInvoked: null },
        { input: [ 1, 2, callback ], output: [ 'foobar' ] },
        'timediff'
      ] ] );
    },
  },
  'testing _emitData': {
    'input, output, funcUri and duration are passed through': function(done) {
      var callback = function(funcUri, type, params, duration) {
        assert.equal(funcUri, 'funcUri');
        assert.deepEqual(params, {input: 'foo', output: 'bar'});
        assert.equal(duration, 'buzz');
        done();
      };
      metrics._emitData(callback, null, 'funcUri', null, 'foo', 'bar', 'buzz');
    },
    'when type is boolean, its a return': function(done) {
      var callback = function(funcUri, type, params, duration) {
        assert.deepEqual(type, {returned: true, argInvoked: null});
        done();
      };
      metrics._emitData(callback, null, null, true);
    },
    'when type is number, its a callback': function(done) {
      var callback = function(funcUri, type, params, duration) {
        assert.deepEqual(type, {returned: false, argInvoked: 1});
        done();
      };
      metrics._emitData(callback, null, null, 1);
    },
    'checking the scope is correct': function(done) {
      var callback = function(funcUri, type, params, duration) {
        assert.equal(this, 'test');
        done();
      };
      metrics._emitData(callback, 'test');
    }
  },
  'testing timeDiff': {
    'returns the expected value when the oldest time is less than the newest': function(done) {
      var oldest = 3545.11;
      var newest = 5180.78;
      var result = metrics._timeDiff(newest, oldest);
      assert.equal(result, 1635.67);
      done();
    },
    'returns the expected value when the oldest time is greater than the newest': function(done) {
      var oldest = 5180.78;
      var newest = 3545.11;
      var result = metrics._timeDiff(newest, oldest);
      assert.equal(result, 8364.33);
      done();
    },
    'returns zero when both times are the same': function(done) {
      var oldest = 3545.11;
      var newest = 3545.11;
      var result = metrics._timeDiff(newest, oldest);
      assert.equal(result, 0);
      done();
    },
  },
  'testing _meaningfulTime': {
    'returns expected value': function(done) {
      process.hrtime = function() {
        return [1800216, 25];
      };
      var result = metrics._meaningfulTime();
      assert.equal('6000.00ms', result);
      done();
    },
  },
  'big test': function(done) {
    function Parent(m, n, o) {
      // console.log("-- Superclass Instantiated", m, n, o);
      this.otherProp = 'Parent'+m+''+n+''+o;
    }
    var parentGetterVar = 0;
    Parent.prototype = {
      get parentGetter() {
        // console.log("-- Parent prototype getter invoked");
        return this.otherProp.trim() + (parentGetterVar++);
      }
    };

    function Constructor(j, k, l) {
      // To make the Super() call work, it needs to be referenced by it's
      // exported reference. requiring it from another file will suffice
      fakeExports.cons.super_.call(this, j, k, l);
      // console.log("-- Base Class Instantiated", j, k, l);
      this.prop = 'Const'+j+''+k+''+l;
    }
    util.inherits(Constructor, Parent);

    Constructor.staticProperty = 'foo';

    Constructor.staticFunction = function(a, b, c) {
      // console.log("-- Static function invoked", a, b, c);
      return "Static"+a+b+c;
    };

    Constructor.prototype.protoProperty = 'bar';

    Constructor.prototype.protoFunction = function(d, e, f) {
      // console.log("-- Prototype function invoked", d, e, f);
      return "Proto"+d+e+f;
    };

    var getterHiddenVar = 0;
    Object.defineProperty(Constructor.prototype, 'protoGetterProperty', {
      get: function() {
        // console.log("-- Prototype getter invoked");
        return getterHiddenVar++;
      },
      enumerable: true
    });

    Constructor.prototype.asyncFunction = function(a, callback) {
      callback(10+' '+this.prop);
      return 5;
    };

    function test(g, h, i) {
      // console.log("-- Test function invoked", g, h, i);
      return "Test"+g+h+i;
    }

    var fakeExports = {
      cons: Constructor,
      test: test
    };

    var args = [ ];
    metrics._timeDiff = function() { return 123.45 };
    metrics._topLevelModule = { filename: 'test.js', exports: fakeExports };
    metrics.watch('test.js', function(funcUri, type, params, duration) {
      args.push(arguments);
    });

    // Static function should still exist and work
    assert.equal(fakeExports.cons.staticFunction(1, 2, 3), 'Static123');
    // Static function should look the same as the original
    assert.equal(fakeExports.cons.staticFunction.toString().match(/function .*?\((.*?)\)/)[1], 'a, b, c');
    // Constructor should still exist and work
    var test = new fakeExports.cons(1, 2, 3);
    // Constructor should still look the same as the original
    assert.equal(fakeExports.cons.toString().match(/function .*?\((.*?)\)/)[1], 'j, k, l');
    // Constructor should have correct scope
    assert.equal(test.prop, 'Const123');
    assert.equal(test.otherProp, 'Parent123');
    // Constructor should construct objects of the correct type
    assert.ok(test instanceof Constructor);
    assert.ok(test instanceof Parent);
    // Instances Prototype function should still exist and work
    assert.equal(test.protoFunction(1, 2, 3), 'Proto123');
    // Instances Prototype function should still look the same as the original
    assert.equal(test.protoFunction.toString().match(/function .*?\((.*?)\)/)[1], 'd, e, f');
    // Instances Prototype getter should still be a getter
    getterHiddenVar = 6;
    assert.equal(test.protoGetterProperty, 6);
    assert.equal(test.protoGetterProperty, 7);
    parentGetterVar = 6;
    assert.equal(test.parentGetter, 'Parent1236');
    assert.equal(test.parentGetter, 'Parent1237');
    // Static property on Constructor should still exist and have same value
    assert.equal(fakeExports.cons.staticProperty, 'foo');
    // Static property on Prototype should still exist and have same value
    assert.equal(test.protoProperty, 'bar');
    // Exported function should still exist and work
    assert.equal(fakeExports.test(1, 2, 3), 'Test123');
    // Exported function should still exist and look the same as the original
    assert.equal(fakeExports.test.toString().match(/function .*?\((.*?)\)/)[1], 'g, h, i');
    // Async function should still work
    var cb = function(number) {
      assert.equal(number, '10 Const123');
    };
    var result = test.asyncFunction(6, cb)
    assert.equal(result, 5);

    // console.log(args);
    assert.deepEqual(args[0]["0"], "test.js:exports.cons.staticFunction");
    assert.deepEqual(args[0]["1"], { "returned": true, "argInvoked": null });
    assert.deepEqual(args[0]["2"], { "input": [ 1, 2, 3 ], "output": [ "Static123" ] });
    assert.deepEqual(args[0]["3"], 123.45 );
    assert.deepEqual(args[1]["0"], "test.js:exports.cons.super_");
    assert.deepEqual(args[1]["1"], { "returned": true, "argInvoked": null });
    assert.deepEqual(args[1]["2"], { "input": [ 1, 2, 3 ], "output": [ undefined ] });
    assert.deepEqual(args[1]["3"], 123.45 );
    assert.deepEqual(args[2]["0"], "test.js:exports.cons");
    assert.deepEqual(args[2]["1"], { "returned": true, "argInvoked": null });
    assert.deepEqual(args[2]["2"], { "input": [ 1, 2, 3 ], "output": [ undefined ] });
    assert.deepEqual(args[2]["3"], 123.45 );
    assert.deepEqual(args[3]["0"], "test.js:exports.cons.prototype.protoFunction");
    assert.deepEqual(args[3]["1"], { "returned": true, "argInvoked": null });
    assert.deepEqual(args[3]["2"], { "input": [ 1, 2, 3 ], "output": [ "Proto123" ] });
    assert.deepEqual(args[3]["3"], 123.45 );
    assert.deepEqual(args[4]["0"], "test.js:exports.test");
    assert.deepEqual(args[4]["1"], { "returned": true, "argInvoked": null });
    assert.deepEqual(args[4]["2"], { "input": [ 1, 2, 3 ], "output": [ "Test123" ] });
    assert.deepEqual(args[4]["3"], 123.45 );
    assert.deepEqual(args[5]["0"], "test.js:exports.cons.prototype.asyncFunction");
    assert.deepEqual(args[5]["1"], { "returned": false, "argInvoked": 1 });
    assert.deepEqual(args[5]["2"], { "input": [ 6, cb ], "output": [ "10 Const123" ] });
    assert.deepEqual(args[5]["3"], 123.45 );
    assert.deepEqual(args[6]["0"], "test.js:exports.cons.prototype.asyncFunction");
    assert.deepEqual(args[6]["1"], { "returned": true, "argInvoked": null });
    assert.deepEqual(args[6]["2"], { "input": [ 6, cb ], "output": [ 5 ] });
    assert.deepEqual(args[6]["3"], 123.45 );

    done();
  }
};
