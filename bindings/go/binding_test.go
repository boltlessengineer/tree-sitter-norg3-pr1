package tree_sitter_norg_test

import (
	"testing"

	tree_sitter "github.com/smacker/go-tree-sitter"
	"github.com/tree-sitter/tree-sitter-norg"
)

func TestCanLoadGrammar(t *testing.T) {
	language := tree_sitter.NewLanguage(tree_sitter_norg.Language())
	if language == nil {
		t.Errorf("Error loading Norg grammar")
	}
}
