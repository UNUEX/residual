"""Local package checks and reproducible review candidates for D006 + D008.

No network, generative model, automatic corrections, or benchmark on upload.
"""

from .localization import tr
from .localization import translate_owned

import csv
import hashlib
import io
import math
from pathlib import Path
import time

import numpy as np
import pandas as pd
from sklearn.ensemble import IsolationForest

MAX_ROWS = 100_000
MAX_BYTES = 32 * 1024 * 1024
FIELDS = ['OB_PL', 'J_PL', 'KOL_K', 'household_size']
FEATURES = FIELDS + ['area_per_person', 'area_per_room', 'living_share']
NAMES = dict(zip(FEATURES, [tr('Total area, m²'), tr('Living area, m²'),
    tr('Living rooms'), tr('Household members'), tr('Area per person, m²'),
    tr('Area per room, m²'), tr('Living-area share')]))

SOURCES = [{'id': 'd006_definition', 'title': 'Residual housing schema', 'path': 'docs/housing_schema.md', 'excerpt': 'The housing table uses NOMER, OB_PL, J_PL and KOL_K. The importer normalizes column names to uppercase. OB_PL is total floor area and J_PL is living area, in square metres. The housing profile expects both values to describe the same dwelling.', 'provenance': 'Project input contract. The area-order check is a diagnostic rule, not an official validation standard.'}, {'id': 'd008_definition', 'title': 'Residual roster schema', 'path': 'docs/housing_schema.md', 'excerpt': 'NOMER is the household identifier; NOMP identifies a member within a household; KOL_CHL is an optional declared household size.', 'provenance': 'Project input contract. Comparing declared size with distinct roster members is a diagnostic check.'}, {'id': 'project_method', 'title': 'Residual quality method', 'path': 'docs/methodology.md', 'excerpt': 'Seven log1p features. Robust score: maximum absolute deviation from the median divided by the interquartile range, floored at 0.05. Isolation Forest: 200 trees, seed 17.', 'provenance': 'Project method. Quartiles describe eligible input records; they are not population estimates or normative limits.'}]

CHECKS = [
    dict(id='AREA_ORDER', title=tr('Living area exceeds total area'), kind='rule',
         severity='contradiction', expression='J_PL > OB_PL',
         source_ids=['d006_definition'],
         explanation=tr('The two values conflict. Neither can be confirmed from this signal alone; check the original source.')),
    dict(id='MISSING_VALUE', title=tr('Missing value'), kind='validation',
         severity='clarification', expression=tr('Blank area or room-count field'),
         source_ids=['d006_definition'],
         explanation=tr('Clarify applicability and why the value is missing. Missingness is not declared an error.')),
    dict(id='NONPOSITIVE_VALUE', title=tr('Nonpositive value'), kind='validation',
         severity='clarification', expression=tr('OB_PL, J_PL or KOL_K ≤ 0'),
         source_ids=['d006_definition'],
         explanation=tr('Clarify the value and measure applicability. No automatic replacement is made.')),
    dict(id='FRACTIONAL_ROOMS', title=tr('Fractional room count'), kind='validation',
         severity='clarification', expression=tr('KOL_K is not an integer'),
         source_ids=['d006_definition'],
         explanation=tr('Verify the room count against the original source.')),
    dict(id='ROSTER_SIZE', title=tr('Household roster needs clarification'), kind='validation',
         severity='clarification', expression=tr('KOL_CHL differs from the D008 row count per NOMER'),
         source_ids=['d008_definition'],
         explanation=tr('Check roster completeness and declared size; this record is excluded from model fitting.')),
    dict(id='ROBUST_OUTLIER', title=tr('Unusual combination of values'), kind='statistical',
         severity='candidate', expression=tr('Priority by robust deviation across seven features'),
         source_ids=['project_method'],
         explanation=tr('A review candidate within the budget, not proof of error.')),
    dict(id='IFOREST_CANDIDATE', title=tr('Additional ML candidate'), kind='ml',
         severity='candidate', expression=tr('High Isolation Forest score outside the robust queue'),
         source_ids=['project_method'],
         explanation=tr('The model selected an unusual record. Percentile is not an error probability.')),
]
CHECK_BY_ID = {check['id']: check for check in CHECKS}


class DatasetError(ValueError):
    """An actionable package error that can be shown to an uploader."""


