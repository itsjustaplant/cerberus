# Development workflow

1. Inspect repository instructions, Git status, and the task before editing.
   Preserve unrelated user changes. Use a conventional task branch; reuse the
   current branch when it already belongs to the task.
2. Analyze the intended behavior and relevant checks, then implement the change.
3. Run appropriate checks (`npm run check` for this scaffold), review the diff
   for correctness, security, maintainability, and unintended changes, and fix
   findings. Report checks that could not run.
4. Build and launch the updated app when practical, or provide concrete
   verification steps and expected results. Ask the user to verify and wait for
   explicit confirmation before committing or merging. Silence and unrelated
   replies do not count as verification.
5. If a problem is reported or later edits change behavior, implement the fix,
   repeat affected checks, and obtain verification again.
6. After verification, inspect the final diff and checks. Commit only task-related
   changes using a Conventional Commit. Do not create duplicate commits.
7. Merge the verified task branch into `main`, preserving unrelated changes.
   Run checks needed for the merged result. If conflict resolution changes
   behavior, repeat affected checks and user verification. Push only when asked
   or already authorized.
8. Bump the version and create a matching `vX.Y.Z` tag only when a release or
   version bump is requested. Validate and commit the version change before
   tagging. Publish or push releases only when asked or already authorized.

Keep the process proportional. For changes without a meaningful live test,
provide inspection or automated-check evidence for user verification. Never
claim checks or verification that did not occur.
