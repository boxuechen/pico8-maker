# High Stakes: uncertainty with actionable information

Evidence: original highstakes-2 cartridge and author rules, with local decode and 120-frame startup verification. No complete match or listening review has been performed. Exact hashes are in research/inventory.json.

## Observed rules and implementation

The author describes a nine-card board with one losing card, rewards for revealing safe cards, information tokens unlocked by rows or columns, an option to identify the losing card directly, and a costly early exit. The source handles normal flipping, hint-token use, stabbing and passing separately. It also uses distinct SFX calls for accepted and rejected interactions. Source anchors: passcost, stabcard, flipbegin, dropchip functions and update_game.

## Design interpretation

Uncertainty becomes a decision when the player can use information or choose exposure. Always showing more rewards is insufficient if the next choice has no understandable consequence. Make the amount at risk, cost of exit and available information legible before commitment. Avoid inventing exact probabilities from an animation or assuming unknown cards are independent.

## Art and audio study

The input handler checks whether a hint token is valid for the selected card before consuming it. Accepted uses call SFX 60; rejected uses call SFX 61 and set curshake to 10. This is a concrete visual-plus-audio rejection response with no resource consumption. Study the hierarchy among hidden cards, revealed values, hint tokens and the current stakes display. Animations should confirm what changed without obscuring the next decision. The author credits Gruber Music. Compare confirm, reject and outcome sound roles; decoded sound data does not establish subjective quality.

## Transfer experiment

Read pattern/risk-reward and pattern/information-before-commitment. In recipe/lantern-vault, use an optional detour and visible fuel as an original deterministic alternative to random loss. Compare banked reward against successful extraction rate. A later card prototype should expose exact rules and use reproducible seeds for evaluation; do not reskin the original card artwork or copy its music.

Sources: https://krystman.itch.io/high-stakes and https://www.lexaloffle.com/bbs/?pid=83548 . The BBS labels this cartridge CC4-BY-NC-SA. This package retains provenance and analysis while keeping original assets outside the distributed model bundle.
