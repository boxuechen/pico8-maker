# Resources that create route decisions

These are transferable design proposals, not universal rules or copied implementations.

## Purpose

Limit an otherwise safe repeated action without making a new player fail before understanding it.

## Implementation

Choose a resource, a visible cost and a recovery/banking rule. Ensure the shortest valid route is affordable. Put optional value beyond that route. Show the resource before input is committed.

## Tuning experiment

Vault starts with 24 fuel. Measure path length including any waits demanded by hazards. Increase resource capacity if safe routes require unexplained precision.

## Failure modes

Resource exhaustion that arrives offscreen feels arbitrary. Refills on every safe loop can remove all pressure. A shortest path with zero slack can punish exploration excessively.

## Verification

Test an affordable direct route, a rewarding detour and deliberate exhaustion. Ensure win/loss precedence is explicit when arrival and the last resource expenditure coincide.

Related references (optional): case/porklike; recipe/lantern-vault.
