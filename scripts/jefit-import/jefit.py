import csv
import io
import re
import sys


def read_sections(path):
    sections = {}
    current = None
    buffer = []
    with open(path, encoding="utf-8-sig") as handle:
        for line in handle:
            header = re.match(r"^### ([A-Z ]+?) #+", line)
            if header:
                current = header.group(1).strip()
                buffer = []
                continue
            if line.startswith("#####"):
                if current:
                    rows = list(csv.DictReader(io.StringIO("".join(buffer).strip() + "\n")))
                    sections[current] = rows
                current = None
                continue
            if current:
                buffer.append(line)
    return sections


if __name__ == "__main__":
    sections = read_sections(sys.argv[1])
    for name, rows in sections.items():
        print(name, len(rows))
