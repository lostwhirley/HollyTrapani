#!/usr/bin/env python3
"""
Refresh rental listings from Realty in US API and update rentals.json files
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
HOMES_RENTALS_FILE = os.path.join(REPO_ROOT, "holly-sells-homes", "rentals.json")

def get_headers():
    """Get API headers"""
    return {
        "Content-Type": "application/json",
        "x-rapidapi-host": API_HOST,
        "x-rapidapi-key": API_KEY
    }

def fetch_rentals():
    """Fetch rental listings from Realty in US API"""
    print("Fetching rental listings from Realty in US API...")

    url = f"https://{API_HOST}/agents/v2/get-listings"
    params = {
        "fulfillment_id": FULFILLMENT_ID,
        "status": "for_rent"
    }

    try:
        response = requests.get(url, headers=get_headers(), params=params, timeout=30)
        response.raise_for_status()
        data = response.json()
        print(f"✓ Successfully fetched {len(data.get('data', {}).get('home_search', {}).get('results', []))} rental listings")
        return data
    except requests.exceptions.RequestException as e:
        print(f"✗ Error fetching rentals: {e}")
        return None

def fetch_property_details(property_id):
    """Fetch detailed information for a specific property"""
    url = f"https://{API_HOST}/properties/v3/detail"
    params = {
        "property_id": property_id
    }

    try:
        response = requests.get(url, headers=get_headers(), params=params, timeout=30)
        response.raise_for_status()
        return response.json()
    except requests.exceptions.RequestException as e:
        print(f"  ⚠ Error fetching details for property {property_id}: {e}")
        return None

def save_rentals(data, filepath):
    """Save rental data to JSON file"""
    try:
        os.makedirs(os.path.dirname(filepath), exist_ok=True)
        with open(filepath, 'w') as f:
            json.dump(data, f, indent=2)
        print(f"✓ Saved to {os.path.basename(filepath)}")
        return True
    except IOError as e:
        print(f"✗ Error saving to {filepath}: {e}")
        return False

def enrich_rentals_with_details(all_rentals_data):
    """Fetch detailed information for each rental and create enriched rentals data"""
    print("\nFetching detailed information for each rental...")

    results = all_rentals_data.get('data', {}).get('home_search', {}).get('results', [])
    detailed_rentals = []

    for i, rental in enumerate(results, 1):
        property_id = rental.get('property_id')
        if property_id:
            print(f"  ({i}/{len(results)}) Fetching details for property {property_id}...")
            details = fetch_property_details(property_id)
            if details:
                detailed_rentals.append(details)
            else:
                # Fallback to basic rental if detail fetch fails
                detailed_rentals.append(rental)

    # Wrap in same structure as all_rentals for compatibility
    return {
        'data': {
            'home_search': {
                'results': detailed_rentals
            }
        }
    }

def main():
    print(f"\n{'='*60}")
    print(f"Refreshing rental listings from Realty in US API")
    print(f"Fulfillment ID: {FULFILLMENT_ID}")
    print(f"Timestamp: {datetime.now().isoformat()}")
    print(f"{'='*60}")

    # Fetch all rental listings
    all_rentals_data = fetch_rentals()
    if not all_rentals_data:
        print("\n✗ Failed to fetch rentals. Exiting.")
        return False

    # Fetch and save detailed rentals
    detailed_rentals_data = enrich_rentals_with_details(all_rentals_data)
    print("\nSaving detailed rentals...")
    success = True
    success &= save_rentals(detailed_rentals_data, HOMES_RENTALS_FILE)

    if success:
        print(f"\n✓ All rentals refreshed successfully!")
        results_count = len(all_rentals_data.get('data', {}).get('home_search', {}).get('results', []))
        print(f"  Total rentals: {results_count}")
    else:
        print("\n✗ Some files failed to save.")

    print(f"{'='*60}\n")
    return success

if __name__ == "__main__":
    success = main()
    exit(0 if success else 1)
