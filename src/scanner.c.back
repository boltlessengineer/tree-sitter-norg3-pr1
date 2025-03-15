#include <stdio.h>
#include <string.h>
#include <wctype.h>

#include "tree_sitter/parser.h"

// #define DEBUG

#ifdef DEBUG
	#define unreachable() fprintf(stderr, "unreachable src/scanner.c:%d\n", __LINE__)
	#define assert(a, ...) \
		if (!(a)) {\
			fprintf(stderr, __VA_ARGS__);\
			exit(EXIT_FAILURE);\
		}
    #define LOG(...) \
            printf("log[%d]: ", __LINE__);\
            printf(__VA_ARGS__);
#else
	#define unreachable() while (false);
	#define assert(a, ...) while (false);
    #define LOG(...) while (false);
#endif

#define lex_next self->lexer->lookahead

#define lex_eof self->lexer->eof(self->lexer)

#define lex_column self->lexer->get_column(self->lexer)

#define lex_mark_end() \
    self->lexer->mark_end(self->lexer)

#define lex_set_result(result) \
    self->lexer->result_symbol = result

#define lex_advance() \
	self->lexer->advance(self->lexer, false)

#define lex_skip() \
	self->lexer->advance(self->lexer, true)

#define lex_advance_newline() \
    if (lex_next == '\r') { \
        lex_advance(); \
        if (lex_next == '\n' && !lex_eof) lex_advance(); \
    } else { \
        lex_advance(); \
    }

// vec<u32> ////////////////////////////////////////////////////////////////////
typedef struct vec_u32 vec_u32;
struct vec_u32 {
	size_t cap;
	size_t len;
	uint32_t* vec;
};
static struct vec_u32 vec_u32_new() {
	return (struct vec_u32) {.cap = 0, .len = 0, .vec = NULL};
}
static void vec_u32_drop(struct vec_u32 self) {
	if (self.vec != NULL) {
		free(self.vec);
	}
}
static void vec_u32_clear(struct vec_u32* self) {
    if (self->vec != NULL) {
        free(self->vec);
    }
    self->cap = 0;
    self->len = 0;
    self->vec = NULL;
}
static void vec_u32_push(struct vec_u32* self, uint32_t value) {
	assert(self != NULL, "vec_u32_push");
	if (self->len + 1 > self->cap) {
		self->cap = self->len + 8;
		self->vec = realloc(self->vec, sizeof(uint32_t) * self->cap);
        assert(self->vec != NULL, "vec_u32_push: malloc failed\n");
	}
	self->vec[self->len++] = value;
}
static uint32_t vec_u32_pop(struct vec_u32* self) {
	assert(self != NULL, "vec_u32_pop");
    assert(!(self->len < 1), "vec_u32_pop: empty vec\n");
	return self->vec[--self->len];
}
static uint32_t vec_u32_back(struct vec_u32* self) {
	assert(self != NULL, "vec_u32_back");
    assert(!(self->len < 1), "vec_u32_back: empty vec\n");
	return self->vec[self->len - 1];
}
static uint32_t vec_u32_back_or(struct vec_u32* self, uint32_t fallback) {
	assert(self != NULL, "vec_u32_back_or");
	if (self->len < 1) {
        return fallback;
	}
	return self->vec[self->len - 1];
}
static bool vec_u32_empty(struct vec_u32* self) {
    return (self->len == 0);
}
static void vec_u32_pop_until(struct vec_u32* self, uint32_t value) {
    while (true) {
        if (vec_u32_empty(self)) return;
        if (vec_u32_pop(self) == value) return;
    }
}
static bool vec_u32_has(struct vec_u32* self, const uint32_t kind) {
	assert(self != NULL, "vec_u32_has");
    for (size_t i = 0; i < self->len; i++) {
        if (self->vec[i] == kind) {
            return true;
        }
    }
    return false;
}
static size_t vec_u32_serialize(struct vec_u32* self, char* buffer) {
	assert(self != NULL, "vec_u32_serialize");
	size_t written = 0;
	memcpy(buffer, &self->len, sizeof self->len);
	written += sizeof self->len;
	if (self->len > 0) {
		memcpy(buffer + written, self->vec, self->len * sizeof(uint32_t));
		written += self->len * sizeof(uint32_t);
	}
	return written;
}
static size_t vec_u32_deserialize(struct vec_u32* self, const char* buffer) {
	assert(self != NULL, "vec_u32_deserialize");
	size_t read = 0;
	memcpy(&self->len, buffer, sizeof self->len);
	read += sizeof self->len;
	if (self->len > self->cap) {
		self->cap = self->len;
		self->vec = realloc(self->vec, sizeof(uint32_t) * self->cap);
        assert(self->vec != NULL, "vec_u32_deserialize: malloc failed\n");
	}
	if (self->len > 0) {
		memcpy(self->vec, buffer + read, self->len * sizeof *self->vec);
		read += self->len * sizeof *self->vec;
	}
	return read;
}
//////////////////////////////////////////////////////////////////// vec<u32> //

