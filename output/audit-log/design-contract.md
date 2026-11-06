# Audit log design contract

Purpose: let administrators trace a sensitive change to an actor, record and time.
Primary action: filter history, then expand a before/after comparison.
Audience: reviewers and operators doing repeated investigations.
Direction: quiet operations journal using the existing ivory/forest admin system.
Reference: local admin money ledger and review queues; reuse their navigation,
labels, bordered surfaces, form controls and pagination. No outside assets needed.
Hierarchy: title and scope, filter controls, dated action timeline, actor/target,
then native expandable redacted state comparison. IDs wrap at mobile widths.
Desktop 1440x1000; mobile 390x844. Keyboard native details, visible focus, text
labels alongside icons. Never render a name, email, bank number or review note.
Loading: route skeleton. Empty: distinguish no matching events; clear filters.
Error: reload action and link back to workspace. Permission: existing admin guard.
Success: read-only list; no mutation confirmation needed. Partial: no mixed-source
summary; page comes from one event query. No separate partial state applies.
Coverage: starts when migration installs, no invented historical backfill; direct
writes without an actor are explicitly unattributed. Append-only means guarded
against ordinary update/delete/truncate, not proof against a privileged DB owner.
