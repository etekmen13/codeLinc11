"""Import active CDT entries from the supplied adult dental fee schedule."""

import argparse
import json
import re
from datetime import date, datetime
from pathlib import Path
import openpyxl


def as_date(value):
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    if value is None:
        return None
    raise ValueError(f"Unexpected effective/end date: {value!r}")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("xlsx", type=Path)
    parser.add_argument("--as-of", default=date.today().isoformat())
    args = parser.parse_args()
    on = date.fromisoformat(args.as_of)
    workbook = openpyxl.load_workbook(args.xlsx, read_only=True, data_only=True)
    codes = {}
    excluded = 0
    for sheet in workbook:
        columns = None
        for row in sheet.iter_rows(values_only=True):
            if "Proc Code" in row and "Proc description" in row:
                columns = {
                    value: index for index, value in enumerate(row) if value is not None
                }
                continue
            if columns is None:
                continue
            code = str(row[columns["Proc Code"]] or "").strip().upper()
            if not re.fullmatch(r"D\d{4}", code):
                continue
            start = as_date(row[columns["Effective Date"]])
            end = as_date(row[columns["End Date"]])
            if (start and start > on) or (end and end < on):
                excluded += 1
                continue
            description = " ".join(str(row[columns["Proc description"]] or "").split())
            if not description:
                continue
            if code in codes and codes[code]["description"] != description:
                raise ValueError(
                    f"Conflicting active descriptions for {code}; review source rows."
                )
            codes[code] = {"code": code, "description": description}
    workbook.close()
    if not codes:
        raise ValueError("No active CDT codes found. Check workbook headers and date.")
    output = Path(__file__).with_name("public_cdt_catalog.json")
    output.write_text(
        json.dumps(
            {
                "source": args.xlsx.name,
                "scope": f"Uploaded Connecticut adult dental fee schedule; active on {on}; not a complete CDT edition. Medicaid fees are not used.",
                "codes": sorted(codes.values(), key=lambda row: row["code"]),
            },
            indent=2,
        ),
        encoding="utf-8",
    )
    print(
        f"Imported {len(codes)} unique active CDT codes; excluded {excluded} historical/future rows. Output: {output.name}"
    )


if __name__ == "__main__":
    main()
