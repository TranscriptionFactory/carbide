---
title: Tailscale Notes
tags: [networking, selfhosted]
---

# Tailscale Notes

## Overview

I run Tailscale on every machine I care about, from the desktop in the study to the phone in my pocket, because it turns a scattered set of devices into one flat network with almost no configuration. The key piece at home is a subnet router on the NAS: it advertises 172.16.10.0/24, the address range of the home network, so a laptop on hotel wifi can reach the printer, the file shares and the router's own page as if it were sitting in the flat. MagicDNS is on, which means I type a machine name rather than an address that changes whenever a lease renews. An exit node sends all my traffic through home when I am on a strange network, which is worth more than any captive-portal login screen. ACL tags keep the servers apart from the personal machines, so a compromised laptop cannot wander into the file server. I set key expiry at 180 days, long enough that I am not re-authenticating every month, short enough that a device lost at an airport stops working within a season. The whole overlay took an evening to set up and has needed almost nothing since. It also removes the whole class of problems that used to arrive with a VPN client: no certificate to rotate, no port to open, no password to type twice, and a phone that works the same on mobile data as it does on the sofa.

## Setup

The subnet router is the part that earns its keep. On the NAS I install the client, bring the interface up, and pass `--advertise-routes=172.16.10.0/24` so the rest of the tailnet learns that this one machine can reach the home network behind it. Advertising is only half the job: I then open the admin console and approve the route, because an unapproved route is a promise the network does not keep.

MagicDNS is switched on in the admin console, which gives every machine a name that resolves across the tailnet and removes the job of remembering addresses. I turn on the setting that lets the client send its own DNS name in the tailnet, so a machine reached by name behaves like a local one. For the exit node, I enable IP forwarding on the NAS and mark it as an exit node, then pick it from the client when I am away.

Access control is where the care goes. I define tags in the policy file, one for servers and one for personal machines, and I write rules that let the personal tag reach the server tag on the ports I actually use and nothing else. A tag applied when a device first joins sticks, so I decide the group before I enrol anything. Key expiry sits at 180 days for most devices; the NAS and the router hold reusable keys so a holiday does not cut the house off, and everything else expires on schedule. I keep the policy file in the repository beside the other infrastructure, because a change made in a browser and not written down is a change I will not remember. I test each rule from a machine in the tag it is meant to apply to, so a rule that looks right on the page but blocks the wrong traffic shows up in a minute rather than at the next trip.

## Troubleshooting

When a machine cannot reach the home network, the route is the first suspect. The subnet router has to be online, the route has to be approved in the console, and the client has to accept the route; a client with route acceptance off will reach the tailnet and nothing beyond it. I check the route list on the client and the approval state on the console before I look anywhere else.

The second bucket is naming. If a host resolves on one machine and not another, MagicDNS has probably been switched off in the client or the machine is using a local resolver that answers first. I check which nameserver the client reports and I make sure the tailnet setting is on.

The third is the exit node. It works until I join a captive portal, where the login page cannot be reached while the exit node is routing everything. I switch the exit node off, sign in, and switch it back on. A slow exit node is usually the hotel's uplink rather than mine.

The fourth is key expiry. A device that stops appearing after a few months has probably expired, and re-authenticating it restores it in a minute. I keep a note of when the important devices expire so the surprise lands on a weekday rather than the start of a trip. If a machine cannot be reached at all, I check whether it is still listed on the tailnet before I change anything, because a device that was removed or expired looks identical to one with a bad route from the outside.

## Notes

The reason my phone reaches the printer at home is simple: the phone is on the tailnet, the NAS advertises the home range, and the route is approved, so the phone's traffic arrives on the home network as if it were local. Nothing about the printer changes; it never learns that the request came from a cafe.

I keep two tags and no more, because a policy with dozens of groups is one I stop reading. The servers hold the shared services, the personal tag holds the laptops and phones, and the rules between them are short enough to fit on a screen. When a new device joins I decide its tag before I approve it, and I accept that a wrong tag is a five-minute fix rather than a reason to loosen every rule.

The NAS is the one device with a reusable key, so a reboot or an update does not need me at a keyboard. I also keep the admin console open in a tab during a change, because approving a route and testing it in the same minute saves a second trip through the menus.
