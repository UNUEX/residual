# Housing input profile

This document defines Residual's fixed housing and roster input contract. The D006 and D008 labels identify the two supported table layouts. No source archive or official survey document is distributed with this project. These rules are implementation choices, not an official validation standard.

| Table | Column | Meaning |
| --- | --- | --- |
| Housing (D006) | NOMER | Household identifier, stored as exact text |
| Housing (D006) | OB_PL | Total floor area in square metres |
| Housing (D006) | J_PL | Living area in square metres for the same dwelling |
| Housing (D006) | KOL_K | Number of living rooms |
| Roster (D008) | NOMER | Household identifier matching the housing table |
| Roster (D008) | NOMP | Member identifier unique within a household |
| Roster (D008) | KOL_CHL | Optional declared household size; the preparation utility requires it |
| Roster (D008) | GOD | Period; required only by the preparation utility |

The fixed profile supports 2024 only. Preserve leading zeroes. Duplicate or missing join keys stop the calculation. Join within one period and count distinct people before combining their roster with housing areas. Unmatched records and inconsistent household sizes are reported; their values are not silently corrected.

The quality queue flags living area greater than total area, missing or nonpositive values, fractional room counts and roster discrepancies. A flag requests review rather than identifying the correct replacement value. Confirm variable definitions and applicability before using another source with this layout.

## Local CSV layout

The command-line housing tools and optional MCP bridge expect the user-selected folder to contain:

```text
d006/2024/rio_2024.csv
d008/2024/kontr_k.csv
```

These are compatibility filenames, not bundled input data. The web uploader accepts CSV contents directly. The invented examples under `examples/demo/` can be copied into this layout when testing the bridge.

The preparation utility reads the two CSV files without any external document archive:

```sh
python -m src.prepare_housing --data-root PATH_TO_INPUT
```

It writes `housing_2024.csv` and `preparation_audit.json` to ignored local storage. It does not infer whether user-supplied records are synthetic. Its explicit exclusions differ from the quality queue; see [calculation methods](methodology.md).
