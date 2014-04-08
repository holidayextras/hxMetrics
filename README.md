# hxMetrics

This is a NodeJS module that allows you to reach inside any other module, without needing a reference, and instrument it's functions to facilitate custom metrics and logging.


## Sample usage:
```
var hxmetrics = require('hxmetrics');

var uri = 'node_modules/mysql/lib/Connection.js:exports.prototype.query';
hxmetrics.watch(uri, function(funcUri, type, params, duration) {

  // Send data off to your preferred dashboard/tracking/monitoring tool tracking here

});
```

The first parameter is a uri taking the form of `path/to/file.js:exports.path.to.function`. You can use regexp characters to target specific paths.

`js/*/myFile.js:exports.MyClass.prototype.` will match any file named `myFile.js` in any folder within `js`, and will watch any functions attached to `MyClass.prototype`.

`js/*/myFile.js:exports.MyClass$` will match any file named `myFile.js` in any folder within `js`, but will only watch the constructor function.


The callback is invoked with the following params:
```
  funcUri: 'path/to.js:exports.code' // path to the function matching the uri
  type: {
    returned: true/false,       // true if the function has simply returned
    argInvoked: null/0/1/2/..   // if a callback has fired, it's the argument number
  },
  params: {
    input: [ 'foobar', function() { } ],  // The params the function was invoked with
    output: [ null, true ]                // The return value or callback params
  },
  duration: 0.12                // milliseconds passed since function was invoked
```
In addition, `this` within the callback is the object on which the traced function is attached to.

It's possible to list all the uris within a project:
```
hxmetrics.listUris();
```
...be prepared for a lot of console output!

You can enable debug mode with `hxmetrics.debug = true` which will cause hxMetrics to print out every function it's monitoring to help target your uris to the right pieces of code.

