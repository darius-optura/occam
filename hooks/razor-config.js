#!/usr/bin/env node
// razor — shared configuration resolver
//
// Razor is either on or off. Resolution order:
//   1. RAZOR_DEFAULT_MODE=on environment variable
//   2. Config file "enabled": true field:
//      - $XDG_CONFIG_HOME/razor/config.json (any platform, if set)
//      - ~/.config/razor/config.json (macOS / Linux fallback)
//      - %APPDATA%\razor\config.json (Windows fallback)
//   3. off — a plugin must not compress a teammate's output without asking

const fs = require('fs');
const path = require('path');
const os = require('os');

function getConfigDir() {
  if (process.env.XDG_CONFIG_HOME) {
    return path.join(process.env.XDG_CONFIG_HOME, 'razor');
  }
  if (process.platform === 'win32') {
    return path.join(
      process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'),
      'razor'
    );
  }
  return path.join(os.homedir(), '.config', 'razor');
}

function getConfigPath() {
  return path.join(getConfigDir(), 'config.json');
}

function isEnabledByDefault() {
  if ((process.env.RAZOR_DEFAULT_MODE || '').trim().toLowerCase() === 'on') return true;

  try {
    return JSON.parse(fs.readFileSync(getConfigPath(), 'utf8')).enabled === true;
  } catch (e) {
    return false;
  }
}

function safeWriteFlag(flagPath, content) {
  const debug = process.env.RAZOR_DEBUG === '1';
  try {
    const flagDir = path.dirname(flagPath);
    fs.mkdirSync(flagDir, { recursive: true });

    let realFlagDir;
    try {
      const lstat = fs.lstatSync(flagDir);
      if (lstat.isSymbolicLink()) {
        realFlagDir = fs.realpathSync(flagDir);
        const realStat = fs.statSync(realFlagDir);
        if (!realStat.isDirectory()) {
          if (debug) process.stderr.write(`[razor] safeWriteFlag: symlink target ${realFlagDir} is not a directory\n`);
          return;
        }
        if (typeof process.getuid === 'function') {
          if (realStat.uid !== process.getuid()) {
            if (debug) process.stderr.write(`[razor] safeWriteFlag: symlink target ${realFlagDir} owned by uid ${realStat.uid}, not current user ${process.getuid()}\n`);
            return;
          }
        } else {
          const home = os.homedir();
          const normalizedReal = path.resolve(realFlagDir);
          const normalizedHome = path.resolve(home);
          if (!normalizedReal.toLowerCase().startsWith(normalizedHome.toLowerCase() + path.sep) &&
              normalizedReal.toLowerCase() !== normalizedHome.toLowerCase()) {
            if (debug) process.stderr.write(`[razor] safeWriteFlag: symlink target ${normalizedReal} is outside home directory ${normalizedHome}\n`);
            return;
          }
        }
      } else {
        realFlagDir = flagDir;
      }
    } catch (e) {
      return;
    }

    const realFlagPath = path.join(realFlagDir, path.basename(flagPath));
    try {
      if (fs.lstatSync(realFlagPath).isSymbolicLink()) return;
    } catch (e) {
      if (e.code !== 'ENOENT') return;
    }

    const tempPath = path.join(realFlagDir, `.razor-active.${process.pid}.${Date.now()}`);
    const O_NOFOLLOW = typeof fs.constants.O_NOFOLLOW === 'number' ? fs.constants.O_NOFOLLOW : 0;
    const flags = fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | O_NOFOLLOW;
    let fd;
    try {
      fd = fs.openSync(tempPath, flags, 0o600);
      fs.writeSync(fd, String(content));
      try { fs.fchmodSync(fd, 0o600); } catch (e) { /* best-effort on Windows */ }
    } finally {
      if (fd !== undefined) fs.closeSync(fd);
    }
    fs.renameSync(tempPath, realFlagPath);
  } catch (e) { /* silent */ }
}

const MAX_FLAG_BYTES = 64;

function isActive(flagPath) {
  try {
    let st;
    try {
      st = fs.lstatSync(flagPath);
    } catch (e) {
      return false;
    }
    if (st.isSymbolicLink() || !st.isFile()) return false;
    if (st.size > MAX_FLAG_BYTES) return false;

    const O_NOFOLLOW = typeof fs.constants.O_NOFOLLOW === 'number' ? fs.constants.O_NOFOLLOW : 0;
    const flags = fs.constants.O_RDONLY | O_NOFOLLOW;
    let fd;
    let out;
    try {
      fd = fs.openSync(flagPath, flags);
      const buf = Buffer.alloc(MAX_FLAG_BYTES);
      const n = fs.readSync(fd, buf, 0, MAX_FLAG_BYTES, 0);
      out = buf.slice(0, n).toString('utf8');
    } finally {
      if (fd !== undefined) fs.closeSync(fd);
    }

    return out.trim().toLowerCase() === 'on';
  } catch (e) {
    return false;
  }
}

module.exports = { isEnabledByDefault, getConfigDir, getConfigPath, safeWriteFlag, isActive };
