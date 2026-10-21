"""Prepare a household table from a user-supplied D006/D008 archive.

The default output is private. Source household/person identifiers never enter
the prepared table or audit. No model, weights, imputation or network is used.
"""
from __future__ import annotations

from .localization import tr


import argparse
from collections import Counter, defaultdict
import csv
import hashlib
import io
import json
import math
from pathlib import Path
import statistics


YEAR = 2024
HOUSING_PATH = "d006/2024/rio_2024.csv"
ROSTER_PATH = "d008/2024/kontr_k.csv"
GROUP = tr('Household size')
SIZE = tr('Household members')
TOTAL = tr('Total floor area')
LIVING = tr('Living area')
PER_PERSON = tr('Area per person')
COLUMNS = [GROUP, SIZE, TOTAL, LIVING, PER_PERSON]
GROUP_ORDER = [tr('1–2 people'), tr('3–4 people'), tr('5+ people')]
EXCLUSION_ORDER = [
    "missing_roster", "roster_size_unconfirmed", "invalid_area",
    "living_area_exceeds_total", "nonfinite_derived",
]


class PreparationError(ValueError):
    """An invalid structure or ambiguous join must stop preparation."""


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def _read(text: str, required: list[str], form: str) -> list[dict]:
    lines = text.lstrip("\ufeff").splitlines()
    if not lines:
        raise PreparationError(f"{form}{tr(': empty file.')}")
    sep = max((",", ";", "\t"), key=lines[0].count)
    try:
        reader = csv.reader(io.StringIO(text.lstrip("\ufeff")), delimiter=sep, strict=True)
        header = [cell.strip().upper() for cell in next(reader)]
        if len(set(header)) != len(header) or not set(required) <= set(header):
            raise PreparationError(f"{form}{tr(': unique columns required: ')}{', '.join(required)}.")
        rows = []
        for values in reader:
            if not values or not any(value.strip() for value in values):
                continue
            if len(values) != len(header):
                raise PreparationError(f"{form}{tr(': incorrect row width at ')}{reader.line_num}.")
            rows.append(dict(zip(header, (cell.strip() for cell in values))))
        if not rows:
            raise PreparationError(f"{form}{tr(': no data rows.')}")
        return rows
    except csv.Error as exc:
        raise PreparationError(f"{form}{tr(': malformed CSV.')}") from exc


def _positive_integer(value: str) -> int | None:
    try:
        result = float(value.replace(",", "."))
    except (ValueError, TypeError):
        return None
    if not math.isfinite(result) or result <= 0 or not result.is_integer():
        return None
    return int(result)


def prepare(housing_text: str, roster_text: str) -> tuple[list[dict], dict]:
    """Inner join at household grain after explicit validation, never many-to-many."""
    housing = _read(housing_text, ["NOMER", "OB_PL", "J_PL"], "D006")
    roster = _read(roster_text, ["NOMER", "NOMP", "KOL_CHL", "GOD"], "D008")
    housing_ids: set[str] = set()
    for row in housing:
        key = row["NOMER"]
        if not key or key in housing_ids:
            raise PreparationError(tr('D006: blank or duplicate NOMER; join stopped.'))
        housing_ids.add(key)

    people: dict[str, list[dict]] = defaultdict(list)
    seen: set[tuple[str, str]] = set()
    for row in roster:
        key = (row["NOMER"], row["NOMP"])
        if not all(key) or key in seen:
            raise PreparationError(tr('D008: blank or duplicate NOMER/NOMP; join stopped.'))
        if row["GOD"] != str(YEAR):
            raise PreparationError(tr('D008: all GOD values must be 2024; mixed periods are blocked.'))
        seen.add(key)
        people[key[0]].append(row)

    output = []
    exclusions = dict.fromkeys(EXCLUSION_ORDER, 0)
    for row in housing:
        members = people.get(row["NOMER"], [])
        if not members:
            exclusions["missing_roster"] += 1
            continue
        size = len(members)
        if any(_positive_integer(member["KOL_CHL"]) != size for member in members):
            exclusions["roster_size_unconfirmed"] += 1
            continue
        total, living = (_positive_integer(row[field]) for field in ("OB_PL", "J_PL"))
        if total is None or living is None:
            exclusions["invalid_area"] += 1
            continue
        if living > total:
            exclusions["living_area_exceeds_total"] += 1
            continue
        per_person = total / size
        if not math.isfinite(per_person):
            exclusions["nonfinite_derived"] += 1
            continue
        group = GROUP_ORDER[0] if size <= 2 else GROUP_ORDER[1] if size <= 4 else GROUP_ORDER[2]
        output.append({GROUP: group, SIZE: size, TOTAL: total,
                       LIVING: living, PER_PERSON: per_person})

    if not output:
        raise PreparationError(tr('No eligible households remain after validation.'))
    if len(output) > 50_000:
        raise PreparationError(tr('More than 50,000 households: import limit exceeded.'))
    counts = Counter(row[GROUP] for row in output)
    audit = {
        "housing_rows": len(housing), "housing_unique_households": len(housing_ids),
        "roster_rows": len(roster), "roster_unique_households": len(people),
        "matched_housing_households": len(housing_ids & people.keys()),
        "unused_roster_households": len(people.keys() - housing_ids),
        "duplicate_housing_keys": 0, "duplicate_person_keys": 0,
        "eligible_households": len(output), "excluded_households": len(housing) - len(output),
        "exclusion_priority": EXCLUSION_ORDER, "exclusions_mutually_exclusive": exclusions,
        "group_counts": {group: counts[group] for group in GROUP_ORDER},
    }
    assert audit["eligible_households"] + sum(exclusions.values()) == len(housing)
    return output, audit


