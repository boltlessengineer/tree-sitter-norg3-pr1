#include <stdio.h>
#include <string.h>
#include <wctype.h>

#include "tree_sitter/parser.h"
#include "tree_sitter/array.h"

// #define DEBUG

#ifdef DEBUG
	#define unreachable() fprintf(stderr, "unreachable src/scanner.c:%d\n", __LINE__)
    #define LOG(...) \
            printf("log[%d]: ", __LINE__);\
            printf(__VA_ARGS__);
#else
	#define unreachable() while (false);
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

static size_t _serialize__prim_array(Array *self, size_t element_size, char* buffer) {
    size_t written = 0;
    memcpy(buffer, &self->size, sizeof self->size);
    written += sizeof self->size;
    if (self->size > 0) {
        const size_t mem_size = self->size * element_size;
        memcpy(buffer + written, self->contents, mem_size);
        written += mem_size;
    }
    return written;
}
static size_t _deserialize__prim_array(Array *self, size_t element_size, const char* buffer) {
    size_t read = 0;
    memcpy(&self->size, buffer, sizeof self->size);
    read += sizeof self->size;
    array_reserve(self, self->size);
    if (self->size > 0) {
        const size_t mem_size = self->size * element_size;
        memcpy(self->contents, buffer + read, mem_size);
        read += mem_size;
    }
    return read;
}
/// serialize array of primitive types
#define serialize_prim_array(self, buffer) \
    _serialize__prim_array((Array *)(self), array_elem_size(self), buffer)
/// deserialize array of primitive types
#define deserialize_prim_array(self, buffer) \
    _deserialize__prim_array((Array *)(self), array_elem_size(self), buffer)

typedef struct Scanner Scanner;
struct Scanner {
    TSLexer* lexer;
    /// start column of ranged tag
    uint32_t range_column;
    /// prefix count of ranged tag
    uint32_t range_repeat;

    /// heading indent stack
    Array(uint32_t) indent_heading;
    /// list indent stack
    Array(uint32_t) indent_list;
};

typedef enum token_type token_type;
enum token_type {
    PRECEDING_VERBATIM_WHITESPACE,

    BLANK_LINE,

    FLAG_NOT_OPEN, // right after word char
    FLAG_NOT_CLOSE, // right after whitespace

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

    // MARKUP_OPEN,
    // MARKUP_CLOSE,
    // TARGET_OPEN,
    // TARGET_CLOSE,
    SCOPE_DELIMITER,

    HEADING,
    TABLE,

    UNORDERED_LIST,
    ORDERED_LIST,
    QUOTE_LIST,
    NULL_LIST,

    DEDENT,
    INDENT_LIST,
    DEDENT_LIST,

    FLAG_LIST_CONTENT,

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
    return 0;
}

static token_type char_to_indent_mod(int32_t c) {
    switch (c) {
        case '-':
            return UNORDERED_LIST;
        case '~':
            return ORDERED_LIST;
        case '>':
            return QUOTE_LIST;
        case '/':
            return NULL_LIST;
    }
    return 0;
}

typedef enum scan_action scan_action;
enum scan_action {
    ACCEPT,    // Confirm the token. Should return immediately
    FAIL,      // No matching external token found. Should return immediately
    SCAN_SKIP, // No side-effect occured. Can precede scanning.
    // NOTE: "SKIP" conflicts with <parser.h>
};

#define TRY_SCAN(action) \
    switch (action) {\
        case ACCEPT:\
            return true;\
        case FAIL:\
            return false;\
        case SCAN_SKIP:\
            break;\
    }

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