typedef enum token_type token_type;

enum token_type {
    WHITESPACE,

    BLANK_LINE,
    FLAG_INSIDE_VERBATIM,

    DESC_OPEN,
    DESC_CLOSE,
    TARGET_OPEN,
    TARGET_CLOSE,

    NOT_OPEN,
    NOT_CLOSE,

    FREE_FORM_OPEN,
    FREE_FORM_CLOSE,

    BOLD_OPEN,
    BOLD_CLOSE,
    FREE_BOLD_OPEN,
    FREE_BOLD_CLOSE,

    ITALIC_OPEN,
    ITALIC_CLOSE,
    FREE_ITALIC_OPEN,
    FREE_ITALIC_CLOSE,

    UNDERLINE_OPEN,
    UNDERLINE_CLOSE,
    FREE_UNDERLINE_OPEN,
    FREE_UNDERLINE_CLOSE,

    STRIKETHROUGH_OPEN,
    STRIKETHROUGH_CLOSE,
    FREE_STRIKETHROUGH_OPEN,
    FREE_STRIKETHROUGH_CLOSE,

    SPOILER_OPEN,
    SPOILER_CLOSE,
    FREE_SPOILER_OPEN,
    FREE_SPOILER_CLOSE,

    SUPERSCRIPT_OPEN,
    SUPERSCRIPT_CLOSE,
    FREE_SUPERSCRIPT_OPEN,
    FREE_SUPERSCRIPT_CLOSE,

    SUBSCRIPT_OPEN,
    SUBSCRIPT_CLOSE,
    FREE_SUBSCRIPT_OPEN,
    FREE_SUBSCRIPT_CLOSE,

    INLINE_COMMENT_OPEN,
    INLINE_COMMENT_CLOSE,
    FREE_INLINE_COMMENT_OPEN,
    FREE_INLINE_COMMENT_CLOSE,

    VERBATIM_OPEN,
    VERBATIM_CLOSE,
    FREE_VERBATIM_OPEN,
    FREE_VERBATIM_CLOSE,

    INLINE_MATH_OPEN,
    INLINE_MATH_CLOSE,
    FREE_INLINE_MATH_OPEN,
    FREE_INLINE_MATH_CLOSE,

    INLINE_MACRO_OPEN,
    INLINE_MACRO_CLOSE,
    FREE_INLINE_MACRO_OPEN,
    FREE_INLINE_MACRO_CLOSE,

    HEADING,
    UNORDERED_LIST,
    ORDERED_LIST,
    QUOTE_LIST,
    NULL_LIST,

    WEAK_DELIMITING_MODIFIER,
    DEDENT,
    DEDENT_LIST,
    FLAG_INDENT_SEGMENT_END,
    STD_RANGED_PREFIX,
    STD_RANGED_END,
    AUTO_SEMI,

    ERROR_MODE,
};

typedef enum {
    ACCEPT,
    FAIL,
    SCAN_SKIP, // "SKIP" conflicts with <parser.h>
} Action;

#define TRY_SCAN(action) \
    switch (action) {\
        case SCAN_SKIP:\
            break;\
        case ACCEPT:\
            return true;\
        case FAIL:\
            return false;\
    }

