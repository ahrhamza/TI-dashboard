"""
Daily digest — standalone HTML page served at GET /digest.
Shows all TO_ADDRESS and TICKET_RAISED articles grouped by severity.
Print-optimised, no React dependency.
"""
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends
from fastapi.responses import HTMLResponse
from sqlmodel import Session, select

from database import get_session
from models import Article, ArticleStatus, Severity, Source

router = APIRouter(tags=["digest"])

SEVERITY_ORDER = [
    Severity.critical,
    Severity.high,
    Severity.medium,
    Severity.low,
    Severity.unset,
]

SEVERITY_LABELS = {
    Severity.critical: "Critical",
    Severity.high: "High",
    Severity.medium: "Medium",
    Severity.low: "Low",
    Severity.unset: "Unset",
}

SEVERITY_COLORS = {
    Severity.critical: "#E11D48",
    Severity.high: "#EA580C",
    Severity.medium: "#D97706",
    Severity.low: "#64748B",
    Severity.unset: "#94A3B8",
}


def _fmt_duration(dt: Optional[datetime]) -> str:
    if not dt:
        return "unknown"
    now = datetime.utcnow()
    diff = now - dt
    total_minutes = int(diff.total_seconds() / 60)
    if total_minutes < 60:
        return f"{total_minutes}m"
    hours = total_minutes // 60
    if hours < 24:
        return f"{hours}h"
    days = hours // 24
    return f"{days}d"


def _fmt_ts(dt: Optional[datetime]) -> str:
    if not dt:
        return ""
    return dt.strftime("%Y-%m-%d %H:%M UTC")


