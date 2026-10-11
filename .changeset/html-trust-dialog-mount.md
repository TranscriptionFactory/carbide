---
"carbide": patch
---

Clicking Live on an HTML fence or `![[x.html]]` embed in a note now shows the trust prompt. The prompt was only mounted inside the HTML document viewer, so with a note open the click did nothing and the request popped up later on the next HTML tab. Embed trust now uses the file's vault path, so a bare `![[chart.html]]` shares grants with the HTML tab viewer.