token_type char_to_attached_mod(int32_t c) {
    switch (c) {
        case '*':
            return BOLD_OPEN;
        case '/':
            return ITALIC_OPEN;
        case '_':
            return UNDERLINE_OPEN;
        case '-':
            return STRIKETHROUGH_OPEN;
        case '!':
            return SPOILER_OPEN;
        case '^':
            return SUPERSCRIPT_OPEN;
        case ',':
            return SUBSCRIPT_OPEN;
        case '%':
            return INLINE_COMMENT_OPEN;
        case '`':
            return VERBATIM_OPEN;
        case '$':
            return INLINE_MATH_OPEN;
        case '&':
            return INLINE_MACRO_OPEN;
    }
    return WHITESPACE;
}

token_type char_to_detached_mod(int32_t c) {
    switch (c) {
        case '*':
            return HEADING;
        case '-':
            return UNORDERED_LIST;
        case '~':
            return ORDERED_LIST;
        case '>':
            return QUOTE_LIST;
        case '%':
            return NULL_LIST;
    }
    return WHITESPACE;
}

/**
 * Returns `true` if the character provided is neither whitespace nor punctuation
 */
bool is_word(int32_t character) {
    // return character && !iswspace(character) && !iswpunct(character);
    // HACK: `iswpunct()` can't be used in wasm
    // TODO(boltless): rewrite this temporary solution.
    return character && (('a' <= character && character <= 'z') || ('A' <= character && character <= 'Z'));
}
/**
 * Returns `true` if the character provided is either \n or \r
 */
bool is_newline(int32_t character) {
    return character == '\n' || character == '\r';
}
/**
 * Returns `true` if the character provided is a separator character (but not a newline).
 */
bool is_whitespace(int32_t character) {
    return character && iswspace(character) && !is_newline(character);
}

bool match_str(TSLexer* lexer, const char* str) {
    size_t i = 0;
    while (str[i] != '\0') {
        if (lexer->eof(lexer))
            return false;
        if (str[i] != lexer->lookahead)
            return false;
        i++;
        lexer->advance(lexer, false);
    }
    return true;
}

typedef struct Scanner Scanner;

struct Scanner {
    TSLexer* lexer;
    vec_u32 att_stack;
    vec_u32 indent_heading;
    vec_u32 indent_list;
};

static bool scan_linkable_close(Scanner *self, const bool *valid_symbols, const token_type kind) {
    if (valid_symbols[kind]) {
        lex_advance();
        lex_mark_end();
        lex_set_result(kind);
        vec_u32_pop(&self->att_stack);
        return true;
    }
    return false;
}

Action scan_linkables(Scanner *self, const bool *valid_symbols) {
    if (lex_next == '[' && valid_symbols[DESC_OPEN]) {
        lex_advance();
        lex_mark_end();
        lex_set_result(DESC_OPEN);
        vec_u32_push(&self->att_stack, DESC_OPEN);
        return ACCEPT;
    }
    if (lex_next == '{' && valid_symbols[TARGET_OPEN]) {
        lex_advance();
        lex_mark_end();
        lex_set_result(TARGET_OPEN);
        vec_u32_push(&self->att_stack, TARGET_OPEN);
        LOG("target\n");
        return ACCEPT;
    }
    if (!vec_u32_empty(&self->att_stack)) {
        if (lex_next == ']')
            return scan_linkable_close(self, valid_symbols, DESC_CLOSE) ? ACCEPT : FAIL;
        if (lex_next == '}')
            return scan_linkable_close(self, valid_symbols, TARGET_CLOSE) ? ACCEPT : FAIL;
    }
    return SCAN_SKIP;
}

