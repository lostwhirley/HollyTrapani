#!/usr/bin/env python3
"""
Refresh listings from Realty in US API and update all-listings.json files
"""

import requests
import json
import os
from datetime import datetime

# Configuration
FULFILLMENT_ID = "100732851"
API_HOST = "realty-in-us.p.rapidapi.com"
API_KEY = os.environ.get("RAPIDAPI_KEY", "2a1eca8e84msh49b38948c7d92c3p168af6jsnbb278f742246")

# File paths
REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
HOMES_LISTINGS_FILE = os.path.join(REPO_ROOT, "holly-sells-homes", "all-listings.json")
HOUSES_LISTINGS_FILE = os.path.join(REPO_ROOT, "holly-sells-houses", "all-listings.json")

def fetch_listings():
    """Fetch listings from Realty in US API"""
    print("Fetching listings from Realty in US API...")

    url = f"https://{API_HOST}/agents/v2/get-listings"
    headers = {
        "Content-Type": "application/json",
        "x-rapidapi-host": API_HOST,
        "x-rapidapi-key": API_KEY
    }
    params = {
        "fulfillment_id": FULFILLMENT_ID
    }

    try:
        response = requests.get(url, headers=headers, params=params, timeout=30)
        response.raise_for_status()
        data = response.json()
        print(f"✓ Successfully fetched listings")
        return data
    except requests.exceptions.RequestException as e:
        print(f"✗ Error fetching listings: {e}")
        return None

def save_listings(data, filepath):
    """Save listings data to JSON file"""
    try:
        os.makedirs(os.path.dirname(filepath), exist_ok=True)
        with open(filepath, 'w') as f:
            json.dump(data, f, indent=2)
        print(f"✓ Saved listings to {os.path.basename(filepath)}")
        return True
    except IOError as e:
        print(f"✗ Error saving to {filepath}: {e}")
        return False

def main():
    print(f"\n{'='*60}")
    print(f"Refreshing listings from Realty in US API")
    print(f"Fulfillment ID: {FULFILLMENT_ID}")
    print(f"Timestamp: {datetime.now().isoformat()}")
    print(f"{'='*60}\n")

    # Fetch listings
    listings_data = fetch_listings()
    if not listings_data:
        print("\n✗ Failed to fetch listings. Exiting.")
        return False

    # Save to both locations
    success = True
    success &= save_listings(listings_data, HOMES_LISTINGS_FILE)
    success &= save_listings(listings_data, HOUSES_LISTINGS_FILE)

    if success:
        print(f"\n✓ Listings refreshed successfully!")

        # Print summary
        if "data" in listings_data and "home_search" in listings_data["data"]:
            results = listings_data["data"]["home_search"].get("results", [])
            print(f"  Total listings: {len(results)}")
    else:
        print("\n✗ Some files failed to save.")

    print(f"{'='*60}\n")
    return success

if __name__ == "__main__":
    success = main()
    exit(0 if success else 1)
