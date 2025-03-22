/// <reference types="tree-sitter-cli/dsl" />
// @ts-check
const newline = choice("\n", "\r", "\r\n");
const newline_or_eof = choice("\n", "\r", "\r\n", "\0");
const whitespace = /\p{Zs}+/u;
const whitespace_or_newline = choice(
    whitespace,
    newline,
    seq(whitespace, newline),
);
const word = /[\p{L}\p{N}]+/u;
const punctuation = /[^\n\r\p{Z}\p{L}\p{N}]/u;
// escape punctuation or space
// (excluding newline & word tokens)
const escape_sequence = /\\[^\n\r\p{L}\p{N}]/u;

const ATTACHED_MODIFIERS = [
    "bold",
    "italic",
    "underline",
    "strikethrough",

    // "inline_comment",
    // "spoiler",
    // "superscript",
    // "subscript",
];

// TODO: check list when I come back to this code:
// - paragraph + paragraph <- this is allowed without newline between them.
//   currently line break at the end of a paragraph is not a requirement
// - bold inside italic inside bold <- should prevent this.
//   can't do with grammar, so have to track states from external lexer.
// - implement link modifier for inline macros / linkables
// - rename carryover tag with attributes (maybe carryover_attributes)
// - debugging with https://github.com/tree-sitter/tree-sitter/discussions/1218
// - list as first item of quote
//   ```
//   > - list item
//   ```

