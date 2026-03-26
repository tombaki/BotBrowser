# Performance Optimization

> Tune BotBrowser startup speed, memory usage, and throughput for high-scale automation while maintaining fingerprint protection.

---

<a id="prerequisites"></a>

## Prerequisites

- **BotBrowser** installed and running. See [Installation Guide](../../../INSTALLATION.md).
- **A profile file** (`.enc` for production).
- Familiarity with [CLI Flags](../../../CLI_FLAGS.md).

---

<a id="quick-start"></a>

## Quick Start

Apply the most impactful optimizations in one launch command:

```bash
chromium-browser \
    --headless \
    --no-sandbox \
    --bot-profile="/path/to/profile.enc" \
    --proxy-server=socks5://user:pass@proxy.example.com:1080 \
    --proxy-ip="203.0.113.1" \
    --disable-audio-output \
    --user-data-dir="$(mktemp -d)"
```

Key flags in this example:

- `--proxy-ip` skips the automatic IP lookup request, saving one HTTP roundtrip on first navigation.
- `--disable-audio-output` disables audio processing overhead.
- `--user-data-dir` with a temp directory prevents profile data conflicts.

---

<a id="how-it-works"></a>

## How It Works

BotBrowser performance is influenced by several factors:

1. **IP lookup.** By default, BotBrowser makes an HTTP request on startup to resolve the proxy's public IP for geo-configuration. The `--proxy-ip` flag (ENT Tier1) provides the IP directly, eliminating this network call.

2. **Profile loading.** Each profile contains fingerprint data (fonts, GPU info, screen properties) that controls the browser's protected identity. Loading happens once at startup. Keeping profiles on fast local storage (SSD) reduces startup time.

3. **GPU rendering.** On servers without a physical GPU, BotBrowser automatically selects the best available software rendering backend. If your system has GPU or GL drivers installed (e.g., Mesa on Linux), BotBrowser will use them for better performance. Otherwise it falls back to its built-in software renderer. You can control this with [`--bot-gpu-emulation`](../../../CLI_FLAGS.md#behavior--protection-toggles) (ENT Tier2).

4. **Browser contexts.** Creating multiple BrowserContexts within a single browser process is more efficient than launching separate browser instances. Each context can have its own fingerprint via Per-Context Fingerprint (ENT Tier3).

---

<a id="common-scenarios"></a>

## Common Scenarios

### Skip IP lookup with --proxy-ip

When you know the proxy's exit IP, provide it directly to save one HTTP request per launch:

```javascript
const browser = await chromium.launch({
    executablePath: BOTBROWSER_EXEC_PATH,
    headless: true,
    args: [
        `--bot-profile=${BOT_PROFILE_PATH}`,
        "--proxy-server=socks5://user:pass@proxy.example.com:1080",
        "--proxy-ip=203.0.113.1",
    ],
});
```

Combine with explicit geo overrides for full control without any lookup overhead:

```javascript
args: [
    `--bot-profile=${BOT_PROFILE_PATH}`,
    "--proxy-server=socks5://user:pass@proxy.example.com:1080",
    "--proxy-ip=203.0.113.1",
    "--bot-config-timezone=Europe/London",
    "--bot-config-locale=en-GB",
    "--bot-config-languages=en-GB,en",
],
```

### Random profile selection with --bot-profile-dir

Instead of managing which profile each instance uses, point to a directory of profiles. BotBrowser selects one randomly at startup:

```bash
chromium-browser \
    --headless \
    --no-sandbox \
    --bot-profile-dir="/path/to/profiles/" \
    --user-data-dir="$(mktemp -d)"
```

This is simpler than scripting profile rotation and provides fingerprint diversity across instances.

### Reuse browser instances with multiple contexts

Creating a new BrowserContext is much faster than launching a new browser process. Use Per-Context Fingerprint (ENT Tier3) for independent identities within one browser:

```javascript
const browser = await chromium.launch({
    executablePath: BOTBROWSER_EXEC_PATH,
    headless: true,
    args: [
        `--bot-profile=${BOT_PROFILE_PATH}`,
        "--proxy-server=socks5://user:pass@proxy.example.com:1080",
    ],
});

// Puppeteer: browser-level CDP session (required for BotBrowser.* commands)
const client = await browser.target().createCDPSession();

// Create multiple contexts with different fingerprints
for (let i = 0; i < 10; i++) {
    // Create context BEFORE setting flags
    const context = await browser.createBrowserContext();

    // Set per-context flags BEFORE creating any page
    await client.send("BotBrowser.setBrowserContextFlags", {
        browserContextId: context._contextId,
        botbrowserFlags: [
            `--bot-profile=/path/to/profile-${i}.enc`,
            `--proxy-server=socks5://user:pass@proxy${i}.example.com:1080`,
        ],
    });

    // NOW create a page. The renderer will start with the correct flags.
    const page = await context.newPage();
    await page.goto("https://example.com");
    // ... do work ...
    await context.close();
}