Action scan_detached_modifier(Scanner *self, const bool *valid_symbols, const int32_t character) {
    LOG("scan_detached_modifier\n");
    const token_type kind = char_to_detached_mod(character);
    const bool is_weak_deli_valid = character == '-' && valid_symbols[WEAK_DELIMITING_MODIFIER];
    if (kind == 0
        || !(valid_symbols[kind] || is_weak_deli_valid)
        || !(lex_next == character || is_whitespace(lex_next))
    ) return SCAN_SKIP;

    vec_u32 *indent_vec = kind == HEADING ? &self->indent_heading : &self->indent_list;
    size_t count = 1;
    while (lex_next == character) {
        count++;
        lex_advance();
    }

    // Every detached modifier must be immediately followed by whitespace. If it is not, return false.
    if (!is_whitespace(lex_next)) {
        // There is an edge case that can be parsed here however - the weak delimiting modifier may
        // consist of two or more `-` characters, and must be immediately succeeded with a newline.
        // If those criteria are met, return the `WEAK_DELIMITING_MODIFIER` instead.
        if (character == '-' && count >= 2 && is_newline(lex_next) && valid_symbols[WEAK_DELIMITING_MODIFIER]) {
            // Advance past the newline as well.
            lex_advance_newline();

            if (!valid_symbols[ERROR_MODE] && !valid_symbols[FLAG_INDENT_SEGMENT_END]) {
                LOG("FAIL\n");
                vec_u32_pop(&self->indent_heading);
            }
            // When `mark_end()` is called again we essentially move the previous checkpoint to the new "head".
            lex_mark_end();
            lex_set_result(WEAK_DELIMITING_MODIFIER);
            return ACCEPT;
        }
        return FAIL;
    }

    if (!valid_symbols[ERROR_MODE] && valid_symbols[DEDENT_LIST] && (kind == HEADING || count <= vec_u32_back_or(&self->indent_list, 0))) {
        LOG("try pop\n");
        vec_u32_pop(&self->indent_list);
        lex_set_result(DEDENT_LIST);
        return ACCEPT;
    }
    if (!valid_symbols[ERROR_MODE] && valid_symbols[DEDENT] && kind == HEADING && count <= vec_u32_back_or(&self->indent_heading, 0)) {
        vec_u32_pop(&self->indent_heading);
        lex_set_result(DEDENT);
        return ACCEPT;
    }

    vec_u32_push(indent_vec, count);
    lex_mark_end();
    lex_set_result(kind);

    return ACCEPT;
}

Action scan_prefix(Scanner *self, const bool *valid_symbols, const int32_t character) {
    // prefix is token with repeated punctuation or single punctuation followed by whitespace
    LOG("scan_prefix\n");
    if (character != '|' && character != lex_next && !iswspace(lex_next))
        return SCAN_SKIP;

    if (character == '*' && valid_symbols[HEADING]) {
        size_t count = 1;
        while (lex_next == character) {
            lex_advance();
            count++;
        }
        if (!is_whitespace(lex_next))
            return FAIL;
        if (!valid_symbols[ERROR_MODE] && valid_symbols[DEDENT] && count <= vec_u32_back_or(&self->indent_heading, 0)) {
            vec_u32_pop(&self->indent_heading);
            lex_set_result(DEDENT);
            return ACCEPT;
        }
        vec_u32_push(&self->indent_heading, count);
        lex_mark_end();
        lex_set_result(HEADING);
        return ACCEPT;
    }

    if (character == '|' && valid_symbols[STD_RANGED_PREFIX]) {
        LOG("standard ranged prefix\n");
        lex_mark_end();
        if (match_str(self->lexer, "end")) {
            if (iswspace(lex_next)) {
                lex_mark_end();
                // pop until level-0
                vec_u32_pop_until(&self->indent_heading, 0);
                vec_u32_pop_until(&self->indent_list, 0);
                lex_set_result(STD_RANGED_END);
                return ACCEPT;
            }
        }
        // append level-0
        vec_u32_push(&self->indent_heading, 0);
        vec_u32_push(&self->indent_list, 0);
        lex_set_result(STD_RANGED_PREFIX);
        return ACCEPT;
    }
    return SCAN_SKIP;
}

