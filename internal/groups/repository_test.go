package groups

import (
	"context"
	"os"
	"path/filepath"
	"testing"
)

func TestYAMLRepository_Load(t *testing.T) {
	tests := []struct {
		name    string
		yaml    string
		wantErr bool
		check   func(t *testing.T, g []Group)
	}{
		{
			name: "happy path with centroid and lat/lng",
			yaml: `
groups:
  - id: conferences
    name: Conferences
    color: "#4f8cff"
    events:
      - title: KubeCon
        description: Cloud-native
        country: de
      - title: re:Invent
        description: AWS
        country: US
        lat: 36.1699
        lng: -115.1398
`,
			check: func(t *testing.T, gs []Group) {
				if len(gs) != 1 {
					t.Fatalf("want 1 group, got %d", len(gs))
				}
				g := gs[0]
				if g.ID != "conferences" || g.Color != "#4f8cff" {
					t.Errorf("group fields not parsed: %+v", g)
				}
				if len(g.Events) != 2 {
					t.Fatalf("want 2 events, got %d", len(g.Events))
				}
				// Country must be normalized to uppercase.
				if g.Events[0].Country != "DE" {
					t.Errorf("want DE, got %q", g.Events[0].Country)
				}
				if g.Events[0].Lat != nil || g.Events[0].Lng != nil {
					t.Errorf("centroid event should have nil lat/lng")
				}
				if g.Events[1].Lat == nil || g.Events[1].Lng == nil {
					t.Fatalf("lat/lng event missing coords")
				}
				if *g.Events[1].Lat != 36.1699 || *g.Events[1].Lng != -115.1398 {
					t.Errorf("coords wrong: %v %v", *g.Events[1].Lat, *g.Events[1].Lng)
				}
			},
		},
		{
			name: "malformed yaml",
			yaml: `groups: [not a list of objects: [`,
			wantErr: true,
		},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			dir := t.TempDir()
			path := filepath.Join(dir, "locations.yaml")
			if err := os.WriteFile(path, []byte(tc.yaml), 0o600); err != nil {
				t.Fatal(err)
			}
			repo := NewYAMLRepository(path)
			gs, err := repo.Load(context.Background())
			if tc.wantErr {
				if err == nil {
					t.Fatal("want error, got nil")
				}
				return
			}
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			tc.check(t, gs)
		})
	}
}

func TestYAMLRepository_FileMissing(t *testing.T) {
	repo := NewYAMLRepository(filepath.Join(t.TempDir(), "missing.yaml"))
	if _, err := repo.Load(context.Background()); err == nil {
		t.Fatal("want error for missing file")
	}
}
