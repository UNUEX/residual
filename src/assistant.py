"""Offline case explanations grounded in supplied values and a curated source registry.

This module is deterministic evidence assembly, not an LLM or a retrieval model.
Isolation Forest lives in the quality engine. No data leaves the local process.
"""

from .localization import tr, get_language

from copy import deepcopy
import math
import re


SOURCE_VERSION = '2026-10-21.1'
SOURCES = {'D006-AREA': {'id': 'D006-AREA', 'title': 'Housing schema: area fields', 'type': 'project_rule', 'locator': 'docs/housing_schema.md', 'excerpt': 'OB_PL is total floor area and J_PL is living area, in square metres. The housing profile expects both values to describe the same dwelling.', 'note': 'Residual implementation specification; not an official validation standard.'}, 'D006-ROOMS': {'id': 'D006-ROOMS', 'title': 'Housing schema: room count', 'type': 'project_rule', 'locator': 'docs/housing_schema.md', 'excerpt': 'KOL_K is the number of living rooms. Confirm the treatment of auxiliary rooms before importing another source.', 'note': 'Residual implementation specification; not an official validation standard.'}, 'D006-FIELDS': {'id': 'D006-FIELDS', 'title': 'Housing schema: column mapping', 'type': 'project_rule', 'locator': 'docs/housing_schema.md', 'excerpt': 'The housing table uses NOMER, OB_PL, J_PL and KOL_K. The importer normalizes column names to uppercase.', 'note': 'Residual implementation specification; not an official validation standard.'}, 'D008-FIELDS': {'id': 'D008-FIELDS', 'title': 'Housing schema: roster', 'type': 'project_rule', 'locator': 'docs/housing_schema.md', 'excerpt': 'NOMER is the household identifier; NOMP identifies a member within a household; KOL_CHL is an optional declared household size.', 'note': 'Residual implementation specification; not an official validation standard.'}, 'TUTORIAL-KEYS': {'id': 'TUTORIAL-KEYS', 'title': 'Housing schema: table joins', 'type': 'project_rule', 'locator': 'docs/housing_schema.md', 'excerpt': 'Join housing and roster rows by the exact text identifier within one period. The fixed profile supports 2024; it does not construct a longitudinal panel.', 'note': 'Residual implementation specification; not an official validation standard.'}, 'RESIDUAL-RULES': {'id': 'RESIDUAL-RULES', 'title': 'Residual: housing checks', 'type': 'project_rule', 'locator': 'docs/housing_schema.md', 'excerpt': 'J_PL > OB_PL triggers an area-order check. Missing values, nonpositive values, invalid keys and roster discrepancies require review. A signal does not determine a replacement value.', 'note': 'Residual implementation specification; not an official validation standard.'}, 'RESIDUAL-METHOD': {'id': 'RESIDUAL-METHOD', 'title': 'Residual: unusual records', 'type': 'methodology', 'locator': 'docs/methodology.md', 'excerpt': 'Robust deviation and Isolation Forest rank unusual records within the current input. A percentile is a rank, not an error probability. Quartiles describe the input rather than a normative range.', 'note': 'Residual implementation specification; not an official validation standard.'}}
for _source in SOURCES.values():
    _source['version'] = SOURCE_VERSION

NAMES = {
    'OB_PL': tr('Total floor area'), 'J_PL': tr('Living area'), 'KOL_K': tr('Living rooms'),
    'household_size': tr('Household member count'), 'declared_size': tr('Declared member count'),
    'area_per_person': tr('Area per person'), 'area_per_room': tr('Area per room'),
    'living_share': tr('Living-area share'),
}
UNITS = {'OB_PL': tr(' m²'), 'J_PL': tr(' m²'), 'area_per_person': tr(' m²'), 'area_per_room': tr(' m²')}


def _text(value, limit=500):
    return re.sub(r'[\x00-\x1f\x7f]', ' ', str(value))[:limit]


def _number(value):
    if isinstance(value, bool) or value is None:
        return None
    try:
        parsed = float(value)
        return parsed if math.isfinite(parsed) else None
    except (ValueError, TypeError):
        return None


def _fmt(value):
    parsed = _number(value)
    return tr('not specified') if parsed is None else f'{parsed:,.3f}'.rstrip('0').rstrip('.').replace(',', ' ').replace('.', ',' if get_language() == 'kk' else '.')


def _action(action, question):
    aliases = {'sources': 'source', 'evidence': 'source', 'draft': 'request', 'clarify': 'request',
               'explanation': 'explain'}
    action = aliases.get(action, action)
    if not question:
        return action if action in {'explain', 'source', 'request'} else 'unsupported'
    q = question.casefold()
    if any(word in q for word in ('поставь', 'измени', 'исправь', 'замени', 'игнорируй', 'ignore', 'забудь', 'delete')):
        return 'correction'
    if any(word in q for word in ('источник', 'инструкц', 'основан', 'документ', 'правило')):
        return 'source'
    if any(word in q for word in ('запрос', 'сверк', 'уточн', 'что делать', 'следующ')):
        return 'request'
    if any(word in q for word in ('почему', 'объясн', 'сигнал', 'необыч', 'площад', 'комнат', 'состав', 'ошибк', 'процентил')):
        return 'explain'
    return 'unsupported'


