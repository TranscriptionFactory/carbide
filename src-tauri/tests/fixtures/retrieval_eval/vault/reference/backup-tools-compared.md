---
title: Backup Tools Compared
tags: [backup]
---

# Backup Tools Compared

## Overview

I keep four backup tools installed because no single one covers every job. Restic and borg do the heavy lifting on the server, rsync handles quick folder mirrors, and timeshift looks after system snapshots on the Linux desktop. Each one earns its place, and I know which to reach for when something breaks.

## Comparison

Restic writes encrypted, deduplicated repositories to local disk and to S3. It dedupes across snapshots, compresses well on text, and restores a single file in minutes. Borg is similar but faster on local repositories and has a richer prune policy; it dedupes by chunk, compresses with zstd, and I run it nightly to the NAS. Rsync copies files as they are, with no dedupe and no encryption, which makes it great for a live mirror and poor for history. Timeshift snapshots the system with hard links, so it is cheap but tied to the filesystem underneath.

Snapshot frequency: nightly for restic and borg, hourly for the rsync mirror, daily for timeshift.

Restore speed: rsync wins for bringing back a whole folder, restic and borg win for a single version from months ago, and timeshift wins for booting a broken system back to a working state.

## Notes

Restic's prune rewrites packs and can be slow, so I run it monthly rather than nightly. Borg needs the repository mounted to browse its contents; I mount it and grep instead of guessing. Rsync over ssh is fine but I always check the delete flag twice before running it. Timeshift lives on a separate disk so a bad upgrade cannot take the snapshots with the system. I keep the restic password in a password manager, because a lost passphrase means a lost repository, and I test a restore from each tool twice a year rather than trusting the logs.