// possible result:
// - HEADING
// - RANGED_OPEN
// - *_TAG_PREFIX
static scan_action scan_nonlist_prefix(Scanner *self, const bool *valid_symbols, const int32_t character, const bool mark_end) {
    if (
        (valid_symbols[HEADING] || valid_symbols[DEDENT_LIST])
        && character == '*'
        && (lex_next == '*' || iswspace(lex_next))
    ) {
        size_t count = 1;
        while (lex_next == character) {
            lex_advance();
            count++;
        }
        uint32_t last_heading_level = 0;
        if (self->indent_heading.size > 0) {
            last_heading_level = *array_back(&self->indent_heading);
        }
        if (iswspace(lex_next)) {
            if (valid_symbols[DEDENT] && count <= last_heading_level) {
                array_pop(&self->indent_heading);
                lex_set_result(DEDENT);
                return ACCEPT;
            }
            if (is_whitespace(lex_next))
                array_push(&self->indent_heading, count);
            if (mark_end) lex_mark_end();
            lex_set_result(HEADING);
            return ACCEPT;
        }
        return FAIL;
    } else if (
        (valid_symbols[RANGED_OPEN] || valid_symbols[DEDENT_LIST])
        && character == '@'
        && (lex_next == '@' || !iswspace(lex_next))
    ) {
        size_t count = 1;
        uint32_t token_start_column = lex_column - 1;
        while (lex_next == character) {
            lex_advance();
            count++;
        }
        if (!iswspace(lex_next)) {
            if (mark_end) lex_mark_end();
            lex_set_result(RANGED_OPEN);
            self->range_column = token_start_column;
            self->range_repeat = count;
            return ACCEPT;
        }
        return SCAN_SKIP;
    } else if (
        (valid_symbols[INFIRM_TAG_PREFIX] || valid_symbols[DEDENT_LIST])
        && character == '.'
        && is_word(lex_next)
    ) {
        if (mark_end) lex_mark_end();
        lex_set_result(INFIRM_TAG_PREFIX);
        return ACCEPT;
    } else if (
        (valid_symbols[CARRYOVER_TAG_PREFIX] || valid_symbols[DEDENT_LIST])
        && character == '#'
        && (is_word(lex_next) || lex_next == '(')
    ) {
        if (mark_end) lex_mark_end();
        lex_set_result(CARRYOVER_TAG_PREFIX);
        return ACCEPT;
    }
    return SCAN_SKIP;
}

static scan_action scan_list(Scanner *self, const bool *valid_symbols, const int32_t character) {
    if (
        (character == '/' || character == '-' || character == '~' || character == '>')
        && (lex_next == character || iswspace(lex_next))
    ) {
        LOG("list item\n");
        size_t count = 1;
        while (lex_next == character) {
            lex_advance();
            count++;
        }
        if (!iswspace(lex_next))
            return FAIL;
        uint32_t last_list_level = 0;
        if (self->indent_list.size > 0) {
            last_list_level = *array_back(&self->indent_list);
        }
        LOG("count = %zu\n", count);
        LOG("sef->indent_list = %d\n", last_list_level);
        LOG("check indent_list\n");
        if (
            valid_symbols[INDENT_LIST]
            && character != '/'
            && count > last_list_level
        ) {
            array_push(&self->indent_list, count);
            lex_set_result(INDENT_LIST);
            return ACCEPT;
        }
        LOG("check dedent_list\n");
        if (valid_symbols[DEDENT_LIST] && count < last_list_level) {
            array_pop(&self->indent_list);
            lex_set_result(DEDENT_LIST);
            return ACCEPT;
        }
        const token_type prefix_token = char_to_indent_mod(character);
        LOG("%c is valid?: %d\n", character, valid_symbols[prefix_token]);
        if (prefix_token && valid_symbols[prefix_token]) {
            lex_mark_end();
            lex_set_result(prefix_token);
            return ACCEPT;
        } else if (prefix_token && valid_symbols[DEDENT_LIST]) { // for "- asdf\n~ asdf"
            array_pop(&self->indent_list);
            lex_set_result(DEDENT_LIST);
            return ACCEPT;
        }
        return FAIL;
    }
    return SCAN_SKIP;
}

static scan_action scan_prefix(Scanner *self, const bool *valid_symbols, const int32_t character) {
    if (valid_symbols[DEDENT_LIST] && !valid_symbols[FLAG_LIST_CONTENT]) {
        const scan_action action = scan_nonlist_prefix(self, valid_symbols, character, false);
        switch (action) {
            case ACCEPT:
                array_pop(&self->indent_list);
                lex_set_result(DEDENT_LIST);
                return ACCEPT;
            case FAIL:
                return FAIL;
            case SCAN_SKIP:
                break;
        }
    } else {
        const scan_action action = scan_nonlist_prefix(self, valid_symbols, character, true);
        if (action != SCAN_SKIP)
            return action;
    }
    return scan_list(self, valid_symbols, character);
}