Action scan_att_open(Scanner *self, const bool *valid_symbols, const int32_t character, const bool link_mod) {
    if (valid_symbols[FLAG_INSIDE_VERBATIM])
        return SCAN_SKIP;
    if (link_mod ^ valid_symbols[NOT_OPEN])
        return SCAN_SKIP;

    const token_type kind_token = char_to_attached_mod(character);
    if (kind_token && valid_symbols[kind_token] && !iswspace(lex_next) && !lex_eof) {
        if (character == lex_next)
            return FAIL;
        lex_mark_end();
        if (lex_next == '|') {
            lex_advance();
            lex_mark_end();
            const token_type next_token = char_to_attached_mod(lex_next);
            if (next_token && valid_symbols[next_token + 3]) { // FREE_*_CLOSE
                lex_advance();
                if (!is_word(lex_next)) {
                    return FAIL;
                }
            }
            lex_set_result(kind_token + 2); // FREE_*_OPEN
            return ACCEPT;
        }
        lex_set_result(kind_token);
        return ACCEPT;
    }
    return SCAN_SKIP;
}
bool scan_att_close(Scanner *self, const bool *valid_symbols, const int32_t character, const bool free_form) {
    if (!free_form && valid_symbols[NOT_CLOSE])
        return false;
    const token_type kind_token = char_to_attached_mod(character);
    const token_type close_token = kind_token + 1 + free_form * 2;
    // if (kind_token && valid_symbols[close_token - 1]) {
    //     return false;
    // }
    if (kind_token && !is_word(lex_next)) {
        LOG("%c: %d\n", lex_next, lex_column);
        LOG("%d\n", valid_symbols[close_token]);
    }
    if (kind_token && valid_symbols[close_token] && !is_word(lex_next)) {
        if (character == lex_next)
            return false;
        lex_mark_end();
        if (lex_next == ':') {
            lex_advance();
            if (is_word(lex_next)) {
                lex_mark_end();
            }
        }
        lex_set_result(close_token);
        return true;
    }
    return false;
}

bool scan_att_mod(Scanner *self, const bool *valid_symbols, const int32_t character) {
    LOG("scan_att_mod\n");
    if (character == ':') {
        const int32_t next_char = lex_next;
        lex_advance();
        TRY_SCAN(scan_att_open(self, valid_symbols, next_char, true));
        LOG("fail\n");
        return false;
    }
    if (scan_att_close(self, valid_symbols, character, false))
        return true;
    TRY_SCAN(scan_att_open(self, valid_symbols, character, false));
    if (character == '|') {
        const int32_t next_char = lex_next;
        lex_advance();
        if (scan_att_close(self, valid_symbols, next_char, true))
            return true;
        LOG("fail\n");
        return false;
    }
    LOG("fail\n");
    return false;
}

