#!/usr/bin/env python3
"""MovieNight: daily IMDb ratings list for the app, served from coenvermeer.nl/movienight-data/.

Runs on the coenvermeer.nl server from beheer's crontab (installed as ~/scripts/movienight-imdb.py).
Downloads IMDb's non-commercial datasets (refreshed daily; personal, non-commercial use), keeps
movies (incl. TV movies, videos, shorts and TV specials) with at least MIN_VOTES votes and writes:

  imdb-ratings.txt   sorted fixed-width records: 8-digit IMDb number + rating x 10 as 2 digits (max 99),
                     the same format as the list bundled in the app (scripts/imdb-ratings.mjs)
  imdb-ratings.json  {"built": "YYYY-MM-DD", "count": n, "minVotes": n} -- the app checks this first

Files are replaced atomically, and only when the new list looks sane, so the app never sees a
half-written or broken list.
"""
import datetime
import gzip
import json
import os
import sys
import tempfile
import urllib.request

OUT = os.environ.get('OUT', '/var/www/coenvermeer.nl/www/movienight-data')
MIN_VOTES = int(os.environ.get('MIN_VOTES', '10'))
TYPES = {'movie', 'tvMovie', 'video', 'short', 'tvSpecial'}
MIN_COUNT = 100_000  # fewer movies than this means the download went wrong: keep the old list


def rows(name):
    """Yield the tab-separated rows of an IMDb dataset, streamed (no temp files)."""
    req = urllib.request.Request(f'https://datasets.imdbws.com/{name}', headers={'User-Agent': 'movienight-imdb'})
    with urllib.request.urlopen(req, timeout=300) as resp, gzip.open(resp, 'rt', encoding='utf-8') as f:
        next(f)  # header
        for line in f:
            yield line.rstrip('\n').split('\t')


def write_atomic(path, text):
    fd, tmp = tempfile.mkstemp(dir=os.path.dirname(path), prefix='.tmp-')
    with os.fdopen(fd, 'w', encoding='ascii') as f:
        f.write(text)
    os.chmod(tmp, 0o644)
    os.replace(tmp, path)


def main():
    ratings = {}
    for tconst, avg, votes in rows('title.ratings.tsv.gz'):
        if int(votes) >= MIN_VOTES:
            ratings[tconst] = min(99, round(float(avg) * 10))
    found = []
    for cols in rows('title.basics.tsv.gz'):
        r = ratings.get(cols[0])
        if r is not None and cols[1] in TYPES:
            found.append((int(cols[0][2:]), r))
    found.sort()
    if len(found) < MIN_COUNT:
        sys.exit(f'only {len(found)} movies, keeping the previous list')

    os.makedirs(OUT, exist_ok=True)
    data = ''.join(f'{n:08d}{r:02d}' for n, r in found)
    built = datetime.date.today().isoformat()
    write_atomic(os.path.join(OUT, 'imdb-ratings.txt'), data)
    write_atomic(os.path.join(OUT, 'imdb-ratings.json'),
                 json.dumps({'built': built, 'count': len(found), 'minVotes': MIN_VOTES}) + '\n')
    print(f'{datetime.datetime.now():%Y-%m-%d %H:%M} {len(found)} movies, {len(data) / 1e6:.1f} MB')


if __name__ == '__main__':
    main()
