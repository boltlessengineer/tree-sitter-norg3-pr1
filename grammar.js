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

module.exports = grammar({
    name: "norg",

    // Tell treesitter we want to handle whitespace ourselves
    extras: (_) => [],
    externals: ($) => [
        $._preceding_verbatim_whitespace,

        $._blank_line,

        $.not_open,
        $.not_close,

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

        $.heading_prefix,
        $.table_prefix,

        $.unordered_list_prefix,
        $.ordered_list_prefix,
        $.quote_list_prefix,
        $.null_list_prefix,

        $._dedent_heading,
        $._indent_list,
        $._dedent_list,
        $._indented_line_start,

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
    ],

    supertypes: ($) => [
        $.block,
        $.tag,
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
            $.unordered_list,
            $.ordered_list,
            $.quote,
        ),
        tag: ($) => choice(
            $.carryover_tag,
            $.infirm_tag,
            $.ranged_tag,
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
                optional($.paragraph),
            )),
            token(prec(1, newline_or_eof)),
        ),
        unordered_list: ($) => prec.right(seq(
            $._indent_list,
            repeat1($.unordered_list_item),
            $._dedent_list,
        )),
        unordered_list_item: ($) => prec.right(seq(
            $.unordered_list_prefix,
            whitespace,
            choice($.block, $._indented_line_start),
            repeat(choice(
                $._indented_block,
                $.unordered_list,
                $.ordered_list,
                $.quote,
            )),
        )),
        ordered_list: ($) => prec.right(seq(
            $._indent_list,
            repeat1($.ordered_list_item),
            optional($._dedent_list),
        )),
        ordered_list_item: ($) => prec.right(seq(
            $.ordered_list_prefix,
            whitespace,
            choice($.block, $._indented_line_start),
            repeat(choice(
                $._indented_block,
                $.unordered_list,
                $.ordered_list,
                $.quote,
            )),
        )),
        quote: ($) => prec.right(seq(
            $._indent_list,
            repeat1($.quote_item),
            optional($._dedent_list),
        )),
        quote_item: ($) => prec.right(seq(
            $.quote_list_prefix,
            whitespace,
            choice($.block, $._indented_line_start),
            repeat(choice(
                $._indented_block,
                $.unordered_list,
                $.ordered_list,
                $.quote,
            )),
        )),
        _indented_block: ($) => seq(
            $.null_list_prefix,
            whitespace,
            choice(
                $.block,
                $._indented_line_start,
            ),
        ),

        // TODO: paragraph should NOT include the preceding whitespace.
        // rename this to $._paragraph including preceding whitespace and paragraph inside.
        paragraph: ($) => prec(1, seq(optional(whitespace), $._inline)),
        _closed_inline: ($) => seq(
            choice(
                seq($.word, optional($.not_open)),
                seq($.whitespace, optional($.not_close)),
                seq($.soft_break, optional($.not_close)),
                seq($.hard_break, optional($.not_close)),
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
            optional($._closed_inline),
        ),
        _inline: ($) => choice(
            prec.right(seq(
                choice(
                    seq($.word, optional($.not_open)),
                    seq($.whitespace, optional($.not_close)),
                    seq($.soft_break, optional($.not_close)),
                    seq($.hard_break, optional($.not_close)),
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
                optional($._inline),
            )),
            ...ATTACHED_MODIFIERS.map((k) => [
                $["unclosed_" + k],
                $["ext_unclosed_" + k],
            ]).flat(),
            $.unclosed_verbatim,
            $.unclosed_link,
            $.unclosed_anchor,
            $.unclosed_inline_macro,
        ),
        _verbatim_inline: ($) => prec.right(2, seq(
            choice(
                $.word,
                seq($.whitespace, optional($.not_close)),
                seq($.soft_break, optional($.not_close)),
                seq($.hard_break, optional($.not_close)),
                $.escape_sequence,
                $.punctuation,
            ),
            optional($._verbatim_inline),
        )),
        punctuation: (_) => token(choice(
            repeat1('*'),
            repeat1('/'),
            repeat1('_'),
            repeat1('~'),
            repeat1('`'),
            /[^\n\r\p{Z}\p{L}\p{N}]/u,
        )),

        word: (_) => word,
        whitespace: (_) => whitespace,
        soft_break: (_) => prec.right(seq(
            token(seq(optional(whitespace), newline)),
            optional(whitespace),
        )),
        escape_sequence: (_) => /\\[^\n\r\p{L}\p{N}]/u,
        hard_break: (_) => token(seq("\\", newline)),
        ...ATTACHED_MODIFIERS.reduce((rules, kind) => {
            rules[kind] = (/** @type any */ $) => prec.right(seq(
                $[kind + "_open"],
                $._closed_inline,
                $[kind + "_close"],
                optional($.attributes),
            ));
            rules["unclosed_" + kind] = (/** @type any */ $) => prec.right(seq(
                $[kind + "_open"],
                $._inline,
            ));
            rules["ext_unclosed_" + kind] = (/** @type any */ $) => prec.right(seq(
                $[kind + "_open"],
                $._closed_inline,
                $[kind + "_close"],
                $.unclosed_attributes,
            ));
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
            "}",
        )),
        unclosed_target: ($) => prec.right(seq(
            "{",
            $._verbatim_inline,
        )),
        link: ($) => prec.right(seq(
            field("target", $.target),
            optional(field("desc", $.markup)),
        )),
        unclosed_link: ($) => choice(
            $.unclosed_target,
            seq($.target, $.unclosed_markup),
        ),
        anchor: ($) => prec.right(seq(
            field("desc", $.markup),
            optional(field("target", $.target))
        )),
        unclosed_anchor: ($) => choice(
            $.unclosed_markup,
            seq($.markup, $.unclosed_target),
        ),

        identifier: (_) => token(prec(1, repeat1(choice(
            /[^;\(\)\n\r\p{Z}]/u,
            token(seq("\\", choice(/./, newline))),
        )))),
        attributes: ($) => seq(
            $._unclosed_attributes,
            ")",
        ),
        unclosed_attributes: ($) => $._unclosed_attributes,
        _unclosed_attributes: ($) => prec.right(1, seq(
            "(",
            repeat(choice(
                token(prec(2, ";")),
                whitespace_or_newline,
            )),
            optional(seq(
                $.kv_pair,
                repeat(seq(
                    token(prec(2, ";")),
                    optional(whitespace_or_newline),
                    optional($.kv_pair),
                )),
            )),
        )),
        kv_pair: ($) => prec.right(2, seq(
            field("key", $.identifier),
            optional(seq(
                token(prec(1, whitespace_or_newline)),
                optional(field("value", alias($._verbatim_inline, $.value))),
            )),
        )),

        // prefixs:
        // * heading
        // = table
        // - unordered list item
        // ~ ordered list item
        // > quote item
        // / indented block
        // @ranged
        // .infirm
        // #carryover

        inline_macro: ($) => prec.right(seq(
            "\\",
            alias(/[\p{L}\p{N}][\p{L}\p{N}\-]*/u, $.identifier),
            optional($.markup),
            optional($.attributes),
        )),
        unclosed_inline_macro: ($) => seq(
            "\\",
            alias(/[\p{L}\p{N}][\p{L}\p{N}\-]*/u, $.identifier),
            choice(
                $.unclosed_markup,
                seq($.markup, $.unclosed_attributes),
            ),
        ),

        verbatim_line: (_) => seq(/[^\n\r]*/u, newline_or_eof),
        ranged_tag: ($) => seq(
            $.ranged_open, field("name", $.word), newline,
            repeat(seq(optional($._preceding_verbatim_whitespace), $.verbatim_line)),
            optional($._preceding_verbatim_whitespace),
            $.ranged_close,
        ),
        infirm_tag: ($) => seq(
            $._infirm_tag_prefix,
            field("name", $.identifier),
            optional(seq(whitespace, $._verbatim_inline)),
            token(prec(1, newline_or_eof)),
        ),
        carryover_tag: ($) => seq(
            $._carryover_tag_prefix,
            choice(
                seq(
                    field("name", $.identifier),
                    optional(seq(whitespace, $._verbatim_inline)),
                ),
                $.attributes,
            ),
            token(prec(1, newline_or_eof)),
        ),
    },
});