def _record_source(record):
    locator = _text(record.get('source') or tr('Uploaded D006 + D008 package'), 500)
    rows = record.get('source_rows')
    locations = []
    if isinstance(rows, dict):
        for key, form in (('housing', 'D006'), ('d006', 'D006'), ('roster', 'D008'), ('d008', 'D008')):
            if key not in rows:
                continue
            entry = rows[key]
            filename = tr('uploaded CSV')
            if isinstance(entry, dict):
                filename = _text(entry.get('file') or filename)
                numbers = entry.get('rows', entry.get('row', []))
            else:
                numbers = entry
            if not isinstance(numbers, (list, tuple)):
                numbers = [numbers]
            numbers = [_text(number) for number in numbers if number is not None]
            detail = (tr('row ') if len(numbers) == 1 else tr('rows ')) + ', '.join(numbers) if numbers else tr('rows not specified')
            locations.append(f'{form} — {filename}: {detail}')
    if locations:
        locator = '; '.join(locations)
    values = record.get('values') or {}
    if not isinstance(values, dict):
        values = {}
    excerpt = '; '.join(f'{name}: {_fmt(values.get(field))}{UNITS.get(field, "")}'
                        for field, name in NAMES.items() if field in values)
    return {'id': 'CASE-INPUT', 'title': f"{tr('Source values: ')}{_text(record.get('id', tr('no identifier')), 100)}",
            'type': 'input_data', 'locator': locator, 'excerpt': excerpt or tr('No field values supplied.'),
            'version': _text(record.get('batch_id') or record.get('batch') or tr('current package'), 100)}


