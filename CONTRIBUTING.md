# Contributing to Compress I/O

Thank you for your interest in contributing to **Compress I/O**! We welcome bug reports, feature suggestions, and code contributions.

---

## 📋 Code of Conduct & Philosophy

Compress I/O is built on three core pillars:
1. **100% Offline & Private:** No user data or media may ever leave the user's local machine.
2. **Hardware Accelerated:** Performance-first architecture leveraging native GPU encoders.
3. **Defense in Depth:** Robust input sanitization, least-privilege permissions, and hardened build pipelines.

---

## 🐛 Reporting Bugs

Before submitting a bug report:
1. Check the [open issues](https://github.com/akshatrawat095/compress-io/issues) to see if the issue has already been reported.
2. If it is a **security vulnerability**, please follow our [Security Policy](SECURITY.md) and report it privately via [GitHub Security Advisories](https://github.com/akshatrawat095/compress-io/security/advisories/new) rather than opening a public issue.

When filing a bug report:
- Use the issue template provided on GitHub.
- Specify your Operating System (Windows, macOS, Linux).
- Include steps to reproduce the problem and expected vs. actual behavior.
- Attach error logs or screenshots if relevant.

---

## 💡 Suggesting Enhancements

Feature requests and workflow improvements are warmly welcomed!
- Open an issue in the [GitHub Issue Tracker](https://github.com/akshatrawat095/compress-io/issues).
- Describe the feature clearly and why it would benefit users.

---

## 🛠️ Development Setup & Building

Compress I/O is a desktop application built with **Tauri (v2)**, **Rust**, and **React (Vite)**.

### Prerequisites

- [Node.js](https://nodejs.org/) (v20 or newer)
- [Rust & Cargo](https://rustup.rs/) (latest stable)
- OS-specific build dependencies for Tauri (see [Tauri Prerequisites Guide](https://v2.tauri.app/start/prerequisites/))

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/akshatrawat095/compress-io.git
   cd compress-io
   ```
2. Install frontend dependencies:
   ```bash
   npm install
   ```
3. Run the development server with hot reload:
   ```bash
   npm run tauri dev
   ```

---

## 🧪 Testing & Verification

Before submitting a pull request, verify that all automated tests and audits pass:

```bash
# Frontend build check
npm run build

# Rust backend tests & linting
cd src-tauri
cargo test
cargo check
cargo clippy --all-targets -- -D warnings
```

---

## 🔄 Submitting Pull Requests

1. Fork the repository and create your feature branch:
   ```bash
   git checkout -b feature/my-new-feature
   ```
2. Commit your changes following conventional commit syntax (`feat:`, `fix:`, `docs:`, `chore:`).
3. Ensure all tests and lint checks pass locally.
4. Push to your fork and submit a Pull Request against the `main` branch.
5. All pull requests are automatically validated by GitHub Actions CI and CodeQL security analysis.
