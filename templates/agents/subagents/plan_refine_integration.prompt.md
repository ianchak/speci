MISSION: Refinement Round 7 - Integration Points & Wiring Completeness
PLAN FILE: [absolute path to plan document]

READ the entire plan file.

## Primary Goal: Ensure No Component Is Orphaned

An "orphaned component" is one that gets created but never wired into the system — it compiles but is never called, registered, or initialized by anything.

ANALYZE all integration boundaries:

- API contracts between components
- Event/message interfaces
- Shared state access
- External system interactions

PERFORM ORPHAN DETECTION:

For EVERY new file listed in Section 5 (New Files):

1. Trace WHO imports/calls/instantiates this component
2. Verify that consumer is documented in Section 3.4 Integration Map
3. If no consumer exists → flag as ORPHANED and add integration step to Section 4 Phase 3

VERIFY WIRING COMPLETENESS:

For EVERY entry in Section 3.4 Integration Map:

1. Confirm the "Registered In" file is listed in Section 5 (Modified Files or Integration Touchpoints)
2. Confirm there is an implementation step in Section 4 Phase 3 that performs the wiring
3. Confirm there is a test in Section 10 that verifies the wired connection works

CHECK ENTRY POINT INTEGRATION:

- Are new commands registered in command routers/registries?
- Are new modules exported from index/barrel files?
- Are new config options added to config schemas and defaults?
- Are new event handlers subscribed in initialization code?
- Are new middleware/plugins registered in their respective pipelines?

EDIT the plan file:

- Enhance Section 7 API Contracts with all interfaces
- Verify Section 2.4 Integration Points are addressed
- Fill/update Section 3.4 Integration Map for any missing entries
- Add EXPLICIT wiring steps to Section 4 Phase 3 for any missing connections
- Add integration tests to Section 10 that verify end-to-end connectivity (not just unit behavior)
- Add any missing files to Section 5.3 Integration Touchpoints
- Update Section 13 Refinement Log, Round 7 row

CRITICAL: Use `replace_string_in_file` to write all findings INTO THE PLAN FILE.

FINAL REPORT: "Round 7 complete: [X] API contracts defined, [Y] integration tests added, [Z] orphaned components found and fixed, [W] wiring steps added to Phase 3. Sections modified: [list]"