def assist_case(record: dict, action: str = 'explain', question: str = '') -> dict:
    """Explain only this case; prepare a draft but never change data or send messages.

    Sources label provenance explicitly. Free text selects a narrow supported intent;
    it is never executed or passed to a language model.
    """
    if not isinstance(record, dict):
        raise ValueError('record must be a dictionary')
    action = _action(str(action), str(question).strip())
    values = record.get('values') or {}
    if not isinstance(values, dict):
        values = {}
    parsed = {field: _number(values.get(field)) for field in ('OB_PL', 'J_PL', 'KOL_K', 'household_size')}
    total, living = parsed['OB_PL'], parsed['J_PL']
    area_conflict = total is not None and living is not None and living > total
    missing = [field for field, value in parsed.items() if value is None]
    nonpositive = [field for field, value in parsed.items() if value is not None and value <= 0]
    kind = str(record.get('kind', ''))
    statistical = kind in ('ml', 'statistical', 'robust')
    signals = ' '.join(str(value).lower() for value in record.get('signal_ids', []))
    link_issue = any(term in signals for term in ('roster', 'duplicate', 'join', 'unmatched', 'key', 'size_mismatch'))
    source_ids = ['D006-FIELDS', 'RESIDUAL-RULES']
    statements = []
    if area_conflict:
        statements.append(f"{tr('Living area ')}{_fmt(living)}{tr(' m² exceeds total area ')}{_fmt(total)}{tr(' m² by ')}{_fmt(living - total)}{tr(' m². Total area includes living area under the housing schema [D006-AREA]. Review both fields; these values alone do not identify which is correct.')}")
        source_ids.insert(0, 'D006-AREA')
    if missing:
        statements.append(tr('Insufficient valid numeric values: ') + ', '.join(NAMES[f] for f in missing) + tr('. Check applicability, whether an answer exists and the table join. Missingness alone does not prove an error [RESIDUAL-RULES].'))
    if nonpositive:
        statements.append(tr('Zero or negative value: ') + ', '.join(NAMES[f] for f in nonpositive) + tr('. Check coding, applicability and the original source. Automatic replacement is not justified [RESIDUAL-RULES].'))
    if 'fractional_rooms' in signals or (parsed['KOL_K'] is not None and parsed['KOL_K'] % 1 != 0):
        statements.append(f"{tr('Fractional room count: ')}{_fmt(parsed['KOL_K'])}{tr('. Check the record and room-count coding [D006-ROOMS]. Rounding without the original source is not justified.')}")
        source_ids.append('D006-ROOMS')
    if 'roster_size' in signals:
        declared = record.get('declared_household_sizes') or []
        declared_text = ', '.join(_fmt(value) for value in declared) if declared else tr('not specified')
        statements.append(f"{tr('Member count from D008 rows: ')}{_fmt(parsed['household_size'])}{tr('; KOL_CHL values: ')}{declared_text}{tr('. Check roster completeness, missing values and declared size. This signal cannot determine which row to add or remove [RESIDUAL-RULES].')}")
    if link_issue:
        statements.append(tr('Check D008 keys and members first: NOMER identifies a household, NOMP a member, and KOL_CHL the declared size [D008-FIELDS]. Join tables within one year only [TUTORIAL-KEYS].'))
        source_ids += ['D008-FIELDS', 'TUTORIAL-KEYS']
    if statistical:
        label = tr('by Isolation Forest') if kind == 'ml' else tr('by statistical ranking')
        statements.append(f"{tr('Record selected ')}{label}{tr(' for review. An unusual record may be valid; it is not a confirmed error [RESIDUAL-METHOD].')}")
        percentile = _number(record.get('percentile', record.get('ml_percentile' if kind == 'ml' else 'robust_percentile')))
        if percentile is not None:
            statements.append(f"{tr('Score percentile: ')}{_fmt(percentile)}{tr('. This is a relative position in the input, not an error probability [RESIDUAL-METHOD].')}")
        for item in (record.get('evidence') or [])[:3]:
            if not isinstance(item, dict):
                continue
            field = item.get('field', '')
            if field not in NAMES or _number(item.get('value')) is None:
                continue
            if all(_number(item.get(key)) is not None for key in ('q25', 'q75', 'median')):
                statements.append(f"{NAMES[field]}: {_fmt(item['value'])}{UNITS.get(field, '')}{tr('; reference median ')}{_fmt(item['median'])}{tr(', middle 50% of values ')}{_fmt(item['q25'])}–{_fmt(item['q75'])}{tr('. This describes the input, not a normative limit or a causal explanation of the model signal [RESIDUAL-METHOD].')}")
        source_ids.append('RESIDUAL-METHOD')
    if not statements:
        statements.append(tr('The supplied context shows no area contradiction, missing or nonpositive value. This is not a complete quality guarantee; only the available case context was checked.'))
    if parsed['KOL_K'] is not None:
        source_ids.append('D006-ROOMS')
    if parsed['household_size'] is not None:
        source_ids.append('D008-FIELDS')
    steps = [
        tr('Check the highlighted fields, household key and question applicability against the original source.'),
        tr("If needed, ask the responsible specialist for clarification using your organization's process."),
        tr('Record the decision and rationale. Upload a revised package to recheck corrected data.'),
    ]
    if statistical and not area_conflict and not missing and not nonpositive:
        steps.insert(1, tr('If the original source confirms a rare value, save Accepted with an explanation.'))
    response = {
        'title': tr('Case explanation'), 'answer': '\n\n'.join(statements), 'steps': steps,
        'sources': [_record_source(record)] + [deepcopy(SOURCES[s]) for s in dict.fromkeys(source_ids)],
        'mode': 'local_evidence', 'action': action, 'version': SOURCE_VERSION,
        'disclosure': tr('Local explanation of calculated facts and project rules. No generative model or external transmission.'),
    }
    if action == 'source':
        response['title'] = tr('Review evidence')
        response['answer'] = (tr('Field definitions are in the Residual input schema. Project rules and methods are identified separately; they are not an official validation standard.\n\n')
                              + response['answer'])
    elif action == 'request':
        response['title'] = tr('Review request draft')
        lines = [f"{tr('Please check record ')}{_text(record.get('id', tr('no identifier')), 100)}{tr(' against the original source.')}"]
        if area_conflict:
            lines.append(f"{tr('D006 reports total area ')}{_fmt(total)}{tr(' m² and living area ')}{_fmt(living)}{tr(' m². Living area exceeds total area. Confirm both values and the unit.')}")
        if 'roster_size' in signals:
            lines.append(f"{tr('Member count calculated from D008: ')}{_fmt(parsed['household_size'])}{tr('; KOL_CHL values: ')}{declared_text}{tr('. Check roster completeness and declared size. Confirm values or provide a justified correction. This signal does not identify which row to add or remove.')}")
        if statistical:
            lines.append(tr('This record is statistically unusual. That does not mean it is wrong. Confirm the values or provide a justified correction.'))
        elif not area_conflict and 'roster_size' not in signals:
            lines.append(tr('Check question applicability, available values and the D006–D008 join.'))
        lines.append('; '.join(f'{NAMES[f]}: {_fmt(values.get(f))}{UNITS.get(f, "")}' for f in parsed) + '.')
        lines.append(tr('Record source: ') + _record_source(record)['locator'] + '.')
        lines.append(tr('The available evidence does not establish the correct value. Provide a basis for confirmation or correction.'))
        response['draft'] = '\n\n'.join(lines)
        response['answer'] = tr('Drafted from this case. Review before use. Nothing has been sent.')
    elif action == 'correction':
        response.update(title=tr('Original value needs confirmation'),
                        answer=tr("The signal cannot establish the correct value. The assistant neither changes records nor invents corrections. Check the original source, then record a specialist's decision."), steps=steps[:1])
    elif action == 'unsupported':
        response.update(title=tr('Question outside this case'),
                        answer=tr('The assistant only explains the selected record, shows evidence and drafts a review request. No verified answer is available for this question in the current context.'), steps=[])
    return response