module.exports = grammar({
    name: "norg",

    // Tell treesitter we want to handle whitespace ourselves
    extras: (_) => [],
    externals: ($) => [
        $._preceding_verbatim_whitespace,

        $._blank_line,

        $.flag_not_open,
        $.flag_not_close,

        $.bold_open,
        $.bold_close,

        $.italic_open,
        $.italic_close,

        $.underline_open,
        $.underline_close,

        $.strikethrough_open,
        $.strikethrough_close,

        $.spoiler_open,
        $.spoiler_close,
        $.superscript_open,
        $.superscript_close,
        $.subscript_open,
        $.subscript_close,
        $.inline_comment_open,
        $.inline_comment_close,

        $.verbatim_open,
        $.verbatim_close,

        // $.markup_open,
        // $.markup_close,
        // $.target_open,
        // $.target_close,

        $.heading_prefix,
        $.table_prefix,

        $.unordered_list_prefix,
        $.ordered_list_prefix,
        $.quote_prefix,
        $.null_list_prefix,

        $._dedent_heading,
        $._indent_list,
        $._dedent_list,
        $.flag_indented_line_start,

        $._infirm_tag_prefix,
        $._carryover_tag_prefix,
        $.ranged_open,
        $.ranged_close,

        $._error_sentinel,
    ],

    conflicts: () => [],

    precedences: () => [],

    inline: ($) => [
        $._unclosed_attributes,
        $._closed_inline_content,
        $._inline_macro_head,
        $._attribute_preceding_whitespace,
    ],

    supertypes: ($) => [
        $.block,
        $.tag,
        $.list,
    ],

    rules: {
        document: ($) => repeat(choice(
            $.block,
            $.section,
            $._indented_block,
        )),

        block: ($) => choice(
            $._blank_line,
            $.paragraph,
            $.tag,
            $.list,
        ),
        tag: ($) => choice(
            $.carryover_tag,
            $.infirm_tag,
            $.ranged_tag,
        ),
        list: ($) => choice(
            $.unordered_list,
            $.ordered_list,
            $.quote,
        ),
        section: ($) => prec.right(seq(
            field("heading", $.heading),
            repeat(choice(
                $.block,
                $.section,
                $._indented_block,
            )),
            optional($._dedent_heading),
        )),
        heading: ($) => seq(
            $.heading_prefix,
            optional(seq(
                whitespace,
                optional(seq(
                    field("attributes", $.attributes),
                    whitespace,
                )),
                optional($.paragraph),
            )),
            token(prec(1, newline_or_eof)),
        ),
        ...[
            "unordered_list",
            "ordered_list",
            "quote",
        ].reduce((rules, kind) => {
            rules[kind] = (/** @type any */ $) => prec.right(seq(
                $._indent_list,
                repeat1($[kind + "_item"]),
                $._dedent_list,
            ));
            rules[kind + "_item"] = (/** @type any */ $) => prec.right(seq(
                $[kind + "_prefix"],
                whitespace,
                optional(seq(
                    field("attributes", $.attributes),
                    whitespace,
                )),
                optional($.flag_indented_line_start),
                $.block,
                repeat(choice(
                    $._indented_block,
                    $.list,
                )),
            ));
            return rules
        }, {}),
        _indented_block: ($) => seq(
            $.null_list_prefix,
            whitespace,
            optional($.flag_indented_line_start),
            $.block,
        ),

        // prefixs that will break the paragraph:
        // * heading
        // = table
        // - unordered list item
        // ~ ordered list item
        // > quote item
        // / indented block
        // #carryover
        // .infirm
        // @ranged

        // TODO: paragraph should NOT include the preceding whitespace.
        // rename this to $._paragraph including preceding whitespace and paragraph inside.
        paragraph: ($) => prec(1, seq(optional(whitespace), $._inline)),
        _closed_inline_content: ($) => choice(
            seq($.word, optional($.flag_not_open)),
            seq($.whitespace, optional($.flag_not_close)),
            seq($.soft_break, optional($.flag_not_close)),
            seq($.hard_break, optional($.flag_not_close)),
            $.escape_sequence,
            $.punctuation,
            ...ATTACHED_MODIFIERS.map((k) => [
                $[k],
            ]).flat(),
            $.verbatim,
            $.link,
            $.anchor,
            $.inline_macro,
        ),
        _closed_inline: ($) => seq(
            $._closed_inline_content,
            optional($._closed_inline),
        ),
        _inline: ($) => choice(
            prec.right(seq(
                $._closed_inline_content,
                optional($._inline),
            )),
            // don't continue on unclosed markups
            ...ATTACHED_MODIFIERS.map((k) => [
                $["unclosed_" + k],
            ]).flat(),
            $.unclosed_verbatim,
            $.unclosed_link,
            $.unclosed_anchor,
            $.unclosed_inline_macro,
        ),
        // TODO: change this to repeat1() instead
        _verbatim_inline: ($) => prec.right(2, seq(
            choice(
                $.word,
                seq($.whitespace, optional($.flag_not_close)),
                seq($.soft_break, optional($.flag_not_close)),
                seq($.hard_break, optional($.flag_not_close)),
                $.escape_sequence,
                $.punctuation,
                // specify verbatim punctuations to prevent linkables or inline macros
                alias(choice("[", "{", "\\"), $.punctuation),
            ),
            optional($._verbatim_inline),
        )),
        punctuation: (_) => token(choice(
            repeat1('*'),
            repeat1('/'),
            repeat1('_'),
            repeat1('~'),
            repeat1('`'),
            punctuation,
        )),

        // small trick to prevent ANY opening modifiers including ones with link modifiers
        flag_never_open: ($) => choice($.verbatim_close, $.flag_not_close),

        word: (_) => word,
        whitespace: (_) => whitespace,
        soft_break: (_) => prec.right(seq(
            token(seq(optional(whitespace), newline)),
            optional(whitespace),
        )),
        escape_sequence: (_) => escape_sequence,
        hard_break: (_) => token(seq("\\", newline)),
        ...ATTACHED_MODIFIERS.reduce((rules, kind) => {
            rules[kind] = (/** @type any */ $) => prec.right(seq(
                $[kind + "_open"],
                $._closed_inline,
                $[kind + "_close"],
                optional(field("attributes", $.attributes)),
            ));
            rules["unclosed_" + kind] = (/** @type any */ $) => choice(
                prec.right(seq(
                    $[kind + "_open"],
                    $._inline,
                )),
                prec.right(seq(
                    $[kind + "_open"],
                    $._closed_inline,
                    $[kind + "_close"],
                    $.unclosed_attributes,
                )),
            );
            return rules
        }, {}),

        verbatim: ($) => prec.right(seq(
            $.verbatim_open,
            $._verbatim_inline,
            $.verbatim_close,
        )),
        unclosed_verbatim: ($) => seq(
            $.verbatim_open,
            $._verbatim_inline,
        ),

        markup: ($) => prec.right(seq(
            "[",
            $._closed_inline,
            "]",
        )),
        unclosed_markup: ($) => prec.right(seq(
            "[",
            $._inline,
        )),
        target: ($) => prec.right(seq(
            "{",
            $._verbatim_inline,
            optional($.flag_never_open),
            token(prec(9, "}")),
        )),
        unclosed_target: ($) => prec.right(seq(
            "{",
            $._verbatim_inline,
        )),

        link: ($) => prec.right(seq(
            field("target", $.target),
            optional(field("description", $.markup)),
            optional(field("attributes", $.attributes)),
        )),
        unclosed_link: ($) => choice(
            field("target", $.unclosed_target),
            seq(
                field("target", $.target),
                field("description", $.unclosed_markup)
            ),
            seq(
                field("target", $.target),
                optional(field("description", $.markup)),
                field("attributes", $.unclosed_attributes)
            ),
        ),
        anchor: ($) => prec.right(seq(
            field("description", $.markup),
            optional(field("target", $.target)),
            optional(field("attributes", $.attributes)),
        )),
        unclosed_anchor: ($) => choice(
            field("description", $.unclosed_markup),
            seq(
                field("description", $.markup),
                field("target", $.unclosed_target)
            ),
            seq(
                field("description", $.markup),
                optional(field("target", $.target)),
                field("attributes", $.unclosed_attributes)
            ),
        ),

        attributes: ($) => seq(
            $._unclosed_attributes,
            optional($.flag_never_open),
            token(prec(9, ")")),
        ),
        unclosed_attributes: ($) => $._unclosed_attributes,
        _unclosed_attributes: ($) => prec.right(1, seq(
            "(",
            repeat(choice(
                $.attribute,
                token(prec(9, ";")),
            )),
        )),
        _attribute_preceding_whitespace: (_) =>
            prec.right(repeat1(
                token(prec(2, choice(whitespace, newline))),
            )),
        attribute: ($) => prec.right(2, choice(
            $._attribute_preceding_whitespace,
            seq(
                optional($._attribute_preceding_whitespace),
                field("key", alias($.key, $.value)),
                optional(seq(
                    repeat1(token(prec(3, whitespace_or_newline))),
                    optional(field("value", $.value)),
                )),
            ),
        )),
        key: ($) => prec.right(repeat1(
            choice(
                token(prec(1, choice(
                    word,
                    punctuation,
                ))),
                alias(
                    token(prec(1, escape_sequence)),
                    $.escape_sequence
                ),
            ),
        )),
        value: ($) => prec.right(repeat1(
            choice(
                token(prec(3, choice(
                    whitespace,
                    newline,
                    word,
                    punctuation,
                ))),
                alias(
                    token(prec(3, escape_sequence)),
                    $.escape_sequence
                ),
            ),
        )),

        _inline_macro_head: ($) => seq(
            "\\",
            field("name", alias(/[\p{L}\p{N}][\p{L}\p{N}\-]*/u, $.identifier)),
        ),
        inline_macro: ($) => prec.right(seq(
            $._inline_macro_head,
            optional($.markup),
            optional(field("attributes", $.attributes)),
        )),
        unclosed_inline_macro: ($) => seq(
            $._inline_macro_head,
            choice(
                $.unclosed_markup,
                seq($.markup, $.unclosed_attributes),
            ),
        ),

        identifier: (_) => token(prec(1, repeat1(choice(
            /[^;\(\)\n\r\p{Z}]/u,
            escape_sequence,
            // token(seq("\\", choice(/./, newline))),
        )))),
        verbatim_line: (_) => seq(/[^\n\r]*/u, newline_or_eof),
        verbatim_line_param: (_) => /[^\n\r]+/u,
        ranged_tag: ($) => seq(
            seq($.ranged_open, field("name", $.identifier)),
            optional(seq(whitespace, optional(field("param", $.verbatim_line_param)))),
            newline,
            repeat(seq(optional($._preceding_verbatim_whitespace), field("line", $.verbatim_line))),
            seq(optional($._preceding_verbatim_whitespace), $.ranged_close),
        ),
        infirm_tag: ($) => seq(
            $._infirm_tag_prefix,
            field("name", $.identifier),
            optional(seq(whitespace, optional(field("param", $.verbatim_line_param)))),
            token(prec(1, newline_or_eof)),
        ),
        carryover_tag: ($) => seq(
            $._carryover_tag_prefix,
            choice(
                seq(
                    field("name", $.identifier),
                    optional(seq(whitespace, optional(field("param", $.verbatim_line_param)))),
                ),
                field("attributes", $.attributes),
            ),
            token(prec(1, newline_or_eof)),
        ),
    },
});
