(verbatim_ranged_tag
  (identifier) @_keyword
  (#any-of? @_keyword "code" "embed")
  ;; TODO: only accept first argument as @_lang
  argument: (_) @_lang
  content: (_) @injection.content
  (#set-lang-from-info-string! @_lang))