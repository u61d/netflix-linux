# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 2.0.x   | :white_check_mark: |
| < 2.0   | :x:                |

## Reporting a Vulnerability

If you find a security vulnerability, please **do not** open a public issue.

Instead:

1. **Email**: Open an issue with title "Security: [brief description]" and request private disclosure
2. **Include**:
   - Description of the vulnerability
   - Steps to reproduce
   - Potential impact
   - Suggested fix (if you have one)

We'll respond within 48 hours and work with you to understand and address the issue.

## Security Considerations

### What This App Does

- Wraps Netflix's web player in an Electron window
- Stores settings locally in `~/.config/netflix-linux/`
- Optionally sends crash reports to Sentry (user must opt-in)
- Optionally communicates with Discord for Rich Presence

### What This App Doesn't Do

- Collect user data without consent
- Store or transmit Netflix credentials
- Phone home without user knowledge
- Run third-party scripts

### Known Limitations

- This is a web wrapper - it's as secure as Netflix's web player
- DRM is handled by Widevine (same as Chrome/Firefox)
- No sandboxing between profiles (they share the same Electron process)

### Best Practices for Users

- Keep the app updated
- Only download from official releases
- Review the code if you're concerned (it's open source)
- Use different Linux users for true profile isolation

## Disclosure Policy

If we discover or are informed of a security issue:

1. We'll fix it in the next release
2. Credit the reporter (unless they prefer anonymity)
3. Document it in the changelog
4. Create a GitHub Security Advisory if severe

## Out of Scope

These are not security issues:
- Netflix login/account security (that's Netflix's responsibility)
- Issues with Netflix's DRM or content protection
- Discord API vulnerabilities
- Electron framework vulnerabilities (unless specific to our implementation)

---

Thanks for helping keep this project secure!