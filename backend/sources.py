"""
Seed list of curated cybersecurity sources.
Tiers: 1=authoritative/government, 2=major vendors & established news,
       3=research blogs, 4=community/aggregators
"""
import logging
from sqlmodel import Session, select
from models import Source, FeedType

logger = logging.getLogger(__name__)

SEED_SOURCES: list[dict] = [
    # ── Tier 1: Authoritative ────────────────────────────────────────────────
    {
        "name": "CISA Alerts",
        "url": "https://www.cisa.gov/uscert/ncas/alerts.xml",
        "tier": 1,
        "feed_type": "rss",
    },
    {
        "name": "CISA Current Activity",
        "url": "https://www.cisa.gov/uscert/ncas/current-activity.xml",
        "tier": 1,
        "feed_type": "rss",
    },
    {
        "name": "CISA ICS Advisories",
        "url": "https://www.cisa.gov/cybersecurity-advisories/ics-advisories.xml",
        "tier": 1,
        "feed_type": "rss",
    },
    {
        "name": "Microsoft Security Response Center",
        "url": "https://api.msrc.microsoft.com/update-guide/rss",
        "tier": 1,
        "feed_type": "rss",
    },
    # ── Tier 2: Major Vendors & Established News ─────────────────────────────
    {
        "name": "Krebs on Security",
        "url": "https://krebsonsecurity.com/feed/",
        "tier": 2,
        "feed_type": "rss",
    },
    {
        "name": "Schneier on Security",
        "url": "https://www.schneier.com/feed/atom/",
        "tier": 2,
        "feed_type": "rss",
    },
    {
        "name": "The Hacker News",
        "url": "https://feeds.feedburner.com/TheHackersNews",
        "tier": 2,
        "feed_type": "rss",
    },
    {
        "name": "BleepingComputer",
        "url": "https://www.bleepingcomputer.com/feed/",
        "tier": 2,
        "feed_type": "rss",
    },
    {
        "name": "Dark Reading",
        "url": "https://www.darkreading.com/rss.xml",
        "tier": 2,
        "feed_type": "rss",
    },
    {
        "name": "SecurityWeek",
        "url": "https://feeds.feedburner.com/securityweek",
        "tier": 2,
        "feed_type": "rss",
    },
    {
        "name": "Infosecurity Magazine",
        "url": "https://www.infosecurity-magazine.com/rss/news/",
        "tier": 2,
        "feed_type": "rss",
    },
    {
        "name": "SANS Internet Storm Center",
        "url": "https://isc.sans.edu/rssfeed_full.xml",
        "tier": 2,
        "feed_type": "rss",
    },
    {
        "name": "Palo Alto Unit 42",
        "url": "https://unit42.paloaltonetworks.com/feed/",
        "tier": 2,
        "feed_type": "rss",
    },
    {
        "name": "CrowdStrike Blog",
        "url": "https://www.crowdstrike.com/blog/feed/",
        "tier": 2,
        "feed_type": "rss",
    },
    {
        "name": "Google Project Zero",
        "url": "https://googleprojectzero.blogspot.com/feeds/posts/default",
        "tier": 2,
        "feed_type": "rss",
    },
    # ── Tier 3: Research Blogs ───────────────────────────────────────────────
    {
        "name": "Securelist (Kaspersky)",
        "url": "https://securelist.com/feed/",
        "tier": 3,
        "feed_type": "rss",
    },
    {
        "name": "Talos Intelligence",
        "url": "http://feeds.feedburner.com/feedburner/Talos",
        "tier": 3,
        "feed_type": "rss",
    },
    {
        "name": "Malwarebytes Labs",
        "url": "https://blog.malwarebytes.com/feed/",
        "tier": 3,
        "feed_type": "rss",
    },
    {
        "name": "Sophos – Threat Research",
        "url": "https://news.sophos.com/en-us/category/threat-research/feed/",
        "tier": 3,
        "feed_type": "rss",
    },
    {
        "name": "Sophos – Security Operations",
        "url": "https://news.sophos.com/en-us/category/security-operations/feed/",
        "tier": 3,
        "feed_type": "rss",
    },
    {
        "name": "ESET WeLiveSecurity",
        "url": "https://www.welivesecurity.com/feed/",
        "tier": 3,
        "feed_type": "rss",
    },

    {
        "name": "Check Point Research",
        "url": "https://research.checkpoint.com/feed/",
        "tier": 3,
        "feed_type": "rss",
    },
    {
        "name": "Rapid7 Blog",
        "url": "https://blog.rapid7.com/rss/",
        "tier": 3,
        "feed_type": "rss",
    },
    {
        "name": "SentinelOne Blog",
        "url": "https://www.sentinelone.com/blog/feed/",
        "tier": 3,
        "feed_type": "rss",
    },
    {
        "name": "Security Affairs",
        "url": "https://securityaffairs.co/wordpress/feed",
        "tier": 3,
        "feed_type": "rss",
    },
    {
        "name": "Recorded Future Blog",
        "url": "https://www.recordedfuture.com/feed",
        "tier": 3,
        "feed_type": "rss",
    },
    {
        "name": "Elastic Security Labs",
        "url": "https://www.elastic.co/security-labs/rss/feed.xml",
        "tier": 3,
        "feed_type": "rss",
    },
    {
        "name": "Mandiant Blog",
        "url": "https://www.mandiant.com/resources/blog/rss.xml",
        "tier": 3,
        "feed_type": "rss",
    },
    # ── Tier 4: Community / Aggregators ─────────────────────────────────────
    {
        "name": "Reddit r/netsec",
        "url": "https://www.reddit.com/r/netsec/.rss",
        "tier": 4,
        "feed_type": "rss",
    },
    {
        "name": "Hacker News (security, 50+ pts)",
        "url": "https://hnrss.org/newest?q=security&points=50",
        "tier": 4,
        "feed_type": "rss",
    },
    {
        "name": "Exploit-DB",
        "url": "https://www.exploit-db.com/rss.xml",
        "tier": 4,
        "feed_type": "rss",
    },
    {
        "name": "Full Disclosure (Seclists)",
        "url": "https://seclists.org/rss/fulldisclosure.rss",
        "tier": 4,
        "feed_type": "rss",
    },
    {
        "name": "The Register – Security",
        "url": "https://www.theregister.com/security/headlines.atom",
        "tier": 4,
        "feed_type": "rss",
    },
]


def seed_sources(session: Session) -> int:
    """
    Insert SEED_SOURCES if the sources table is empty.
    Returns the number of sources inserted (0 if already seeded).
    """
    existing = session.exec(select(Source)).first()
    if existing:
        return 0

    count = 0
    for s in SEED_SOURCES:
        source = Source(
            name=s["name"],
            url=s["url"],
            tier=s["tier"],
            feed_type=FeedType(s["feed_type"]),
        )
        session.add(source)
        count += 1

    session.commit()
    logger.info(f"Seeded {count} sources into the database")
    return count
