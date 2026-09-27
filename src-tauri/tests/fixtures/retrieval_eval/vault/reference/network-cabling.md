---
title: Network Cabling
tags: [networking, home]
---

# Network Cabling

## Overview

I recabled the flat in 2024 with solid-core Cat 6 after the old stranded patch cable started dropping the desktop to 100 Mbit for no obvious reason. Solid-core is the right choice for anything that stays put: the conductor is a single copper wire, so it takes a punchdown and holds it, and it carries a signal further than the stranded cable meant for a short patch lead. The run goes from the router through the hall cupboard, where a patch panel gathers every cable, and out to the three rooms that matter. I bought the cable on a 305 m box and cut each run with slack rather than guessing, which left decent spare for two more points. The whole job took a weekend, most of it spent feeding cable under floorboards and through the loft. I labelled both ends before I started pulling, because a bundle of identical blue cables is impossible to sort once it disappears into a wall. The aim was a network that survives a decade of upgrades without me reopening the plaster. Cat 6 was the choice rather than Cat 5e because the price gap is small and the extra headroom carries 2.5G cleanly across the longer runs.

## Setup

Punchdown work is where a good run is won or lost. The patch panel sits in the hall cupboard on a small rack, and each incoming cable terminates on the back of it, following the standard colour order: white-blue, blue, white-green, green, white-orange, orange, white-brown, brown. I keep the twists in the pairs right up to the point of the punch, because untwisting more than a few millimetres is the usual cause of a run that tests short. The keystone jacks in the rooms use the same order, T568B at both ends, so I never have to remember which end I am holding.

Bend radius is the other thing I watch. I keep every turn to at least four times the cable diameter, which for a 6 mm jacket means a curve no tighter than about 24 mm. A tighter bend crushes the pairs and raises the loss without any visible damage. I never kink a cable to fold it into a corner and I never staple one tight against a joist; a staple driven hard enough to hold the cable also crushes the twist underneath. Wherever the cable runs beside mains wiring I keep a hand's width of separation to cut interference.

Length matters at 2.5G more than people expect. A run over 40 m starts to matter for 2.5G, because the speed depends on a clean signal across every pair, and the margin thins as the cable grows. Two of my runs sit just under 30 m and test clean at full speed; the long one to the far bedroom crosses 45 m and is where I would expect any trouble to show first. I keep the patch cords short and factory-made, since the field-terminated work is mine and the easy parts should not be the ones that let me down.

## Notes

Certification is not optional for me. After installation I ran a tester over every link and it certified each one for the standard I need, printing a pass or a fail per pair along with the length and the skew. A link that connects but fails on near-end crosstalk will still pass light traffic and then fall over the moment the network is busy. I keep the printed reports in the cupboard with the layout sheet.

Solid-core cable is for installation and stranded cable is for patch leads; using stranded in a wall is a common mistake because the thin strands break at the punch over a few years. I never staple tight, and I never pull the cable hard around a corner, because both do damage that only shows up in the test. The tester also flagged the one run I made slightly too long, which I re-terminated before the plaster went back. Buying a 305 m box rather than several short ones saved money and left me a spare coil, which has already paid for itself twice. I write the length of each run on the report as well, so the next time I shift a socket I know which cable I am looking at and how far it can stretch. I also keep the tester itself, since a borrowed one costs me a week of waiting the next time a link goes bad. The reports are dated, which turns a drawer of paper into a short history of the installation.

## Troubleshooting

The faults I meet are few and mostly the same. A link that drops to 100 Mbit when it should run at 2.5G is nearly always a single pair that did not seat in the punch; the tester shows which pair and the fix takes five minutes. A run that works on a short patch cable but fails on a longer one is usually a kink hidden behind a skirting board, so I trace it by hand before re-terminating. Intermittent drops that hit every device on a switch often come from a cable I reused from an old job, and old cable ages badly near a radiator. When a run tests clean but a device still stumbles, I swap the patch lead first, because a bent factory lead is cheaper to replace than a wall. The last resort is pulling a fresh cable, and by then I already know the duct is clear from the first attempt. A run that passes at 1G but fails at 2.5G is often a cable that was fine for the older standard and simply has no margin left, and re-terminating both ends is the first thing I try. If that does not lift it, the cable runs too close to mains wiring for the higher speed, and moving it a hand's width usually settles the link.
