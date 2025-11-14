#!/usr/bin/env bun

/**
 * Cross-platform font installer for Resolve-Bold.otf
 *
 * This script installs the Resolve-Bold font on Windows, Linux, and macOS.
 *
 * Usage:
 *   bun font/add.ts
 */

import { existsSync, copyFileSync, mkdirSync } from "fs";
import { join, resolve } from "path";
import { execSync } from "child_process";
import { homedir, platform } from "os";
import * as logger from "../src/logger.ts";

// Font file path (relative to project root since script is in font/ directory)
const FONT_FILE = "font/Resolve-Bold.otf";
const FONT_NAME = "Resolve-Bold.otf";
const SERVICE_NAME = "FontInstaller";

/**
 * Install font on Windows
 */
function installWindows(): void {
  logger.step(SERVICE_NAME, "Installing Resolve-Bold font on Windows");

  const fontPath = resolve(FONT_FILE);
  if (!existsSync(fontPath)) {
    throw new Error(`Font file not found: ${fontPath}`);
  }

  // Windows fonts directory
  const fontsDir = join(process.env.WINDIR || "C:\\Windows", "Fonts");
  const destPath = join(fontsDir, FONT_NAME);

  try {
    // Copy font to Windows Fonts directory
    copyFileSync(fontPath, destPath);
    logger.success(SERVICE_NAME, `Font copied to: ${destPath}`);

    // Register font in Windows Registry using PowerShell
    const psCommand = `
      $fontName = "Resolve Bold (TrueType)"
      $fontFile = "${FONT_NAME}"
      New-ItemProperty -Path "HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Fonts" -Name $fontName -Value $fontFile -PropertyType String -Force | Out-Null
    `;

    execSync(`powershell -Command "${psCommand.replace(/\n/g, " ")}"`, {
      stdio: "inherit",
    });

    logger.success(SERVICE_NAME, "Font registered in Windows Registry");
    logger.success(SERVICE_NAME, "Resolve-Bold font installed successfully on Windows!");
    logger.warn(SERVICE_NAME, "You may need to restart applications to see the font.");
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(
        `Failed to install font on Windows: ${error.message}\n` +
          `Try running this script as Administrator.`
      );
    }
    throw error;
  }
}

/**
 * Install font on macOS
 */
function installMacOS(): void {
  logger.step(SERVICE_NAME, "Installing Resolve-Bold font on macOS");

  const fontPath = resolve(FONT_FILE);
  if (!existsSync(fontPath)) {
    throw new Error(`Font file not found: ${fontPath}`);
  }

  // macOS user fonts directory
  const fontsDir = join(homedir(), "Library", "Fonts");
  const destPath = join(fontsDir, FONT_NAME);

  try {
    // Ensure fonts directory exists
    if (!existsSync(fontsDir)) {
      mkdirSync(fontsDir, { recursive: true });
    }

    // Copy font to user fonts directory
    copyFileSync(fontPath, destPath);
    logger.success(SERVICE_NAME, `Font copied to: ${destPath}`);

    logger.success(SERVICE_NAME, "Resolve-Bold font installed successfully on macOS!");
    logger.warn(SERVICE_NAME, "You may need to restart applications to see the font.");
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Failed to install font on macOS: ${error.message}`);
    }
    throw error;
  }
}

/**
 * Install font on Linux
 */
function installLinux(): void {
  logger.step(SERVICE_NAME, "Installing Resolve-Bold font on Linux");

  const fontPath = resolve(FONT_FILE);
  if (!existsSync(fontPath)) {
    throw new Error(`Font file not found: ${fontPath}`);
  }

  // Linux user fonts directory
  const fontsDir = join(homedir(), ".local", "share", "fonts");
  const destPath = join(fontsDir, FONT_NAME);

  try {
    // Ensure fonts directory exists
    if (!existsSync(fontsDir)) {
      mkdirSync(fontsDir, { recursive: true });
    }

    // Copy font to user fonts directory
    copyFileSync(fontPath, destPath);
    logger.success(SERVICE_NAME, `Font copied to: ${destPath}`);

    // Refresh font cache
    try {
      execSync("fc-cache -f -v", { stdio: "inherit" });
      logger.success(SERVICE_NAME, "Font cache refreshed");
    } catch (error) {
      logger.warn(
        SERVICE_NAME,
        "Could not refresh font cache. Run 'fc-cache -f -v' manually."
      );
    }

    logger.success(SERVICE_NAME, "Resolve-Bold font installed successfully on Linux!");
    logger.warn(SERVICE_NAME, "You may need to restart applications to see the font.");
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Failed to install font on Linux: ${error.message}`);
    }
    throw error;
  }
}

/**
 * Main function
 */
function main(): void {
  logger.log(SERVICE_NAME, "============================================================");
  logger.log(SERVICE_NAME, "🔤 Resolve-Bold Font Installer");
  logger.log(SERVICE_NAME, "============================================================");

  const os = platform();

  try {
    switch (os) {
      case "win32":
        installWindows();
        break;
      case "darwin":
        installMacOS();
        break;
      case "linux":
        installLinux();
        break;
      default:
        throw new Error(`Unsupported operating system: ${os}`);
    }
  } catch (error) {
    logger.error(SERVICE_NAME, "Font installation failed", error);
    process.exit(1);
  }

  logger.log(SERVICE_NAME, "============================================================");
}

main();

