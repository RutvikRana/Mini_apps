"""
Resolve a pin.it short link to its real pin id.

GET /api/pin?code=<code>   (or ?url=https://pin.it/<code>)
-> {"ok": true, "pinId": "889179520179912128", "resolvedUrl": "..."}

The browser cannot do this itself: api.pinterest.com's redirect endpoint
sends no CORS headers, so client-side fetch is blocked. This helper runs
server-side where CORS does not apply. Standard library only.
"""

import json
import re
import urllib.request


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def _extract_pin_id(location: str) -> str | None:
    match = re.search(r"/pin/(\d+)", location or "")
    return match.group(1) if match else None


def handler(request):
    from urllib.parse import parse_qs, urlparse

    qs = parse_qs(urlparse(request.get("url", "")).query) if isinstance(request, dict) else {}
    code = (qs.get("code") or [None])[0]
    url_param = (qs.get("url") or [None])[0]

    if not code and url_param:
        code = urlparse(url_param).path.rstrip("/").split("/")[-1]
    if not code:
        return {"statusCode": 400, "body": {"error": "missing code"}}

    if not re.fullmatch(r"[A-Za-z0-9]{5,20}", code):
        return {"statusCode": 400, "body": {"error": "invalid code"}}

    opener = urllib.request.build_opener(NoRedirect)
    req = urllib.request.Request(
        f"https://api.pinterest.com/url_shortener/{code}/redirect/",
        headers={"User-Agent": "Mozilla/5.0 (compatible; MiniMixApp/1.0)"},
    )
    try:
        try:
            opener.open(req, timeout=10)
            return {"statusCode": 502, "body": {"error": "no redirect returned"}}
        except urllib.error.HTTPError as err:
            location = err.headers.get("Location")
    except Exception:
        return {"statusCode": 502, "body": {"error": "shortener unreachable"}}

    if not location:
        return {"statusCode": 404, "body": {"error": "unknown or expired code"}}

    pin_id = _extract_pin_id(location)
    return {
        "statusCode": 200,
        "headers": {"Access-Control-Allow-Origin": "*", "Cache-Control": "public, max-age=86400"},
        "body": {"ok": True, "pinId": pin_id, "resolvedUrl": location},
    }


def main(request):
    return handler(request)
