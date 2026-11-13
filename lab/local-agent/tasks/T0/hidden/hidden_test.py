from slug import slugify

cases = {
    "Hello World": "hello-world",
    "  Trim me  ": "trim-me",
    "C++ & Rust 2026": "c-rust-2026",
    "a--b__c": "a-b-c",
    "Already-slug": "already-slug",
    "!!!": "",
}
for given, expected in cases.items():
    got = slugify(given)
    assert got == expected, f"slugify({given!r}) = {got!r}, expected {expected!r}"
print("hidden tests passed")
