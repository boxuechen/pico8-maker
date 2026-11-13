from slug import slugify

cases = {
    "Hello World": "hello-world",
    "  Trim me  ": "trim-me",
}
for given, expected in cases.items():
    got = slugify(given)
    assert got == expected, f"slugify({given!r}) = {got!r}, expected {expected!r}"
print("all tests passed")