def prepare_archive(data_root: Path, output_dir: Path) -> dict:
    """Write private CSV and an identifier-free aggregate audit for the supplied archive."""
    sources = {}
    contents = {}
    for relative in [HOUSING_PATH, ROSTER_PATH]:
        source = data_root / relative
        if not source.is_file():
            raise PreparationError(f"{tr('Input folder is missing ')}{relative}.")
        data = source.read_bytes()
        sources[relative] = {"sha256": sha256(data), "bytes": len(data)}
        if relative in (HOUSING_PATH, ROSTER_PATH):
            contents[relative] = data.decode("utf-8-sig")
    rows, audit = prepare(contents[HOUSING_PATH], contents[ROSTER_PATH])
    csv_buffer = io.StringIO(newline="")
    writer = csv.DictWriter(csv_buffer, fieldnames=COLUMNS, lineterminator="\n")
    writer.writeheader()
    writer.writerows(rows)
    csv_bytes = csv_buffer.getvalue().encode("utf-8-sig")
    aggregate = []
    for group in GROUP_ORDER:
        members = [row for row in rows if row[GROUP] == group]
        if members:
            aggregate.append({"group": group, "households": len(members),
                "median_area_per_person_m2": round(statistics.median(row[PER_PERSON] for row in members), 6),
                "median_total_area_m2": round(statistics.median(row[TOTAL] for row in members), 6)})
    result = {
        "case": "Residual: prepared household table",
        "year": YEAR, "synthetic_data": None, "population_inference": False,
        "source_files": sources, "preparation_code_sha256": sha256(Path(__file__).read_bytes()),
        "prepared_file": {"name": "housing_2024.csv", "sha256": sha256(csv_bytes),
                          "rows": len(rows), "columns": COLUMNS},
        "audit": audit,
        "definitions": {
            GROUP: tr('Project groups: 1–2, 3–4 and 5+ recorded members.'),
            SIZE: tr('Distinct D008 NOMER+NOMP count, consistent with every KOL_CHL value.'),
            TOTAL: tr('D006.OB_PL, total housing area, m².'),
            LIVING: tr('D006.J_PL, living area, m².'),
            PER_PERSON: tr('D006.OB_PL / distinct NOMER+NOMP in D008, m²/person.'),
        },
        "rules": [
            tr('Keys are text; leading zeros are preserved. Duplicates stop preparation.'),
            tr('D008 is reduced to one size per NOMER before joining D006.'),
            tr('Missing or inconsistent rosters are excluded without imputation.'),
            tr('Areas must be finite positive integers; this narrow preparation workflow does not impute values.'),
            tr('J_PL > OB_PL is excluded as an area-definition contradiction under the project rule.'),
            tr('Exclusion reasons are mutually exclusive in the stated order. Source rows are not changed.'),
            tr('Room count does not affect inclusion in this area calculation.'),
        ],
        "reference_aggregates": aggregate,
        "limitations": [
            tr('Data provenance is supplied by the user. Values describe eligible input records only.'),
            tr('Survey weights, confidence intervals, disclosure control and causal effects are not calculated.'),
            tr('Median area ratios use households, not person-weighted rows.'),
            tr('Members are those recorded for 2024; within-year roster changes are not modeled.'),
            tr('Area per person depends on its denominator; group comparisons do not establish causality.'),
            tr('Land and additional housing ownership are not considered. Grouping is project-defined.'),
            tr('Prepared CSV and input records stay local; aggregates can be verified separately.'),
        ],
    }
    output_dir.mkdir(parents=True, exist_ok=True)
    (output_dir / "housing_2024.csv").write_bytes(csv_bytes)
    (output_dir / "preparation_audit.json").write_text(
        json.dumps(result, ensure_ascii=False, indent=2, allow_nan=False) + "\n", encoding="utf-8")
    return result


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--data-root", type=Path, required=True,
                        help="Folder containing the housing and roster CSV files.")
    parser.add_argument("--output-dir", type=Path,
                        default=Path(__file__).resolve().parents[1] / "private_outputs" / "housing_preparation",
                        help=tr('Local output folder; default: private_outputs/housing_preparation.'))
    args = parser.parse_args()
    try:
        result = prepare_archive(args.data_root, args.output_dir)
    except (PreparationError, OSError, UnicodeError) as exc:
        parser.exit(1, f"{tr('Preparation stopped: ')}{exc}\n")
    print(json.dumps({"prepared_households": result["audit"]["eligible_households"],
                      "excluded_households": result["audit"]["excluded_households"],
                      "synthetic_data": None, "files": ["housing_2024.csv", "preparation_audit.json"]},
                     ensure_ascii=False))


if __name__ == "__main__":
    main()
