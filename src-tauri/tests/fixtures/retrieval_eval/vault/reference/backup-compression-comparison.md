---
title: Backup Compression Comparison
tags: [backup]
---

# Backup Compression Comparison

## Overview

I compressed the same 40 GB photo set with four codecs to see what the numbers actually looked like, rather than trusting the impression that one tool is fast and another small. The set is typical of my archive: mostly JPEG files that are already compressed, a scattering of RAW frames, and a few hundred megabytes of sidecar text. It sits on a quiet disk, the machine was idle, and I ran each pass three times and took the median, so a background update could not flatter a result.

The job of a backup compressor here is modest. Already-compressed photos do not shrink much further, so the realistic gains are ten to twenty per cent, and the question is not which codec wins on size but which size is worth the extra minutes on a nightly run. I measured wall-clock time and the size of the resulting archive, and I check the archive afterwards with a blake2b checksum made before and after the round trip. The point of the exercise was not to crown a winner but to see where the size curve flattens, so I could stop paying minutes for megabytes that a nightly run does not need. All four codecs produced archives that passed the checksum, so the comparison came down to time alone. The machine is a modest desktop, and I noted that in the results, because a faster processor would compress the times down without changing the sizes at all.

## Comparison

lz4 was the speed champion. It turned the 40 GB set into 36 GB in about 40 seconds, which is barely less than a copy. For an hourly snapshot that only has to be a little smaller and very fast, lz4 is the right tool.

zstd is the middle ground I actually use. At level 3 it produced 34 GB in a minute and a half, a solid gain with no noticeable cost. At level 6 it produced 33 GB in about four minutes, which is twice the time for one gigabyte of saving. At level 19 it produced 32 GB but took about forty minutes, so the last level bought one more gigabyte at eight times the cost of level 6.

gzip was the slow baseline. It produced 35 GB in about nine minutes, slower than zstd level 6 and larger, which is why it no longer appears in my scripts except when an old tool insists on it. It is the reference point that shows how far zstd has come, not a serious candidate any more.

The pattern is the same at every step: returns fall away sharply as the level climbs, and the curve is flat by the time level 6 is behind me. On this data, anything past level 6 is buying single-digit percentages with multiples of the time.

I check every archive with a blake2b checksum. I hash the source set before the run and the restored set afterwards, and the two digests have to match before I trust the backup. Compression that corrupts one bit is worse than no compression at all, and a checksum is the cheapest way to catch it. The digest costs a few seconds to compute and has saved me a bad archive once, which is enough to keep it in the job.

## Notes

Level 19 is rarely worth it on a nightly job. Forty minutes of CPU every night for one gigabyte on a 40 GB set is a poor trade, and the machine that does the work is also the machine I want to use in the evening. I keep level 6 for the weekly archive and level 3 for the nightly one, and I let the disk do the rest.

The cost is not only time. Higher levels use more memory and make the restore slower, because more work was done on the way in. A restore during a bad evening should be quick, and an archive that takes an hour to unpack is a second problem on top of the first.

I also keep the codec choice separate from the storage choice. The archive format, the checksums and the retention policy are one decision; the compression level is a knob I can change later without touching either. I record the level in the job's configuration and in the log, so a size that changes from one week to the next has a known cause.

Finally I test a restore rather than trusting the log. Once a month I unpack the newest archive into a scratch directory, run the blake2b checksum, and delete it. A backup is only as good as the last restore that actually worked, and the test costs me five minutes. If a future release of zstd changes its output slightly, the size moves and I know why, because the level and the version are both in the log.
