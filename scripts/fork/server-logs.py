#!/usr/bin/env python3
"""Fork (server logs): aggregate a day's web server access log and post the
totals to OpenSEO (POST /api/fork/server-logs, see FORK.md).

Only date, path (no query string), status, bot class and hit count leave this
script. IPs, user agents and referrers are read in memory and dropped.

    OPENSEO_LOG_TOKEN=osl_… server-logs.py \
        --ssh ssh-w0222de1@w0222de1.kasserver.com \
        --remote-dir /www/htdocs/w0222de1/logs --prefix access_log_vertion_de_ \
        --url https://seo.harfert.org/api/fork/server-logs --days 7

Each run re-sends the last N complete days (the host keeps 7); the server
replaces a day, so re-sending never double counts. --file reads a local .gz
instead of SSH. --dry-run prints the totals instead of posting. --selftest runs
the checks below.
"""
import argparse
import collections
import datetime
import gzip
import json
import os
import re
import subprocess
import sys
import urllib.request

MAX_ROWS = 5000  # must match MAX_ROWS_PER_DAY in ServerLogService.ts

LINE = re.compile(
    r'^\S+ \S+ \S+ \[[^\]]+\] "(?:[A-Z]+) (\S+)[^"]*" (\d{3}) \S+ "[^"]*" "([^"]*)"'
)

# Order matters: the more specific names first. Same list as serverLogBots.ts.
BOTS = [
    ("OAI-SearchBot", re.compile(r"OAI-SearchBot", re.I)),
    ("ChatGPT-User", re.compile(r"ChatGPT-User", re.I)),
    ("GPTBot", re.compile(r"GPTBot", re.I)),
    ("Claude-User", re.compile(r"Claude-User", re.I)),
    ("ClaudeBot", re.compile(r"ClaudeBot|anthropic-ai|claude-web", re.I)),
    ("Perplexity-User", re.compile(r"Perplexity-User", re.I)),
    ("PerplexityBot", re.compile(r"PerplexityBot", re.I)),
    # Google-Extended is a robots.txt token, not a crawler; kept for completeness.
    ("Google-Extended", re.compile(r"Google-Extended", re.I)),
    ("Googlebot", re.compile(r"Googlebot|Google-InspectionTool|GoogleOther|Storebot-Google", re.I)),
    ("Bingbot", re.compile(r"bingbot|BingPreview|msnbot", re.I)),
    ("other bots", re.compile(
        r"bot\b|bot/|crawl|spider|slurp|wget|curl|python|httpclient|http-client|go-http|java/|"
        r"okhttp|libwww|scrapy|headless|monitor|uptime|preview|facebookexternalhit|feedfetcher|"
        r"^-?$", re.I)),
]


def classify(user_agent):
    for name, pattern in BOTS:
        if pattern.search(user_agent):
            return name
    return "people"


def clean_path(target):
    path = target.split("?", 1)[0].split("#", 1)[0]
    if not path.startswith("/"):
        path = "/" + path if not path.startswith("http") else re.sub(r"^https?://[^/]+", "", path) or "/"
    return path[:300]


def aggregate(lines):
    counts = collections.Counter()
    for line in lines:
        m = LINE.match(line)
        if not m:
            continue
        target, status, agent = m.groups()
        counts[(clean_path(target), int(status), classify(agent))] += 1
    rows = counts.most_common()
    if len(rows) > MAX_ROWS:
        kept, rest = rows[: MAX_ROWS - 200], rows[MAX_ROWS - 200:]
        folded = collections.Counter()
        for (path, status, bot), hits in rest:
            folded[("(other)", status, bot)] += hits
        rows = kept + list(folded.items())
    return [{"path": p, "status": s, "bot": b, "hits": h} for (p, s, b), h in rows]


def read_remote(ssh, remote_dir, prefix, day):
    name = f"{remote_dir.rstrip('/')}/{prefix}{day}.gz"
    result = subprocess.run(
        ["ssh", "-o", "BatchMode=yes", ssh, f"cat {name} 2>/dev/null"],
        capture_output=True, timeout=120, check=False)
    return result.stdout or None


def post(url, token, day, rows):
    request = urllib.request.Request(
        url, data=json.dumps({"date": day, "rows": rows}).encode(), method="POST",
        headers={"content-type": "application/json", "authorization": f"Bearer {token}"})
    with urllib.request.urlopen(request, timeout=60) as response:
        return json.load(response)


