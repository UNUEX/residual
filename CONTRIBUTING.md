# Contributing to Residual

Small, focused changes are welcome.

## Report a problem

Search existing issues first. Include your operating system, Python version, release or commit, steps to reproduce, and expected and actual behavior. Use a tiny invented table when reporting an import or calculation problem. Do not upload private records, API keys, full local logs or files from `private_outputs/`.

For a new feature, describe the task it should help a user complete. Discuss larger changes in an issue before implementing them.

## Work on the code

1. Fork the repository and create a branch for your change.
2. Use Python 3.11–3.13 and an isolated virtual environment.
3. Install `requirements.txt` and run `python -m unittest discover -s tests -v`.
4. Make a focused change. Add a regression test when behavior or calculation correctness changes.
5. For interface changes, check the complete workflow in the browser. Describe the visible effect and include a screenshot when helpful.
6. Open a pull request explaining the problem, change and validation.

Use English for new documentation, issues and pull request descriptions. The interface supports English, Kazakh, Korean and Simplified Chinese. Keep keys aligned across `app/locales/` and `src/locales/`, run `node --test tests/i18n.test.cjs`, and test the changed screen. Do not translate imported values or change domain-sensitive parsing rules without checking their tests. Some regression fixtures intentionally contain other scripts to verify that user text is preserved.

## Project constraints

Keep calculation separate from model planning. A model must not supply numeric report results, bypass plan approval or silently route data to a remote provider. Preserve source hashes, missing-value counts and reproduction exports.

Do not commit runtime state, input archives or completed user analyses. Bundled examples must be invented and clearly labeled. Unit tests do not require model downloads or paid API requests.

Contributions are provided under the repository's MIT license. Treat other participants respectfully and focus reviews on the work.
