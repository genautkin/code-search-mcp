# Index Storage Documentation Alignment

## Goal

Align `docs/ARCHITECTURE.md` with the README's documented index-storage behavior.

## Change

- Show `node_modules/.cache/code-search/lancedb/` as the primary local LanceDB location.
- Document `.code-search/` as the fallback when `node_modules` is unavailable.
- Do not change implementation code or the README.

## Success Criteria

The architecture diagram and storage explanation describe the same primary and fallback paths as the README, with no contradictory path references remaining in the architecture document.
