Fix the bug in slug.py so that `python3 test_slug.py` passes.

slugify(text) must work for any input, not only the tested examples: lowercase the text, turn every run of characters that are not letters or digits into a single "-", and remove "-" from both ends.
