const fs = require('fs');
const path = require('path');

const targets = [
  path.join(__dirname, '..', 'node_modules', 'webpackbar', 'dist', 'index.cjs'),
  path.join(__dirname, '..', 'node_modules', 'webpackbar', 'dist', 'index.mjs')
];

const replacements = [
  ['__publicField(this, "options");', '__publicField(this, "webpackbarOptions");'],
  ['this.options = Object.assign({}, DEFAULTS, options);', 'this.webpackbarOptions = Object.assign({}, DEFAULTS, options);'],
  ['...this.options.reporters || [],', '...this.webpackbarOptions.reporters || [],'],
  ['this.options.reporter', 'this.webpackbarOptions.reporter'],
  ['if (this.options.profile', 'if (this.webpackbarOptions.profile'],
  ['if (this.options[reporter] === false)', 'if (this.webpackbarOptions[reporter] === false)'],
  ['options2 = { ...this.options[reporter], ...options2 };', 'options2 = { ...this.webpackbarOptions[reporter], ...options2 };'],
  ['return globalStates[this.options.name];', 'return globalStates[this.webpackbarOptions.name];'],
  ['if (!this.states[this.options.name]) {', 'if (!this.states[this.webpackbarOptions.name]) {'],
  ['this.states[this.options.name] = {', 'this.states[this.webpackbarOptions.name] = {'],
  ['color: this.options.color,', 'color: this.webpackbarOptions.color,'],
  ['name: startCase(this.options.name)', 'name: startCase(this.webpackbarOptions.name)']
];

for (const target of targets) {
  if (!fs.existsSync(target)) {
    continue;
  }

  const original = fs.readFileSync(target, 'utf8');
  if (original.includes('webpackbarOptions')) {
    continue;
  }

  let next = original;
  for (const [from, to] of replacements) {
    next = next.replace(from, to);
  }

  if (next === original) {
    throw new Error(`webpackbar patch did not change ${target}`);
  }

  fs.writeFileSync(target, next);
  process.stdout.write(`patched ${path.relative(process.cwd(), target)}\n`);
}
