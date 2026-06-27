import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkStringify from "remark-stringify";
import remarkGfm from "remark-gfm";
const p = unified().use(remarkParse).use(remarkGfm);
const s = unified().use(remarkStringify).use(remarkGfm);
for (const md of [
  `<iframe src="https://example.com/x" width="640" height="360"></iframe>`,
  `<video src="clip.mp4" controls></video>`,
]) {
  const tree = p.parse(md);
  console.log("IN:", md);
  console.log("NODES:", JSON.stringify(tree.children.map(c=>({type:c.type, value:c.value})) ));
  console.log("OUT:", JSON.stringify(s.stringify(tree)));
  console.log("---");
}