bool scan(Scanner *self, const bool *valid_symbols) {
    // check if parser is in error-recovery mode
    const bool error_mode = valid_symbols[ERROR_MODE];

    // We return false here to allow the lexer to fall back
    // to the grammar, which allows the existence of `\0`.
    if (lex_eof) {
        return false;
    }

    // If we are at the beginning of a line, parse any whitespace that we encounter.
    // This is then returned as `$._preceding_whitespace`, which is part of the `extras`
    // group, meaning it can theoretically exist "anywhere in the document". This prevents
    // odd errors with preceding whitespace like ` @end`, where `@end` isn't parsed because
    // a `$._whitespace` is encountered, causing the parser to continue parsing as if everything
    // were a `$.paragraph_segment`.
    const uint32_t start_column = lex_column;
    lex_mark_end();
    if (valid_symbols[AUTO_SEMI] && !error_mode) {
        if (lex_next == ')' || is_newline(lex_next)) {
            lex_set_result(AUTO_SEMI);
            return true;
        }
    }
    // if (iswspace(lex_next))
    //     return scan_newline(self, valid_symbols);
    TRY_SCAN(scan_linkables(self, valid_symbols));

    const int32_t character = lex_next;
    lex_advance();

    if (start_column == 0 && is_whitespace(character)) {
        while (is_whitespace(lex_next))
            lex_skip();

        TRY_SCAN(scan_prefix(self, valid_symbols, character));

        lex_mark_end();
        lex_set_result(WHITESPACE);
        return true;
    }
    if (start_column == 0)
        TRY_SCAN(scan_prefix(self, valid_symbols, character));

    if (is_newline(character)) {
        if (character == '\n' && lex_next == '\r')
            lex_advance();
        lex_mark_end();
        while (is_whitespace(lex_next))
            lex_advance();
        // NOTE: don't do more than this. parse soft_break from grammar.js
        // as cases when paragraph parsing breaks is when free-form/linkables
        // are not closed and in that situation, user expect parser tries to
        // extend until it get the closing modifier
        if (start_column == 0 && valid_symbols[BLANK_LINE]) {
            lex_set_result(BLANK_LINE);
        } else {
            return false;
        }
        return true;
    }

    // if (character == '|' && !iswspace(lex_next) && (valid_symbols[STD_RANGED_PREFIX] || valid_symbols[STD_RANGED_END])) {
    //     lex_mark_end();
    //     // TODO(boltless): find better format for matching string
    //     if (lex_next == 'e') {
    //         lex_advance();
    //         if (lex_next == 'n') {
    //             lex_advance();
    //             if (lex_next == 'd') {
    //                 lex_advance();
    //                 if (iswspace(lex_next)) {
    //                     lex_mark_end();
    //                     vec_u32_pop_until(&self->indent_heading, 0);
    //                     vec_u32_pop_until(&self->indent_list, 0);
    //                     lex_set_result(STD_RANGED_END);
    //                     return true;
    //                 }
    //             }
    //         }
    //     }
    //     vec_u32_push(&self->indent_heading, 0);
    //     vec_u32_push(&self->indent_list, 0);
    //     lex_set_result(STD_RANGED_PREFIX);
    //     return true;
    // }

    // TRY_SCAN(scan_detached_modifier(self, valid_symbols, character));

    // if (character == '|')
    //     return scan_free_form_close(self, valid_symbols, character);
    //
    // return scan_attached_modifier(self, valid_symbols, character);
    return scan_att_mod(self, valid_symbols, character);
}

void *tree_sitter_norg_external_scanner_create() {
    LOG("tree_sitter_norg_external_scanner_create\n");
	Scanner* self = malloc(sizeof(Scanner));
    self->att_stack = vec_u32_new();
    self->indent_heading = vec_u32_new();
    self->indent_list = vec_u32_new();
    return self;
}

void tree_sitter_norg_external_scanner_destroy(void *payload) {
    LOG("tree_sitter_norg_external_scanner_destroy\n");
	struct Scanner* scanner = payload;
	vec_u32_drop(scanner->att_stack);
	vec_u32_drop(scanner->indent_heading);
	vec_u32_drop(scanner->indent_list);
	free(scanner);
}

unsigned tree_sitter_norg_external_scanner_serialize(
	void *payload,
	char *buffer
) {
    LOG("tree_sitter_norg_external_scanner_serialize\n");
	struct Scanner* scanner = payload;
	size_t written = 0;
	written += vec_u32_serialize(&scanner->att_stack, buffer + written);
	written += vec_u32_serialize(&scanner->indent_heading, buffer + written);
	written += vec_u32_serialize(&scanner->indent_list, buffer + written);
	return written;
}

void tree_sitter_norg_external_scanner_deserialize(
	void *payload,
	const char *buffer,
	unsigned length
) {
    LOG("tree_sitter_norg_external_scanner_deserialize\n");
	Scanner* scanner = payload;
    scanner->att_stack.len = 0;
    scanner->indent_heading.len = 0;
    scanner->indent_list.len = 0;
	if (length != 0) {
		size_t read = 0;
		read += vec_u32_deserialize(&scanner->att_stack, buffer + read);
		read += vec_u32_deserialize(&scanner->indent_heading, buffer + read);
		read += vec_u32_deserialize(&scanner->indent_list, buffer + read);
    }
}

bool tree_sitter_norg_external_scanner_scan(void *payload, TSLexer *lexer, const bool *valid_symbols) {
    LOG("tree_sitter_norg_external_scanner_scan\n");
    Scanner* scanner = payload;
    scanner->lexer = lexer;
    return scan(scanner, valid_symbols);
}
