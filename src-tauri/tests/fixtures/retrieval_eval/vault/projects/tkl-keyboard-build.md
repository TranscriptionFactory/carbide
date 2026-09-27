---
title: TKL Keyboard Build
tags: [gear]
---

# TKL Keyboard Build

## Overview

A tenkeyless board is the size I keep coming back to. It has the function row and the arrow keys, and it drops the number pad I never use, which leaves room on the desk for a mouse without the board sprawling. The case is aluminium and the whole thing weighs just over a kilogram, so it stays put during a fast paragraph. The build is a screw-in stabiliser job with a soft mounting feel from the stacked foam, and I put it together over a weekend in the spring. This is the third board I have built in this layout, and each one has taught me something small about where the rattle comes from and where it does not. The tenkeyless layout costs me nothing in daily use, because I do not work with numbers all day and the function row carries everything else. What I like most is that a board like this can be repaired rather than replaced. Every part inside it is a standard part, and if a switch dies I can open the case, pull it, and fit another in a few minutes. That is the reason I keep building instead of buying, and it is also the reason the third board exists at all, since each one has taught me something that the next one put right.

## Setup

I laid every part out on a cloth before I started, and checked the plate against the PCB so I knew the screw holes lined up. The board uses an FR4 plate, which is a fibreglass material with a slightly softer feel than aluminium and a slightly deeper sound. I fitted the stabilisers first, because they are awkward to reach once the plate is on. The stabilisers are screw-in, so they are fixed to the PCB with a screw rather than clipping in, which is far more stable and far less prone to popping out later.

The stabilisers then get packed with dielectric grease. I put a generous amount on the wire and on the inside of the housing, and I work it in until the wire glides without a rattle. Over-packing is hard here; a stabiliser with too little grease rattles, and one with plenty is quiet and only needs a clean-up around the edges. I test each stabiliser by hand before the plate goes on, pressing the key several times and listening for a tick.

With the stabilisers done I added the foam. A sheet of PE foam sits under the plate, between the plate and the PCB, which softens the sound and takes out the hollow ring of the aluminium case. A piece of tape covers the back of the PCB, the tape mod, which does a similar job on the underside and gives the whole board a slightly fuller note. I trim both to the outline of the plate so nothing bulges when the case closes.

Then I fit the switches and check the layout. I always use a switch tester before soldering, and I press every position on the board against the tester to confirm the pins line up and the orientation is right, because desoldering a wrong switch is the worst way to spend an hour. Once I am satisfied, I solder the switch pins, then the diodes, then the controller, checking after each stage.

Finally the firmware. I use QMK, so I clone my keymap into the build and compile it, then put the board into bootloader mode and flash the image. The commands are short: a build command that produces the hex file, and a flash command that writes it over the bootloader. I keep the keymap in a text file in my notes, so a reflash is a copy and a paste rather than a reconstruction.

## Troubleshooting

A key that does nothing after the flash is usually a bad solder joint rather than a firmware problem, so I reflow the two pins and test again. A key that repeats by itself is more likely a switch that is sitting slightly too high in the plate, and pressing it home fixes it. If the whole board is dead I check the bootloader entry and confirm the flash actually completed, because a board that is somehow stuck in bootloader looks dead but is not. A rattle that survives after the case is closed is nearly always a stabiliser, and I open the board and add grease rather than trying to live with it. If the firmware will not compile, the error is almost always a stray character in the keymap, and I re-read the last line I edited. A board that works when it is on the bench but not when the case is closed is nearly always a pin touching the case or a foam sheet pressing on the controller, and I look for a shiny spot on the inside of the case before I blame anything else. A column of dead keys is a solder bridge rather than a firmware fault, and the fix is a quick clean with the iron and a look under a magnifier. If the keyboard is not recognised at all, I check the cable first, since a USB cable that only carries power and no data is a classic way to lose an hour.

## Notes

The FR4 plate is the change I would make again. It is cheaper than aluminium and the sound is closer to what I want, and it drills cleanly when I have to enlarge a hole for a stabiliser. The tape mod is worth the ten minutes, but it is the first thing I would drop if I were short of time, because the difference is smaller than the foam. I keep a small bag of spare screws and a spare set of stabilisers in the box, since the parts that fail are the parts that are fiddly to replace. Before the next build I will buy a second switch tester, because passing mine around while the board is half-soldered is a habit I would rather not repeat. The one thing I have not got round to is a carrying case, and the board is heavy enough that it stays on the desk anyway, so that purchase can wait indefinitely. I keep the leftover foam and tape in the parts box, since both are the sort of thing I would have to buy a whole roll of if I ever needed a small piece again.
