# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 0.1.x   | :white_check_mark: |
| < 0.1   | :x:                |

## Reporting a Vulnerability

If you discover a security vulnerability in Compress I/O, **please do NOT open a public GitHub issue.**

Instead, report it privately using **GitHub Security Advisories**:

👉 [**Report a Vulnerability**](https://github.com/akshatrawat095/compress-io/security/advisories/new)

### What to include

- A clear description of the vulnerability
- Steps to reproduce the issue
- Affected version(s)
- Any potential impact or exploit scenario

### What to expect

- **Acknowledgment** within **48 hours**
- **Status update** within **7 days**
- If accepted, a fix will be prioritized and included in the next patch release
- If declined, you'll receive an explanation of why

## Scope

Since Compress I/O is a **100% offline desktop app**, the primary security concerns are:

- Malicious file input exploits (e.g., crafted media files targeting FFmpeg)
- Tauri/Rust backend vulnerabilities
- Dependency supply-chain issues (npm/crate packages)

Thank you for helping keep Compress I/O safe! 🛡️
