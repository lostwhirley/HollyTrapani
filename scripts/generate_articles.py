#!/usr/bin/env python3
"""
Generate weekly real estate articles from real market data (FRED, Census, Claude API).
"""

import json
import csv
import io
import os
from datetime import datetime
import requests
from anthropic import Anthropic

# Initialize Anthropic client
client = Anthropic()

# Constants
FRED_MORTGAGE_30YR = "MORTGAGE30US"
FRED_MORTGAGE_15YR = "MORTGAGE15US"
FRED_CSV_URL = "https://fred.stlouisfed.org/graph/fredgraph.csv"
CENSUS_ACS_URL = "https://api.census.gov/data/2023/acs/acs5"
LISTINGS_PATH = "holly-sells-homes/all-listings.json"
OUTPUT_PATH = "articles.json"

# Claude system prompt
SYSTEM_PROMPT = """You are a professional real estate content writer for Holly Trapani, a licensed real estate agent serving Ave Maria and Naples in Collier County, Southwest Florida. Holly works with New Day Realty.

Write in a warm, knowledgeable, locally-grounded voice for homebuyers and sellers in Southwest Florida. Ground every article in the actual data provided. Do not fabricate statistics or claim data you haven't been given.

Return your response as a valid JSON object with these exact fields:
{
  "title": "Article title",
  "tag": "one of: Buying, Selling, Market, Lifestyle, Neighborhood",
  "excerpt": "2-3 sentence summary",
  "full_content": "250-400 word article body"
}"""


def fetch_fred_rate(series_id):
    """Fetch the latest rate from FRED."""
    url = f"{FRED_CSV_URL}?id={series_id}"
    resp = requests.get(url, timeout=10)
    resp.raise_for_status()

    reader = csv.reader(io.StringIO(resp.text))
    next(reader)  # skip header

    rows = [(row[0], row[1]) for row in reader if len(row) >= 2 and row[1] != '.']
    if not rows:
        raise ValueError(f"No data found for {series_id}")

    last_date, last_value = rows[-1]
    return float(last_value), last_date


def fetch_census_data():
    """Fetch Collier County, FL housing data from Census ACS."""
    variables = "B25077_001E,B25064_001E,B25003_001E,B25003_002E"
    params = {
        "get": variables,
        "for": "county:021",
        "in": "state:12"
    }

    resp = requests.get(CENSUS_ACS_URL, params=params, timeout=10)
    resp.raise_for_status()

    data = resp.json()
    headers = data[0]
    values = data[1]
    row = dict(zip(headers, values))

    median_value = int(row['B25077_001E'])
    median_rent = int(row['B25064_001E'])
    total_units = int(row['B25003_001E'])
    owner_units = int(row['B25003_002E'])
    homeownership_rate = round(owner_units / total_units * 100, 1) if total_units > 0 else 0

    return median_value, median_rent, homeownership_rate


def summarize_listings(path):
    """Extract price and description data from local listings."""
    try:
        with open(path) as f:
            data = json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return {
            'count': 0,
            'avg_price': 0,
            'min_price': 0,
            'max_price': 0,
            'cities': [],
            'avg_beds': 0,
            'avg_sqft': 0,
        }

    results = data.get('data', {}).get('home_search', {}).get('results', [])
    if not results:
        return {
            'count': 0,
            'avg_price': 0,
            'min_price': 0,
            'max_price': 0,
            'cities': [],
            'avg_beds': 0,
            'avg_sqft': 0,
        }

    prices = [r.get('list_price') for r in results if r.get('list_price')]
    cities = [r.get('location', {}).get('address', {}).get('city') for r in results]
    cities = [c for c in cities if c]
    beds = [r.get('description', {}).get('beds') for r in results if r.get('description', {}).get('beds')]
    sqfts = [r.get('description', {}).get('sqft') for r in results if r.get('description', {}).get('sqft')]

    return {
        'count': len(results),
        'avg_price': round(sum(prices) / len(prices)) if prices else 0,
        'min_price': min(prices) if prices else 0,
        'max_price': max(prices) if prices else 0,
        'cities': list(set(cities)),
        'avg_beds': round(sum(beds) / len(beds), 1) if beds else 0,
        'avg_sqft': round(sum(sqfts) / len(sqfts)) if sqfts else 0,
    }


def generate_article(user_prompt):
    """Call Claude to generate an article."""
    try:
        message = client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=1024,
            system=SYSTEM_PROMPT,
            messages=[{"role": "user", "content": user_prompt}]
        )

        text = message.content[0].text.strip()
        # Remove markdown code fences if present
        text = text.lstrip('```json\n`').lstrip('```\n').rstrip('\n```')

        article = json.loads(text)
        return article
    except Exception as e:
        print(f"Error generating article: {e}")
        return None