static bool scan(Scanner *self, const bool *valid_symbols) {
    // check if parser is in error-recovery mode
    const bool error_mode = valid_symbols[ERROR_MODE];
    if (error_mode)
        return false;

    if (valid_symbols[DEDENT_LIST] && lex_eof) {
        lex_set_result(DEDENT_LIST);
        return true;
    }

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

    if (start_column == 0 && is_newline(character)) {
        LOG("blank line detected\n");
        if (valid_symbols[DEDENT_LIST]) {
            array_pop(&self->indent_list);
            lex_set_result(DEDENT_LIST);
            return true;
        }
        if (valid_symbols[BLANK_LINE]) {
            lex_mark_end();
            lex_set_result(BLANK_LINE);
            return true;
        }
        return false;
    } else if (start_column == 0 && is_whitespace(character)) {
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

        TRY_SCAN(scan_prefix(self, valid_symbols, character));

        return false;
    } else if (start_column == 0) {
        TRY_SCAN(scan_prefix(self, valid_symbols, character));
    } else if (valid_symbols[FLAG_LIST_CONTENT]) {
        TRY_SCAN(scan_nonlist_prefix(self, valid_symbols, character, true));
    }

    if (valid_symbols[SCOPE_DELIMITER] && character == ':') {
        lex_mark_end();
        lex_set_result(SCOPE_DELIMITER);
        return true;
    }

    // scan attached modifier
    int32_t first_char = character;
    const bool link_mod_left = first_char == ':';
    if (link_mod_left) {
        first_char = lex_next;
        lex_advance();
    }
    const token_type kind_token = char_to_attached_mod(first_char);
    if (kind_token) {
        LOG("meet attached modifier\n");
        if (
            (link_mod_left || !valid_symbols[FLAG_NOT_OPEN])
            && valid_symbols[kind_token]
            && !valid_symbols[kind_token + 1]
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
            !link_mod_left
            && !valid_symbols[FLAG_NOT_CLOSE]
            && valid_symbols[kind_token + 1]
            && !is_word(lex_next)
        ) {
            if (first_char == lex_next)
                return false;
            if (lex_next == ':')
                lex_advance();
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
	Scanner *self = calloc(1, sizeof(Scanner));
    array_init(&self->indent_heading);
    array_init(&self->indent_list);
    return self;
}

void tree_sitter_norg_external_scanner_destroy(void *payload) {
    LOG("tree_sitter_norg_external_scanner_destroy\n");
	Scanner *scanner = payload;
    array_delete(&scanner->indent_heading);
    array_delete(&scanner->indent_list);
	free(scanner);
}

unsigned tree_sitter_norg_external_scanner_serialize(
	void *payload,
	char *buffer
) {
    LOG("tree_sitter_norg_external_scanner_serialize\n");
	Scanner *scanner = payload;
	size_t written = 0;
    buffer[written++] = (char)scanner->range_column;
    buffer[written++] = (char)scanner->range_repeat;
    written += serialize_prim_array(&scanner->indent_heading, buffer + written);
    written += serialize_prim_array(&scanner->indent_list, buffer + written);
	return written;
}

void tree_sitter_norg_external_scanner_deserialize(
	void *payload,
	const char *buffer,
	unsigned length
) {
    LOG("tree_sitter_norg_external_scanner_deserialize\n");
	Scanner *scanner = payload;
	if (length != 0) {
		size_t read = 0;
        scanner->range_column = buffer[read++];
        scanner->range_repeat = buffer[read++];
        read += deserialize_prim_array(&scanner->indent_heading, buffer + read);
        read += deserialize_prim_array(&scanner->indent_list, buffer + read);
    }
}

bool tree_sitter_norg_external_scanner_scan(void *payload, TSLexer *lexer, const bool *valid_symbols) {
    LOG("tree_sitter_norg_external_scanner_scan\n");
    Scanner* scanner = payload;
    scanner->lexer = lexer;
    return scan(scanner, valid_symbols);
}