def _render_html(articles: list[Article], source_map: dict) -> str:
    now_str = datetime.utcnow().strftime("%Y-%m-%d %H:%M UTC")
    total = len(articles)

    grouped: dict[Severity, list[Article]] = {sev: [] for sev in SEVERITY_ORDER}
    for a in articles:
        grouped[a.severity].append(a)

    sections_html = ""
    for sev in SEVERITY_ORDER:
        items = grouped[sev]
        if not items:
            continue

        color = SEVERITY_COLORS[sev]
        label = SEVERITY_LABELS[sev]

        rows = ""
        for a in items:
            source_name = source_map.get(a.source_id, "Unknown")
            time_in_state = _fmt_duration(a.status_changed_at or a.ingested_at)
            status_label = "To Address" if a.status == ArticleStatus.TO_ADDRESS else "Ticket Raised"

            ticket_cell = ""
            if a.ticket_id:
                ticket_cell = f'<a href="https://ithelpdesk.albatha.com/ticket/{a.ticket_id}" class="ticket-link">#{a.ticket_id}</a>'

            rows += f"""
            <tr>
              <td class="title-cell">
                <a href="{a.url}" target="_blank" rel="noopener noreferrer">{a.title}</a>
              </td>
              <td class="source-cell">{source_name}</td>
              <td class="status-cell">{status_label}</td>
              <td class="ticket-cell">{ticket_cell}</td>
              <td class="time-cell">{time_in_state}</td>
            </tr>"""

        sections_html += f"""
        <section class="severity-section">
          <h2 class="severity-heading" style="color: {color}; border-left-color: {color}">
            {label} <span class="count-badge">{len(items)}</span>
          </h2>
          <table>
            <thead>
              <tr>
                <th class="th-title">Title</th>
                <th class="th-source">Source</th>
                <th class="th-status">Status</th>
                <th class="th-ticket">Ticket</th>
                <th class="th-time">Time in State</th>
              </tr>
            </thead>
            <tbody>{rows}</tbody>
          </table>
        </section>"""

    if not sections_html:
        sections_html = '<p class="empty-state">No active items — queue is clear.</p>'

    return f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>SOCFeed Daily Digest — {now_str}</title>
  <style>
    *, *::before, *::after {{ box-sizing: border-box; }}

    body {{
      font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
      font-size: 13px;
      color: #1E293B;
      background: #ffffff;
      margin: 0;
      padding: 2rem 2.5rem;
      max-width: 1100px;
      margin-inline: auto;
    }}

    .digest-header {{
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      border-bottom: 2px solid #E2E8F0;
      padding-bottom: 1rem;
      margin-bottom: 2rem;
    }}

    .digest-title {{
      font-size: 1.4rem;
      font-weight: 700;
      letter-spacing: -0.02em;
      color: #0F172A;
      margin: 0;
    }}

    .digest-meta {{
      font-size: 11px;
      color: #94A3B8;
      text-align: right;
      line-height: 1.6;
    }}

    .digest-meta strong {{
      display: block;
      font-weight: 600;
      color: #64748B;
    }}

    .severity-section {{
      margin-bottom: 2.5rem;
      page-break-inside: avoid;
    }}

    .severity-heading {{
      font-size: 0.85rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      margin: 0 0 0.75rem 0;
      padding-left: 0.75rem;
      border-left: 3px solid;
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }}

    .count-badge {{
      display: inline-flex;
      align-items: center;
      justify-content: center;
      background: #F1F5F9;
      color: #475569;
      border-radius: 9999px;
      font-size: 10px;
      font-weight: 600;
      padding: 1px 7px;
      letter-spacing: 0;
      text-transform: none;
    }}

    table {{
      width: 100%;
      border-collapse: collapse;
      font-size: 12.5px;
    }}

    thead tr {{
      background: #F8FAFC;
    }}

    th {{
      text-align: left;
      padding: 6px 10px;
      font-weight: 600;
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: #64748B;
      border-bottom: 1px solid #E2E8F0;
    }}

    td {{
      padding: 7px 10px;
      border-bottom: 1px solid #F1F5F9;
      vertical-align: top;
      color: #334155;
    }}

    tbody tr:last-child td {{
      border-bottom: none;
    }}

    tbody tr:hover {{
      background: #F8FAFC;
    }}

    .title-cell a {{
      color: #1D4ED8;
      text-decoration: none;
      font-weight: 500;
      line-height: 1.4;
    }}

    .title-cell a:hover {{
      text-decoration: underline;
    }}

    .th-title {{ width: 45%; }}
    .th-source {{ width: 15%; }}
    .th-status {{ width: 13%; }}
    .th-ticket {{ width: 12%; }}
    .th-time {{ width: 10%; text-align: right; }}

    .time-cell {{ text-align: right; font-variant-numeric: tabular-nums; color: #64748B; }}
    .source-cell {{ color: #475569; }}
    .status-cell {{ color: #475569; }}

    .ticket-link {{
      font-family: 'Courier New', monospace;
      font-size: 11px;
      color: #7C3AED;
      text-decoration: none;
    }}

    .ticket-link:hover {{ text-decoration: underline; }}

    .empty-state {{
      text-align: center;
      color: #94A3B8;
      padding: 3rem;
      font-style: italic;
    }}

    .footer {{
      margin-top: 3rem;
      padding-top: 1rem;
      border-top: 1px solid #E2E8F0;
      font-size: 11px;
      color: #94A3B8;
      display: flex;
      justify-content: space-between;
    }}

    @media print {{
      body {{
        padding: 1cm;
        font-size: 11px;
      }}

      .digest-header {{
        margin-bottom: 1.5rem;
      }}

      .severity-section {{
        page-break-inside: avoid;
        margin-bottom: 1.5rem;
      }}

      a {{ color: inherit; text-decoration: none; }}

      .title-cell a {{ color: #1D4ED8; }}

      table {{ font-size: 10.5px; }}

      td, th {{ padding: 5px 8px; }}
    }}
  </style>
</head>
<body>
  <div class="digest-header">
    <h1 class="digest-title">SOCFeed — Daily Digest</h1>
    <div class="digest-meta">
      <strong>Generated {now_str}</strong>
      {total} active item{"s" if total != 1 else ""} requiring attention
    </div>
  </div>

  {sections_html}

  <div class="footer">
    <span>SOCFeed Internal Threat Intelligence</span>
    <span>Showing TO_ADDRESS and TICKET_RAISED items only</span>
  </div>
</body>
</html>"""


@router.get("/digest", response_class=HTMLResponse)
def digest(session: Session = Depends(get_session)):
    active_statuses = [ArticleStatus.TO_ADDRESS, ArticleStatus.TICKET_RAISED]
    articles = session.exec(
        select(Article)
        .where(Article.status.in_(active_statuses))
        .order_by(Article.status_changed_at.asc())
    ).all()

    sources = session.exec(select(Source)).all()
    source_map = {s.id: s.name for s in sources}

    return HTMLResponse(content=_render_html(articles, source_map))
