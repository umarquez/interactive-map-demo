package httpapi

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/umarquez/interactive-map-demo/internal/groups"
)

type fakeReader struct {
	gs  []groups.Group
	err error
}

func (f *fakeReader) Groups(_ context.Context) ([]groups.Group, error) {
	return f.gs, f.err
}

func TestGroupsHandler_OK(t *testing.T) {
	lat := 36.1699
	lng := -115.1398
	reader := &fakeReader{gs: []groups.Group{
		{
			ID: "conferences", Name: "Conferences", Color: "#4f8cff",
			Events: []groups.Event{
				{Title: "KubeCon", Description: "x", Country: "DE"},
				{Title: "re:Invent", Description: "y", Country: "US", Lat: &lat, Lng: &lng},
			},
		},
	}}
	h := NewGroupsHandler(reader)

	rr := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/api/v1/groups", nil)
	h.ServeHTTP(rr, req)

	if rr.Code != http.StatusOK {
		t.Fatalf("status %d", rr.Code)
	}
	if ct := rr.Header().Get("Content-Type"); !strings.HasPrefix(ct, "application/json") {
		t.Errorf("content-type %q", ct)
	}
	var payload struct {
		Groups []groups.Group `json:"groups"`
	}
	if err := json.Unmarshal(rr.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if len(payload.Groups) != 1 || len(payload.Groups[0].Events) != 2 {
		t.Fatalf("payload wrong: %+v", payload)
	}
	if payload.Groups[0].Events[1].Lat == nil || *payload.Groups[0].Events[1].Lng != lng {
		t.Errorf("lat/lng round-trip failed")
	}
}

func TestGroupsHandler_EmptyIsEmptyArray(t *testing.T) {
	h := NewGroupsHandler(&fakeReader{gs: nil})
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, httptest.NewRequest(http.MethodGet, "/api/v1/groups", nil))
	if !strings.Contains(rr.Body.String(), `"groups":[]`) {
		t.Errorf("nil should serialize as empty array, got %s", rr.Body.String())
	}
}

func TestGroupsHandler_MethodNotAllowed(t *testing.T) {
	h := NewGroupsHandler(&fakeReader{})
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, httptest.NewRequest(http.MethodPost, "/api/v1/groups", nil))
	if rr.Code != http.StatusMethodNotAllowed {
		t.Errorf("status %d", rr.Code)
	}
}

func TestGroupsHandler_ReaderError(t *testing.T) {
	h := NewGroupsHandler(&fakeReader{err: errors.New("boom")})
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, httptest.NewRequest(http.MethodGet, "/api/v1/groups", nil))
	if rr.Code != http.StatusInternalServerError {
		t.Errorf("status %d", rr.Code)
	}
}
