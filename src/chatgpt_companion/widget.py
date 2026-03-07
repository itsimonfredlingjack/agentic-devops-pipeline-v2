"""Helpers for serving the ChatGPT companion widget."""

from __future__ import annotations

import re
from pathlib import Path

from src.chatgpt_companion.config import config

ASSET_PATTERN = re.compile(
    r"""(?:<link[^>]+href="(?P<css>/assets/[^"]+\.css)"[^>]*>|"""
    r"""<script[^>]+src="(?P<js>/assets/[^"]+\.js)"[^>]*></script>)"""
)


def load_widget_html() -> str:
    """Load the built widget HTML and inline its assets for MCP delivery."""
    index_path = config.widget_dist / "index.html"
    if not index_path.exists():
        return _fallback_widget_html(
            "Widget build not found. Run `cd chatgpt-companion/web && npm install && npm run build`."
        )

    html = index_path.read_text(encoding="utf-8")
    replacements: dict[str, str] = {}
    for match in ASSET_PATTERN.finditer(html):
        css_path = match.group("css")
        js_path = match.group("js")
        if css_path:
            asset_text = _read_asset(config.widget_dist / css_path.lstrip("/"))
            replacements[match.group(0)] = f"<style>{asset_text}</style>"
        elif js_path:
            asset_text = _read_asset(config.widget_dist / js_path.lstrip("/"))
            replacements[match.group(0)] = f'<script type="module">{asset_text}</script>'

    for needle, replacement in replacements.items():
        html = html.replace(needle, replacement)

    return html


def _read_asset(path: Path) -> str:
    if not path.exists():
        return ""
    return path.read_text(encoding="utf-8")


def _fallback_widget_html(message: str) -> str:
    safe_message = (
        message.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
    )
    return f"""
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>SEJFA Companion</title>
    <style>
      body {{
        margin: 0;
        font-family: system-ui, -apple-system, sans-serif;
        background: #08101f;
        color: #f1f5f9;
        padding: 24px;
      }}
      .card {{
        border: 1px solid rgba(120, 170, 255, 0.18);
        border-radius: 16px;
        padding: 18px;
        background: rgba(10, 18, 38, 0.92);
      }}
      .eyebrow {{
        text-transform: uppercase;
        letter-spacing: 0.18em;
        color: rgba(210, 219, 244, 0.72);
        font-size: 12px;
      }}
      h1 {{
        margin: 8px 0 12px;
        font-size: 26px;
      }}
    </style>
  </head>
  <body>
    <div class="card">
      <div class="eyebrow">SEJFA Companion</div>
      <h1>Widget Build Needed</h1>
      <p>{safe_message}</p>
    </div>
  </body>
</html>
""".strip()

