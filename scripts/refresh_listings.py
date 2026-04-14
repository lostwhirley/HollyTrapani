#!/usr/bin/env python3
"""
Refresh listings from Realty in US API and update all-listings.json and listings.json files
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
HOMES_ALL_LISTINGS_FILE = os.path.join(REPO_ROOT, "holly-sells-homes", "all-listings.json")
HOMES_LISTINGS_FILE = os.path.join(REPO_ROOT, "holly-sells-homes", "listings.json")
SOLD_LISTINGS_FILE = os.path.join(REPO_ROOT, "holly-sells-homes", "sold-listings.json")
REVIEWS_FILE = os.path.join(REPO_ROOT, "holly-sells-homes", "reviews.json")

def get_headers():
    """Get API headers"""
    return {
        "Content-Type": "application/json",
        "x-rapidapi-host": API_HOST,
        "x-rapidapi-key": API_KEY
    }

def fetch_reviews():
    """Fetch agent reviews from Realty in US API, preserving manually-added reviews from other sources"""
    print("Fetching agent reviews...")
    url = f"https://{API_HOST}/agents/v2/get-reviews"
    params = {"fulfillment_id": FULFILLMENT_ID}
    try:
        # Load any existing manually-added reviews (e.g. Facebook) so we don't overwrite them
        manual_reviews = []
        try:
            with open(REVIEWS_FILE, 'r') as f:
                existing = json.load(f)
            manual_reviews = [r for r in existing.get('reviews', []) if r.get('source_id') != 'RDC']
            if manual_reviews:
                print(f"  Preserving {len(manual_reviews)} manually-added review(s) from other sources")
        except (IOError, json.JSONDecodeError):
            pass

        response = requests.get(url, headers=get_headers(), params=params, timeout=30)
        response.raise_for_status()
        data = response.json()
        rdc_reviews = data.get('data', {}).get('agent_branding_reviews', {}).get('reviews', [])
        print(f"✓ Fetched {len(rdc_reviews)} review(s) from Realtor.com")

        all_reviews = rdc_reviews + manual_reviews
        if all_reviews:
            avg = sum(r.get('rating', 0) for r in all_reviews) / len(all_reviews)
            result = {"average_rating": round(avg, 1), "total_reviews": len(all_reviews), "reviews": all_reviews}
        else:
            result = {"average_rating": 0, "total_reviews": 0, "reviews": []}

        with open(REVIEWS_FILE, 'w') as f:
            json.dump(result, f, indent=2)
        print(f"✓ Saved {len(all_reviews)} total review(s) to reviews.json")
        return True
    except Exception as e:
        print(f"✗ Error fetching reviews: {e}")
        return False


def fetch_listings():
    """Fetch listings from Realty in US API"""
    print("Fetching listings from Realty in US API...")

    url = f"https://{API_HOST}/agents/v2/get-listings"
    params = {
        "fulfillment_id": FULFILLMENT_ID
    }

    try:
        response = requests.get(url, headers=get_headers(), params=params, timeout=30)
        response.raise_for_status()
        data = response.json()
        print(f"✓ Successfully fetched {len(data.get('data', {}).get('home_search', {}).get('results', []))} listings")
        return data
    except requests.exceptions.RequestException as e:
        print(f"✗ Error fetching listings: {e}")
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

def save_listings(data, filepath):
    """Save listings data to JSON file"""
    try:
        os.makedirs(os.path.dirname(filepath), exist_ok=True)
        with open(filepath, 'w') as f:
            json.dump(data, f, indent=2)
        print(f"✓ Saved to {os.path.basename(filepath)}")
        return True
    except IOError as e:
        print(f"✗ Error saving to {filepath}: {e}")
        return False

def enrich_listings_with_details(all_listings_data):
    """Fetch detailed information for each listing and create enriched listings data"""
    print("\nFetching detailed information for each listing...")

    results = all_listings_data.get('data', {}).get('home_search', {}).get('results', [])
    detailed_listings = []

    for i, listing in enumerate(results, 1):
        property_id = listing.get('property_id')
        if property_id:
            print(f"  ({i}/{len(results)}) Fetching details for property {property_id}...")
            details = fetch_property_details(property_id)
            if details:
                detailed_listings.append(details)
            else:
                # Fallback to basic listing if detail fetch fails
                detailed_listings.append(listing)

    # Wrap in same structure as all_listings for compatibility
    return {
        'data': {
            'home_search': {
                'results': detailed_listings
            }
        }
    }

def load_sold_listings():
    """Load existing sold listings from file."""
    try:
        with open(SOLD_LISTINGS_FILE, 'r') as f:
            return json.load(f)
    except (IOError, json.JSONDecodeError):
        return []

def check_for_newly_sold(previous_ids, current_ids):
    """Check properties that dropped off the active list to see if they sold."""
    missing_ids = previous_ids - current_ids
    if not missing_ids:
        return []

    print(f"\nChecking {len(missing_ids)} property(ies) that left active listings...")
    newly_sold = []

    for prop_id in missing_ids:
        print(f"  Checking property {prop_id}...")
        details = fetch_property_details(prop_id)
        if not details:
            continue
        home = details.get('data', {}).get('home', {})
        status = home.get('status', '').lower()
        if status == 'sold':
            desc = home.get('description', {})
            addr = home.get('location', {}).get('address', {})
            photos = home.get('photos', [])
            primary = home.get('primary_photo', {})
            sold_entry = {
                'property_id': prop_id,
                'status': 'sold',
                'last_sold_date': home.get('last_sold_date'),
                'last_sold_price': home.get('last_sold_price'),
                'list_price': home.get('list_price'),
                'address': {
                    'line': addr.get('line'),
                    'city': addr.get('city'),
                    'state_code': addr.get('state_code'),
                    'postal_code': addr.get('postal_code')
                },
                'description': {
                    'beds': desc.get('beds'),
                    'baths_consolidated': desc.get('baths_consolidated'),
                    'sqft': desc.get('sqft'),
                    'type': desc.get('type'),
                    'year_built': desc.get('year_built')
                },
                'primary_photo': primary.get('href', photos[0].get('href') if photos else '')
            }
            newly_sold.append(sold_entry)
            print(f"  ✓ {addr.get('line')} sold on {home.get('last_sold_date')} for ${home.get('last_sold_price'):,}")

    return newly_sold

def update_sold_listings(newly_sold):
    """Merge newly sold properties into sold-listings.json."""
    if not newly_sold:
        return

    existing = load_sold_listings()
    existing_ids = {e['property_id'] for e in existing}

    added = 0
    for entry in newly_sold:
        if entry['property_id'] not in existing_ids:
            existing.insert(0, entry)  # newest first
            added += 1

    if added:
        with open(SOLD_LISTINGS_FILE, 'w') as f:
            json.dump(existing, f, indent=2)
        print(f"✓ Added {added} new sold listing(s) to sold-listings.json")

def main():
    print(f"\n{'='*60}")
    print(f"Refreshing listings from Realty in US API")
    print(f"Fulfillment ID: {FULFILLMENT_ID}")
    print(f"Timestamp: {datetime.now().isoformat()}")
    print(f"{'='*60}")

    # Load previous listing IDs to detect sold properties
    previous_ids = set()
    try:
        with open(HOMES_ALL_LISTINGS_FILE, 'r') as f:
            prev = json.load(f)
        for r in prev.get('data', {}).get('home_search', {}).get('results', []):
            if r.get('property_id'):
                previous_ids.add(str(r['property_id']))
    except (IOError, json.JSONDecodeError):
        pass

    # Fetch reviews
    fetch_reviews()

    # Fetch all listings
    all_listings_data = fetch_listings()
    if not all_listings_data:
        print("\n✗ Failed to fetch listings. Exiting.")
        return False

    # Detect newly sold (dropped off active list)
    current_ids = {str(r['property_id']) for r in all_listings_data.get('data', {}).get('home_search', {}).get('results', []) if r.get('property_id')}
    newly_sold = check_for_newly_sold(previous_ids, current_ids)
    update_sold_listings(newly_sold)

    # Save all-listings.json (summary data)
    print("\nSaving summary listings...")
    success = True
    success &= save_listings(all_listings_data, HOMES_ALL_LISTINGS_FILE)

    # Fetch and save detailed listings
    detailed_listings_data = enrich_listings_with_details(all_listings_data)
    print("\nSaving detailed listings...")
    success &= save_listings(detailed_listings_data, HOMES_LISTINGS_FILE)

    if success:
        print(f"\n✓ All listings refreshed successfully!")
        results_count = len(all_listings_data.get('data', {}).get('home_search', {}).get('results', []))
        print(f"  Total listings: {results_count}")
    else:
        print("\n✗ Some files failed to save.")

    print(f"{'='*60}\n")
    return success

if __name__ == "__main__":
    success = main()
    exit(0 if success else 1)
