"""
SMS text extractor — reads from macOS Messages chat.db.
Handles both text column and attributedBody blob.
Called from Node.js via stdin with JSON params.
"""
import sqlite3, re, json, sys, time

def extract_text(row_text, row_blob):
    if row_text:
        return row_text
    if not row_blob:
        return ""
    try:
        blob = bytes(row_blob)
        text = blob.decode("utf-8", errors="replace")
        segments = re.split(r'[\x00-\x08\x0e-\x1f\ufffd]{3,}', text)
        best = ""
        for seg in segments:
            clean = seg.strip()
            if len(clean) > len(best) and (re.search(r'[\u0590-\u05ff]', clean) or re.search(r'[a-zA-Z]{3,}', clean)):
                best = clean
        best = re.sub(r'^[^\u0590-\u05ffa-zA-Z0-9]*', '', best)
        return best.strip()
    except:
        return ""

def main():
    params = json.loads(sys.stdin.read())
    db_path = params["db"]
    action = params["action"]

    conn = sqlite3.connect(db_path)
    epoch2001 = 978307200

    if action == "recent":
        since_hours = params.get("hours", 24)
        limit = params.get("limit", 20)
        sms_only = params.get("sms_only", False)
        since_nano = int((time.time() - epoch2001 - since_hours * 3600) * 1e9)
        service_filter = 'AND m.service = "SMS"' if sms_only else ""
        rows = conn.execute(f"""
            SELECT m.rowid, m.text, h.id, m.is_from_me,
                   datetime(m.date/1000000000 + {epoch2001}, 'unixepoch', 'localtime'),
                   m.service, m.attributedBody
            FROM message m
            LEFT JOIN handle h ON m.handle_id = h.rowid
            WHERE m.date > ?
            {service_filter}
            ORDER BY m.date DESC
            LIMIT {limit}
        """, (since_nano,)).fetchall()

    elif action == "search":
        keyword = params["keyword"]
        limit = params.get("limit", 10)
        rows = conn.execute("""
            SELECT m.rowid, m.text, h.id, m.is_from_me,
                   datetime(m.date/1000000000 + %d, 'unixepoch', 'localtime'),
                   m.service, m.attributedBody
            FROM message m
            LEFT JOIN handle h ON m.handle_id = h.rowid
            ORDER BY m.date DESC
            LIMIT 500
        """ % epoch2001).fetchall()
        kw = keyword.lower()
        rows = [r for r in rows if kw in (extract_text(r[1], r[6]) or "").lower()][:limit]

    elif action == "since_id":
        since_id = params["since_id"]
        limit = params.get("limit", 50)
        rows = conn.execute(f"""
            SELECT m.rowid, m.text, h.id, m.is_from_me,
                   datetime(m.date/1000000000 + {epoch2001}, 'unixepoch', 'localtime'),
                   m.service, m.attributedBody
            FROM message m
            LEFT JOIN handle h ON m.handle_id = h.rowid
            WHERE m.rowid > ?
            ORDER BY m.date ASC
            LIMIT {limit}
        """, (since_id,)).fetchall()

    elif action == "latest_id":
        row = conn.execute("SELECT MAX(rowid) FROM message").fetchone()
        print(json.dumps({"id": row[0] or 0}))
        conn.close()
        return

    elif action == "available":
        row = conn.execute("SELECT COUNT(*) FROM message").fetchone()
        print(json.dumps({"count": row[0] or 0}))
        conn.close()
        return

    else:
        print(json.dumps([]))
        conn.close()
        return

    result = []
    for r in rows:
        text = extract_text(r[1], r[6])
        if text and len(text) > 3:
            result.append({
                "id": r[0],
                "text": text[:500],
                "sender": r[2] or "",
                "isFromMe": bool(r[3]),
                "timestamp": r[4] or "",
                "service": r[5] or ""
            })

    print(json.dumps(result, ensure_ascii=False))
    conn.close()

if __name__ == "__main__":
    main()