await browser.close();
```

### Memory management

Monitor and control memory usage:

```bash
# Check memory usage of running instances
ps aux | grep chromium-browser | awk '{sum += $6} END {print sum/1024 " MB"}'
```

Tips for reducing memory consumption:

- **Close contexts when done.** Each open context holds page state in memory.
- **Use `--user-data-dir` with temp directories.** Prevents cache buildup across sessions.
- **Limit concurrent pages.** Each tab consumes additional memory. Close pages you no longer need.
- **Set container memory limits.** In Docker, use `--memory=2g` to prevent a single instance from consuming all host memory.

### GPU rendering backend on Linux

On headless Linux servers without a physical GPU, BotBrowser automatically detects and uses your system's GL drivers (e.g., Mesa GL drivers) when available. This typically delivers better performance than the built-in fallback renderer.

```bash
# Default: BotBrowser auto-detects the best backend (recommended)
chromium-browser \
    --headless \
    --bot-profile="/path/to/profile.enc" \
    --user-data-dir="$(mktemp -d)"

# If you have your own GPU or GL driver and want BotBrowser
# to skip all rendering backend configuration:
chromium-browser \
    --headless \
    --bot-profile="/path/to/profile.enc" \
    --bot-gpu-emulation=false \
    --user-data-dir="$(mktemp -d)"
```

When `--bot-gpu-emulation=false` is set, BotBrowser does not configure any GPU rendering flags. Chrome's own GPU process handles backend selection. WebGL and Canvas fingerprint protection still work normally.

> **Note:** If you disable GPU emulation and your system has no GL drivers, WebGL may become unavailable. Ensure your environment provides GPU or GL support (e.g., `apt install mesa-utils libegl-mesa0 mesa-vulkan-drivers` on Debian/Ubuntu).

### Optimized browser flags for production

```bash
chromium-browser \
    --headless \
    --no-sandbox \
    --bot-profile="/path/to/profile.enc" \
    --disable-audio-output \
    --disable-background-networking \
    --disable-default-apps \
    --disable-extensions \
    --disable-sync \
    --disable-translate \
    --metrics-recording-only \
    --no-first-run \
    --user-data-dir="$(mktemp -d)"
```

---

<a id="troubleshooting"></a>

## Troubleshooting / FAQ

| Problem | Solution |
|---------|----------|
| Slow first page load | Add `--proxy-ip` to skip IP lookup. The first navigation triggers geo-lookup by default. |
| High memory with many instances | Use Per-Context Fingerprint with fewer browser processes. Each process has baseline overhead. |
| CPU spikes during idle | Disable background features: `--disable-background-networking`, `--disable-sync`. |
| Slow screenshot capture | Ensure a virtual display is running on Linux. Consider reducing profile screen resolution for faster rendering. |
| Profile loading takes too long | Store profiles on SSD, not network-mounted storage. Profile files are small but read on every startup. |
| GPU process consuming CPU | Install Mesa GL drivers (`apt install libegl-mesa0 mesa-utils`) for better software rendering performance. If your server has a GPU, set `--bot-gpu-emulation=false` to use it directly. |

---

<a id="next-steps"></a>

## Next Steps

- [Headless Server Setup](HEADLESS_SERVER_SETUP.md). Production deployment on Ubuntu servers.
- [Docker Deployment](DOCKER_DEPLOYMENT.md). Containerized setup with scaling.
- [Automation Consistency Practices](../getting-started/AUTOMATION_CONSISTENCY.md). Reduce framework-related inconsistency signals.
- [CLI Flags Reference](../../../CLI_FLAGS.md). Complete list of all available flags.

---

**Related documentation:** [Advanced Features](../../../ADVANCED_FEATURES.md) | [Per-Context Fingerprint](../../../PER_CONTEXT_FINGERPRINT.md) | [Playwright Guide](../getting-started/PLAYWRIGHT.md)

---

**[Legal Disclaimer & Terms of Use](https://github.com/botswin/BotBrowser/blob/main/DISCLAIMER.md) • [Responsible Use Guidelines](https://github.com/botswin/BotBrowser/blob/main/RESPONSIBLE_USE.md)**. BotBrowser is for authorized fingerprint protection and privacy research only.
