---
title: Mesh WiFi Notes
tags: [networking, home]
---

# Mesh WiFi Notes

## Overview

Late last year I replaced the tired single router with a three-unit mesh kit, because one box could not push a signal through the stone wall that runs down the middle of the flat. Two of the three units sit on a wired backhaul, so they carry their traffic over ethernet rather than over the air, and only the third unit falls back to wireless. That split matters more than any number on the box: a wired node gives me full speed in the far bedroom instead of the half a wireless hop would cost. The main unit lives beside the modem under the stairs, the second sits on a shelf in the hall cupboard, and the third gets a place upstairs once I find a spare socket. The goal was boring coverage, the sort nobody notices. I drew the layout on paper before buying anything and checked for old cable runs I could reuse rather than pull new ones. Commissioning took an hour; the small adjustments took a fortnight. I keep the spare power supplies and a short ethernet cable in a labelled drawer, so a dead unit is a five-minute swap instead of a lost evening. The old router is a spare now, wiped and boxed, because a mesh kit that loses its controller is a brick until a replacement lands. I read reviews for weeks before committing, and the deciding factor turned out to be not speed but how clearly the app showed me which node each device had chosen.

## Setup

Setup began in the app, which walks through naming the network and adding each unit in turn. I gave the main unit a fixed lease on the router so its address never drifts, then added the two satellites one at a time and waited for a steady light before moving on. The wired pair plug straight into the hall switch, and I switched off their preference for a wireless backhaul so the kit uses the cable instead of the air. A wired backhaul is the single change that turns a mesh from adequate into fast.

For the radios I left 2.4 GHz at 20 MHz, because it is crowded and the wider setting buys nothing down there. On 5 GHz I set the channel width to 80 MHz on both wired nodes, which gives real throughput without reaching into the channels the neighbours also use. The third band, a second 5 GHz radio that came with the kit, I have left alone; it is not carrying wired traffic, so keeping its channel untouched avoids a fight with the other two. Band steering is on, so the kit nudges a capable phone onto 5 GHz instead of letting it squat on 2.4 GHz forever. A guest network sits on its own name with client isolation switched on, which keeps visitors and cheap smart plugs away from the machines that matter.

Roaming is the setting I tune by hand. I set the threshold around -70 dBm, the point where a client should give up a fading node and look for a better one. Too high and devices flap between nodes; too low and a phone clings to a weak signal until a call drops. Placement does the rest: every unit sits high, near the ceiling, and off the walls, because a metal shelf or a thick corner swallows the pattern. I checked each spot with my phone before drilling anything, and the app confirmed the overlaps.

## Troubleshooting

Most of my mesh problems fall into a few buckets. The first is a unit that quietly drops to a wireless backhaul, which halves its throughput. The app shows the link type, so I check that the wired node still says ethernet. If it flipped, the cable or the port is the suspect, not the radio. A cheap switch that is not passing traffic correctly, or a port that negotiated down to 100 Mbit, will drag the whole node with it.

The second bucket is roaming. A call drops as I walk from the kitchen to the bedroom, and the app's signal chart shows the client holding a node two walls away long past the point it should let go. I nudge the threshold a little lower, or reduce the power on the node it refuses to leave, and the handoff smooths out. I test by walking the flat with a long ping running, watching for a clean gap instead of a run of timeouts.

The third is interference. A neighbour's new kit can swamp a channel overnight, so I rescan every few months rather than once, and shift the 80 MHz block if it sits on top of theirs. A single device that keeps losing its address is usually a stale lease, so I reserve it by hand and move on. A factory reset is the last resort, and I only reach for it when two nodes stop talking entirely, because it costs me the whole layout and an evening of re-adding devices one by one.

## Notes

I keep the kit's firmware on the automatic channel, and I read the release notes before accepting anything that touches the radios, since one update in spring reshuffled my channels without asking. The app is the main window into the network: it lists every client, the node it is attached to and the band it chose, which is more than any light on the box will tell me. I keep a printed sheet in the drawer with the network names, the fixed addresses and the placement, because a reset in a bad mood is easier with a page in front of me than with an app that has forgotten its own history. The three units also draw very little: about 14 W in total with all three awake, which hardly shows on the bill and is worth the flat coverage alone. The two nodes on ethernet keep a gigabit link to the switch, so a large copy between the desktop and the NAS never touches the wireless at all. I check that link speed in the app after any change, because a cable that dropped to 100 Mbit looks exactly like a slow disk from the sofa.
