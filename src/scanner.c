#include <stdio.h>
#include <string.h>
#include <wctype.h>

#include "tree_sitter/parser.h"

#define DEBUG

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

typedef struct Scanner Scanner;
struct Scanner {
    TSLexer* lexer;
    /// start column of ranged tag
    uint32_t range_column;
    /// prefix count of ranged tag
    uint32_t range_repeat;
    /// heading indent stack
    vec_u32 indent_heading;
    /// list indent stack
    vec_u32 indent_list;
};

typedef enum token_type token_type;
enum token_type {
    PRECEDING_VERBATIM_WHITESPACE,

    BLANK_LINE,

    NOT_OPEN, // right after word char
    NOT_CLOSE, // right after whitespace

    BOLD_OPEN,
    BOLD_CLOSE,

    ITALIC_OPEN,
    ITALIC_CLOSE,

    UNDERLINE_OPEN,
    UNDERLINE_CLOSE,

    STRIKETHROUGH_OPEN,
    STRIKETHROUGH_CLOSE,

    SPOILER_OPEN,
    SPOILER_CLOSE,
    SUPERSCRIPT_OPEN,
    SUPERSCRIPT_CLOSE,
    SUBSCRIPT_OPEN,
    SUBSCRIPT_CLOSE,
    COMMENT_OPEN,
    COMMENT_CLOSE,

    VERBATIM_OPEN,
    VERBATIM_CLOSE,

    HEADING,
    TABLE,
    UNORDERED_LIST,
    ORDERED_LIST,
    QUOTE_LIST,
    NULL_LIST,

    DEDENT,
    DEDENT_LIST,

    INFIRM_TAG_PREFIX,
    CARRYOVER_TAG_PREFIX,
    RANGED_OPEN,
    RANGED_CLOSE,

    ERROR_MODE,
};

static token_type char_to_attached_mod(int32_t c) {
    switch (c) {
        case '*':
            return BOLD_OPEN;
        case '/':
            return ITALIC_OPEN;
        case '_':
            return UNDERLINE_OPEN;
        case '~':
            return STRIKETHROUGH_OPEN;
        case '!':
            return SPOILER_OPEN;
        case '^':
            return SUPERSCRIPT_OPEN;
        case ',':
            return SUBSCRIPT_OPEN;
        case '%':
            return COMMENT_OPEN;
        case '`':
            return VERBATIM_OPEN;
    }
    return ERROR_MODE;
}

static token_type char_to_detached_mod(int32_t c) {
    switch (c) {
        case '*':
            return HEADING;
        case '-':
            return UNORDERED_LIST;
        case '~':
            return ORDERED_LIST;
    }
    return ERROR_MODE;
}

typedef enum scan_action scan_action;
enum scan_action {
    ACCEPT,
    FAIL,
    SCAN_SKIP, // "SKIP" conflicts with <parser.h>
};

/**
 * Returns `true` if the character provided is neither whitespace nor punctuation
 */
static bool is_word(int32_t character) {
    // return character && !iswspace(character) && !iswpunct(character);
    // HACK: `iswpunct()` can't be used in wasm
    // TODO(boltless): rewrite this temporary solution.
    return character && (('a' <= character && character <= 'z') || ('A' <= character && character <= 'Z'));
}
/**
 * Returns `true` if the character provided is either \n or \r
 */
static bool is_newline(int32_t character) {
    return character == '\n' || character == '\r';
}
/**
 * Returns `true` if the character provided is a separator character (but not a newline).
 */
static bool is_whitespace(int32_t character) {
    return character && iswspace(character) && !is_newline(character);
}

