---
"carbide": minor
---

Replace the agent's Safe | Power control with a live Auto-approve switch

Agent mode asked you to choose a permission posture up front, once, before you
knew what the agent would request — and then held you to it for the rest of the
conversation. The two labels also oversold both ends: Power still interrupted
for deletions and shell commands, and Safe did not "ask before edits" for
Carbide's own tools, it silently hid them.

Auto-approve replaces it with one switch you can flip at any point, including
while a permission prompt is on screen. Off (the default for every new session)
every edit, command and deletion asks first. On, none of them do — and turning
it on answers whatever prompt the agent is currently waiting on. The same state
is reachable from the composer switch and from "Allow everything for this
session" inside a permission prompt.

Carbide's own vault tools are now always offered to the agent and gated at the
moment of the call, so a blocked write comes back as an explanation the agent
can relay to you rather than a capability it never appeared to have. Approving
a prompt no longer risks the call being refused anyway.

Ask | Agent is unchanged.

**Removed:** the "Default Agent Permission" setting. Granting blanket approval
to sessions that do not exist yet is exactly the pre-emptive consent this
change removes; new sessions always start with auto-approve off. Existing
sessions saved in Power mode carry over as auto-approved.