def selftest():
    sample = [
        '1.2.0.0 - - [15/Nov/2026:00:00:00 +0100] "GET /blog?utm=x HTTP/1.1" 200 512 "-" "Mozilla/5.0 (compatible; GPTBot/1.2; +https://openai.com/gptbot)" "Traffic IN:1 OUT:2" "ReqTime:0 sec"',
        '1.2.0.0 - - [15/Nov/2026:00:00:01 +0100] "GET /blog HTTP/1.1" 200 512 "-" "Mozilla/5.0 AppleWebKit/537.36; compatible; ChatGPT-User/1.0" "x" "y"',
        '1.2.0.0 - - [15/Nov/2026:00:00:02 +0100] "GET /alt HTTP/1.1" 404 0 "https://ref" "Mozilla/5.0 (Macintosh) Safari/605" "x" "y"',
        '1.2.0.0 - - [15/Nov/2026:00:00:03 +0100] "HEAD / HTTP/1.1" 200 - "-" "Wget/1.21.3" "x" "y"',
        '1.2.0.0 - - [15/Nov/2026:00:00:04 +0100] "GET /blog HTTP/1.1" 200 1 "-" "Mozilla/5.0 (compatible; Googlebot/2.1)" "x" "y"',
        '1.2.0.0 - - [15/Nov/2026:00:00:05 +0100] "GET /blog?a=1 HTTP/1.1" 200 1 "-" "Mozilla/5.0 (compatible; GPTBot/1.2)" "x" "y"',
        'garbage line',
    ]
    rows = {(r["path"], r["status"], r["bot"]): r["hits"] for r in aggregate(sample)}
    assert rows == {
        ("/blog", 200, "GPTBot"): 2, ("/blog", 200, "ChatGPT-User"): 1,
        ("/alt", 404, "people"): 1, ("/", 200, "other bots"): 1, ("/blog", 200, "Googlebot"): 1,
    }, rows
    assert classify("Mozilla/5.0 (compatible; ClaudeBot/1.0; +claudebot@anthropic.com)") == "ClaudeBot"
    assert classify("Claude-User/1.0") == "Claude-User"
    assert classify("Mozilla/5.0 (compatible; OAI-SearchBot/1.0)") == "OAI-SearchBot"
    assert classify("Mozilla/5.0 (compatible; bingbot/2.0)") == "Bingbot"
    assert classify("Mozilla/5.0 (compatible; PerplexityBot/1.0)") == "PerplexityBot"
    assert classify("-") == "other bots"
    assert clean_path("http://vertion.de/x?y") == "/x"
    big = [f'1.2.0.0 - - [d] "GET /p{i} HTTP/1.1" 200 1 "-" "Safari" "x" "y"' for i in range(MAX_ROWS + 50)]
    out = aggregate(big)
    assert len(out) <= MAX_ROWS and sum(r["hits"] for r in out) == MAX_ROWS + 50
    print("ok")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--ssh")
    ap.add_argument("--remote-dir", default="/www/htdocs/w0222de1/logs")
    ap.add_argument("--prefix", default="access_log_vertion_de_")
    ap.add_argument("--file", help="local .gz for one day (needs --date)")
    ap.add_argument("--date")
    ap.add_argument("--days", type=int, default=7)
    ap.add_argument("--url", default="https://seo.harfert.org/api/fork/server-logs")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--selftest", action="store_true")
    args = ap.parse_args()
    if args.selftest:
        return selftest()
    token = os.environ.get("OPENSEO_LOG_TOKEN", "").strip()
    if not args.dry_run and not token:
        sys.exit("OPENSEO_LOG_TOKEN is not set")
    if args.file:
        days = [(args.date, open(args.file, "rb").read())]
    else:
        if not args.ssh:
            sys.exit("--ssh or --file is required")
        today = datetime.date.today()
        days = []
        for back in range(1, args.days + 1):
            day = (today - datetime.timedelta(days=back)).isoformat()
            days.append((day, read_remote(args.ssh, args.remote_dir, args.prefix, day)))
    failed = 0
    for day, raw in days:
        if not raw:
            print(f"{day}: no log file")
            continue
        rows = aggregate(gzip.decompress(raw).decode("utf-8", "replace").splitlines())
        if args.dry_run:
            print(json.dumps({"date": day, "rows": rows[:20], "rowCount": len(rows)}, indent=1))
            continue
        try:
            result = post(args.url, token, day, rows)
            print(f"{day}: {len(rows)} rows, {sum(r['hits'] for r in rows)} hits -> {result}")
        except Exception as error:  # report and go on with the other days
            failed += 1
            print(f"{day}: post failed: {getattr(error, 'code', '')} {type(error).__name__}")
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
