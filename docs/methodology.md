# Calculation methods

## Main table workflow

The user confirms the schema and missing codes. The language model proposes a bounded plan containing fields, one supported aggregation, and optional grouping. Validation checks field roles, supported methods, and explicit field selections. Unsupported or ambiguous requests are stopped before execution. A user must confirm the visible plan.

The calculator uses available numeric values per measure. Declared missing codes, blanks, and invalid numbers are excluded and counted. Zero and negative values remain valid unless explicitly declared missing. Rows without a grouping category are excluded and counted separately. With no valid numeric values, the result is null, including sums. Different measures can have different valid counts.

Reports preserve normalized source data, a confirmed plan, calculation-source hash, and a standalone reproduction export. Models do not calculate report values. Structural validation cannot guarantee that every natural-language question was understood correctly.

## Housing schema and joins

The optional housing module expects housing fields NOMER, OB_PL, J_PL, KOL_K and a roster keyed by NOMER and NOMP. Keep identifiers as text and join only within one declared period. Count unique roster members before joining; do not duplicate housing areas across person rows. KOL_CHL, when supplied, must agree with the roster. The implemented fixed schema supports 2024 only and does not create a longitudinal panel.

Compute area per person for each household before taking a group median. Groups are 1–2, 3–4, and 5+ members. The fixed housing calculator retains area-order flags in its primary result and supplies a separate sensitivity result excluding J_PL > OB_PL. The optional preparation utility applies its own explicit exclusions before producing a general-purpose input table. These policies are distinct and must not be conflated.

## Quality review

Rules flag structural problems and area contradictions. Robust deviation ranks unusual values. Optional Isolation Forest adds candidates from the current uploaded package. Ranks and percentiles are review priorities, not probabilities of error. Source values are not corrected automatically; review decisions are saved separately.

## Interpretation

Calculations are unweighted descriptions of supplied rows. Population inference, causality, confidentiality protection, and method suitability require separate review. Only small invented samples and test scenarios are bundled. Previously calculated research results are not application inputs or evidence for new uploads.