def generate_all_articles(data_context):
    """Generate 3 articles using Claude."""
    articles = []

    prompts = [
        f"""Using the market data below, write a real estate article for buyers in Ave Maria and Naples, Florida about what current mortgage rates mean for affordability in this market. Be specific with the numbers. Calculate a rough monthly payment example for a $400,000 home at the current 30-year rate (assume 20% down, 3% HOA/tax/insurance). Help buyers understand their options right now.

{data_context}""",

        f"""Using the market data below, write a neighborhood guide article about Ave Maria, Florida. This is a master-planned community in Collier County. Highlight the community's character, what the housing market looks like (use Holly's listings for price/size examples), and why Collier County's homeownership rate reflects the area's desirability. Make it useful for someone researching a move.

{data_context}""",

        f"""Using the market data below, write a practical article for someone considering selling their home in Ave Maria or Naples, Florida. Use Collier County's median home value and Holly's listing prices as anchors. Discuss how current mortgage rates affect buyer demand. Give actionable advice for pricing strategy and timing.

{data_context}"""
    ]

    for prompt in prompts:
        article = generate_article(prompt)
        if article:
            articles.append(article)
        else:
            # Fallback article if generation fails
            articles.append({
                "title": "Real Estate Market Update",
                "tag": "Market",
                "excerpt": "Stay tuned for the latest insights on the Southwest Florida real estate market.",
                "full_content": "Check back soon for market updates and insights."
            })

    return articles


def main():
    print("Fetching market data...")

    try:
        # Fetch FRED mortgage rates
        rate_30yr, fred_30yr_date = fetch_fred_rate(FRED_MORTGAGE_30YR)
        rate_15yr, fred_15yr_date = fetch_fred_rate(FRED_MORTGAGE_15YR)
        print(f"  30-year rate: {rate_30yr}% (as of {fred_30yr_date})")
        print(f"  15-year rate: {rate_15yr}% (as of {fred_15yr_date})")

        # Fetch Census data
        median_value, median_rent, homeownership_rate = fetch_census_data()
        print(f"  Collier County median home value: ${median_value:,}")
        print(f"  Collier County median rent: ${median_rent}/month")
        print(f"  Homeownership rate: {homeownership_rate}%")

        # Summarize local listings
        listings = summarize_listings(LISTINGS_PATH)
        print(f"  Holly's listings: {listings['count']} properties, ${listings['min_price']:,}–${listings['max_price']:,}")

        # Build data context for Claude
        data_context = f"""Current Market Data (as of {fred_30yr_date}):
- 30-year fixed mortgage rate: {rate_30yr}%
- 15-year fixed mortgage rate: {rate_15yr}%
- Collier County median home value: ${median_value:,} (Census ACS 2023)
- Collier County median gross rent: ${median_rent:,}/month
- Collier County homeownership rate: {homeownership_rate}%

Holly's Current Listings:
- {listings['count']} active listings in Ave Maria and Naples
- Price range: ${listings['min_price']:,} – ${listings['max_price']:,}
- Average price: ${listings['avg_price']:,}
- Average: {listings['avg_beds']} beds, {listings['avg_sqft']:,} sqft
- Communities: {', '.join(listings['cities']) if listings['cities'] else 'Ave Maria, Naples'}"""

        # Generate articles
        print("\nGenerating articles with Claude...")
        articles = generate_all_articles(data_context)

        # Assemble output
        now = datetime.utcnow().isoformat() + 'Z'
        output = {
            "generated_at": now,
            "data_snapshot": {
                "mortgage_30yr": rate_30yr,
                "mortgage_15yr": rate_15yr,
                "fred_series_date": fred_30yr_date,
                "collier_median_home_value": median_value,
                "collier_median_gross_rent": median_rent,
                "collier_homeownership_rate": homeownership_rate,
                "census_vintage": "2023",
                "holly_listings_avg_price": listings['avg_price'],
                "holly_listings_count": listings['count'],
            },
            "articles": [
                {
                    "id": f"{datetime.utcnow().strftime('%Y-%m-%d')}-article-{i+1}",
                    "tag": article.get('tag', 'Market'),
                    "date": datetime.utcnow().strftime('%B %Y'),
                    "date_iso": datetime.utcnow().strftime('%Y-%m-%d'),
                    "title": article.get('title', 'Real Estate Update'),
                    "excerpt": article.get('excerpt', ''),
                    "full_content": article.get('full_content', ''),
                    "data_points": [
                        f"30-year fixed rate: {rate_30yr}% (FRED MORTGAGE30US, {fred_30yr_date})",
                        f"15-year fixed rate: {rate_15yr}% (FRED MORTGAGE15US, {fred_15yr_date})",
                        f"Collier County median home value: ${median_value:,} (Census ACS 2023)",
                        f"Collier County median rent: ${median_rent:,}/month (Census ACS 2023)",
                        f"Collier County homeownership rate: {homeownership_rate}% (Census ACS 2023)"
                    ]
                }
                for i, article in enumerate(articles)
            ]
        }

        # Write output
        with open(OUTPUT_PATH, 'w') as f:
            json.dump(output, f, indent=2)

        print(f"\n✓ Articles generated successfully: {OUTPUT_PATH}")
        print(f"  Generated at: {now}")
        print(f"  Articles: {len(output['articles'])}")

    except Exception as e:
        print(f"✗ Error: {e}")
        raise


if __name__ == "__main__":
    main()
