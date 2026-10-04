"""Download the public HUSKY schedule locally; do not commit the generated catalog."""
import json
import re
from html.parser import HTMLParser
from pathlib import Path
from urllib.request import Request, urlopen

SOURCE = 'https://ctdhp.org/provider-benefit-resource/'

class ScheduleParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.rows = []
        self.row = None
        self.cell = None
    def handle_starttag(self, tag, attrs):
        if tag == 'tr': self.row = []
        if tag in ('td', 'th') and self.row is not None: self.cell = []
    def handle_data(self, data):
        if self.cell is not None: self.cell.append(data)
    def handle_endtag(self, tag):
        if tag in ('td', 'th') and self.cell is not None:
            self.row.append(' '.join(' '.join(self.cell).split()))
            self.cell = None
        if tag == 'tr' and self.row is not None:
            self.rows.append(self.row)
            self.row = None

def main():
    request = Request(SOURCE, headers={'User-Agent': 'ClearCare prototype reference importer'})
    with urlopen(request, timeout=30) as response:
        page = response.read().decode('utf-8')
    parser = ScheduleParser(); parser.feed(page)
    codes = {}
    for row in parser.rows:
        for index, cell in enumerate(row):
            if re.fullmatch(r'D\d{4}', cell) and index + 1 < len(row):
                description = row[index + 1]
                if description and not re.fullmatch(r'D\d{4}', description):
                    codes[cell] = {'code': cell, 'description': description}
    if len(codes) < 20:
        raise RuntimeError('Schedule format changed; catalog not written.')
    destination = Path(__file__).with_name('public_cdt_catalog.json')
    destination.write_text(json.dumps({'source': SOURCE, 'scope': 'HUSKY public covered-service schedule; not a complete CDT edition', 'codes': list(codes.values())}, indent=2), encoding='utf-8')
    print(f'Imported {len(codes)} unique codes into {destination.name}.')

if __name__ == '__main__': main()
