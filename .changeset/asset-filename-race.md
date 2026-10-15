---
"carbide": patch
---

Saving several images at once can no longer overwrite one with another. Image assets (paste, drop, web clips) now claim their filename atomically before writing, so two images with the same name saved in the same millisecond get distinct files. Web clips download and save images fully in parallel as a result.
