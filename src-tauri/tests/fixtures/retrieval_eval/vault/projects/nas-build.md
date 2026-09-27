---
title: NAS Build
tags: [selfhosted]
---

# NAS Build

## Overview

Four 8 TB drives in a small tower, plus a 500 GB NVMe for the system. I chose ZFS raidz2 so any two drives can fail without data loss; with four disks that leaves about 14.5 TB usable. It draws around 45 W idle and sits in the cupboard under the stairs, where I ran a dedicated circuit and a small fan for airflow. The whole build came in under the price of a shop unit with the same capacity, and I know every part in it. Two of the drives came out of a decommissioned office unit and are still under warranty, so spares are covered for now.

## Setup

The pool uses ashift=12 for the 512e drives. I split it into datasets: media, documents, and a separate one for virtual machines so snapshots do not drag everything along. Shares are SMB for Windows machines and NFS for the Linux boxes. Backup is a set of rsync jobs that walk the datasets to a second machine each night. Timeshift handles the desktop volumes on the workstations, keeping hourly rollback for the system partitions. Permissions are per-dataset, and I keep a text file listing each job and where it lands. I labelled each bay with a printed strip and noted which serial sits where, so a failed member is a two-minute lookup rather than a guess.

## Maintenance

Monthly zpool scrub, and I read the SMART report on every drive while it runs. Temperatures sit near 38 C; if one climbs past 45 I look at the airflow. I keep one cold spare drive on the shelf and replace a member as soon as it logs a reallocated sector. The rsync jobs get checked weekly by reading the log tail. Every few months I boot the second machine alone and confirm the datasets open without the primary online. I also log each scrub date on a whiteboard beside the rack; if one slips by more than a week it becomes the job for that evening.
