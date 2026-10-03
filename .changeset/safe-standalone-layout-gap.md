---
'@nipe-solutions/flex-layout-codemod': patch
---

Preserve standalone `fxLayoutGap` directives for manual review in both native CSS and Tailwind migrations. CSS gap is emitted only when a same-element flex layout is proven throughout the gap's active responsive range, preventing loss of the original child-margin spacing on block containers such as the Kubernetes Dashboard footer.