static bool scan(Scanner *self, const bool *valid_symbols) {
    // check if parser is in error-recovery mode
    const bool error_mode = valid_symbols[ERROR_MODE];

    if (
        valid_symbols[PRECEDING_VERBATIM_WHITESPACE]
        && lex_column == 0
    ) {
        LOG("expected columns: %d\n", self->range_column);
        while (is_whitespace(lex_next) && lex_column < self->range_column)
            lex_skip();
        lex_mark_end();
        lex_set_result(PRECEDING_VERBATIM_WHITESPACE);
        {
            LOG("try scan range close\n");
            while (is_whitespace(lex_next))
                lex_skip();
            LOG("skipped whitespaces\n");
            const int32_t character = lex_next;
            lex_advance();
            if (character == '@') {
                LOG("prefix detected\n");
                size_t count = 1;
                while (lex_next == character) {
                    lex_advance();
                    count++;
                }
                LOG("prefix advanced\n");
                LOG("expected count: %d\n", self->range_repeat);
                LOG("parsed count: %zu\n", count);
                if (
                    count == self->range_repeat
                    && (lex_next == 'e' && (lex_advance(), true))
                    && (lex_next == 'n' && (lex_advance(), true))
                    && (lex_next == 'd' && (lex_advance(), true))
                    && (is_newline(lex_next) || lex_eof)
                ) {
                    lex_advance();
                    lex_mark_end();
                    lex_set_result(RANGED_CLOSE);
                    self->range_column = 0;
                    self->range_repeat = 0;
                    return true;
                }
            }
            LOG("wasn't range close\n");
        }
        return true;
    }

    // capture the initial lexer state and advance
    const uint32_t start_column = lex_column;
    const int32_t character = lex_next;
    // mark end here for zero-width tokens
    lex_mark_end();
    if (iswspace(lex_next)) lex_skip();
    else lex_advance();

    // 1. VERBATIM_WHITESPACE  (`    `)
    // 2. RANGED_CLOSE         (`    @end`)
    //
    // line start with whitespace
    // possible tokens:
    // 1. BLANK_LINE           (`    \n`)
    // 2. RANGED_OPEN          (`    @`)
    // 3. HEADING              (`    *    `)
    // 4. DEDENT               (``)

    if (start_column == 0 && is_whitespace(character)) {
        while (is_whitespace(lex_next))
            lex_skip();
        if (valid_symbols[BLANK_LINE] && is_newline(lex_next)) {
            lex_advance();
            lex_mark_end();
            lex_set_result(BLANK_LINE);
            return true;
        }

        LOG("checking prefix\n");
            // shadow `character` to match function signature
            const int32_t character = lex_next;
            lex_advance();

            if (
                valid_symbols[HEADING]
                && character == '*'
                && (lex_next == '*' || iswspace(lex_next))
            ) {
                size_t count = 1;
                while (lex_next == character) {
                    lex_advance();
                    count++;
                }
                if (iswspace(lex_next)) {
                    if (valid_symbols[DEDENT] && count <= vec_u32_back_or(&self->indent_heading, 0)) {
                        vec_u32_pop(&self->indent_heading);
                        lex_set_result(DEDENT);
                        return true;
                    }
                    vec_u32_push(&self->indent_heading, count);
                    lex_mark_end();
                    lex_set_result(HEADING);
                    return true;
                }
                // SKIP
            } else if (
                valid_symbols[RANGED_OPEN]
                && character == '@'
                && (lex_next == '@' || !iswspace(lex_next))
            ) {
                size_t count = 1;
                while (lex_next == character) {
                    lex_advance();
                    count++;
                }
                if (!iswspace(lex_next)) {
                    lex_mark_end();
                    lex_set_result(RANGED_OPEN);
                    self->range_column = lex_column - 1;
                    self->range_repeat = count;
                    return true;
                }
                // SKIP
            } else if (
                valid_symbols[INFIRM_TAG_PREFIX]
                && character == '.'
                && is_word(lex_next)
            ) {
                lex_mark_end();
                lex_set_result(INFIRM_TAG_PREFIX);
                return true;
            } else if (
                valid_symbols[CARRYOVER_TAG_PREFIX]
                && character == '#'
                && is_word(lex_next)
            ) {
                lex_mark_end();
                lex_set_result(CARRYOVER_TAG_PREFIX);
                return true;
            }

        return false;
    } else if (start_column == 0) {
        if (valid_symbols[BLANK_LINE] && is_newline(character)) {
            lex_mark_end();
            lex_set_result(BLANK_LINE);
            return true;
        }

            if (
                valid_symbols[HEADING]
                && character == '*'
                && (lex_next == '*' || iswspace(lex_next))
            ) {
                size_t count = 1;
                while (lex_next == character) {
                    lex_advance();
                    count++;
                }
                if (iswspace(lex_next)) {
                    if (valid_symbols[DEDENT] && count <= vec_u32_back_or(&self->indent_heading, 0)) {
                        vec_u32_pop(&self->indent_heading);
                        lex_set_result(DEDENT);
                        return true;
                    }
                    vec_u32_push(&self->indent_heading, count);
                    lex_mark_end();
                    lex_set_result(HEADING);
                    return true;
                }
                // SKIP
            } else if (
                valid_symbols[RANGED_OPEN]
                && character == '@'
                && (lex_next == '@' || !iswspace(lex_next))
            ) {
                size_t count = 1;
                while (lex_next == character) {
                    lex_advance();
                    count++;
                }
                if (!iswspace(lex_next)) {
                    lex_mark_end();
                    lex_set_result(RANGED_OPEN);
                    self->range_column = lex_column;
                    self->range_repeat = count;
                    return true;
                }
                // SKIP
            } else if (
                valid_symbols[INFIRM_TAG_PREFIX]
                && character == '.'
                && is_word(lex_next)
            ) {
                lex_mark_end();
                lex_set_result(INFIRM_TAG_PREFIX);
                return true;
            } else if (
                valid_symbols[CARRYOVER_TAG_PREFIX]
                && character == '#'
                && is_word(lex_next)
            ) {
                lex_mark_end();
                lex_set_result(CARRYOVER_TAG_PREFIX);
                return true;
            }

    }

    // scan attached modifier
    const token_type kind_token = char_to_attached_mod(character);
    if (kind_token) {
        LOG("meet attached modifier\n");
        if (
            !valid_symbols[NOT_OPEN]
            && valid_symbols[kind_token]
            && !iswspace(lex_next)
            && !lex_eof
            && !valid_symbols[VERBATIM_CLOSE]
        ) {
            if (character == lex_next) // **
                return false;
            lex_mark_end();
            lex_set_result(kind_token);
            return true;
        } else if (
            !valid_symbols[NOT_CLOSE]
            && valid_symbols[kind_token + 1]
            && !is_word(lex_next)
        ) {
            if (character == lex_next)
                return false;
            lex_mark_end();
            lex_set_result(kind_token + 1);
            return true;
        }
    }
    LOG("none\n");

    return false;
}

void *tree_sitter_norg_external_scanner_create() {
    LOG("tree_sitter_norg_external_scanner_create\n");
	Scanner* self = malloc(sizeof(Scanner));
    self->indent_heading = vec_u32_new();
    self->indent_list = vec_u32_new();
    return self;
}

void tree_sitter_norg_external_scanner_destroy(void *payload) {
    LOG("tree_sitter_norg_external_scanner_destroy\n");
	struct Scanner* scanner = payload;
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
	if (length != 0) {
		size_t read = 0;
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

