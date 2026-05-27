package httpapi

import (
	"context"
	"encoding/json"
	"log"
	"net/http"

	"github.com/umarquez/interactive-map-demo/internal/groups"
)

// GroupsReader is the narrow interface the handler depends on
// (Interface Segregation — we don't pull in the whole service surface).
type GroupsReader interface {
	Groups(ctx context.Context) ([]groups.Group, error)
}

type GroupsHandler struct {
	reader GroupsReader
}

func NewGroupsHandler(r GroupsReader) *GroupsHandler {
	return &GroupsHandler{reader: r}
}

func (h *GroupsHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		w.Header().Set("Allow", http.MethodGet)
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	gs, err := h.reader.Groups(r.Context())
	if err != nil {
		log.Printf("groups handler: %v", err)
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}
	if gs == nil {
		gs = []groups.Group{}
	}
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	if err := json.NewEncoder(w).Encode(map[string]any{"groups": gs}); err != nil {
		log.Printf("encode groups: %v", err)
	}
}
