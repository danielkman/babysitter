#!/usr/bin/env node
'use strict';

var path = require('path');
var shared = require('../bin/install-shared');

var workspace = process.cwd();
for (var i = 0; i < process.argv.length; i++) {
  if (process.argv[i] === '--workspace' && process.argv[i + 1]) {
    workspace = path.resolve(process.argv[i + 1]);
  }
}

var dest = shared.getPluginHome('workspace');
console.log('[babysitter] Team install to ' + dest);

var src = process.env.PLUGIN_PACKAGE_ROOT || path.resolve(__dirname, '..');
shared.copyDir(src, dest);
shared.runPostInstall(dest);
console.log('[babysitter] Team install complete.');
