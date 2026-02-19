MISSION: Refinement Round 10 - Final Validation
PLAN FILE: [absolute path to plan document]

READ the entire plan file.

FINAL QUALITY CHECK (all questions should already be resolved):

- All sections are complete (no remaining placeholder text)
- No contradictions between sections
- Implementation steps are properly ordered
- Dependencies are correct
- Section 14 should be empty or contain only informational notes
- All user decisions from Phase 7 are properly reflected in the plan
- Plan is ready for execution

INTEGRATION WIRING FINAL CHECK:

- Section 3.4 (Integration Map) has an entry for every new component
- Every entry in Section 3.4 has a corresponding wiring step in Section 4 Phase 3
- Section 5.3 (Integration Touchpoints) lists all files that need modification for wiring
- Section 10 Integration Tests cover all wiring connections
- No component is orphaned (created but never consumed)
- If Section 3.4 is empty or missing, FLAG THIS as a critical issue

EDIT the plan file:

- Fix any remaining issues
- Ensure integration wiring is complete and traceable
- Update Metadata: Status: COMPLETE, Current Phase: FINALIZED
- Update Section 13 Refinement Log, Round 10 row
- Add final confidence assessment to Metadata

CRITICAL: Use `replace_string_in_file` to write all findings INTO THE PLAN FILE.

FINAL REPORT: "Round 10 complete: [X] issues fixed, [Y] integration connections verified. Status: COMPLETE. Confidence: [HIGH/MEDIUM/LOW]"
