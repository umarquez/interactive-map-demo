package httpapi

import (
	"net/http"
	"path/filepath"
	"strings"
	"time"
)

type Config struct {
	Addr      string // e.g. ":8080"
	RootDir   string // project root (contains index.html and assets/)
	AssetsDir string // typically filepath.Join(RootDir, "assets")
}

func NewServer(cfg Config, groupsHandler http.Handler) *http.Server {
	mux := http.NewServeMux()

	mux.Handle("GET /api/v1/groups", groupsHandler)

	// Static assets — served from /assets/... (with directory listings disabled).
	assetsFS := http.FileServer(http.Dir(cfg.AssetsDir))
	mux.Handle("GET /assets/", noDirListing(http.StripPrefix("/assets/", assetsFS)))

	// SPA shell at /
	mux.HandleFunc("GET /{$}", func(w http.ResponseWriter, r *http.Request) {
		serveIndex(w, r, cfg.RootDir)
	})

	// Don't leak the source YAML even though it lives at repo root.
	mux.HandleFunc("GET /locations.yaml", func(w http.ResponseWriter, _ *http.Request) {
		http.NotFound(w, nil)
	})

	return &http.Server{
		Addr:              cfg.Addr,
		Handler:           logRequests(mux),
		ReadHeaderTimeout: 5 * time.Second,
	}
}

func serveIndex(w http.ResponseWriter, r *http.Request, rootDir string) {
	w.Header().Set("Cache-Control", "no-cache")
	http.ServeFile(w, r, filepath.Join(rootDir, "index.html"))
}

// noDirListing prevents http.FileServer from rendering directory indexes.
// Must wrap StripPrefix from the outside so it sees the original URL path.
func noDirListing(h http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "" || strings.HasSuffix(r.URL.Path, "/") {
			http.NotFound(w, r)
			return
		}
		h.ServeHTTP(w, r)
	})
}

func logRequests(h http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		sw := &statusWriter{ResponseWriter: w, status: http.StatusOK}
		h.ServeHTTP(sw, r)
		logf("%s %s -> %d (%s)", r.Method, r.URL.Path, sw.status, time.Since(start))
	})
}

type statusWriter struct {
	http.ResponseWriter
	status int
}

func (sw *statusWriter) WriteHeader(code int) {
	sw.status = code
	sw.ResponseWriter.WriteHeader(code)
}
