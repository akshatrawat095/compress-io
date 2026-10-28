# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 0.1.x   | :white_check_mark: |
| < 0.1   | :x:                |

---

## 🛡️ Defense-in-Depth Security Architecture

Compress I/O is designed with a **100% offline, privacy-first, and supply-chain hardened** model:

1. **Local Engine Hardening (`-protocol_whitelist`):**
   - Native media engines (FFmpeg) are strictly whitelisted to `file,crypto,data,pipe`.
   - All network calls, remote URLs, and nested protocols (e.g. `http://`, `subfile:`, `concat:`) are forcefully rejected at the engine level to prevent SSRF and local file inclusion exploits.

2. **Binary Provenance & Cryptographic Attestations (SLSA Level 3):**
   - Official releases are cryptographically signed with **Sigstore** and verified via GitHub OIDC.
   - Anyone can verify the authenticity and build provenance of official installers using the GitHub CLI:
     ```bash
     gh attestation verify <installer-binary> -R akshatrawat095/compress-io
     ```

3. **Software Bill of Materials (SBOM):**
   - Every official release publishes a standardized SPDX JSON SBOM (`compress-io-sbom.spdx.json`) detailing every dependency and cryptographic hash.

4. **CI/CD Hardening & Supply Chain Protection:**
   - **StepSecurity `harden-runner`:** Monitors and blocks rogue egress network connections from build runners.
   - **Automated Dependency Audits:** Continuous `npm audit` and `cargo audit` in CI pipelines.
   - **OpenSSF Scorecard:** Automated weekly repo health and security posture evaluations.
   - **Immutable Action Pinning:** All CI/CD actions are pinned to immutable 40-character commit SHAs.

---

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

---

Thank you for helping keep Compress I/O safe! 🛡️
