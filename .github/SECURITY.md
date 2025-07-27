# Security Policy

> WordServe includes a secure downloader component that fetches the core WordServe binary and data files from [this GitHub releases](https://github.com/bastiangx/wordserve/releases)

All files are verified against SHA-256 checksums from the release.
The system only downloads from a specific, hardcoded release version.

### Data Privacy

- **Local Operation**: All autocomplete suggestions and abbreviations are processed entirely offline
- **No Network Communication**: After initial setup, WordServe operates without any network requests
- **No Telemetry**: No usage data or personal information is collected or transmitted

---

For general questions or issues, please use the [GitHub Issues](https://github.com/bastiangx/wordserve-obsidian/issues)