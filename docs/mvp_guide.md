# Housing quality review

Open `/quality/` after starting the application. Upload two tables matching the housing and roster schema, or explicitly load the fictional sample. Review a queued record, inspect its values and rule explanation, and save a decision. Upload a revised package to compare changes without overwriting earlier decisions.

A signal means that a record needs review. Rare values may be valid. J_PL greater than OB_PL identifies an area contradiction but does not identify which source value is correct. Robust scores and Isolation Forest ranks do not estimate error probabilities.

The local assistant assembles record values, implemented rules, schema definitions, and a draft clarification request. The quality module does not send messages or change source records. Its explanations use deterministic templates.

The main general-purpose table assistant lives at `/`. See [calculation methods](methodology.md), [scope](PRODUCT_SCOPE.txt), and [setup](LOCAL_START.txt).
