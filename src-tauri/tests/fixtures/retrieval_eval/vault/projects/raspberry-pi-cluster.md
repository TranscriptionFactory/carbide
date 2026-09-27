# Raspberry Pi Cluster

## Overview

Four Pi 4 8 GB boards in a small printed rack, each with a PoE HAT so one cable carries both power and network. A 12 V PoE switch feeds all four, which keeps the cabling to a single run per node. I run k3s for orchestration. I looked at Ceph for storage but it is too heavy for this hardware, so I use a simple NFS export from the NAS instead. Total idle draw is about 22 W and it is silent. The rack itself is printed in PETG and holds the boards vertically so heat rises between them instead of pooling underneath.

## Setup

Flash each card with the 64-bit lite image, then set the hostname and a static lease in the router before first boot. Enable SSH by dropping a file on the boot partition. The PoE HAT fan curve is set in the firmware config so the boards stay under 60 C. Install k3s on the first node and join the rest as agents with a token. Taint the first node so it only runs the control plane. Add an NFS storage class pointing at the NAS, then a Traefik ingress and cert-manager. Everything else is a handful of manifests in a git repo I pull on each node.

## Troubleshooting

Thermal throttling shows up as random pod evictions; check the fan and the paste under the HAT. SD card corruption after a power cut is common, so I moved the runtime to a USB SSD on each node. A node that will not join usually has a clock skew, so install and enable a time service. If the PoE budget trips, the switch drops the last port powered; move a node or lower the per-port class. Weird DNS failures inside pods almost always trace to the NAS being unreachable at boot. I keep a spare card already flashed in a drawer, so a failed node is a swap rather than a rebuild.
