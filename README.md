# Codex Monitor

A GNOME Shell extension that displays your ChatGPT Codex plan usage directly in the top panel. View your current five-hour and weekly usage windows from a compact menu, with configurable refresh and display options.

## Features

- Shows the five-hour usage percentage in the GNOME top panel.
- Displays five-hour and weekly usage, progress bars, and reset estimates in the menu.
- Switches the panel and highlighted menu percentages between **remaining** and **used**.
- Refreshes automatically at a configurable interval or on demand.
- Stores the ChatGPT session cookie in GNOME Keyring.
- Supports GNOME Shell versions 45–51.

## Installation

### Install from the source repository

The following commands build and install the extension for your current user:

```sh
git clone https://github.com/FalkFranco/codex-monitor-gnome.git
cd codex-monitor-gnome
glib-compile-schemas --strict schemas
gnome-extensions pack --force \
  --extra-source=src \
  --extra-source=LICENSE \
  --extra-source=README.md \
  --out-dir=/tmp .
gnome-extensions install --force /tmp/codex-monitor@frankooseb.shell-extension.zip
gnome-extensions enable codex-monitor@frankooseb
```

If the extension does not appear immediately, log out and back in. On X11, you can also restart GNOME Shell with **Alt+F2**, then `r`.

### Configure your account

1. Open the extension's **Preferences** from the panel menu or run:

   ```sh
   gnome-extensions prefs codex-monitor@frankooseb
   ```

2. In **Account**, paste your ChatGPT session cookie.
3. Select **Test connection** to verify it, then **Save cookie**.
4. In **General**, choose whether percentages show usage remaining or used, and set the refresh interval.

The refresh interval can be set from 5 to 120 minutes; the default is 15 minutes. You can also select **Refresh now** from the panel menu.

## Requirements

- GNOME Shell 45 or later (versions 45–51 are declared as supported).
- A ChatGPT account with Codex plan usage available.
- GNOME Keyring available and unlocked to store the session cookie.

## Privacy and service compatibility

Your ChatGPT session cookie is a sensitive credential that may grant access to your account. Only enter it if you trust this extension. Codex Monitor stores a saved cookie in GNOME Keyring; it is not written to GSettings or a plain-text preferences file. The connection test sends the cookie you enter to ChatGPT but does not save it. Remove a saved credential at any time from **Preferences → Account → Delete cookie**.

For usage retrieval, the extension sends the cookie to `chatgpt.com`'s `/api/auth/session` endpoint, then uses the returned access token to request `/backend-api/wham/usage` from the same host. The source code contains no telemetry or other data destinations.

These ChatGPT web endpoints are private and are not a public, stable API. They may change, which can temporarily interrupt usage reporting. Codex Monitor is an independent community project and is not affiliated with or endorsed by OpenAI.

Treat your session cookie like a password: do not share it, publish it, or include it in bug reports.

## Trademarks and attribution

The OpenAI logo is a trademark of OpenAI and is used only to identify the ChatGPT service supported by this extension. OpenAI and ChatGPT are trademarks of OpenAI. Their use does not imply sponsorship or endorsement. Codex Monitor is distributed under the MIT License; that license does not grant rights to third-party trademarks or branding.

## Development

From the repository root, compile and validate the settings schema with:

```sh
glib-compile-schemas --strict schemas
```

The extension code is organized into `src/application`, `src/domain`, and `src/infrastructure`. The GNOME Shell integration is in `extension.js`, and the preferences UI is in `prefs.js`.

## License

Codex Monitor is distributed under the MIT License. See [LICENSE](LICENSE).
