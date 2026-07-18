[한국어](PRIVACY.md) · **English**

# Refont Privacy Policy

**Effective date: June 5, 2026**

Refont (the "Extension") is a browser extension that replaces a web page's body font
with a font you specify. The Extension **does not collect, store, or transmit any
personal information.**

## At a glance

- **No** analytics, tracking, or telemetry of any kind.
- **No** server operated by the developer. Data is never sent anywhere.
- **No** advertising, advertising IDs, or fingerprinting.
- **No** sign-up, login, or account.

## What the Extension stores

The Extension stores only your **settings** — the font you chose, adjustments such as
size, letter spacing, and line height, your excluded-sites list, your protected-fonts
list, and recently used fonts — in the browser's local storage (`storage.local`).

- This data stays **on your device only** and never leaves it.
- It is never transmitted to anyone, including the developer.
- Uninstalling the Extension deletes this data along with it.

## About network requests

The Extension makes an outbound network request in **exactly one** case.

> If you **manually enter** a "Web Font URL" to specify a font, the Extension requests
> that font file from the **exact address you entered**.

- This request goes **directly** to the font provider you chose (e.g. Google Fonts, a
  CDN you specified, etc.).
- It does not pass through any server run by the developer, and the developer receives
  no information about this request.
- The fetched font is used only to apply it to the current page.
- If you don't enter a font URL (i.e. you only use fonts already installed on your
  system), the Extension makes no network requests at all.

Whatever information that font provider itself processes is governed by that
provider's own privacy policy.

## Why each permission is used

- **storage** — to store the settings described above on your device.
- **scripting** — to inject the CSS that replaces fonts on the page.
- **tabs** — to read the current tab's address, for the "exclude this site" feature and
  the toolbar badge.
- **host permissions (`<all_urls>`)** — so fonts can be replaced on any site you visit.
  This is **not** used to read page content and send it anywhere.

## Children's privacy

The Extension does not collect personal information from any user, including children.

## Changes to this policy

If this policy changes, this document and its effective date will be updated. Our aim
is to keep the "we collect no data" principle unchanged.

## Contact

If you have questions or concerns, please open an issue on the GitHub repository:
https://github.com/jisamcom/refont/issues