def _read_csv(content, form, required):
    filename = f"{form}{tr(' — uploaded CSV')}"
    if isinstance(content, Path):
        filename = content.name
        try:
            content = content.read_text(encoding='utf-8-sig')
        except UnicodeError as exc:
            raise DatasetError(f"{form}{tr(': save the file in UTF-8.')}") from exc
    if not isinstance(content, str):
        raise DatasetError(f"{form}{tr(': UTF-8 CSV text expected.')}")
    if len(content.encode('utf-8')) > MAX_BYTES:
        raise DatasetError(f"{form}{tr(': file exceeds 32 MiB. Split into single-period packages.')}")
    text = content.lstrip('\ufeff')
    if not text.strip():
        raise DatasetError(f"{form}{tr(': empty file. Add a header and data rows.')}")
    if '\x00' in text:
        raise DatasetError(f"{form}{tr(': null bytes found. Upload a text CSV in UTF-8.')}")
    first_line = text.splitlines()[0]
    options = []
    for separator in [',', ';', '\t']:
        try:
            header = next(csv.reader([first_line], delimiter=separator, strict=True))
        except csv.Error:
            continue
        normalized = [column.strip().upper() for column in header]
        options.append((len(set(required) & set(normalized)), separator, normalized))
    if not options:
        raise DatasetError(f"{form}{tr(': cannot read the CSV header.')}")
    _, separator, header = max(options, key=lambda candidate: candidate[0])
    if len(header) != len(set(header)) or any(not column for column in header):
        raise DatasetError(f"{form}{tr(': headers are blank or duplicated. Use unique column names.')}")
    missing = [field for field in required if field not in header]
    if missing:
        raise DatasetError(f"{form}{tr(': missing columns ')}{', '.join(missing)}{tr('. Check the layout and delimiter: comma, semicolon or tab.')}")
    reader = csv.reader(io.StringIO(text), delimiter=separator, strict=True)
    rows, line_numbers = [], []
    try:
        next(reader)
        previous_line = reader.line_num
        for row in reader:
            row_start = previous_line + 1
            previous_line = reader.line_num
            if not row or all(not cell.strip() for cell in row):
                continue
            if len(row) != len(header):
                raise DatasetError(f"{form}{tr(', row ')}{row_start}: {len(row)}{tr(' values instead of ')}{len(header)}{tr('. Check delimiters and quotes; use decimal commas with semicolon-separated CSV or quoted cells.')}")
            if len(rows) >= MAX_ROWS:
                raise DatasetError(f"{form}{tr(': more than ')}{MAX_ROWS:,}{tr(' rows. Split the package.')}")
            rows.append(row)
            line_numbers.append(row_start)
    except csv.Error as exc:
        raise DatasetError(f"{form}{tr(', near row ')}{reader.line_num}{tr(': invalid CSV. Check quotes and delimiters.')}") from exc
    if not rows:
        raise DatasetError(f"{form}{tr(': no data rows after the header.')}")
    frame = pd.DataFrame(rows, columns=header)
    frame['_source_row'] = line_numbers
    keys = ['NOMER'] if form == 'D006' else ['NOMER', 'NOMP']
    for key in keys:
        frame[key] = frame[key].str.strip()
        empty = frame[key].eq('')
        if empty.any():
            line = int(frame.loc[empty, '_source_row'].iloc[0])
            raise DatasetError(f"{form}{tr(', row ')}{line}{tr(': blank key ')}{key}{tr('. Fill in the identifier in the source file.')}")
    duplicate = frame.duplicated(keys, keep=False)
    if duplicate.any():
        locations = ', '.join(str(n) for n in frame.loc[duplicate, '_source_row'].head(4))
        raise DatasetError(f"{form}{tr(': duplicate key ')}{' + '.join(keys)}{tr(' at rows ')}{locations}{tr('. Remove duplicate keys; leading zeros are preserved.')}")
    return frame, dict(filename=filename, delimiter=separator, rows=len(frame),
                       columns=len(header)), content


def _numeric(frame, column, form):
    raw = frame[column].str.strip()
    # Comma decimals are accepted only inside one parsed CSV cell.
    normalized = raw.str.replace(',', '.', regex=False)
    numbers = pd.to_numeric(normalized.where(raw.ne('')), errors='coerce')
    malformed = raw.ne('') & (~np.isfinite(numbers))
    if malformed.any():
        index = malformed[malformed].index[0]
        raise DatasetError(f"{form}{tr(', row ')}{int(frame.loc[index, '_source_row'])}, {column}: «{raw.loc[index][:60]}{tr('» is not finite. Correct it; leave missing values blank.')}")
    return numbers.astype(float)


def _finite(value, digits=5):
    return round(float(value), digits) if pd.notna(value) and math.isfinite(float(value)) else None


