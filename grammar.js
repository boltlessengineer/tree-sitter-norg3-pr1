/// <reference types="tree-sitter-cli/dsl" />
// @ts-check
const newline = choice("\n", "\r", "\r\n");
const newline_or_eof = choice("\n", "\r", "\r\n", "\0");
const whitespace = /\p{Zs}+/u;
const whitespace_or_newline = token(prec.right(choice(
    whitespace,
    newline,
    seq(whitespace, newline),
)))
const word = /[\p{L}\p{N}]+/;

const ATTACHED_MODIFIERS = [
    "bold",
    "italic",
    "underline",
    "strikethrough",
    "spoiler",
    "superscript",
    "subscript",
    "inline_comment",
];
const VERBATIM_ATTACHED_MODIFIERS = [
    "verbatim",
    "math",
    "inline_macro",
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

        $.paragraph_break,

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

    conflicts: ($) => [
        ...ATTACHED_MODIFIERS.map((kind) => [
            // [$[kind], $[kind + "_conflict"]],
            // FIXME:you can't make this conflict case, as this leads 2^8 dynamic conflict cases
            [$["_"+kind+"_inner"], $[kind + "_conflict"]],
            // [$[kind], $.open_conflict],
            // [$[kind]],
        ]).flat(),
        // [$._link_description, $.verbatim],
        // [$._link_description, $.math],
        // [$._link_description, $.inline_macro],
        // [$._link_target, $.verbatim],
        // [$._link_target, $.math],
        // [$._link_target, $.inline_macro],

        // [$.tag, $.unordered_list_item],
        // [$.tag, $.ordered_list_item],
        // [$.tag, $.quote_list_item],
    ],

    precedences: () => [],

    inline: ($) => [
        $.document_content,
    ],

    supertypes: ($) => [
        $.non_structural,
    ],

    rules: {
        document: ($) => repeat($.document_content),
        document_content: ($) =>
            choice(
                $.non_structural,
                newline,
            ),
        paragraph: ($) => seq(
            $._inner,
            optional($.paragraph_break)
        ),
        _inner: ($) =>
            prec.right(
                seq(
                    choice(
                        seq($.whitespace, optional($.not_close)),
                        seq($.word, optional($.not_open)),
                        $.punctuation,
                        $.escape_sequence,
                        seq($.soft_break, optional($.not_close)),

                        ...ATTACHED_MODIFIERS.map((k) => [
                            $[k],
                            $[k+"_conflict"],
                        ]).flat(),
                        ...VERBATIM_ATTACHED_MODIFIERS.map((k) => [
                            $[k],
                        ]).flat(),
                    ),
                    optional($._inner)
                )
            ),

        punctuation: ($) => choice(
            token(choice(
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
            // ...ATTACHED_MODIFIERS.map((kind) =>
            //     prec.right(
            //         0,
            //         seq(
            //             prec(1, $[kind+"_open"]),
            //             prec.right(
            //                 2,
            //                 repeat1(
            //                     prec(2, $[kind+"_open"])
            //                 )
            //             )
            //         )
            //     )
            // ),
            // prec(3, seq($.bold_open, $.bold_open)),
        ),

        word: (_) => token(word),
        whitespace: (_) => token(prec(1, whitespace)),
        soft_break: (_) => token(prec(1, newline)),

        escape_sequence: (_) => token(seq("\\", choice(/./, newline))),

        ...ATTACHED_MODIFIERS.reduce((rules, kind) => {
            rules[kind]= gen_new_att_mod(kind);
            return rules;
        }, {}),
        ...ATTACHED_MODIFIERS.reduce((rules, kind) => {
            const other_kind = ATTACHED_MODIFIERS.filter((k) => k != kind);
            rules["_"+kind+"_inner"]=($)=>
                choice(
                    seq(
                        choice(
                            seq($.whitespace, optional($.not_close)),
                            seq($.word, optional($.not_open)),
                            $.punctuation,
                            $.escape_sequence,
                            seq($.soft_break, optional($.not_close)),

                            ...other_kind.map((k) => [
                                $[k],
                                $[k + "_conflict"],
                            ]).flat(),
                            ...VERBATIM_ATTACHED_MODIFIERS.map((k) => [
                                $[k],
                            ]).flat(),
                        ),
                        optional($["_"+kind+"_inner"]),
                    ),
                    // ...other_kind.map((k) => [
                    //     $[k + "_open"],
                    // ]).flat(),
                )
            return rules;
        }, {}),
        ...ATTACHED_MODIFIERS.reduce((rules, kind) => {
            rules[kind+"_conflict"]= gen_new_att_mod_conflict(kind);
            return rules;
        }, {}),
        ...VERBATIM_ATTACHED_MODIFIERS.reduce((rules, k) => {
            rules[k] = gen_new_ver_att_mod(k);
            // rules[k+"_conflict"] = gen_new_ver_att_mod_conflict(k);
            return rules;
        }, {}),

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
        non_structural: ($) =>
            choice(
                $.paragraph,
            ),
    },
});

/**
 * @param {string} kind
 */
function gen_new_att_mod(kind) {
    return (/** @type GrammarSymbols<any> */ $) =>
        prec.dynamic(1,
        choice(
            seq(
                $[kind + "_open"],
                // $._inner,
                $["_"+kind+"_inner"],
                $[kind + "_close"],
                optional($.extensions),
            ),
            // seq(
            //     $["free_" + kind + "_open"],
            //     repeat(
            //         // gen_new_att_mod_inner(kind)($),
            //         $._general,
            //     ),
            //     $["free_" + kind + "_close"],
            //     optional($.extensions),
            // )
        )
        )
}
/**
 * @param {string} kind
 */
function gen_new_att_mod_conflict(kind) {
    const other_kind = ATTACHED_MODIFIERS.filter((k) => k != kind);
    return (/** @type GrammarSymbols<any> */ $) =>
        seq(
            $[kind + "_open"],
            choice(
                prec.right(repeat1(
                    choice(
                        seq($.whitespace, optional($.not_close)),
                        seq($.word, optional($.not_open)),
                        $.punctuation,
                        $.escape_sequence,
                        seq($.soft_break, optional($.not_close)),
                        $[kind + "_open"],
                    )
                )),
            ),
        )
}
/**
 * @param {string} kind
 */
function gen_new_ver_att_mod(kind) {
    return (/** @type GrammarSymbols<any> */ $) =>
        choice(
            seq(
                $[kind + "_open"],
                repeat1(
                    choice(
                        seq($.whitespace, optional($.not_close)),
                        prec.right(seq($.word, optional($.not_open))),
                        $.punctuation,
                        $.escape_sequence,
                        seq($.soft_break, optional($.not_close)),

                        ...ATTACHED_MODIFIERS.map((k) => [
                            $[k + "_close"],
                        ]).flat(),
                        // $[kind + "_open"],
                    )
                ),
                $[kind + "_close"],
                optional($.extensions),
            ),
            // seq(
            //     $["free_" + kind + "_open"],
            //     repeat(
            //         choice(
            //             seq($.whitespace, optional($.not_close)),
            //             prec.right(seq($.word, optional($.not_open))),
            //             $.punctuation,
            //             seq($.soft_break, optional($.not_close)),
            //
            //             ...ATTACHED_MODIFIERS.map((k) => [
            //                 $[k + "_close"],
            //             ]).flat(),
            //             // $[kind + "_open"],
            //         )
            //     ),
            //     $["free_" + kind + "_close"],
                // optional($.extensions),
            // )
        )
}
