export interface RssFeed {
  id: string;
  name: string;
  url: string;
  category: string;
  description?: string;
}

export interface RssFeedCategory {
  key: string;
  label: string;
  description: string;
  feeds: RssFeed[];
}

export const RSS_FEED_CATALOG: RssFeedCategory[] = [
  {
    key: "breaking_news",
    label: "Breaking News",
    description: "Global breaking news from major wire services and outlets",
    feeds: [
      {
        id: "bbc_world",
        name: "BBC World",
        url: "https://feeds.bbci.co.uk/news/world/rss.xml",
        category: "breaking_news",
        description: "BBC World Service news feed",
      },
      {
        id: "reuters_world",
        name: "Reuters",
        url: "https://www.reutersagency.com/feed/?best-topics=political-general&post_type=best",
        category: "breaking_news",
        description: "Reuters top world news",
      },
      {
        id: "ap_news",
        name: "AP News",
        url: "https://rsshub.app/apnews/topics/apf-topnews",
        category: "breaking_news",
        description: "Associated Press top news",
      },
      {
        id: "aljazeera",
        name: "Al Jazeera",
        url: "https://www.aljazeera.com/xml/rss/all.xml",
        category: "breaking_news",
        description: "Al Jazeera English full RSS",
      },
      {
        id: "npr_news",
        name: "NPR",
        url: "https://feeds.npr.org/1001/rss.xml",
        category: "breaking_news",
        description: "NPR News headlines",
      },
    ],
  },
  {
    key: "defense_military",
    label: "Defense & Military",
    description: "Defense industry, military operations, and strategic analysis",
    feeds: [
      {
        id: "defense_one",
        name: "Defense One",
        url: "https://www.defenseone.com/rss/",
        category: "defense_military",
        description: "Defense One policy, technology, threats",
      },
      {
        id: "breaking_defense",
        name: "Breaking Defense",
        url: "https://breakingdefense.com/feed/",
        category: "defense_military",
        description: "Breaking Defense news",
      },
      {
        id: "defense_news",
        name: "Defense News",
        url: "https://www.defensenews.com/arc/outboundfeeds/rss/?outputType=xml",
        category: "defense_military",
        description: "Defense News global coverage",
      },
      {
        id: "usni_news",
        name: "USNI News",
        url: "https://news.usni.org/feed",
        category: "defense_military",
        description: "US Naval Institute News",
      },
      {
        id: "military_times",
        name: "Military Times",
        url: "https://www.militarytimes.com/arc/outboundfeeds/rss/?outputType=xml",
        category: "defense_military",
        description: "Military Times coverage",
      },
      {
        id: "war_on_rocks",
        name: "War on the Rocks",
        url: "https://warontherocks.com/feed/",
        category: "defense_military",
        description: "War on the Rocks analysis",
      },
      {
        id: "the_war_zone",
        name: "The War Zone (TheDrive)",
        url: "https://www.thedrive.com/the-war-zone/feed",
        category: "defense_military",
        description: "The War Zone military coverage",
      },
      {
        id: "stars_stripes",
        name: "Stars and Stripes",
        url: "https://www.stripes.com/rss",
        category: "defense_military",
        description: "Stars and Stripes military newspaper",
      },
      {
        id: "janes_defence",
        name: "Jane's Defence",
        url: "https://www.janes.com/feeds/news",
        category: "defense_military",
        description: "Jane's Defence intelligence",
      },
    ],
  },
  {
    key: "osint_intelligence",
    label: "OSINT & Intelligence",
    description: "Open-source intelligence, investigative journalism, and threat intel",
    feeds: [
      {
        id: "bellingcat",
        name: "Bellingcat",
        url: "https://www.bellingcat.com/feed/",
        category: "osint_intelligence",
        description: "Bellingcat investigative journalism",
      },
      {
        id: "the_intercept",
        name: "The Intercept",
        url: "https://theintercept.com/feed/?rss",
        category: "osint_intelligence",
        description: "The Intercept investigative reporting",
      },
      {
        id: "osint_curious",
        name: "OSINT Curious",
        url: "https://osintcurio.us/feed/",
        category: "osint_intelligence",
        description: "OSINT Curious community blog",
      },
      {
        id: "intelbrief",
        name: "IntelBrief",
        url: "https://www.thesoufancenter.org/intelbrief/feed/",
        category: "osint_intelligence",
        description: "The Soufan Center IntelBrief",
      },
      {
        id: "recorded_future",
        name: "Recorded Future Blog",
        url: "https://www.recordedfuture.com/feed",
        category: "osint_intelligence",
        description: "Recorded Future threat intelligence blog",
      },
    ],
  },
  {
    key: "maritime",
    label: "Maritime",
    description: "Maritime shipping, naval operations, and port security",
    feeds: [
      {
        id: "usni_maritime",
        name: "USNI News (Maritime)",
        url: "https://news.usni.org/category/fleet-tracker/feed",
        category: "maritime",
        description: "USNI Fleet Tracker",
      },
      {
        id: "maritime_executive",
        name: "Maritime Executive",
        url: "https://www.maritime-executive.com/feed",
        category: "maritime",
        description: "Maritime Executive industry news",
      },
      {
        id: "gcaptain",
        name: "gCaptain",
        url: "https://gcaptain.com/feed/",
        category: "maritime",
        description: "gCaptain maritime and offshore news",
      },
      {
        id: "lloyds_list",
        name: "Lloyd's List",
        url: "https://lloydslist.maritimeintelligence.informa.com/rss/news",
        category: "maritime",
        description: "Lloyd's List shipping intelligence",
      },
      {
        id: "marine_traffic_blog",
        name: "Marine Traffic Blog",
        url: "https://www.marinetraffic.com/blog/feed/",
        category: "maritime",
        description: "MarineTraffic blog and updates",
      },
    ],
  },
  {
    key: "weather_disasters",
    label: "Weather & Natural Disasters",
    description: "Weather alerts, earthquakes, storms, and natural disaster monitoring",
    feeds: [
      {
        id: "noaa_weather",
        name: "NOAA Weather",
        url: "https://www.weather.gov/rss_page.php?site_name=nws",
        category: "weather_disasters",
        description: "National Weather Service alerts",
      },
      {
        id: "nws_alerts",
        name: "NWS Alerts",
        url: "https://alerts.weather.gov/cap/us.php?x=0",
        category: "weather_disasters",
        description: "NWS active alerts Atom feed",
      },
      {
        id: "weather_gov_rss",
        name: "Weather.gov RSS",
        url: "https://www.weather.gov/rss/",
        category: "weather_disasters",
        description: "Weather.gov syndication feeds",
      },
      {
        id: "usgs_earthquake",
        name: "USGS Earthquake RSS",
        url: "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/significant_month.atom",
        category: "weather_disasters",
        description: "USGS significant earthquakes (past month)",
      },
      {
        id: "nasa_eonet",
        name: "NASA EONET",
        url: "https://eonet.gsfc.nasa.gov/api/v3/events/rss",
        category: "weather_disasters",
        description: "NASA Earth Observatory Natural Event Tracker",
      },
      {
        id: "gdacs",
        name: "GDACS (Global Disaster Alert)",
        url: "https://www.gdacs.org/xml/rss.xml",
        category: "weather_disasters",
        description: "Global Disaster Alerting Coordination System",
      },
    ],
  },
  {
    key: "government_policy",
    label: "Government & Policy",
    description: "Official government communications and policy updates",
    feeds: [
      {
        id: "state_dept",
        name: "State Department",
        url: "https://www.state.gov/rss-feed/press-releases/feed/",
        category: "government_policy",
        description: "US State Department press releases",
      },
      {
        id: "dhs",
        name: "DHS",
        url: "https://www.dhs.gov/rss.xml",
        category: "government_policy",
        description: "Department of Homeland Security news",
      },
      {
        id: "dod_news",
        name: "DOD News",
        url: "https://www.defense.gov/DesktopModules/ArticleCS/RSS.ashx?max=10&ContentType=1&Site=945",
        category: "government_policy",
        description: "Department of Defense news releases",
      },
      {
        id: "white_house",
        name: "White House",
        url: "https://www.whitehouse.gov/feed/",
        category: "government_policy",
        description: "White House official blog/news",
      },
      {
        id: "cia_factbook",
        name: "CIA World Factbook Updates",
        url: "https://www.cia.gov/resources/rss-feeds/",
        category: "government_policy",
        description: "CIA public RSS feeds",
      },
      {
        id: "un_news",
        name: "UN News",
        url: "https://news.un.org/feed/subscribe/en/news/all/rss.xml",
        category: "government_policy",
        description: "United Nations News Centre",
      },
    ],
  },
  {
    key: "geopolitics_analysis",
    label: "Geopolitics & Analysis",
    description: "Think tanks, policy analysis, and geopolitical strategy",
    feeds: [
      {
        id: "foreign_policy",
        name: "Foreign Policy",
        url: "https://foreignpolicy.com/feed/",
        category: "geopolitics_analysis",
        description: "Foreign Policy magazine",
      },
      {
        id: "csis",
        name: "CSIS",
        url: "https://www.csis.org/analysis/feed",
        category: "geopolitics_analysis",
        description: "Center for Strategic & International Studies",
      },
      {
        id: "atlantic_council",
        name: "Atlantic Council",
        url: "https://www.atlanticcouncil.org/feed/",
        category: "geopolitics_analysis",
        description: "Atlantic Council analysis",
      },
      {
        id: "brookings",
        name: "Brookings",
        url: "https://www.brookings.edu/feed/",
        category: "geopolitics_analysis",
        description: "Brookings Institution research",
      },
      {
        id: "rand_corp",
        name: "RAND Corp",
        url: "https://www.rand.org/blog.xml",
        category: "geopolitics_analysis",
        description: "RAND Corporation blog/research",
      },
      {
        id: "carnegie",
        name: "Carnegie Endowment",
        url: "https://carnegieendowment.org/rss/solr/?fa=analysis",
        category: "geopolitics_analysis",
        description: "Carnegie Endowment for International Peace",
      },
    ],
  },
  {
    key: "local_regional",
    label: "Local & Regional",
    description: "Local law enforcement, traffic, transit, and community alerts",
    feeds: [
      {
        id: "broadcastify_scanner",
        name: "Broadcastify Scanner Feeds",
        url: "https://www.broadcastify.com/listen/feed/rss",
        category: "local_regional",
        description: "Broadcastify police/fire scanner API placeholder",
      },
      {
        id: "local_news_rss",
        name: "Local News RSS",
        url: "https://news.google.com/rss/topics/CAAqJggKIiBDQkFTRWdvSUwyMHZNRFZxYUdjU0FtVnVHZ0pWVXlnQVAB",
        category: "local_regional",
        description: "Google News local/regional aggregator",
      },
      {
        id: "traffic_transit",
        name: "Traffic/Transit Alerts",
        url: "https://www.511.org/rss/alerts",
        category: "local_regional",
        description: "Regional traffic and transit alerts",
      },
    ],
  },
  {
    key: "radio_comms",
    label: "Radio & Communications",
    description: "Radio scanner feeds, WebSDR, and amateur radio",
    feeds: [
      {
        id: "broadcastify_top50",
        name: "Broadcastify Top 50 Feeds",
        url: "https://www.broadcastify.com/listen/top",
        category: "radio_comms",
        description: "Top 50 most listened Broadcastify feeds",
      },
      {
        id: "websdr_links",
        name: "WebSDR Links",
        url: "http://www.websdr.org/",
        category: "radio_comms",
        description: "Web-based Software Defined Radio receivers",
      },
      {
        id: "aprs_feeds",
        name: "Amateur Radio APRS Feeds",
        url: "https://aprs.fi/",
        category: "radio_comms",
        description: "APRS automatic packet reporting system",
      },
    ],
  },
];

/** Flatten all feeds from catalog */
export function getAllFeeds(): RssFeed[] {
  return RSS_FEED_CATALOG.flatMap((cat) => cat.feeds);
}

/** Get a single feed by ID */
export function getFeedById(id: string): RssFeed | undefined {
  return getAllFeeds().find((f) => f.id === id);
}

/** Get feeds by category key */
export function getFeedsByCategory(categoryKey: string): RssFeed[] {
  const cat = RSS_FEED_CATALOG.find((c) => c.key === categoryKey);
  return cat?.feeds || [];
}

