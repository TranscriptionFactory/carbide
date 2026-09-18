---
"carbide": patch
---

Marquee now scrolls whenever it has tasks. A list shorter than the panel used to sit still, and a panel that was collapsed when the plugin first rendered stayed still even after it opened, because the scroll check ran only when the task list changed. The track now repeats the list enough times to cover the panel with a seamless loop, and re-measures whenever the panel is resized.