def _features(data):
    result = data[FIELDS].copy()
    with np.errstate(divide='ignore', invalid='ignore', over='ignore'):
        result['area_per_person'] = data.OB_PL / data.household_size
        result['area_per_room'] = data.OB_PL / data.KOL_K
        result['living_share'] = data.J_PL / data.OB_PL
    return result.replace([np.inf, -np.inf], np.nan)


def analyze_package(housing_csv: str, roster_csv: str, year: int = 2024, label: str = '') -> dict:
    """Analyze CSV text (or explicit pathlib.Path objects); keep source data unchanged.

    Queue cap applies to candidates, never to explicit rule/validation signals.
    all_records_by_id allows version comparison without relying on queue membership.
    """
    started = time.perf_counter()
    if year != 2024:
        raise DatasetError(tr('This profile was checked for D006/D008 in 2024. Other years require agreed schemas and rules first.'))
    housing, h_meta, h_text = _read_csv(housing_csv, 'D006', ['NOMER', 'OB_PL', 'J_PL', 'KOL_K'])
    roster, r_meta, r_text = _read_csv(roster_csv, 'D008', ['NOMER', 'NOMP'])
    missing_links = housing.loc[~housing.NOMER.isin(roster.NOMER), 'NOMER']
    if len(missing_links):
        examples = ', '.join(missing_links.head(3))
        raise DatasetError(f"{tr('D006 → D008: for ')}{len(missing_links)}{tr(' households have no roster (for example, ')}{examples}{tr('). Upload the same period with matching NOMER keys; leading zeros matter.')}")
    data = housing.set_index('NOMER')[[]]
    for field in ['OB_PL', 'J_PL', 'KOL_K']:
        data[field] = _numeric(housing, field, 'D006').to_numpy()
    groups = roster.groupby('NOMER', sort=False)
    sizes = groups.size()
    data['household_size'] = sizes.reindex(data.index).astype(float)
    declared_mismatch = pd.Series(False, index=data.index)
    declared_values = {}
    if 'KOL_CHL' in roster:
        roster['_declared_size'] = _numeric(roster, 'KOL_CHL', 'D008')
        for key, group in roster.groupby('NOMER', sort=False):
            if key not in data.index:
                continue
            values = group['_declared_size']
            declared_values[key] = [_finite(value) for value in pd.unique(values)]
            declared_mismatch.loc[key] = bool(values.isna().any() or not values.eq(len(group)).all())
    missing = data[FIELDS].isna().any(axis=1)
    nonpositive = data[FIELDS].le(0).any(axis=1)
    fractional = data.KOL_K.notna() & data.KOL_K.mod(1).ne(0)
    contradiction = data.J_PL.gt(data.OB_PL)
    validation = missing | nonpositive | fractional | declared_mismatch
    excluded = contradiction | validation
    raw_features = _features(data)
    # Extremely large finite inputs may still overflow derived ratios.
    invalid_derived = raw_features.isna().any(axis=1) & ~excluded
    if invalid_derived.any():
        key = str(data.index[invalid_derived][0])
        raise DatasetError(f"D006, NOMER {key}{tr(': values cannot form finite area ratios. Check their magnitude.')}")
    clean = raw_features.loc[~excluded]
    ranges = clean.quantile([.25, .5, .75]) if len(clean) else pd.DataFrame(
        np.nan, index=[.25, .5, .75], columns=FEATURES)
    robust = pd.Series(np.nan, index=data.index)
    ml = pd.Series(np.nan, index=data.index)
    deviations = pd.DataFrame(np.nan, index=data.index, columns=FEATURES)
    model_enabled = len(clean) >= 100
    if len(clean):
        logged = np.log1p(clean)
        median = logged.median()
        spread = (logged.quantile(.75) - logged.quantile(.25)).clip(lower=.05)
        # Comparisons on invalid rows are display context only; not ranking/model input.
        safe = raw_features.where(raw_features.ge(0))
        deviations = (np.log1p(safe) - median).abs().div(spread)
        robust.loc[clean.index] = deviations.loc[clean.index].max(axis=1)
        if model_enabled:
            model = IsolationForest(n_estimators=200, max_samples=min(256, len(clean)),
                contamination='auto', random_state=17, n_jobs=1)
            model.fit(logged)
            ml.loc[clean.index] = -model.score_samples(logged)
    robust_percentile = robust.rank(method='average', pct=True) * 100
    ml_percentile = ml.rank(method='average', pct=True) * 100
    # IDs break score ties, retaining leading zeros and reproducible ordering.
    robust_order = sorted(clean.index, key=lambda key: (-robust.loc[key], key))
    ml_order = sorted(clean.index, key=lambda key: (-ml.loc[key], key)) if model_enabled else []
    priority_ids = sorted(data.index[excluded], key=lambda key: (not contradiction.loc[key], key))
    target = min(250, max(1, math.ceil(len(data) * .1)))
    available = max(0, target - len(priority_ids))
    ml_budget = min(50, math.floor(target * .2)) if model_enabled else 0
    robust_ids = robust_order[:available]
    robust_set = set(robust_ids)
    ml_ids = [key for key in ml_order if key not in robust_set][:ml_budget]
    chosen = priority_ids + robust_ids + ml_ids
    chosen_set = set(chosen)
    selected_ml = set(ml_ids)
    selected_stat = set(robust_ids)
    row_numbers = housing.set_index('NOMER')['_source_row']
    roster_rows = roster.groupby('NOMER', sort=False)['_source_row'].agg(list).to_dict()
    all_records, queue = {}, []
    signal_counts = {check['id']: 0 for check in CHECKS}
    for key, row in data.iterrows():
        signal_ids, reasons = [], []
        if contradiction.loc[key]:
            signal_ids.append('AREA_ORDER')
            reasons.append(f"{tr('Living area ')}{row.J_PL:g}{tr(' m² exceeds total area ')}{row.OB_PL:g}{tr(' m² by ')}{row.J_PL - row.OB_PL:g}{tr(' m². Check both values.')}")
        if missing.loc[key]:
            signal_ids.append('MISSING_VALUE')
            reasons.append(tr('Missing value: ') + ', '.join(NAMES[field] for field in FIELDS if pd.isna(row[field])) + '.')
        if nonpositive.loc[key]:
            signal_ids.append('NONPOSITIVE_VALUE')
            reasons.append(tr('Nonpositive value: ') + ', '.join(
                f'{NAMES[field]} = {row[field]:g}' for field in FIELDS if pd.notna(row[field]) and row[field] <= 0) + '.')
        if fractional.loc[key]:
            signal_ids.append('FRACTIONAL_ROOMS')
            reasons.append(f"{tr('Fractional living-room count: ')}{row.KOL_K:g}{tr('. Clarification needed.')}")
        if declared_mismatch.loc[key]:
            signal_ids.append('ROSTER_SIZE')
            reasons.append(f"{tr('D008 contains ')}{int(row.household_size)}{tr(' members; KOL_CHL is blank, inconsistent or different from this count.')}")
        kind = 'rule' if contradiction.loc[key] else 'validation' if validation.loc[key] else 'none'
        if key in selected_ml:
            kind = 'ml'
            signal_ids.append('IFOREST_CANDIDATE')
            reasons.append(tr('An additional Isolation Forest candidate outside the robust queue. Statistical unusualness is not an error finding.'))
        elif key in selected_stat:
            kind = 'statistical'
            signal_ids.append('ROBUST_OUTLIER')
            reasons.append(tr('High robust deviation relative to eligible input records. Statistical unusualness does not establish an error.'))
        for signal_id in signal_ids:
            signal_counts[signal_id] += 1
        values = {field: _finite(row[field], 8) for field in FIELDS}
        all_records[str(key)] = dict(values=values, kind=kind, signal_ids=signal_ids,
            # Internal evaluation uses exact scores, before display rounding. This
            # mapping is excluded from API state by the service layer.
            robust_score=None if pd.isna(robust.loc[key]) else float(robust.loc[key]),
            ml_score=None if pd.isna(ml.loc[key]) else float(ml.loc[key]),
            declared_household_sizes=declared_values.get(key, []),
            derived_values={field: _finite(raw_features.loc[key, field], 8) for field in FEATURES[4:]})
        if key not in chosen_set:
            continue
        ranked_fields = deviations.loc[key].sort_values(ascending=False, na_position='last').index
        evidence = [dict(field=field, name=NAMES[field], value=_finite(raw_features.loc[key, field], 3),
            q25=_finite(ranges.loc[.25, field], 3), median=_finite(ranges.loc[.5, field], 3),
            q75=_finite(ranges.loc[.75, field], 3), deviation=_finite(deviations.loc[key, field], 3),
            reference_count=len(clean), source_ids=['project_method']) for field in ranked_fields]
        source_rows = dict(housing=dict(file=h_meta['filename'], row=int(row_numbers.loc[key])),
                           roster=dict(file=r_meta['filename'], rows=[int(n) for n in roster_rows[key]]))
        queue.append(dict(id=str(key), kind=kind, rank=0, status='pending',
            supplemental=kind == 'ml',
            score=_finite(ml.loc[key] if kind == 'ml' else robust.loc[key]),
            percentile=_finite(ml_percentile.loc[key] if kind == 'ml' else robust_percentile.loc[key], 1),
            robust_score=_finite(robust.loc[key]), robust_percentile=_finite(robust_percentile.loc[key], 1),
            ml_score=_finite(ml.loc[key]), ml_percentile=_finite(ml_percentile.loc[key], 1),
            reasons=reasons, signal_ids=signal_ids,
            signals=[translate_owned(CHECK_BY_ID[signal_id]) for signal_id in signal_ids],
            evidence=evidence, values=values, source_rows=source_rows,
            declared_household_sizes=declared_values.get(key, []),
            source=f"{h_meta['filename']}{tr(', row ')}{source_rows['housing']['row']} + {r_meta['filename']}",
            source_ids=sorted({source for signal_id in signal_ids for source in CHECK_BY_ID[signal_id]['source_ids']})))
    positions = {key: i for i, key in enumerate(chosen)}
    queue.sort(key=lambda record: positions[record['id']])
    for rank, record in enumerate(queue, 1):
        record['rank'] = rank
    histogram = []
    for low, high in zip([0, 10, 20, 30, 40, 60, 100], [10, 20, 30, 40, 60, 100, np.inf]):
        histogram.append(dict(label=f'{low}–{int(high)}' if np.isfinite(high) else '100+',
            count=int(raw_features.area_per_person.between(low, high, inclusive='left').sum())))
    fingerprint = hashlib.sha256()
    for body in [h_text, r_text]:
        encoded = body.encode('utf-8')
        fingerprint.update(len(encoded).to_bytes(8, 'big'))
        fingerprint.update(encoded)
    model_metadata = dict(name='Isolation Forest', enabled=model_enabled, seed=17,
        n_estimators=200, max_samples=min(256, len(clean)) if model_enabled else 0,
        features=FEATURES, training_rows=len(clean), transformation='log1p',
        fit_scope=tr('Complete positive records without contradictions or clarification signals only.'),
        validation=tr('Training and ranking use one package without error labels. This run does not measure accuracy on real errors.'),
        disabled_reason=None if model_enabled else tr('ML requires at least 100 eligible records.'),
        percentile_note=tr('Score percentile within this package, not an error probability.'))
    summary = dict(version='1.0', label=str(label)[:200], year=year, scope='D006 + D008',
        housing_rows=len(data), roster_rows=len(roster), roster_households=len(sizes),
        unused_roster_households=int((~sizes.index.isin(data.index)).sum()),
        training_rows=len(clean), rule_flags=int(contradiction.sum()),
        validation_flags=int((validation & ~contradiction).sum()),
        validation_records=int(validation.sum()), living_exceeds_total=int(contradiction.sum()),
        missing_or_nonpositive=int((missing | nonpositive).sum()),
        explicit_signal_records=int(excluded.sum()), queue_size=len(queue),
        base_queue_size=len(priority_ids) + len(robust_ids),
        statistical_queue=len(robust_ids), ml_queue=len(ml_ids), pending=len(queue),
        model='Isolation Forest', model_metadata=model_metadata, features=FEATURES,
        histogram=histogram, histogram_scope=tr('All rows with finite nonnegative area per person.'),
        signal_counts=signal_counts, input_sha256=fingerprint.hexdigest(),
        input_files=dict(housing=h_meta, roster=r_meta),
        queue_policy=dict(base_budget=target, supplemental_ml_budget=ml_budget,
            all_explicit_signals_included=True,
            expanded_for_signals=len(priority_ids) > target,
            description=tr('The base queue keeps contradictions and clarification signals, then robust candidates up to budget. ML adds up to 50 other candidates without displacing the base. Combined-queue quality has not been measured; rank is not an error probability.')),
        runtime_seconds=round(time.perf_counter() - started, 3),
        limitations=[tr('The review profile supports D006/D008 for 2024 only.'),
                    tr('Signals require a specialist decision; source values remain unchanged.'),
                    tr('Quartiles are unweighted and describe this package, not a population.'),
                    tr('Ranking quality on real errors needs a separate pilot.')])
    return dict(summary=summary, records=queue, all_records_by_id=all_records,
                checks=[translate_owned(check) for check in CHECKS], sources=[translate_owned(source) for source in SOURCES])
