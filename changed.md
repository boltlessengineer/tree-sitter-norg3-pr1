- remove most niche inline markups (spoiler, superscript, subscript, potentially comments)
- remove range-able detached modifiers as footnotes/definitions can be implemented with standard macros (inline for links and block for definition)
- remove wikilinks

# Syntax Removed

These are list of syntax removed and reimplemented using other syntax.

## Block

- range-able detached modifier (footnotes/definitions are removed and table is moved to structural detached modifier)
- standard ranged tag (merged to verbatim ranged tag)
- macro definition (merged to verbatim ranged tag. macro system reimplemented)

## Inline

- spoiler
- superscript
- subscript
- inline comment (`%this%`)
- inline target (`<this>`)
- extendable link target (`{= this}`)
- wiki link target (`{? this}`)
- line number link target (`{123}`)

## Misc

- paragraph segments (` : `)
- indent segmenets (`::\n`)
- slides (`:\n`)

# Indents!

structural detached modifier changes the global indent. All blocks below it will also be affected.

```
paragraph <- indented to level 0

** heading <- sets global indent level to 2

   paragraph <- indented to level 2

* heading <- sets global indent level to 1

  paragraph <- indented to level 1
```

nestable detached modifier changes the local indent. It only affects to single block it's assigned to.

```
- paragraph <- paragraph indented 1

,----- indents the assigned block; (list_item)
| ,--- (list_item) indented to level 1
| |
v vvvvvvvvvvv
- - paragraph
  ^ ^^^^^^^^^
  | |
  | `--- (paragraph) indented to level 2
  `----- indents the assigned block; paragraph
```
