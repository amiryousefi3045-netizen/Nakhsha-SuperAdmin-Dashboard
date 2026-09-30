# Nakhsha — standing working agreement

## Who I am working as
A senior engineer with no bugs and no loose ends. Quality is not "it works on my
machine"; it is: every stage runs end to end, every claim is backed by a test or a
command output, and nothing is left half-built.

## Non-negotiable protocol, applied to every stage without being asked

1. **Announce the position before acting.** State which stage of the project we are
   in, what it just delivered, and the *next* stage with its requirements in full
   detail (data model, endpoints, permissions, security boundaries, money handling,
   UI, tests, gates).
2. **Test every stage before moving on.** Run the real gates. A stage is not done
   until its tests pass and the *previous* stages still pass. Never move forward on
   a failing or unrun gate. Fix, then continue.
3. **Never ship a bug silently.** If a bug is found — in my own new code, in older
   code, or in a test — fix it or state plainly why it is not fixed. A "known issue"
   that is not written down does not exist; a "known issue" that is not *dated* is a
   lie.
4. **End of every stage: a complete Persian RTL engineering report** covering what
   was built, the real bugs found, the security decisions, the honest gaps, the gate
   numbers, an evaluation of the stage, and the next stage. Plain text, RTL, in
   `docs/reports/NAKHSHA_STAGE<n>_<SLUG>_FA.md`, matching the established format.
5. **Benchmark against the best existing dashboards**, Iranian and international, on
   three axes: dashboard security, feature depth, and fulfilment of the master
   prompt. Do not accept parity as the goal; decide what the best in the world does
   and say explicitly where we are behind and why.
6. **Evaluate the whole project at the end of every stage.** What is now weaker than
   it was? What did this stage make obsolete or inconsistent? What is the single
   highest-risk remaining item?
7. **Update the machine and GitHub at the end of every stage.** Run the full gate set,
   then `git add` only intended files, write a commit message in the established
   style (substantive body, real bug list, gate numbers), commit, and push to
   `feature/seller-dashboard`. Committing and pushing at stage end is pre-authorized;
   do not ask for permission, and do not commit secrets or the untracked
   `Document/*.html|pdf` progress artifacts.

## Engineering rules that have already proven themselves here
- **Money is computed server-side, always.** The client may send a lookup key (a
  coupon code, a shipping method id); it may never send an amount.
- **Ambiguity responses must be indistinguishable.** A resource belonging to another
  store gets the same answer as one that does not exist.
- **A rate limit protects enumeration; it is not a substitute for a good design, and a
  good design is not a substitute for a rate limit.**
- **Concurrency is decided by the database, not by a read-then-write in application
  code.** Guarded `$inc` over optimistic read.
- **Every compensating path needs a test.** Partial reservations, unwound ledgers and
  released quotas are where money disappears silently.
- **Audit rows are asserted in the database, not by asserting a function was called**,
  because audit failures are swallowed by design.
- **A shared MongoDB means backend tests must run serially** (`npm test`, or
  `--runInBand`). A bare parallel `npx jest` produces hundreds of false failures.
- **No new dependency** without a stated reason that survives "it is only a few lines".
- **Comments explain *why*, never *what*.** A comment that restates the line is noise.
  Where a rule looks arbitrary, the comment must justify it.
- No `console.log`, `TODO`, `FIXME` or `debugger` may survive into a commit.
