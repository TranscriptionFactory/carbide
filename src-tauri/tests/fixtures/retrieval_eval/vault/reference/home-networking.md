---
title: Home Networking
tags: [networking, home]
---

# Home Networking

## Overview

I rebuilt the home network in 2023 when the old router started dropping video calls in the middle of meetings. The fibre lands at the back of the flat, the modem sits against the wall, and everything else hangs off one router. The place is long and narrow with a thick stone wall down the middle, so a single box in the corner cannot cover it. I planned the layout before buying anything: modem and router at one end, a cable run to the far room, and one wireless access point up high where the two halves meet. The goal was boring reliability: flat coverage, no dead spots, and a guest network for visitors.

## Setup

The router keeps the default address 192.168.1.1, and I log in there for DHCP, WiFi and port forwarding. It feeds a gigabit switch in the hall cupboard, which handles the wired runs to the desktop, the TV and the access point. The switch is unmanaged, so I plug in and it works. In the far room I mounted a PoE access point on the ceiling; the single cable carries both power and data, which saved running a socket up there. I gave the access point a fixed address outside the DHCP pool and set both radios to the same name across the two bands so devices can roam. The guest network is a separate SSID with client isolation switched on.

## Troubleshooting

Most of my network problems land in a handful of buckets. The first is name resolution. If pages hang for a few seconds and then load, or one device fails while others work, the DNS server is usually the culprit. I check what the router hands out, and if the provider resolver is flaky I point the clients at a public resolver instead. Flushing the cache on the machine often clears a stale entry straight away. I also flush the resolver on the router and test with a direct query, so I can tell a dead name server from a dead link.

The second bucket is wireless. On 2.4 GHz only channels 1, 6 and 11 do not overlap, and in a block of flats even those are crowded. I scan the air, pick the quietest channel and leave the width at 20 MHz there. On 5 GHz I use wider channels and let the access point steer clients, because the range is shorter and walls eat the signal. A dropout that hits one room only is almost always a coverage problem, not a router fault. Channels are only part of it; a neighbour's new mesh kit can swamp a band overnight, so I rescan every few months rather than once.

DHCP is the third. A lease pool that is too small, or a static address sitting inside the pool, causes duplicate address clashes and random disconnects. I keep fixed addresses outside the pool and give the pool plenty of room. When a device keeps losing its address I check the lease time; very short leases cause churn, and very long ones leave stale entries after I move hardware around. If the pool is a /24, I start it a hundred addresses in, leaving room for the fixed gear at the bottom.

VLANs are my fourth. I separate guests, work machines and the smart-home gadgets onto different tags so a cheap plug cannot scan my laptop. The trunk port to the switch carries every tag, and the access point maps each SSID to a tag. When something cannot reach the printer, nine times out of ten it is on the wrong VLAN rather than broken.

Roaming is its own bucket. Too many access points, or two radios shouting at full power, make a phone cling to a weak one until the call drops. I lower the power on the access point and let it hand off earlier, and I keep the SSIDs identical so the client has somewhere to go. I confirm the handoff with a ping while walking the flat; steady replies mean the client moved cleanly.

The last bucket is the link itself. Dropouts that hit every device at once point at the modem, the cable or the provider. I check the modem logs, look for the upstream losing sync, and test with a cable straight into the modem to rule out my own gear. If the modem itself is rebooting under load, that is a provider ticket, not something I can fix from the router. If the light stays green through a dropout, I look at the cable and the connector before I blame the provider.

One setting I only touch when the symptoms fit the pattern: some fibre providers use PPPoE, which adds an eight-byte header and will not fit a full-sized frame, so I set the MTU to 1492 on the router's WAN side. With the wrong value, large packets vanish while small ones pass, which looks exactly like one broken site rather than a link fault. Ping a large packet with the do-not-fragment flag and the size falls into place quickly.
