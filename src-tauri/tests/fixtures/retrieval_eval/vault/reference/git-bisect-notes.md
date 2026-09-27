---
title: Git Bisect Notes
tags: [dev]
---

# Git Bisect Notes

## Overview

Git bisect is the tool I reach for when a bug appeared somewhere in the last few hundred commits and I have no idea where. It is a binary search over history: I give it one commit I know is good and one I know is bad, it checks out the middle, asks me to test, and halves the range with every answer. For 250 commits the hunt lands in about eight steps, because 250 halves to 125, 63, 32, 16, 8, 4, 2, and then the single commit that broke things. The power is not the algorithm, which is simple, but that it turns a vague hunt into a short list of yes and no answers. I use it when a failure is reproducible and the cause sits behind a change I cannot spot by reading diffs. It works on any repository and costs nothing but the time of a few builds. The habit that makes it pleasant is narrow: I keep the test small and fast, and I write down each step so I can watch the range closing. On a project with a slow build I use the automatic mode instead and let a script do the answering while I work on something else. The named commit is only useful if I trust the test, so I make sure it fails for the right reason before I start.

## Steps

1. Open the hunt with `git bisect start` at the top of the repository. This clears any earlier session and puts the tool into its search mode, waiting for me to mark the two ends of the range.
2. Mark the current commit as bad with `git bisect bad`, because the bug is what I am looking at right now. If I am not sitting on the broken commit, I pass its hash to the command instead of relying on the checkout.
3. Mark a commit from before the bug as good with `git bisect good <hash>`. Choosing a good point far back is safe, because the search only cares that the range between the two marks contains the break.
4. Let the tool check out the commit halfway between the two marks. Build it, run the failing case, and answer with `git bisect good` or `git bisect bad` depending on the result. Every answer halves the number of commits still under suspicion.
5. Repeat step four until the tool names the first bad commit. For 250 commits this takes about eight answers, because each one cuts the range in half and the range runs out quickly once it is small.
6. Use `git bisect skip` when a commit will not build at all. The tool steps aside to a nearby commit instead, so one broken build does not stall the whole search or force me to abandon it.
7. Switch to `git bisect run ./test.sh` when the test is quick enough to script. The tool checks out each candidate and runs the script, reading the exit code as the answer, and the hunt finishes without me touching the keyboard.
8. Finish with `git bisect reset`, which returns the repository to the branch it started on and drops the temporary checkouts. I keep a log of each step on paper so the range and the answers survive a slip.

## Notes

Two habits keep bisect pleasant. The first is a fast test: the tool runs it once per step, so a test that takes ten minutes turns an eight-step hunt into an eighty-minute wait, and a test that takes ten seconds makes it a coffee break. I narrow the script until it fails only on the bug I am chasing, and I keep a copy of the failing case outside the repository so a checkout cannot disturb it.

The second is a clean working tree. Bisect checks out commits under me, so uncommitted changes either get lost or block the checkout; I stash or commit before I start, and I check that nothing is half-edited. I also note the good and bad hashes in the terminal, because a `git bisect reset` in a bad mood wipes the session and the hashes are no longer on screen.

When the repository has a flaky test that fails one run in five, I run the script twice at each step and treat any failure as bad, because a false bad sends the search down the wrong half and the named commit will be wrong. Finally I read the named commit before I trust it; sometimes the real fix belongs one commit later, and the message on the first bad commit explains what changed and why. I keep the log in the ticket, so the next person sees the range I covered and the commit I found without repeating the work. That note is also where I record the test command, because the next hunt usually starts from the same script.
