# Changelog

All notable changes to worserve-obsidian will be documented in this file.

## [0.1.31] - 2025-09-19

### Removed

- Unused `try/catch` blocks in `tab.ts` for `copyTextToClipboard()`

### Fixed

- Styles and data attribute selections is now more focused (`init.ts`) for suggestions and focused items
- Font weight selections options simplified to only values


## [0.1.3] - 2025-09-01

### Added

- TOML error logs for the plugin/app
- `copy to clipboard` button for fatal/important errors in settings page
- read/clear methods for logs
- init error handling with restart attempt

### Fixed

- Missing npm packages like `obsidian` or `tslib` were removed by accident
- most `any` types are now replaced with better casting

### Changed

- Replace console logging with TOML temp file logging

### Removed

- All `console.log` statements
- All `console.*` calls (including build script)

---
---

> The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
> and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).
