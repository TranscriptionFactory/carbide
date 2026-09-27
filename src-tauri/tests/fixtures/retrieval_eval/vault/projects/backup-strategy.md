---
title: Backup Strategy
tags: [backup, selfhosted]
---

# Backup Strategy

## Overview

Three copies of anything that matters: the live data, a local copy, and one off-site. I keep the rule simple because complicated schemes rot. Losing a laptop is annoying; losing the only copy of ten years of images is not something I want to explain to anyone. So the local copy runs nightly and the off-site copy runs weekly, and I test a restore every quarter. Everything important lives in a handful of directories, which makes the sets easy to describe. None of this is clever; it just runs every day without me thinking about it, and that is the whole point.

## Tools

The storage host runs borg with --append-only, so snapshots cannot be deleted by a compromised host. That matters: if something gets onto the server it can add data but cannot rewrite history or wipe the archive. I reach it over SSH with a key locked to a single forced command. Desktop machines run restic to a local USB disk for quick rollback, and Timeshift covers the system volumes on those desktops. Databases get dumped first, then the dump is folded into the same archive so a restore is one operation rather than three.

## Schedule

Nightly at 02:00 the laptops push to the storage host. Weekly on Sunday the storage host pushes to an off-site box I rent in another city. Retention is 7 daily, 4 weekly, and 12 monthly. Health checks run after every job and email me only when something fails. Once a quarter I restore a random file set to a scratch directory and confirm the files open and their checksums match. If a job has not reported in 36 hours I get a nag, because silent failure is the dangerous kind. I also keep a printed copy of the restore steps in a drawer, because the night I need it is the night I will not want to look it up.
