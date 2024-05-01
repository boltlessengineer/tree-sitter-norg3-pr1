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
const word = /[\p{L}\p{N}]+/;

const ATTACHED_MODIFIERS = [
    "bold",
    "italic",
    "underline",
    "strikethrough",
    "inline_comment",
    "spoiler",
    "superscript",
    "subscript",
];
const VERBATIM_ATTACHED_MODIFIERS = [
    "verbatim",
    "math",
    "inline_macro",
    // "superscript",
    // "subscript",
];

/// General TODOS:
//  - Abstract repeating patterns (e.g. nestable detached modifiers) into Javascript functions.
//  - Make every node have an alias($.node, $.node_prefix). Only some currently do.

/**
 * @param {RuleOrLiteral} rule
 */
function repeat2(rule) {
    return seq(rule, rule, repeat(rule));
}

module.exports = grammar({
    name: "norg",

    // Tell treesitter we want to handle whitespace ourselves
    extras: ($) => [
        $._preceding_whitespace,
    ],
    externals: ($) => [
        $._preceding_whitespace,

        $.blank_line,
        $.__inside_verbatim,

        $.desc_open,
        $.desc_close,
        $.target_open,
        $.target_close,

        $.not_open,
        $.not_close,

        $.free_form_open,
        $.free_form_close,

        $.bold_open,
        $.bold_close,
        $.free_bold_open,
        $.free_bold_close,

        $.italic_open,
        $.italic_close,
        $.free_italic_open,
        $.free_italic_close,

        $.underline_open,
        $.underline_close,
        $.free_underline_open,
        $.free_underline_close,

        $.strikethrough_open,
        $.strikethrough_close,
        $.free_strikethrough_open,
        $.free_strikethrough_close,

        $.spoiler_open,
        $.spoiler_close,
        $.free_spoiler_open,
        $.free_spoiler_close,

        $.superscript_open,
        $.superscript_close,
        $.free_superscript_open,
        $.free_superscript_close,

        $.subscript_open,
        $.subscript_close,
        $.free_subscript_open,
        $.free_subscript_close,

        $.inline_comment_open,
        $.inline_comment_close,
        $.free_inline_comment_open,
        $.free_inline_comment_close,

        $.verbatim_open,
        $.verbatim_close,
        $.free_verbatim_open,
        $.free_verbatim_close,

        $.math_open,
        $.math_close,
        $.free_math_open,
        $.free_math_close,

        $.inline_macro_open,
        $.inline_macro_close,
        $.free_inline_macro_open,
        $.free_inline_macro_close,

        $.heading_prefix,
        $.unordered_list_prefix,
        $.ordered_list_prefix,
        $.quote_list_prefix,
        $.null_list_prefix,

        $.weak_delimiting_modifier,
        $._dedent_heading,
        $._dedent_list,
        $.__indent_seg_end,
        $.std_ranged_tag_prefix,
        $.std_ranged_tag_end,
        $._auto_semi,

        $._error_sentinel,
    ],

    conflicts: () => [],

    precedences: () => [
        // TODO:
        // $.whitespace < $.link_scope_prefix < $.verbatim_whitespace
        //                                    < $.verbatim_punctuation
    ],

    inline: ($) => [
        $.__general,
        $.document_content,
        ...ATTACHED_MODIFIERS.map((k) => [
            $["_"+k+"_inner"],
        ]).flat(),
    ],

    supertypes: ($) => [
        $.non_structural,
        $.tag,
        $.linkable,
    ],

    rules: {
        document: ($) => repeat($.document_content),
        document_content: ($) =>
            choice(
                $.heading,
                $.non_structural,
                $.strong_delimiting_modifier,
            ),
        paragraph: ($) => seq(
            $._paragraph_inner,
        ),
        __general: ($) =>
            choice(
                seq($.soft_break, optional($.not_close)),
                seq($.whitespace, optional($.not_close)),
                seq($.word, optional($.not_open)),
                $.punctuation,
                $.escape_sequence,
                $.linkable,
            ),
        // TODO: force to end with soft_break or \0
        _paragraph_inner: ($) =>
            choice(
                prec.right(seq(
                    choice(
                        $.__general,

                        ...ATTACHED_MODIFIERS.map((k) => [
                            $[k],
                        ]).flat(),
                        ...VERBATIM_ATTACHED_MODIFIERS.map((k) => [
                            $[k],
                        ]).flat(),
                    ),
                    optional($._paragraph_inner),
                )),
                ...ATTACHED_MODIFIERS.map((k) => [
                    alias($["_"+k+"_unclosed_verbatim"], $.unclosed),
                ]).flat(),
                ...VERBATIM_ATTACHED_MODIFIERS.map((k) => [
                    alias($["_"+k+"_unclosed"], $.unclosed),
                ]).flat(),
            ),

        punctuation: ($) => token(choice(
            // TODO: replace these repeated tokens to
            // external token "_failed_punctuation" immediately followed by
            // optional "not_open" and "not_close"
            // "_failed_punctuation" will be returned for "*" with lookahead "*"
            // last "*" will be parsed from regex token below
            // ":" in ":*" will be also "_failed_punctuation" too
            // we should separate "_failed_open" and "_failed_close"
            repeat1('*'),
            repeat1('/'),
            repeat1('_'),
            repeat1('-'),
            repeat1('!'),
            repeat1('`'),
            repeat1('&'),
            repeat1('$'),
            // '#',
            // '+',
            // '.',
            // '|',
            // '@',
            // '=',
            /[^\n\r\p{Z}\p{L}\p{N}]/u,
        )),

        word: (_) => token(word),
        whitespace: (_) => token(prec(1, whitespace)),
        soft_break: (_) => newline,

        escape_sequence: (_) => token(seq("\\", choice(/./, newline))),

        linkable: ($) => choice($.anchor, $.link),
        anchor: ($) =>
            prec.right(seq(
                $.link_description,
                optional($.link_target),
                optional($.extensions),
            )),
        link: ($) =>
            prec.right(seq(
                $.link_target,
                optional($.link_description),
                optional($.extensions),
            )),
        link_description: ($) =>
            seq(
                "[",
                optional(field("description", $._paragraph_inner)),
                "]",
            ),
        link_target: ($) =>
            seq(
                "{",
                choice(
                    seq(
                        optional($.link_scope_prefix),
                        $._link_scope_list,
                    )
                ),
                "}",
            ),
        link_scope_prefix: (_) =>
            token(prec(2, seq(
                optional(whitespace_or_newline),
                ":",
                optional(whitespace_or_newline),
            ))),
        // HACK: implement proper filepath parsing
        path: (_) => word,
        _link_scope_list: ($) =>
            prec.right(seq(
                choice(
                    $.link_scope_heading,
                    $.link_scope_file,
                ),
                repeat(
                    seq(
                        $.link_scope_prefix,
                        optional($._link_scope_list),
                    ),
                ),
            )),
        link_scope_file: ($) =>
            seq(
                $.path,
            ),
        link_scope_heading: ($) =>
            seq(
                token(seq(repeat1("*"), whitespace_or_newline)),
                $._paragraph_inner,
            ),
        ...ATTACHED_MODIFIERS.reduce((rules, kind) => {
            const other_kind = ATTACHED_MODIFIERS.filter((k) => k != kind);
            rules["_"+kind+"_inner"] = ($) =>
                (choice(
                    $.__general,
                    // NOTE: change this to other_kind
                    ...ATTACHED_MODIFIERS.map((k) => [
                        $[k],
                        // NOTE: enabling this will make parser size much smaller
                        // $[k+"_close"],
                    ]).flat(),
                    ...VERBATIM_ATTACHED_MODIFIERS.map((k) => [
                        $[k],
                    ]).flat(),
                ))
            rules["_"+kind+"_unclosed"] = ($) =>
                prec.right(seq(
                    $[kind+"_open"],
                    repeat($["_"+kind+"_inner"]),
                    optional(
                        choice(
                            ...ATTACHED_MODIFIERS.map((k) => [
                                alias($["_"+k+"_unclosed"], $.unclosed),
                            ]).flat(),
                        )
                    )
                ))
            rules["_"+kind+"_unclosed_verbatim"] = ($) =>
                prec.right(seq(
                    $[kind+"_open"],
                    repeat($["_"+kind+"_inner"]),
                    optional(
                        choice(
                            ...ATTACHED_MODIFIERS.map((k) => [
                                alias($["_"+k+"_unclosed_verbatim"], $.unclosed),
                            ]).flat(),
                            ...VERBATIM_ATTACHED_MODIFIERS.map((k) => [
                                alias($["_"+k+"_unclosed"], $.unclosed),
                            ]).flat(),
                        )
                    )
                ))
            rules[kind] = ($) =>
                choice(
                    seq(
                        // NOTE: choice between these two changes parser
                        // behavior and size dramatically
                        // $["_"+kind+"_unclosed"],
                        seq(
                            $[kind+"_open"],
                            repeat1($["_"+kind+"_inner"]),
                        ),

                        $[kind+"_close"],
                        optional($.extensions)
                    ),
                )
            return rules;
        }, {}),
        ...VERBATIM_ATTACHED_MODIFIERS.reduce((rules, kind) => {
            rules[kind] = ($) =>
                choice(
                    (seq(
                        $["_"+kind+"_unclosed"],
                        (seq(
                            $[kind+"_close"],
                            optional($.extensions)
                        )),
                    )),
                    seq(
                        $["free_"+kind+"_open"],
                        repeat(
                            choice(
                                $.soft_break,
                                $.whitespace,
                                $.word,
                                $.punctuation,
                            )
                        ),
                        $["free_"+kind+"_close"],
                        optional($.extensions)
                    )
                )
            rules["_"+kind+"_unclosed"] = ($) =>
                seq(
                    $[kind+"_open"],
                    prec.right(repeat1(
                        choice(
                            seq($.soft_break, optional($.not_close)),
                            seq(
                                alias(token(prec(3, whitespace)), $.whitespace),
                                optional($.not_close)
                            ),
                            $.word,
                            $.punctuation,
                            $.escape_sequence,
                            // consume linkable close modifiers
                            alias(choice(
                                token(prec(3, ":")),
                                token(prec(1, "[")),
                                token(prec(1, "]")),
                                token(prec(1, "{")),
                                token(prec(1, "}")),
                            ), $.punctuation),
                            // prevent any open modifier from external scanner
                            // can't use `not_open` as it won't work for open
                            // modifier with link modifier
                            $.__inside_verbatim,
                        )
                    )),
                )
            return rules;
        }, {}),
        identifier: (_) => token(prec(1, /[0-9A-Za-z][0-9A-Za-z\-_\.\+=]*/)),
        _verbatim_text: ($) => repeat1(choice(/[^\s\\]+/, $.escape_sequence)),
        argument: ($) => $._verbatim_text,

        strong_delimiting_modifier: (_) => token(seq(repeat2("="), newline_or_eof)),
        horizontal_rule: (_) => token(seq(repeat2("_"), newline_or_eof)),
        extensions: ($) =>
            seq(
                token(prec(1, "(")),
                repeat(
                    choice(
                        $.ext_attribute,
                        ";",
                        token(seq(optional(whitespace), newline)),
                    ),
                ),
                ")",
            ),
        // TODO: add support for escape sequence in identifier/parameter
        ext_identifier: (_) => token(/[^\s\n\r;\(\)]+/),
        ext_param: (_) => token(/[^\s\n\r;\(\)][^\n\r;\(\)]*/),
        ext_attribute: ($) =>
            choice(
                seq(
                    optional(whitespace),
                    field("key", $.ext_identifier),
                    optional(whitespace),
                    optional(
                        field("value", $.ext_param)
                    ),
                    choice(
                        ";",
                        $._auto_semi,
                    ),
                ),
                seq(
                    // alias(whitespace, $.undone),
                    whitespace,
                    choice(
                        ";",
                        $._auto_semi,
                    ),
                )
            ),
        heading: ($) =>
            prec.right(
                seq(
                    $.heading_prefix,
                    whitespace,
                    optional(
                        seq(
                            $.extensions,
                            whitespace,
                        )
                    ),
                    field("title", $.paragraph),
                    repeat(choice($.heading, $.non_structural)),
                    optional(choice($._dedent_heading, $.weak_delimiting_modifier))
                ),
            ),
        non_structural: ($) =>
            choice(
                $.paragraph,
                $.blank_line,
                $.tag,
                $.horizontal_rule,
            ),
        tag: ($) =>
            choice(
                $.strong_carryover_tag,
                // TODO: add missing parts
            ),
        strong_carryover_tag: ($) =>
            seq(
                token(prec(1, "#")),
                field("name", $.identifier),
                repeat(seq(whitespace, field("argument", $.argument))),
                // TODO: add missing parts
                newline_or_eof,
            ),
    },
});
