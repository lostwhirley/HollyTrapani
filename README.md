Web setup for Holly Trapani site

Quick start

Node (recommended for static serving):

1. Install the `serve` package when prompted (it will run via `npx`).
2. Run the site locally:

```bash
npx serve . -s
```

Alternative (Python):

```bash
python3 -m http.server 8000
```

Puppeteer scripts

Install Puppeteer dependencies and run generators from the `puppeteer/` folder:

```bash
npm run puppeteer:install
npm run puppeteer:generate
```

Python scripts

Install Python dependencies:

```bash
python3 -m pip install -r requirements.txt
```

Then run the scripts in `scripts/` (they use environment variables for API keys):

```bash
export RAPIDAPI_KEY=your_key_here
export CENSUS_API_KEY=your_key_here
python3 scripts/refresh_listings.py
python3 scripts/refresh_rentals.py
python3 scripts/generate_articles.py
```

Files added by this setup: [package.json](package.json), [requirements.txt](requirements.txt), [README.md](README.md), [ .gitignore](.gitignore)
