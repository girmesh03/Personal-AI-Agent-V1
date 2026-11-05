#!/usr/bin/env node

/**
 * @file installFonts.js
 * @description Automated user-space font installer for headless Linux environments (Render / Docker).
 * Copies TrueType Ethiopic fonts into Fontconfig user directory (~/.local/share/fonts)
 * and refreshes the font cache with fc-cache.
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const FONTS_SRC = path.resolve(__dirname, '../src/assets/fonts');

async function installFonts() {
  console.log('[installFonts] Checking font installation environment...');

  if (process.platform !== 'linux') {
    console.log(`[installFonts] Platform is ${process.platform}. Linux fontconfig installation skipped.`);
    return;
  }

  try {
    const homedir = os.homedir();
    const targetDir = path.join(homedir, '.local', 'share', 'fonts', 'noto-sans-ethiopic');
    const legacyDir = path.join(homedir, '.fonts', 'noto-sans-ethiopic');
    const configDir = path.join(homedir, '.config', 'fontconfig');

    fs.mkdirSync(targetDir, { recursive: true });
    fs.mkdirSync(legacyDir, { recursive: true });
    fs.mkdirSync(configDir, { recursive: true });

    if (!fs.existsSync(FONTS_SRC)) {
      console.warn(`[installFonts] Warning: Source fonts directory not found at ${FONTS_SRC}`);
      return;
    }

    // Install user fonts.conf
    const srcConf = path.join(FONTS_SRC, 'fonts.conf');
    if (fs.existsSync(srcConf)) {
      const dstConf = path.join(configDir, 'fonts.conf');
      fs.copyFileSync(srcConf, dstConf);
      console.log(`[installFonts] Installed user fonts.conf to ${dstConf}`);
    }

    const fontFiles = fs.readdirSync(FONTS_SRC).filter((f) => f.endsWith('.ttf') || f.endsWith('.otf'));
    console.log(`[installFonts] Found ${fontFiles.length} font binaries in ${FONTS_SRC}`);

    for (const font of fontFiles) {
      const srcPath = path.join(FONTS_SRC, font);
      const dstPath1 = path.join(targetDir, font);
      const dstPath2 = path.join(legacyDir, font);

      fs.copyFileSync(srcPath, dstPath1);
      fs.copyFileSync(srcPath, dstPath2);
      console.log(`[installFonts] Installed ${font} to ~/.local/share/fonts/`);
    }

    // Attempt to refresh fontconfig cache
    try {
      execSync('fc-cache -f ~/.local/share/fonts/ 2>/dev/null || fc-cache -f 2>/dev/null', {
        stdio: 'inherit',
        timeout: 10000,
      });
      console.log('[installFonts] Fontconfig cache refreshed successfully via fc-cache.');
    } catch (cacheErr) {
      console.log('[installFonts] Note: fc-cache returned non-zero or not found; relying on runtime FONTCONFIG_PATH.');
    }

    // Verify and ensure execution permissions on ffmpeg/ffprobe binaries if bundled
    try {
      const ffmpegInstaller = await import('@ffmpeg-installer/ffmpeg').then((m) => m.default || m).catch(() => null);
      if (ffmpegInstaller?.path && fs.existsSync(ffmpegInstaller.path)) {
        fs.chmodSync(ffmpegInstaller.path, 0o755);
        console.log(`[installFonts] Set 0755 execution permissions on bundled ffmpeg: ${ffmpegInstaller.path}`);
      }
      const ffprobeInstaller = await import('@ffprobe-installer/ffprobe').then((m) => m.default || m).catch(() => null);
      if (ffprobeInstaller?.path && fs.existsSync(ffprobeInstaller.path)) {
        fs.chmodSync(ffprobeInstaller.path, 0o755);
        console.log(`[installFonts] Set 0755 execution permissions on bundled ffprobe: ${ffprobeInstaller.path}`);
      }
    } catch (binPermErr) {
      console.log('[installFonts] Note: ffmpeg/ffprobe binary permission check skipped:', binPermErr.message);
    }

    console.log('[installFonts] Linux font installation complete.');
  } catch (err) {
    console.warn('[installFonts] Non-fatal font installation error:', err.message);
  }
}

installFonts();
