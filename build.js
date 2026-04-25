#!/usr/bin/env node
// Cross-platform build script — works on Linux (Vercel) and Windows
const fs = require('fs');
const path = require('path');

function mkdirp(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function copyFile(src, dest) {
  mkdirp(path.dirname(dest));
  fs.copyFileSync(src, dest);
}

function copyDir(src, dest) {
  mkdirp(dest);
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      copyFile(srcPath, destPath);
    }
  }
}

const root = __dirname;
const publicDir = path.join(root, 'public');

mkdirp(publicDir);
copyFile(path.join(root, 'landing', 'index.html'), path.join(publicDir, 'index.html'));
copyDir(path.join(root, 'pwa'), path.join(publicDir, 'pwa'));

console.log('✓ Build complete → public/');
