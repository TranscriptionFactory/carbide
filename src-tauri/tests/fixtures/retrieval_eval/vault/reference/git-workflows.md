---
title: Git Workflows
tags: [dev]
---

# Git Workflows

## Overview

Our team moved to trunk-based development after a painful release where three long-lived branches each carried half of one feature. Now the main branch is always releasable, and everything lands there in small commits. The rule is simple: branch, finish something small, get it reviewed, merge, delete. Nothing sits around long enough to rot. The point is not the tooling but the cadence: a change that lands on Tuesday is reviewed by Wednesday and shipped that week, while a branch left open for a month is a merge conflict waiting to happen.

## Branching

I keep branches alive for a day or two at most. Each one scopes a single change and is named after the ticket. Commits stay small and each one builds, so a bad change is easy to find and easy to revert. Long-lived branches are where conflicts breed, so we avoid them; when work genuinely spans weeks it hides behind a feature flag instead of sitting on a branch. A branch that has not seen a commit in three days usually means the change was too big, so I split it and land the first part.

## Rebase or Merge

Before opening a pull request I rebase onto the latest main, so the history stays linear and the review shows only my work. Rebase before merge is our default; it keeps the log readable and makes bisecting useful. When I stack dependent work, git rebase --onto moves the upper commits onto the freshly updated lower branch without dragging along the old base. On shared branches I never rebase, only merge, to spare everyone a force push. The habit: small commits, rebase locally, merge to main, delete the branch. If a rebase turns messy, I abort and try again in smaller steps rather than resolving a pile of conflicts at once.
